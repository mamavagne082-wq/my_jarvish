package com.jarvis.assistant

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

class JarvisForegroundService : Service() {

    companion object {
        private const val TAG = "JarvisForeground"
        private const val CHANNEL_ID = "jarvis_voice_channel"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.jarvis.assistant.START"
        const val ACTION_STOP = "com.jarvis.assistant.STOP"

        // ── [NEW] Wake Word broadcast action ──────────────────────────────
        const val ACTION_WAKE_WORD_DETECTED = "com.jarvis.assistant.WAKE_WORD"

        const val PREFS_NAME = "jarvis_mobile_prefs"
        const val KEY_SERVICE_ENABLED = "service_enabled"

        var isRunning = false
            private set

        fun setServiceEnabled(context: Context, enabled: Boolean) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_SERVICE_ENABLED, enabled)
                .apply()
        }

        fun isServiceEnabled(context: Context): Boolean {
            return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_SERVICE_ENABLED, true)
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())
    private var wakeLock: PowerManager.WakeLock? = null
    private var liveKitRoom: Room? = null
    private var explicitlyStopped = false

    // ── [NEW] Wake Word Engine ─────────────────────────────────────────────
    private var wakeWordEngine: WakeWordEngine? = null

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            Log.d(TAG, "Screen broadcast event: $action")
            if (isServiceEnabled(this@JarvisForegroundService)) {
                acquireWakeLock()
                if (liveKitRoom == null || liveKitRoom?.state != Room.State.CONNECTED) {
                    Log.d(TAG, "Screen event ($action) detected disconnected LiveKit. Reconnecting...")
                    connectToLiveKitRoom()
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
        registerScreenStateReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            explicitlyStopped = true
            setServiceEnabled(this, false)
            stopForegroundService()
            return START_NOT_STICKY
        }

        explicitlyStopped = false
        setServiceEnabled(this, true)
        startAsForeground()
        connectToLiveKitRoom()

        // ── [NEW] Start wake word engine ("Hey Jarvis") ──────────────────
        if (wakeWordEngine == null) {
            wakeWordEngine = WakeWordEngine()
            wakeWordEngine?.start()
        }

        isRunning = true
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        if (isServiceEnabled(this)) {
            Log.d(TAG, "Jarvis task removed from Recents. Auto-restarting background service immediately...")
            val restartServiceIntent = Intent(applicationContext, JarvisForegroundService::class.java).apply {
                this.action = ACTION_START
            }
            val pendingIntent = PendingIntent.getService(
                applicationContext, 1002, restartServiceIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            alarmManager?.set(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 1000,
                pendingIntent
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        // ── [NEW] Stop wake word engine ───────────────────────────────────
        wakeWordEngine?.stop()
        wakeWordEngine = null
        unregisterScreenStateReceiver()
        disconnectLiveKit()
        releaseWakeLock()

        if (!explicitlyStopped && isServiceEnabled(this)) {
            Log.w(TAG, "Jarvis killed unexpectedly by OS. Auto-resurrecting...")
            val restartServiceIntent = Intent(applicationContext, JarvisForegroundService::class.java).apply {
                this.action = ACTION_START
            }
            val pendingIntent = PendingIntent.getService(
                applicationContext, 1003, restartServiceIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            alarmManager?.set(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 1500,
                pendingIntent
            )
        }
        Log.d(TAG, "JarvisForegroundService destroyed")
    }

    private fun registerScreenStateReceiver() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        try {
            registerReceiver(screenReceiver, filter)
        } catch (e: Exception) {
            Log.e(TAG, "Error registering screenReceiver: ${e.message}")
        }
    }

    private fun unregisterScreenStateReceiver() {
        try {
            unregisterReceiver(screenReceiver)
        } catch (e: Exception) {
            // ignore if not registered
        }
    }

    private fun startAsForeground() {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.service_running_title))
            .setContentText(getString(R.string.service_running_desc))
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Jarvis Voice Assistant Background Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Jarvis connected to microphone and speaker 24/7"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Jarvis::VoiceWakeLock").apply {
                acquire()
            }
            Log.d(TAG, "WakeLock acquired")
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }

    /**
     * Connects to LiveKit Room using MobileConfig credentials.
     * Starts microphone and listens for remote commands via DataChannel.
     */
    private fun connectToLiveKitRoom() {
        serviceScope.launch {
            try {
                if (liveKitRoom != null && liveKitRoom?.state == Room.State.CONNECTED) {
                    Log.d(TAG, "LiveKit room already connected.")
                    return@launch
                }

                Log.d(TAG, "Connecting to LiveKit room: ${MobileConfig.LIVEKIT_URL}...")
                
                val room = LiveKit.create(applicationContext)
                liveKitRoom = room

                // Listen to room events
                serviceScope.launch {
                    room.events.collect { event ->
                        when (event) {
                            is RoomEvent.Connected -> {
                                Log.d(TAG, "Successfully connected to LiveKit Room!")
                                // Automatically enable local microphone
                                room.localParticipant.setMicrophoneEnabled(true)
                                // Send platform identity to Jarvis Agent
                                try {
                                    val identifyPayload = JSONObject().apply {
                                        put("type", "PLATFORM_IDENTIFY")
                                        put("platform", "mobile")
                                    }.toString().toByteArray(Charsets.UTF_8)
                                    serviceScope.launch {
                                        room.localParticipant.publishData(identifyPayload, true)
                                    }
                                } catch (e: Exception) {
                                    Log.w(TAG, "Failed to send platform identify: ${e.message}")
                                }
                            }
                            is RoomEvent.Disconnected -> {
                                Log.w(TAG, "Room disconnected. Attempting auto-reconnect in 3s...")
                                delay(3000)
                                if (isRunning && isServiceEnabled(this@JarvisForegroundService)) {
                                    connectToLiveKitRoom()
                                }
                            }
                            is RoomEvent.DataReceived -> {
                                handleIncomingDataPacket(event.data)
                            }
                            else -> {}
                        }
                    }
                }

                val token = generateOrFetchToken()
                room.connect(MobileConfig.LIVEKIT_URL, token)

            } catch (e: Exception) {
                Log.e(TAG, "Failed to connect to LiveKit: ${e.message}", e)
                delay(5000)
                if (isRunning && isServiceEnabled(this@JarvisForegroundService)) {
                    connectToLiveKitRoom()
                }
            }
        }
    }

    /**
     * Parses incoming command packets from the Python Jarvis Agent.
     */
    private fun handleIncomingDataPacket(data: ByteArray) {
        try {
            val text = String(data, Charsets.UTF_8)
            val json = JSONObject(text)
            val type = json.optString("type", "")

            if (type == "JARVIS_MOBILE_CMD") {
                val action = json.optString("action", "")
                val payload = json.optJSONObject("payload") ?: JSONObject()
                Log.d(TAG, "Received mobile command from Jarvis: action=$action")

                JarvisAccessibilityService.instance?.handleCommand(action, payload)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling incoming data packet: ${e.message}")
        }
    }

    private fun generateOrFetchToken(): String {
        return "jarvis-mobile-client-token"
    }

    private fun disconnectLiveKit() {
        serviceScope.launch {
            try {
                liveKitRoom?.disconnect()
                liveKitRoom?.release()
                liveKitRoom = null
            } catch (e: Exception) {
                Log.e(TAG, "Error disconnecting LiveKit: ${e.message}")
            }
        }
    }

    private fun stopForegroundService() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [NEW] WakeWordEngine — Continuously listens for "Hey Jarvis"
    //        Uses Android SpeechRecognizer (on-device, no cloud needed on
    //        Android 13+ / Pixel devices; falls back to Google cloud STT).
    // ═══════════════════════════════════════════════════════════════════════
    inner class WakeWordEngine {

        private val TAG_WW = "JarvisWakeWord"
        private var recognizer: SpeechRecognizer? = null
        private var isActive = false
        private var lastActivationMs = 0L
        private val COOLDOWN_MS = 3000L

        /** Wake phrases to detect (case-insensitive substring match). */
        private val WAKE_PHRASES = listOf(
            "hey jarvis", "ok jarvis", "okay jarvis", "hi jarvis",
            "jarvis",          // just the name
            "জারভিস",          // Bengali
            "হে জারভিস",       // Bengali "Hey Jarvis"
            "ও জারভিস",        // Bengali "Oh Jarvis"
            "হ্যালো জারভিস"    // Bengali "Hello Jarvis"
        )

        fun start() {
            isActive = true
            // SpeechRecognizer must be created on main thread
            serviceScope.launch(Dispatchers.Main) {
                startListening()
            }
            Log.i(TAG_WW, "Wake word engine started. Say 'Hey Jarvis' to activate.")
        }

        fun stop() {
            isActive = false
            serviceScope.launch(Dispatchers.Main) {
                recognizer?.stopListening()
                recognizer?.destroy()
                recognizer = null
            }
            Log.i(TAG_WW, "Wake word engine stopped.")
        }

        private fun startListening() {
            if (!isActive) return
            if (!SpeechRecognizer.isRecognitionAvailable(applicationContext)) {
                Log.w(TAG_WW, "Speech recognition not available on this device.")
                return
            }

            recognizer?.destroy()
            recognizer = SpeechRecognizer.createSpeechRecognizer(applicationContext)

            recognizer?.setRecognitionListener(object : RecognitionListener {

                override fun onResults(results: Bundle?) {
                    val matches = results
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?: emptyList<String>()

                    for (text in matches) {
                        val lower = text.lowercase()
                        Log.d(TAG_WW, "Heard: \"$lower\"")
                        for (phrase in WAKE_PHRASES) {
                            if (phrase in lower) {
                                onWakeWordDetected(text)
                                break
                            }
                        }
                    }
                    // Restart for next phrase
                    restartAfterDelay(300)
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    // Check partial results too for faster response
                    val partial = partialResults
                        ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()?.lowercase() ?: return
                    for (phrase in WAKE_PHRASES) {
                        if (phrase in partial) {
                            Log.d(TAG_WW, "Partial match: \"$partial\"")
                            onWakeWordDetected(partial)
                            break
                        }
                    }
                }

                override fun onError(error: Int) {
                    val msg = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH -> "No match"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Timeout"
                        SpeechRecognizer.ERROR_AUDIO -> "Audio error"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                        else -> "Error $error"
                    }
                    Log.d(TAG_WW, "Recognition error: $msg. Restarting...")
                    restartAfterDelay(if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) 1500L else 500L)
                }

                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                // Support both Bengali and English in one session
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "bn-BD")
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "bn-BD")
                putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                // Keep listening longer for wake word detection
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 300L)
            }

            recognizer?.startListening(intent)
        }

        private fun restartAfterDelay(delayMs: Long = 500L) {
            if (!isActive) return
            serviceScope.launch(Dispatchers.Main) {
                delay(delayMs)
                if (isActive) startListening()
            }
        }

        private fun onWakeWordDetected(phrase: String) {
            val now = System.currentTimeMillis()
            if (now - lastActivationMs < COOLDOWN_MS) return  // cooldown
            lastActivationMs = now

            Log.i(TAG_WW, "\uD83D\uDD0A WAKE WORD DETECTED: \"$phrase\" → Activating Jarvis!")

            // Send broadcast → MainActivity will come to foreground
            val wakeIntent = Intent(ACTION_WAKE_WORD_DETECTED).apply {
                setPackage(packageName)
                putExtra("phrase", phrase)
            }
            sendBroadcast(wakeIntent)

            // Also ensure LiveKit is connected
            if (liveKitRoom == null || liveKitRoom?.state != Room.State.CONNECTED) {
                connectToLiveKitRoom()
            }
        }
    }
}
