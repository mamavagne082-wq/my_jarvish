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
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import android.util.Log
import androidx.core.app.NotificationCompat
import com.jarvis.assistant.automation.android.JarvisNotificationListenerService
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.track.RemoteAudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * 24/7 Standalone Jarvis Foreground Service for Android.
 * Fully autonomous: Operates 100% independently on mobile even when PC is completely OFF.
 * Provides hands-free Wake Word detection, continuous conversational voice loop,
 * full phone control (YouTube, Apps, Calls, WhatsApp, Messenger, Survey, Screen Lock),
 * and direct AI engine with multi-model failover.
 */
class JarvisForegroundService : Service() {

    companion object {
        private const val TAG = "JarvisForeground"
        private const val CHANNEL_ID = "jarvis_voice_channel"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.jarvis.assistant.START"
        const val ACTION_STOP = "com.jarvis.assistant.STOP"

        // Wake Word, Session State & Idle broadcast actions
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

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())
    private var wakeLock: PowerManager.WakeLock? = null
    private var explicitlyStopped = false

    // Audio & Loudspeaker Management
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    // Autonomous On-Device Voice Manager
    private var autonomousVoiceManager: AutonomousVoiceManager? = null

    // Text To Speech
    private var textToSpeech: TextToSpeech? = null
    private var ttsReady = false

