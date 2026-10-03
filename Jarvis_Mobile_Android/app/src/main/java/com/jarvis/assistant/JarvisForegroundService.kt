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
import android.speech.tts.TextToSpeech
import java.util.Locale
import android.util.Log
import androidx.core.app.NotificationCompat
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.track.RemoteAudioTrack
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

        // ── Wake Word, Session State & Idle broadcast actions ──────────────
        const val ACTION_WAKE_WORD_DETECTED = "com.jarvis.assistant.WAKE_WORD"
        const val ACTION_SESSION_STATE_CHANGED = "com.jarvis.assistant.SESSION_STATE_CHANGED"
        const val ACTION_RESET_IDLE = "com.jarvis.assistant.RESET_IDLE"

        const val PREFS_NAME = "jarvis_mobile_prefs"
        const val KEY_SERVICE_ENABLED = "service_enabled"

        var isRunning = false
            private set

        var isSessionActive = false
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

    /**
     * Publishes platform identity to Jarvis Agent (Mobile standalone vs PC Paired).
     */
    fun sendPlatformIdentify(isPairedOverride: Boolean? = null) {
        val isPaired = isPairedOverride ?: MobileConfig.isPcPaired(this)
        val identifyPayload = JSONObject().apply {
            put("type", "PLATFORM_IDENTIFY")
            put("platform", if (isPaired) "paired" else "mobile")
            put("paired", isPaired)
        }
        sendDataPacket(identifyPayload)
        Log.i(TAG, "Dispatched PLATFORM_IDENTIFY packet: platform=${if (isPaired) "paired" else "mobile"}, paired=$isPaired")
    }

    // ── Local Text-To-Speech for Proactive Verbal Announcements ──────────
    private var textToSpeech: TextToSpeech? = null
    private var ttsReady = false

    private fun initLocalTTS() {
        try {
            textToSpeech = TextToSpeech(applicationContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    ttsReady = true
                    try {
                        val bn = Locale("bn", "BD")
                        if (textToSpeech?.isLanguageAvailable(bn) == TextToSpeech.LANG_AVAILABLE) {
                            textToSpeech?.language = bn
                        }
                    } catch (_: Exception) {}
                    Log.d(TAG, "Local TextToSpeech initialized successfully")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not initialize local TTS: ${e.message}")
        }
    }

    fun speakTextLocally(text: String) {
        if (!ttsReady || textToSpeech == null) return
        try {
            val params = Bundle().apply {
                putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_VOICE_CALL)
            }
            textToSpeech?.speak(text, TextToSpeech.QUEUE_ADD, params, "jarvis_tts_${System.currentTimeMillis()}")
        } catch (e: Exception) {
            Log.w(TAG, "speakTextLocally error: ${e.message}")
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
     * Applies loudspeaker routing and maximizes audio volume.
     * Ensures Jarvis is loud and crystal clear through the device speaker.
     */
    fun applyLoudspeakerSettings() {
        try {
            audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
            audioManager?.isSpeakerphoneOn = true
            audioManager?.isBluetoothScoOn = false

            // Maximize volume streams so Jarvis voice is loud, clear, and doesn't get muffled
            val maxVoice = audioManager?.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL) ?: 7
            audioManager?.setStreamVolume(AudioManager.STREAM_VOICE_CALL, maxVoice, 0)
            val maxMusic = audioManager?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: 15
            audioManager?.setStreamVolume(AudioManager.STREAM_MUSIC, maxMusic, 0)
            Log.d(TAG, "Loudspeaker configured at max volume (Voice: $maxVoice, Music: $maxMusic)")
        } catch (e: Exception) {
            Log.w(TAG, "Error applying loudspeaker settings: ${e.message}")
        }
    }

    /**
     * Acquires audio focus for active voice conversation.
     * Sets MODE_IN_COMMUNICATION to enable hardware Acoustic Echo Cancellation (AEC)
     * and Noise Suppression (NS) on the device chipset.
     */
    private fun acquireAudioFocusForAssistant() {
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        previousAudioMode = audioManager?.mode ?: AudioManager.MODE_NORMAL

        // Switch to COMMUNICATION mode for hardware AEC and clear VoIP audio
        audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener { focusChange ->
                    Log.d(TAG, "Audio focus changed: $focusChange")
                    if (focusChange == AudioManager.AUDIOFOCUS_GAIN && isSessionActive) {
                        applyLoudspeakerSettings()
                    }
                }
                .build()
            audioFocusRequest = focusRequest
            audioManager?.requestAudioFocus(focusRequest)
        } else {
            @Suppress("DEPRECATION")
            audioManager?.requestAudioFocus(
                null,
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN
            )
        }

        applyLoudspeakerSettings()
        Log.d(TAG, "Call Assistant audio focus acquired. Mode: IN_COMMUNICATION, Loudspeaker: ON")
    }

    private fun releaseAudioFocusForAssistant() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                audioManager?.abandonAudioFocus(null)
            }
            audioManager?.mode = AudioManager.MODE_NORMAL
            audioManager?.isSpeakerphoneOn = false
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing audio focus: ${e.message}")
        }
        Log.d(TAG, "Call Assistant audio focus released. Restored normal mode.")
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
        initLocalTTS()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            explicitlyStopped = true
            setServiceEnabled(this, false)
            disconnectSession(sendByePacket = false)
            stopForegroundService()
            return START_NOT_STICKY
        }

        explicitlyStopped = false
        setServiceEnabled(this, true)
        startAsForeground()

        // Standby mode: only start wake word engine if not in active call
        if (wakeWordEngine == null && !isSessionActive) {
            wakeWordEngine = WakeWordEngine()
            wakeWordEngine?.start()
        }

        // ── Start Jarvis Mic Bubble / 3D Orb Overlay if permitted ──
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && android.provider.Settings.canDrawOverlays(this)) {
            try {
                val overlayIntent = Intent(this, JarvisOverlayService::class.java).apply {
                    setAction(JarvisOverlayService.ACTION_SHOW_OVERLAY)
                    putExtra(JarvisOverlayService.EXTRA_OVERLAY_MODE, "bubble")
                    putExtra(JarvisOverlayService.EXTRA_AGENT_STATE, if (isSessionActive) "listening" else "idle")
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
        try {
            textToSpeech?.stop()
            textToSpeech?.shutdown()
        } catch (_: Exception) {}
        textToSpeech = null
        ttsReady = false

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
     * Enforces hardware AEC, loudspeaker output, and track filtering to eliminate any echo.
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

                if (livekitUrl.isBlank() || livekitKey.isBlank() || livekitSecret.isBlank()) {
                    Log.w(TAG, "LiveKit credentials missing. Please configure in Settings.")
                    isSessionActive = false
                    sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
                        setPackage(packageName)
                        putExtra("active", false)
                        putExtra("state", "idle")
                        putExtra("error", "missing_keys")
                    })
                    return@launch
                }

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
                                applyLoudspeakerSettings()

                                // Send platform identity to Jarvis Agent (Mobile vs Paired)
                                sendPlatformIdentify()

                                sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
                                    setPackage(packageName)
                                    putExtra("active", true)
                                    putExtra("state", "listening")
                                })
                            }
                            is RoomEvent.TrackSubscribed -> {
                                if (event.track is RemoteAudioTrack) {
                                    val remoteAudio = event.track as RemoteAudioTrack
                                    val pId = (event.participant.identity?.toString() ?: "").lowercase()
                                    val localId = (room.localParticipant.identity?.toString() ?: "").lowercase()
                                    Log.d(TAG, "TrackSubscribed from remote participant: $pId (local: $localId)")

                                    // Mute only if it's our own local identity or user audio feedback; ALWAYS unmute the assistant!
                                    if (pId.isNotBlank() && (pId == localId || (pId.contains("user") && !pId.contains("agent") && !pId.contains("jarvis")))) {
                                        Log.d(TAG, "Muting duplicate audio track from $pId")
                                        try { remoteAudio.rtcTrack.setVolume(0.0) } catch (_: Exception) {}
                                    } else {
                                        Log.d(TAG, "Unmuting Jarvis assistant audio track at full volume from $pId")
                                        try { remoteAudio.rtcTrack.setVolume(1.0) } catch (_: Exception) {}
                                    }
                                    applyLoudspeakerSettings()
                                }
                            }
                            is RoomEvent.Disconnected -> {
                                Log.w(TAG, "LiveKit room disconnected.")
                                if (isSessionActive && isRunning && isServiceEnabled(this@JarvisForegroundService)) {
                                    Log.d(TAG, "Unexpected drop during active session. Auto-reconnecting in 3s...")
                                    delay(3000)
                                    if (isSessionActive) {
                                        connectToLiveKitRoom()
                                    }
                                } else {
                                    Log.d(TAG, "LiveKit session ended intentionally. Standby mode active.")
                                    sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
                                        setPackage(packageName)
                                        putExtra("active", false)
                                        putExtra("state", "idle")
                                    })
                                }
                            }
                            is RoomEvent.DataReceived -> {
                                handleIncomingDataPacket(event.data)
                            }
                            else -> {}
                        }
                    }
                }

                // Deterministic participant identity
                val cleanUser = userName.trim().lowercase().replace(Regex("[^a-z0-9_]"), "")
                val identity = "mobile_user_${cleanUser.ifEmpty { "alamin" }}"

                // Unique room name per active session ensures LiveKit Cloud immediately dispatches an active agent instance
                val sessionRoom = "voice_assistant_room_${System.currentTimeMillis() / 1000}"

                val token = MobileConfig.generateLiveKitToken(
                    apiKey = livekitKey,
                    apiSecret = livekitSecret,
                    roomName = sessionRoom,
                    identity = identity,
                    participantName = userName
                )
                room.connect(livekitUrl, token)

            } catch (e: Exception) {
                Log.e(TAG, "Failed to connect to LiveKit: ${e.message}", e)
                if (isSessionActive && isRunning && isServiceEnabled(this@JarvisForegroundService)) {
                    delay(5000)
                    if (isSessionActive) {
                        connectToLiveKitRoom()
                    }
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

    fun isSessionConnected(): Boolean {
        return liveKitRoom != null && liveKitRoom?.state == Room.State.CONNECTED
    }

    fun connectSession() {
        if (!MobileConfig.hasValidCredentials(this)) {
            Log.w(TAG, "Cannot connect session: Missing LiveKit credentials in Settings")
            sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
                setPackage(packageName)
                putExtra("active", false)
                putExtra("state", "idle")
                putExtra("error", "missing_keys")
            })
            return
        }

        isSessionActive = true
        // Pause wake word engine so it releases the microphone completely for WebRTC
        wakeWordEngine?.stop()
        wakeWordEngine = null

        acquireAudioFocusForAssistant()
        connectToLiveKitRoom()
    }

    fun disconnectSession(sendByePacket: Boolean = true) {
        val wasActive = isSessionActive
        isSessionActive = false

        if (sendByePacket && liveKitRoom != null && liveKitRoom?.state == Room.State.CONNECTED) {
            try {
                val byeJson = JSONObject().apply { put("type", "SAY_BYE") }
                sendDataPacket(byeJson)
                Log.d(TAG, "SAY_BYE packet sent to Jarvis agent")
            } catch (e: Exception) {
                Log.w(TAG, "Could not send SAY_BYE: ${e.message}")
            }
        }

        serviceScope.launch {
            if (sendByePacket && wasActive) {
                delay(1200) // Allow SAY_BYE data packet to flush to agent before disconnecting socket
            }
            disconnectLiveKit()
            releaseAudioFocusForAssistant()
            sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
                setPackage(packageName)
                putExtra("active", false)
                putExtra("state", "idle")
            })

            // Resume wake word engine for standby listening if service is running
            if (isRunning && isServiceEnabled(this@JarvisForegroundService) && wakeWordEngine == null) {
                wakeWordEngine = WakeWordEngine()
                wakeWordEngine?.start()
            }
        }
    }

    fun setSpeakerphone(enabled: Boolean) {
        try {
            audioManager?.isSpeakerphoneOn = enabled
            if (enabled) {
                applyLoudspeakerSettings()
            }
            Log.d(TAG, "Speakerphone set to: $enabled")
        } catch (_: Exception) {}
    }

    fun disconnectLiveKit() {
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

            // Connect voice call session upon wake word detection
            connectSession()
        }
    }
}
