package com.jarvis.assistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
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

        var isRunning = false
            private set
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())
    private var wakeLock: PowerManager.WakeLock? = null
    private var liveKitRoom: Room? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START

        if (action == ACTION_STOP) {
            stopForegroundService()
            return START_NOT_STICKY
        }

        startAsForeground()
        connectToLiveKitRoom()

        isRunning = true
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        disconnectLiveKit()
        releaseWakeLock()
        Log.d(TAG, "JarvisForegroundService destroyed")
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
                            }
                            is RoomEvent.Disconnected -> {
                                Log.w(TAG, "Room disconnected. Attempting auto-reconnect in 3s...")
                                delay(3000)
                                if (isRunning) connectToLiveKitRoom()
                            }
                            is RoomEvent.DataReceived -> {
                                handleIncomingDataPacket(event.data)
                            }
                            else -> {}
                        }
                    }
                }

                // In LiveKit Cloud, client connects with token or credentials
                val token = generateOrFetchToken()
                room.connect(MobileConfig.LIVEKIT_URL, token)

            } catch (e: Exception) {
                Log.e(TAG, "Failed to connect to LiveKit: ${e.message}", e)
                delay(5000)
                if (isRunning) connectToLiveKitRoom()
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
        // Token provided or generated by backend token service
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
}