    // Optional PC LiveKit Room (non-blocking)
    private var liveKitRoom: Room? = null

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
            stopAutonomousSession()
            stopForegroundService()
            return START_NOT_STICKY
        }

        explicitlyStopped = false
        setServiceEnabled(this, true)
        startAsForeground()

        // Initialize and start Autonomous Voice Engine
        if (autonomousVoiceManager == null) {
            autonomousVoiceManager = AutonomousVoiceManager()
            autonomousVoiceManager?.start()
        }

        // Show floating overlay if permitted
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
                SystemClock.elapsedRealtime() + 800,
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
        releaseAudioFocusForAssistant()
        autonomousVoiceManager?.stop()
        autonomousVoiceManager = null
        unregisterScreenStateReceiver()
        disconnectLiveKit()
        releaseWakeLock()

        try {
            textToSpeech?.stop()
            textToSpeech?.shutdown()
        } catch (_: Exception) {}
        textToSpeech = null
        ttsReady = false

        try {
            val hideOverlayIntent = Intent(this, JarvisOverlayService::class.java).apply {
                action = JarvisOverlayService.ACTION_HIDE_OVERLAY
            }
            startService(hideOverlayIntent)
        } catch (_: Exception) {}

        if (!explicitlyStopped && isServiceEnabled(this)) {
            Log.w(TAG, "Jarvis service killed by OS. Auto-resurrecting in 1s...")
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
                SystemClock.elapsedRealtime() + 1000,
                pendingIntent
            )
        }
        Log.d(TAG, "JarvisForegroundService destroyed")
    }

    // ── Local Text-To-Speech Setup with Utterance Listener ───────────────────
    private fun initLocalTTS(onInitDone: (() -> Unit)? = null) {
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

                    // Setup listener so mic resumes listening immediately after speaking
                    textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {
                            sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
                                setPackage(packageName)
                                putExtra("active", isSessionActive)
                                putExtra("state", "speaking")
                            })
                        }

                        override fun onDone(utteranceId: String?) {
                            serviceScope.launch(Dispatchers.Main) {
                                if (isSessionActive) {
                                    sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
                                        setPackage(packageName)
                                        putExtra("active", true)
                                        putExtra("state", "listening")
                                    })
                                    autonomousVoiceManager?.resumeListeningAfterSpeech()
                                }
                            }
                        }

                        override fun onError(utteranceId: String?) {
                            serviceScope.launch(Dispatchers.Main) {
                                if (isSessionActive) {
                                    autonomousVoiceManager?.resumeListeningAfterSpeech()
                                }
                            }
                        }
                    })

                    Log.d(TAG, "Local TextToSpeech initialized successfully with UtteranceListener")
                    onInitDone?.invoke()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not initialize local TTS: ${e.message}")
        }
    }

    fun speakTextLocally(text: String) {
        applyLoudspeakerSettings()
        autonomousVoiceManager?.pauseListeningForSpeech()

        if (!ttsReady || textToSpeech == null) {
            Log.w(TAG, "Local TTS not ready yet, queuing text: $text")
            initLocalTTS {
                speakTextLocally(text)
            }
            return
        }

        try {
            val utteranceId = "jarvis_tts_${System.currentTimeMillis()}"
            val params = Bundle().apply {
                putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
                putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
                putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
            }
            textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
            Log.i(TAG, "Jarvis speaking locally: \"$text\"")

            // Failsafe watchdog: resume listening if onDone not fired within expected time
            val maxWait = (text.length * 90L).coerceIn(2500L, 12000L)
            serviceScope.launch {
                delay(maxWait)
                if (isSessionActive) {
                    autonomousVoiceManager?.resumeListeningAfterSpeech()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "speakTextLocally error: ${e.message}")
            autonomousVoiceManager?.resumeListeningAfterSpeech()
        }
    }

    // ── Loudspeaker Audio Setup ─────────────────────────────────────────────
    fun applyLoudspeakerSettings() {
        try {
            audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager?.mode = AudioManager.MODE_NORMAL
            audioManager?.isSpeakerphoneOn = true
            audioManager?.isBluetoothScoOn = false

            val maxMusic = audioManager?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: 15
            audioManager?.setStreamVolume(AudioManager.STREAM_MUSIC, maxMusic, 0)
            val maxVoice = audioManager?.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL) ?: 7
            audioManager?.setStreamVolume(AudioManager.STREAM_VOICE_CALL, maxVoice, 0)
            Log.d(TAG, "Loudspeaker configured at max volume (Music: $maxMusic, Voice: $maxVoice)")
        } catch (e: Exception) {
            Log.w(TAG, "Error applying loudspeaker settings: ${e.message}")
        }
    }

    private fun acquireAudioFocusForAssistant() {
        try {
            audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setAcceptsDelayedFocusGain(true)
                    .build()
                audioFocusRequest = focusRequest
                audioManager?.requestAudioFocus(focusRequest)
            } else {
                @Suppress("DEPRECATION")
                audioManager?.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            }
            applyLoudspeakerSettings()
        } catch (e: Exception) {
            Log.w(TAG, "Audio focus acquire error: ${e.message}")
        }
    }

    private fun releaseAudioFocusForAssistant() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { audioManager?.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                audioManager?.abandonAudioFocus(null)
            }
        } catch (_: Exception) {}
    }

    // ── Foreground Notification Setup ───────────────────────────────────────
    private fun startAsForeground() {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jarvis AI Assistant (সক্রিয়)")
            .setContentText("মোবাইল সম্পূর্ণ স্বয়ংক্রিয়ভাবে প্রস্তুত • কথা বলুন বা নির্দেশ দিন")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Jarvis Autonomous Mobile Voice Channel",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps Jarvis connected to microphone and speaker 24/7 on mobile"
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
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    private fun registerScreenStateReceiver() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        try { registerReceiver(screenReceiver, filter) } catch (_: Exception) {}
    }

    private fun unregisterScreenStateReceiver() {
        try { unregisterReceiver(screenReceiver) } catch (_: Exception) {}
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (isServiceEnabled(this@JarvisForegroundService)) {
                acquireWakeLock()
                if (autonomousVoiceManager == null) {
                    autonomousVoiceManager = AutonomousVoiceManager()
                    autonomousVoiceManager?.start()
                }
            }
        }
    }

    private fun stopForegroundService() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ── Public Session Controls (Called from MainActivity & WebUI) ──────────
    fun connectSession() {
        startAutonomousSession(initialGreeting = true)
    }

    fun disconnectSession(sendByePacket: Boolean = true) {
        stopAutonomousSession()
    }

    fun startAutonomousSession(initialGreeting: Boolean = true) {
        isSessionActive = true
        applyLoudspeakerSettings()
        acquireAudioFocusForAssistant()

        sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
            setPackage(packageName)
            putExtra("active", true)
            putExtra("state", "listening")
        })

        if (initialGreeting) {
            val userName = MobileConfig.getUserName(this)
            speakTextLocally("হ্যালো $userName স্যার! জারভিস প্রস্তুত, বলুন কীভাবে সাহায্য করতে পারি?")
        }

        // Start interactive listening immediately
        autonomousVoiceManager?.resumeListeningAfterSpeech()

        // Optional non-blocking background PC connection
        startOptionalBackgroundLiveKit()
    }

    fun stopAutonomousSession() {
        isSessionActive = false
        releaseAudioFocusForAssistant()
        disconnectLiveKit()

        sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
            setPackage(packageName)
            putExtra("active", false)
            putExtra("state", "idle")
        })

        // Return to standby wake word listening
        if (isRunning && isServiceEnabled(this)) {
            autonomousVoiceManager?.resumeListeningAfterSpeech()
        }
    }

    fun setSpeakerphone(enabled: Boolean) {
        try {
            audioManager?.isSpeakerphoneOn = enabled
            if (enabled) applyLoudspeakerSettings()
        } catch (_: Exception) {}
    }

    fun isSessionConnected(): Boolean = isSessionActive

    // ── Autonomous Mobile Command & Tool Execution Engine ───────────────────
    fun handleUserSpokenCommand(commandText: String) {
        val clean = commandText.trim()
        if (clean.isBlank()) return
        val lower = clean.lowercase()

        Log.i(TAG, "Executing Autonomous Command: \"$clean\"")

        // 1. BYE / SHUTDOWN
        if (isMatch(lower, listOf("বাই বাই", "বিদায়", "বিদায়", "বন্ধ করো", "থাক", "ঘুমিয়ে পড়ো", "stop", "exit", "bye", "goodbye", "good bye"))) {
            MainActivity.instance?.runOnUiThread {
                MainActivity.instance?.postDirectTranscript(clean, "বাই বাই জানু, ধন্যবাদ তোমাকে!")
            }
            speakTextLocally("বাই বাই জানু, ধন্যবাদ তোমাকে!")
            disconnectSession(sendByePacket = false)
            return
        }

        // 2. LOCK DEVICE
        if (isMatch(lower, listOf("লক", "লক করো", "লক করে দাও", "স্ক্রিন বন্ধ", "ফোন লক", "মোবাইল লক", "lock", "lock screen", "turn off screen"))) {
            val reply = "মোবাইল স্ক্রিন লক করা হচ্ছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            JarvisAccessibilityService.instance?.handleCommand("lock", JSONObject())
            return
        }

        // 3. YOUTUBE SEARCH & PLAY
        if (isMatch(lower, listOf("ইউটিউব", "ইউটিউবে", "গান", "ভিডিও", "youtube", "play", "চালাও", "প্লে করো", "প্লে", "শোনাও", "সার্চ"))) {
            var query = clean
            val removeKeywords = listOf(
                "ইউটিউবে একটা গান চালাও", "ইউটিউবে গান চালাও", "ইউটিউবে", "ইউটিউব",
                "একটা গান চালাও", "গান চালাও", "গান প্লে করো", "গানটি চালাও", "গানটি প্লে করো",
                "ভিডিও চালাও", "ভিডিও প্লে করো", "প্লে করো", "চালাও", "শোনাও", "সার্চ করো",
                "খোঁজো", "খোজো", "play", "on youtube", "youtube", "song", "video", "search"
            )
            for (kw in removeKeywords) {
                query = query.replace(Regex("(?i)$kw"), "").trim()
            }
            if (query.isBlank() || query.length < 2) {
                query = "Iron Man Theme"
            }
            val reply = "ইউটিউবে '$query' সার্চ ও প্লে করা হচ্ছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            JarvisAccessibilityService.instance?.searchAndPlayYouTube(query)
            return
        }

        // 4. PHONE CALL & DIALER (SIM 1 Default)
        if (isMatch(lower, listOf("কল", "কল দাও", "কল করো", "ফোন দাও", "ফোন করো", "ডায়াল", "ডায়াল", "call", "dial"))) {
            val isDialpad = isMatch(lower, listOf("ডায়াল প্যাড", "ডায়াল প্যাড", "ডায়ালার", "ডায়ালার", "dialpad", "dialer"))
            var target = clean
            val callRemovals = listOf(
                "১ সিম দিয়ে", "১ সিম দিয়ে", "১ নম্বর সিম দিয়ে", "১ম সিম দিয়ে", "ওয়ান সিম দিয়ে",
                "one sim", "sim 1", "sim1", "ডায়াল প্যাড ওপেন করে", "ডায়াল প্যাড খুলে", "ডায়াল প্যাড",
                "কল দাও", "কল করো", "ফোন দাও", "ফোন করো", "ডায়াল করো", "ডায়াল করো", "কে", "call", "dial"
            )
            for (kw in callRemovals) {
                target = target.replace(Regex("(?i)$kw"), "").trim()
            }
            val reply = if (target.isBlank() || isDialpad) "ডায়াল প্যাড ওপেন করা হচ্ছে।" else "'$target'-কে কল দেওয়া হচ্ছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)

            val success = JarvisAccessibilityService.instance?.makePhoneCall(target.ifBlank { "dialer" }, simSlot = 1, openDialpad = isDialpad) ?: false
            if (!success && !isDialpad) {
                try {
                    val fallback = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${target.replace(Regex("[^0-9+]"), "")}")).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    startActivity(fallback)
                } catch (_: Exception) {}
            }
            return
        }

        // 5. WHATSAPP MESSAGE & CALL
        if (lower.contains("হোয়াটসঅ্যাপ") || lower.contains("whatsapp")) {
            val isCall = isMatch(lower, listOf("কল", "ভিডিও কল", "অডিও কল", "call"))
            if (isCall) {
                val reply = "হোয়াটসঅ্যাপ কল করা হচ্ছে।"
                MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
                speakTextLocally(reply)
                JarvisAccessibilityService.instance?.makeWhatsAppCall("", "voice")
                return
            }
            val reply = "হোয়াটসঅ্যাপ ওপেন করে মেসেজ পাঠানো হচ্ছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            JarvisAccessibilityService.instance?.sendWhatsAppMessage("", clean)
            return
        }

        // 6. MESSENGER / FACEBOOK MESSAGE
        if (lower.contains("মেসেঞ্জার") || lower.contains("messenger")) {
            val reply = "মেসেঞ্জারে মেসেজ পাঠানো হচ্ছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            JarvisAccessibilityService.instance?.sendMessengerMessage("", clean)
            return
        }

        // 7. OPEN APPLICATION
        if (isMatch(lower, listOf("ওপেন", "খোল", "খোলো", "চালু", "অন করো", "open", "launch", "start"))) {
            var appName = clean
            val openRemovals = listOf("অ্যাপস ওপেন করো", "অ্যাপ ওপেন করো", "ওপেন করো", "অ্যাপস খোলো", "অ্যাপ খোলো", "খোলো", "খোল", "চালু করো", "অন করো", "অ্যাপটি", "অ্যাপস", "open app", "open", "launch")
            for (kw in openRemovals) {
                appName = appName.replace(Regex("(?i)$kw"), "").trim()
            }
            if (appName.isNotBlank()) {
                val reply = "'$appName' অ্যাপটি চালু করা হচ্ছে।"
                MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
                speakTextLocally(reply)
                JarvisAccessibilityService.instance?.openApplication(appName)
                return
            }
        }

        // 8. SURVEY AUTOMATION
        if (isMatch(lower, listOf("সার্ভে", "সার্ভে করো", "অটো সার্ভে", "নেক্সট বাটন", "ফর্ম পূরণ", "survey", "auto survey"))) {
            val reply = "সার্ভে অটোমেশন কার্যকর করা হয়েছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            JarvisAccessibilityService.instance?.performSurveyAutomation()
            return
        }

        // 9. READ NOTIFICATIONS
        if (isMatch(lower, listOf("নোটিফিকেশন", "মেসেজ কি এসেছে", "নোটিফিকেশন পড়ো", "নোটিফিকেশন পড়ো", "read notification", "notifications"))) {
            val sender = JarvisNotificationListenerService.lastNotificationSender
            val text = JarvisNotificationListenerService.lastNotificationText
            val app = JarvisNotificationListenerService.lastNotificationApp
            val reply = if (sender.isNotBlank() && text.isNotBlank()) {
                "সর্বশেষ নোটিফিকেশন $app থেকে $sender পাঠিয়েছেন: $text"
            } else {
                "বর্তমানে কোনো নতুন আনরিড নোটিফিকেশন নেই।"
            }
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            return
        }

        // 10. VOLUME & BRIGHTNESS & SCROLL
        if (lower.contains("ভলিউম") || lower.contains("সাউন্ড") || lower.contains("শব্দ")) {
            val up = isMatch(lower, listOf("বাড়া", "বাড়া", "ফুল", "up", "high", "increase"))
            JarvisAccessibilityService.instance?.adjustVolume(increase = up)
            val reply = if (up) "ভলিউম বাড়ানো হয়েছে।" else "ভলিউম কমানো হয়েছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            return
        }

        if (lower.contains("ব্রাইটনেস") || lower.contains("আলো")) {
            val up = isMatch(lower, listOf("বাড়া", "বাড়া", "ফুল", "up", "high", "increase"))
            JarvisAccessibilityService.instance?.adjustScreenBrightness(increase = up)
            val reply = if (up) "স্ক্রিন ব্রাইটনেস বাড়ানো হয়েছে।" else "স্ক্রিন ব্রাইটনেস কমানো হয়েছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            return
        }

        if (lower.contains("স্ক্রোল") || lower.contains("scroll") || lower.contains("নিচে যাও") || lower.contains("উপরে যাও")) {
            val isUp = lower.contains("উপরে") || lower.contains("up")
            JarvisAccessibilityService.instance?.performScroll(if (isUp) "up" else "down")
            val reply = if (isUp) "উপরে স্ক্রোল করা হয়েছে।" else "নিচে স্ক্রোল করা হয়েছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            return
        }

        if (isMatch(lower, listOf("হোম", "হোমে যাও", "পিছনে", "পিছনে যাও", "ব্যাক", "home", "back"))) {
            val isHome = lower.contains("হোম") || lower.contains("home")
            JarvisAccessibilityService.instance?.performGlobalAction(
                if (isHome) android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME
                else android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK
            )
            val reply = if (isHome) "হোমে ফিরে যাওয়া হয়েছে।" else "পিছনে ফিরে যাওয়া হয়েছে।"
            MainActivity.instance?.runOnUiThread { MainActivity.instance?.postDirectTranscript(clean, reply) }
            speakTextLocally(reply)
            return
        }

        // 11. CONVERSATIONAL AI & GENERAL KNOWLEDGE
        sendBroadcast(Intent(ACTION_SESSION_STATE_CHANGED).apply {
            setPackage(packageName)
            putExtra("active", true)
            putExtra("state", "thinking")
        })

        queryDirectAI(clean) { reply ->
            MainActivity.instance?.runOnUiThread {
                MainActivity.instance?.postDirectTranscript(clean, reply)
            }
            speakTextLocally(reply)
        }
    }

    private fun isMatch(text: String, keywords: List<String>): Boolean {
        val lower = text.lowercase()
        for (kw in keywords) {
            if (lower.contains(kw.lowercase())) return true
        }
        return false
    }

    // ── Direct Multi-Model AI Engine (OpenRouter -> Torve -> Grok -> OpenAI -> Gemini -> Offline) ───────
    fun queryDirectAI(userPrompt: String, onResponse: (String) -> Unit) {
        serviceScope.launch(Dispatchers.IO) {
            val openRouterKey = MobileConfig.getOpenRouterKey(this@JarvisForegroundService)
            val torveKey = MobileConfig.getTorveKey(this@JarvisForegroundService)
            val grokKey = MobileConfig.getGrokKey(this@JarvisForegroundService)
            val openAiKey = MobileConfig.getOpenAiKey(this@JarvisForegroundService)
            val googleKey = MobileConfig.getGoogleKey(this@JarvisForegroundService)
            var answered = false

            // 1. OpenRouter Multi-Model Cloud API (Fast & Free models)
            if (!answered && openRouterKey.isNotBlank()) {
                val orModels = listOf(
                    "google/gemini-2.0-flash-exp:free",
                    "meta-llama/llama-3.3-70b-instruct:free",
                    "deepseek/deepseek-chat",
                    "openrouter/auto",
                    "mistralai/mistral-7b-instruct:free"
                )
                for (m in orModels) {
                    if (answered) break
                    try {
                        val result = callOpenRouterApi(openRouterKey, m, userPrompt)
                        if (result.isNotBlank()) {
                            answered = true
                            withContext(Dispatchers.Main) { onResponse(result) }
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "OpenRouter $m failed: ${e.message}")
                    }
                }
            }

            // 2. FastRouter / Torve AI
            if (!answered && torveKey.isNotBlank()) {
                try {
                    val result = callTorveAiApi(torveKey, "claude-opus-4-8", userPrompt)
                    if (result.isNotBlank()) {
                        answered = true
                        withContext(Dispatchers.Main) { onResponse(result) }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Torve AI failed: ${e.message}")
                }
            }

            // 3. Grok (xAI)
            if (!answered && grokKey.isNotBlank()) {
                try {
                    val result = callGrokApi(grokKey, "grok-beta", userPrompt)
                    if (result.isNotBlank()) {
                        answered = true
                        withContext(Dispatchers.Main) { onResponse(result) }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Grok failed: ${e.message}")
                }
            }

            // 4. OpenAI API (GPT-4o Mini)
            if (!answered && openAiKey.isNotBlank() && !openAiKey.startsWith("0")) {
                try {
                    val result = callOpenAiApi(openAiKey, "gpt-4o-mini", userPrompt)
                    if (result.isNotBlank()) {
                        answered = true
                        withContext(Dispatchers.Main) { onResponse(result) }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "OpenAI failed: ${e.message}")
                }
            }

            // 5. Google Gemini API (if key is valid and not AQ token)
            if (!answered && googleKey.isNotBlank() && googleKey != "0" && !googleKey.startsWith("AQ.")) {
                val geminiModels = listOf("gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash")
                for (model in geminiModels) {
                    if (answered) break
                    try {
                        val result = callGeminiApi(googleKey, model, userPrompt)
                        if (result.isNotBlank()) {
                            answered = true
                            withContext(Dispatchers.Main) { onResponse(result) }
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "Gemini $model failed: ${e.message}")
                    }
                }
            }

            // 6. Smart Offline Fallback (100% Offline Guaranteed - zero crash)
            if (!answered) {
                val offlineReply = generateSmartOfflineReply(userPrompt)
                withContext(Dispatchers.Main) { onResponse(offlineReply) }
            }
        }
    }

    private fun callGeminiApi(apiKey: String, model: String, prompt: String): String {
        val endpoint = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=${apiKey.trim()}"
        val url = java.net.URL(endpoint)
        val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 4000
            readTimeout = 6000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
        }

        val sysPrompt = "You are Jarvis, the high-tech AI companion for ALAMIN. " +
                "Reply naturally, smartly and concisely in Bengali (বাংলা). " +
                "Keep verbal response to 1-2 short punchy sentences suitable for speech output. " +
                "Do not include asterisks, emojis or markdown."

        val body = JSONObject().apply {
            val sysParts = JSONArray().apply {
                put(JSONObject().apply { put("text", sysPrompt) })
            }
            put("system_instruction", JSONObject().apply { put("parts", sysParts) })

            val contents = JSONArray().apply {
                val userObj = JSONObject().apply {
                    put("role", "user")
                    val parts = JSONArray().apply {
                        put(JSONObject().apply { put("text", prompt) })
                    }
                    put("parts", parts)
                }
                put(userObj)
            }
            put("contents", contents)

            val genConfig = JSONObject().apply {
                put("temperature", 0.7)
                put("maxOutputTokens", 150)
            }
            put("generationConfig", genConfig)
        }

        conn.outputStream.use { os ->
            os.write(body.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        if (code == 200) {
            val respText = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val jsonResp = JSONObject(respText)
            val text = jsonResp.optJSONArray("candidates")
                ?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
                ?.optJSONObject(0)
                ?.optString("text", "") ?: ""
            return text.trim()
        }
        conn.disconnect()
        throw Exception("HTTP $code")
    }

    private fun callOpenRouterApi(apiKey: String, model: String, prompt: String): String {
        val endpoint = "https://openrouter.ai/api/v1/chat/completions"
        val url = java.net.URL(endpoint)
        val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5000
            readTimeout = 8000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
        }

        val sysPrompt = "You are Jarvis, the personal AI companion for ALAMIN. " +
                "Reply naturally, smartly and concisely in Bengali (বাংলা). " +
                "Keep verbal response to 1-2 short punchy sentences suitable for speech output. " +
                "Do not include asterisks or markdown."

        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", 150)
            val messages = JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "system")
                    put("content", sysPrompt)
                })
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", prompt)
                })
            }
            put("messages", messages)
        }

        conn.outputStream.use { os ->
            os.write(body.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        if (code == 200) {
            val respText = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val jsonResp = JSONObject(respText)
            val text = jsonResp.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content", "") ?: ""
            return text.trim()
        }
        conn.disconnect()
        throw Exception("HTTP $code")
    }

    private fun callOpenAiApi(apiKey: String, model: String, prompt: String): String {
        val endpoint = "https://api.openai.com/v1/chat/completions"
        val url = java.net.URL(endpoint)
        val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5000
            readTimeout = 8000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
        }

        val sysPrompt = "You are Jarvis, the personal AI companion for ALAMIN. " +
                "Reply naturally, smartly and concisely in Bengali (বাংলা). " +
                "Keep verbal response to 1-2 short punchy sentences."

        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", 150)
            val messages = JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "system")
                    put("content", sysPrompt)
                })
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", prompt)
                })
            }
            put("messages", messages)
        }

        conn.outputStream.use { os ->
            os.write(body.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        if (code == 200) {
            val respText = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val jsonResp = JSONObject(respText)
            val text = jsonResp.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content", "") ?: ""
            return text.trim()
        }
        conn.disconnect()
        throw Exception("HTTP $code")
    }

    private fun callGrokApi(apiKey: String, model: String, prompt: String): String {
        val endpoint = "https://api.x.ai/v1/chat/completions"
        val url = java.net.URL(endpoint)
        val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5000
            readTimeout = 8000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
        }

        val sysPrompt = "You are Jarvis, the high-tech AI companion for ALAMIN. " +
                "Reply naturally, smartly and concisely in Bengali (বাংলা). " +
                "Keep verbal response to 1-2 short punchy sentences suitable for speech output."

        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", 150)
            val messages = JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "system")
                    put("content", sysPrompt)
                })
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", prompt)
                })
            }
            put("messages", messages)
        }

        conn.outputStream.use { os ->
            os.write(body.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        if (code == 200) {
            val respText = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val jsonResp = JSONObject(respText)
            return jsonResp.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content", "")?.trim() ?: ""
        }
        conn.disconnect()
        throw Exception("HTTP $code")
    }

    private fun callTorveAiApi(apiKey: String, model: String, prompt: String): String {
        val endpoint = "https://openrouter.ai/api/v1/chat/completions"
        val url = java.net.URL(endpoint)
        val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5000
            readTimeout = 8000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Authorization", "Bearer ${apiKey.trim()}")
        }

        val sysPrompt = "You are Jarvis, the high-tech AI companion for ALAMIN. " +
                "Reply naturally, smartly and concisely in Bengali (বাংলা). " +
                "Keep verbal response to 1-2 short punchy sentences suitable for speech output."

        val body = JSONObject().apply {
            put("model", model)
            put("max_tokens", 150)
            val messages = JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "system")
                    put("content", sysPrompt)
                })
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", prompt)
                })
            }
            put("messages", messages)
        }

        conn.outputStream.use { os ->
            os.write(body.toString().toByteArray(Charsets.UTF_8))
        }

        val code = conn.responseCode
        if (code == 200) {
            val respText = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            val jsonResp = JSONObject(respText)
            return jsonResp.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content", "")?.trim() ?: ""
        }
        conn.disconnect()
        throw Exception("HTTP $code")
    }

    private fun generateSmartOfflineReply(prompt: String): String {
        val lower = prompt.lowercase()
        return when {
            isMatch(lower, listOf("সময়", "টাইম", "কয়টা বাজে", "time")) -> {
                val timeStr = java.text.SimpleDateFormat("hh:mm a", Locale.getDefault()).format(java.util.Date())
                "এখন সময় $timeStr।"
            }
            isMatch(lower, listOf("তারিখ", "আজকে কি বার", "date", "day")) -> {
                val dateStr = java.text.SimpleDateFormat("EEEE, dd MMMM yyyy", Locale("bn", "BD")).format(java.util.Date())
                "আজকের তারিখ $dateStr।"
            }
            isMatch(lower, listOf("কেমন আছো", "how are you", "কেমন আছেন")) -> {
                "আমি চমৎকার আছি স্যার! আপনার সেবায় সর্বদা প্রস্তুত ও সক্রিয় আছি।"
            }
            isMatch(lower, listOf("তুমি কে", "তোমার নাম", "who are you", "your name")) -> {
                "আমি জারভিস, আপনার ব্যক্তিগত এআই সহকারী। আমি মোবাইল ও পিসির সমস্ত কাজ সম্পূর্ণ করতে পারি।"
            }
            isMatch(lower, listOf("ধন্যবাদ", "থ্যাংক ইউ", "thank you", "thanks")) -> {
                "আপনাকে অসংখ্য ধন্যবাদ স্যার! সবসময় আপনার সেবায় নিয়োজিত আছি।"
            }
            isMatch(lower, listOf("কি করতে পারো", "ফিচার", "সাহায্য", "help", "features")) -> {
                "আমি ইউটিউবে গান বাজানো, যেকোনো অ্যাপ চালু করা, কল দেওয়া, মেসেজ পাঠানো, স্ক্রিন লক করা, নোটিফিকেশন পড়া এবং সার্ভে অটোমেশন সহ সব কাজ করতে পারি।"
            }
            isMatch(lower, listOf("ব্যাটারি", "চার্জ", "battery", "charge")) -> {
                val bm = getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager
                val batLevel = bm?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
                if (batLevel >= 0) "বর্তমানে আপনার মোবাইলে $batLevel শতাংশ ব্যাটারি চার্জ রয়েছে।"
                else "ব্যাটারি চার্জ পর্যাপ্ত রয়েছে স্যার।"
            }
            isMatch(lower, listOf("কৌতুক", "হাসাও", "joke", "হাসি")) -> {
                "একজন প্রোগ্রামার বাজারে গিয়ে বলল: এক ডজন কলা দিন। যদি ডিম থাকে, ১০টা দিন। সে ১০ ডজন কলা নিয়ে ফিরে এল!"
            }
            isMatch(lower, listOf("সালাম", "আসসালামু আলাইকুম", "hello", "hi", "হাই", "হ্যালো")) -> {
                "ওয়ালাইকুমুস সালাম স্যার! জারভিস প্রস্তুত, আদেশ করুন।"
            }
            isMatch(lower, listOf("শুভ সকাল", "good morning")) -> {
                "শুভ সকাল স্যার! আজকের দিনটি আপনার দারুণ কাটুক।"
            }
            isMatch(lower, listOf("শুভ রাত্রি", "good night")) -> {
                "শুভ রাত্রি স্যার! শান্তিতে ঘুমান, আমি ব্যাকগ্রাউন্ডে সতর্ক আছি।"
            }
            else -> {
                "স্যার, আমি আপনার কথা শুনতে পাচ্ছি এবং সব কাজ করতে প্রস্তুত। বলুন আর কীভাবে সাহায্য করতে পারি?"
            }
        }
    }

    // ── Autonomous On-Device Voice Manager (Wake Word & Continuous Speech) ──
    inner class AutonomousVoiceManager {
        private val TAG_VM = "JarvisVoiceManager"
        private var speechRecognizer: SpeechRecognizer? = null
        private var isListening = false
        private var isPausedForTTS = false
        private var lastWakeActivationMs = 0L
        private val WAKE_COOLDOWN_MS = 2500L

        private val WAKE_PHRASES = listOf(
            "hey jarvis", "ok jarvis", "okay jarvis", "hi jarvis",
            "jarvis", "hello jarvis",
            "জারভিস", "হে জারভিস", "ও জারভিস", "হ্যালো জারভিস", "শোনো", "অ্যাসিস্ট্যান্ট"
        )

        fun start() {
            isListening = true
            isPausedForTTS = false
            serviceScope.launch(Dispatchers.Main) {
                initRecognizerAndListen()
            }
            Log.i(TAG_VM, "Autonomous Voice Manager started (24/7 Standalone Ready)")
        }

        fun stop() {
            isListening = false
            isPausedForTTS = false
            serviceScope.launch(Dispatchers.Main) {
                destroyRecognizer()
            }
            Log.i(TAG_VM, "Autonomous Voice Manager stopped")
        }

        fun pauseListeningForSpeech() {
            isPausedForTTS = true
            serviceScope.launch(Dispatchers.Main) {
                try {
                    speechRecognizer?.stopListening()
                } catch (_: Exception) {}
            }
        }

        fun resumeListeningAfterSpeech() {
            isPausedForTTS = false
            serviceScope.launch(Dispatchers.Main) {
                if (isListening && !isPausedForTTS) {
                    startListening()
                }
            }
        }

        private fun destroyRecognizer() {
            try {
                speechRecognizer?.stopListening()
                speechRecognizer?.destroy()
            } catch (_: Exception) {}
            speechRecognizer = null
        }

        private fun initRecognizerAndListen() {
            if (!isListening) return
            if (!SpeechRecognizer.isRecognitionAvailable(applicationContext)) {
                Log.w(TAG_VM, "Speech recognition is not available on this device.")
                return
            }
            destroyRecognizer()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(applicationContext).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {}
                    override fun onBeginningOfSpeech() {
                        sendBroadcast(Intent(ACTION_RESET_IDLE).setPackage(packageName))
                    }
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}

                    override fun onError(error: Int) {
                        if (isPausedForTTS) return
                        val delayMs = if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) 1000L else 350L
                        restartListening(delayMs)
                    }

                    override fun onResults(results: Bundle?) {
                        if (isPausedForTTS) return
                        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: emptyList<String>()
                        val heardText = matches.firstOrNull()?.trim() ?: ""

                        if (heardText.isNotBlank()) {
                            Log.i(TAG_VM, "Recognized: \"$heardText\" (SessionActive=$isSessionActive)")
                            if (isSessionActive) {
                                handleUserSpokenCommand(heardText)
                            } else {
                                val lower = heardText.lowercase()
                                var wakeFound = false
                                for (p in WAKE_PHRASES) {
                                    if (p in lower) {
                                        wakeFound = true
                                        break
                                    }
                                }
                                if (wakeFound) {
                                    triggerWakeWordActivation(heardText)
                                } else {
                                    restartListening(300L)
                                }
                            }
                        } else {
                            restartListening(300L)
                        }
                    }

                    override fun onPartialResults(partialResults: Bundle?) {
                        if (isPausedForTTS) return
                        val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim() ?: return
                        if (!isSessionActive) {
                            val lower = partial.lowercase()
                            for (p in WAKE_PHRASES) {
                                if (p in lower) {
                                    triggerWakeWordActivation(partial)
                                    break
                                }
                            }
                        }
                    }

                    override fun onEvent(eventType: Int, params: Bundle?) {}
                })
            }
            startListening()
        }

        private fun startListening() {
            if (!isListening || isPausedForTTS) return
            try {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "bn-BD")
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "bn-BD")
                    putExtra(RecognizerIntent.EXTRA_SUPPORTED_LANGUAGES, arrayListOf("bn-BD", "en-US"))
                    putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 300L)
                }
                speechRecognizer?.startListening(intent)
            } catch (e: Exception) {
                Log.w(TAG_VM, "Error starting speech listening: ${e.message}")
                restartListening(1000L)
            }
        }

        private fun restartListening(delayMs: Long) {
            if (!isListening || isPausedForTTS) return
            serviceScope.launch(Dispatchers.Main) {
                delay(delayMs)
                if (isListening && !isPausedForTTS) {
                    startListening()
                }
            }
        }

        private fun triggerWakeWordActivation(phrase: String) {
            val now = System.currentTimeMillis()
            if (now - lastWakeActivationMs < WAKE_COOLDOWN_MS) return
            lastWakeActivationMs = now

            Log.i(TAG_VM, "🔊 WAKE WORD DETECTED: \"$phrase\" -> Activating Jarvis Mobile UI!")

            // Wake screen if sleeping
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
            } catch (_: Exception) {}

            // Bring MainActivity to front
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

            try { startActivity(bringIntent) } catch (_: Exception) {}
            try { JarvisAccessibilityService.instance?.startActivity(bringIntent) } catch (_: Exception) {}

            // High-priority alert notification
            try {
                val fullScreenPendingIntent = PendingIntent.getActivity(
                    applicationContext, 1004, bringIntent,
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
            } catch (_: Exception) {}

            sendBroadcast(Intent(ACTION_WAKE_WORD_DETECTED).apply {
                setPackage(packageName)
                putExtra("phrase", phrase)
            })

            // Activate session with instant verbal response
            startAutonomousSession(initialGreeting = true)
        }
    }

    // ── Optional Non-Blocking Background LiveKit Link ────────────────────────
    fun sendDataPacket(payload: JSONObject) {
        val room = liveKitRoom ?: return
        val bytes = payload.toString().toByteArray(Charsets.UTF_8)
        serviceScope.launch {
            try {
                room.localParticipant.publishData(bytes)
                Log.d(TAG, "Sent data packet to PC agent: $payload")
            } catch (e: Exception) {
                Log.d(TAG, "Optional data packet send skipped: ${e.message}")
            }
        }
    }

    fun sendConfigSyncPacket(configJson: JSONObject? = null) {
        val payload = JSONObject().apply {
            put("type", "SYNC_CONFIG")
            val cfg = configJson ?: MobileConfig.getAllConfigJson(this@JarvisForegroundService)
            put("config", cfg)
            put("google_key", MobileConfig.getGoogleKey(this@JarvisForegroundService))
            put("openai_key", MobileConfig.getOpenAiKey(this@JarvisForegroundService))
            put("llm_model", MobileConfig.getLlmModel(this@JarvisForegroundService))
        }
        sendDataPacket(payload)
    }

    fun sendPlatformIdentify(isPairedOverride: Boolean? = null) {
        val isPaired = isPairedOverride ?: MobileConfig.isPcPaired(this)
        val identifyPayload = JSONObject().apply {
            put("type", "PLATFORM_IDENTIFY")
            put("platform", if (isPaired) "paired" else "mobile")
            put("paired", isPaired)
        }
        sendDataPacket(identifyPayload)
    }

    fun reconnectWithUpdatedKeys() {
        Log.i(TAG, "Re-syncing configuration with fresh API credentials...")
        sendConfigSyncPacket()
    }

    private fun startOptionalBackgroundLiveKit() {
        val livekitUrl = MobileConfig.getLiveKitUrl(this)
        val livekitKey = MobileConfig.getLiveKitKey(this)
        val livekitSecret = MobileConfig.getLiveKitSecret(this)
        if (livekitUrl.isBlank() || livekitKey.isBlank() || livekitSecret.isBlank()) return

        serviceScope.launch(Dispatchers.IO) {
            try {
                if (liveKitRoom != null && liveKitRoom?.state == Room.State.CONNECTED) return@launch
                connectToLiveKitRoom()
            } catch (e: Exception) {
                Log.d(TAG, "Optional LiveKit background link: ${e.message}")
            }
        }
    }

    private fun connectToLiveKitRoom() {
        serviceScope.launch {
            try {
                if (liveKitRoom != null && liveKitRoom?.state == Room.State.CONNECTED) return@launch

                val livekitUrl = MobileConfig.getLiveKitUrl(this@JarvisForegroundService)
                val livekitKey = MobileConfig.getLiveKitKey(this@JarvisForegroundService)
                val livekitSecret = MobileConfig.getLiveKitSecret(this@JarvisForegroundService)
                val userName = MobileConfig.getUserName(this@JarvisForegroundService)

                if (livekitUrl.isBlank() || livekitKey.isBlank() || livekitSecret.isBlank()) return@launch

                val room = LiveKit.create(applicationContext)
                liveKitRoom = room

                serviceScope.launch {
                    room.events.events.collect { event ->
                        when (event) {
                            is RoomEvent.Connected -> {
                                Log.d(TAG, "Optional LiveKit link connected in background")
                                sendConfigSyncPacket()
                            }
                            is RoomEvent.TrackSubscribed -> {
                                if (event.track is RemoteAudioTrack) {
                                    val remoteAudio = event.track as RemoteAudioTrack
                                    val pId = (event.participant.identity?.toString() ?: "").lowercase()
                                    val localId = (room.localParticipant.identity?.toString() ?: "").lowercase()
                                    if (pId.isNotBlank() && (pId == localId || (pId.contains("user") && !pId.contains("agent") && !pId.contains("jarvis")))) {
                                        try { remoteAudio.rtcTrack.setVolume(0.0) } catch (_: Exception) {}
                                    } else {
                                        try { remoteAudio.rtcTrack.setVolume(1.0) } catch (_: Exception) {}
                                    }
                                }
                            }
                            is RoomEvent.DataReceived -> {
                                handleIncomingDataPacket(event.data)
                            }
                            else -> {}
                        }
                    }
                }

                val cleanUser = userName.trim().lowercase().replace(Regex("[^a-z0-9_]"), "")
                val identity = "mobile_user_${cleanUser.ifEmpty { "alamin" }}"
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
                Log.d(TAG, "LiveKit background link attempt: ${e.message}")
            }
        }
    }

    private fun handleIncomingDataPacket(data: ByteArray) {
        try {
            sendBroadcast(Intent(ACTION_RESET_IDLE).setPackage(packageName))
            val text = String(data, Charsets.UTF_8)
            val json = JSONObject(text)
            val type = json.optString("type", "")
            if (type == "JARVIS_MOBILE_CMD") {
                val action = json.optString("action", "")
                val payload = json.optJSONObject("payload") ?: JSONObject()
                JarvisAccessibilityService.instance?.handleCommand(action, payload)
            }
        } catch (_: Exception) {}
    }

    fun disconnectLiveKit() {
        serviceScope.launch {
            try {
                liveKitRoom?.disconnect()
                liveKitRoom?.release()
                liveKitRoom = null
            } catch (_: Exception) {}
        }
    }
}
