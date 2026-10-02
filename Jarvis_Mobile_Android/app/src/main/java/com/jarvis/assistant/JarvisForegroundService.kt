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
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
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
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import org.json.JSONObject

class JarvisForegroundService : Service() {

    companion object {
        private const val TAG = "JarvisForeground"
        private const val CHANNEL_ID = "jarvis_voice_channel"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.jarvis.assistant.START"
        const val ACTION_STOP = "com.jarvis.assistant.STOP"

        // ── [NEW] Wake Word & Idle broadcast actions ──────────────────────
        const val ACTION_WAKE_WORD_DETECTED = "com.jarvis.assistant.WAKE_WORD"
        const val ACTION_RESET_IDLE = "com.jarvis.assistant.RESET_IDLE"

        const val PREFS_NAME = "jarvis_mobile_prefs"
        const val KEY_SERVICE_ENABLED = "service_enabled"

        var isRunning = false
            private set

        var instance: JarvisForegroundService? = null
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

    fun sendDataPacket(payload: JSONObject) {
        val room = liveKitRoom ?: return
        val bytes = payload.toString().toByteArray(Charsets.UTF_8)
        serviceScope.launch {
            try {
                room.localParticipant.publishData(bytes)
                Log.d(TAG, "Sent data packet to Python agent: $payload")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send data packet: ${e.message}")
            }
        }
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())
    private var wakeLock: PowerManager.WakeLock? = null
    private var liveKitRoom: Room? = null
    private var explicitlyStopped = false

    // ── Audio Routing & Call Assistant Fix ────────────────────────────────
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var previousAudioMode = AudioManager.MODE_NORMAL

    /**
     * Acquires exclusive audio focus for the Call Assistant.
     * Sets MODE_IN_COMMUNICATION to prevent echo, Bluetooth routing issues,
     * and mic dropping during active phone call or VoIP session.
     */
    private fun acquireAudioFocusForAssistant() {
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        previousAudioMode = audioManager?.mode ?: AudioManager.MODE_NORMAL

        // Switch to COMMUNICATION mode (eliminates mic cutoff on calls)
        audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_LOSS -> {
                            Log.w(TAG, "Audio focus lost permanently. Re-requesting...")
                            acquireAudioFocusForAssistant()
                        }
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                            Log.d(TAG, "Audio focus lost transiently (phone call?). Holding...")
                        }
                        AudioManager.AUDIOFOCUS_GAIN -> {
                            Log.d(TAG, "Audio focus regained.")
                        }
                    }
                }
                .build()
            audioFocusRequest = focusRequest
            val result = audioManager?.requestAudioFocus(focusRequest)
            Log.d(TAG, "Audio focus request result: $result")
        } else {
            @Suppress("DEPRECATION")
            audioManager?.requestAudioFocus(
                { focusChange ->
                    Log.d(TAG, "Audio focus changed (legacy): $focusChange")
                },
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
            )
        }

        // Route audio through earpiece/speaker for clear 2-way voice
        audioManager?.isSpeakerphoneOn = false
        audioManager?.isBluetoothScoOn = false
        Log.d(TAG, "Call Assistant audio focus acquired. Mode: IN_COMMUNICATION")
    }

    private fun releaseAudioFocusForAssistant() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager?.abandonAudioFocus(null)
        }
        // Restore previous audio mode
        audioManager?.mode = previousAudioMode
        Log.d(TAG, "Call Assistant audio focus released.")
    }

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
        instance = this
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
        // ── Acquire audio focus for clear microphone + speaker routing ─────
        acquireAudioFocusForAssistant()
        connectToLiveKitRoom()

        // ── [NEW] Start wake word engine ("Hey Jarvis") ──────────────────
        if (wakeWordEngine == null) {
            wakeWordEngine = WakeWordEngine()
            wakeWordEngine?.start()
        }

        // ── [NEW] Start Jarvis Mic Bubble / 3D Orb Overlay if permitted ──
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && android.provider.Settings.canDrawOverlays(this)) {
            try {
                val overlayIntent = Intent(this, JarvisOverlayService::class.java).apply {
                    setAction(JarvisOverlayService.ACTION_SHOW_OVERLAY)
                    putExtra(JarvisOverlayService.EXTRA_OVERLAY_MODE, "bubble")
                    putExtra(JarvisOverlayService.EXTRA_AGENT_STATE, "idle")
                }
                startService(overlayIntent)
            } catch (e: Exception) {
                Log.w(TAG, "Could not start JarvisOverlayService: ${e.message}")
            }
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
        if (instance == this) {
            instance = null
        }
        isRunning = false
        // ── Release audio focus & restore audio mode ──────────────────────
        releaseAudioFocusForAssistant()
        // ── [NEW] Stop wake word engine ───────────────────────────────────
        wakeWordEngine?.stop()
        wakeWordEngine = null
        unregisterScreenStateReceiver()
        disconnectLiveKit()
        releaseWakeLock()

        // ── Hide floating overlay ─────────────────────────────────────────
        try {
            val hideOverlayIntent = Intent(this, JarvisOverlayService::class.java).apply {
                action = JarvisOverlayService.ACTION_HIDE_OVERLAY
            }
            startService(hideOverlayIntent)
        } catch (_: Exception) {}

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

                val livekitUrl = MobileConfig.getLiveKitUrl(this@JarvisForegroundService)
                val livekitKey = MobileConfig.getLiveKitKey(this@JarvisForegroundService)
                val livekitSecret = MobileConfig.getLiveKitSecret(this@JarvisForegroundService)
                val userName = MobileConfig.getUserName(this@JarvisForegroundService)

                Log.d(TAG, "Connecting to LiveKit room: $livekitUrl...")
                
                val room = LiveKit.create(applicationContext)
                liveKitRoom = room

                // Listen to room events
                serviceScope.launch {
                    room.events.events.collect { event ->
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
                                        room.localParticipant.publishData(identifyPayload)
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

                val identity = "mobile_user_${userName.lowercase()}_${System.currentTimeMillis() % 10000}"
                val token = MobileConfig.generateLiveKitToken(
                    apiKey = livekitKey,
                    apiSecret = livekitSecret,
                    roomName = MobileConfig.DEFAULT_ROOM_NAME,
                    identity = identity,
                    participantName = userName
                )
                room.connect(livekitUrl, token)

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
            // Activity detected: notify MainActivity to keep UI active / reset idle timer
            sendBroadcast(Intent(ACTION_RESET_IDLE).setPackage(packageName))

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

            Log.i(TAG_WW, "🔊 WAKE WORD DETECTED: \"$phrase\" → Activating Jarvis UI!")

            // 1. Wake screen if sleeping
            try {
                val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
                @Suppress("DEPRECATION")
                val screenLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                    "Jarvis::WakeWordScreenOn"
                )
                screenLock.acquire(3000L)
            } catch (e: Exception) {
                Log.w(TAG_WW, "Screen wakeup error: ${e.message}")
            }

            // 2. Prepare Intent to launch/bring MainActivity to front
            val bringIntent = Intent(applicationContext, MainActivity::class.java).apply {
                action = ACTION_WAKE_WORD_DETECTED
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra("from_wake_word", true)
                putExtra("phrase", phrase)
            }

            // 3. Direct launch
            try {
                startActivity(bringIntent)
            } catch (e: Exception) {
                Log.w(TAG_WW, "Direct startActivity error: ${e.message}")
            }

            // 4. Accessibility service launch fallback (bypasses Android 10+ background restriction)
            try {
                JarvisAccessibilityService.instance?.startActivity(bringIntent)
            } catch (e: Exception) {
                Log.w(TAG_WW, "Accessibility startActivity error: ${e.message}")
            }

            // 5. High-priority Full-Screen Notification (guaranteed foreground popup on Android 10-15)
            try {
                val fullScreenPendingIntent = PendingIntent.getActivity(
                    applicationContext,
                    1004,
                    bringIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
                )
                val alertNotification = NotificationCompat.Builder(this@JarvisForegroundService, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setContentTitle("Jarvis AI Assistant")
                    .setContentText("🎤 \"$phrase\" শোনা গেছে — আমি শুনছি...")
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setFullScreenIntent(fullScreenPendingIntent, true)
                    .setAutoCancel(true)
                    .build()
                val notifManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                notifManager.notify(1005, alertNotification)
            } catch (e: Exception) {
                Log.w(TAG_WW, "Full screen notification error: ${e.message}")
            }

            // 6. Send broadcast for any active receiver
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
