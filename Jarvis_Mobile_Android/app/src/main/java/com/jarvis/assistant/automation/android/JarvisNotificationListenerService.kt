package com.jarvis.assistant.automation.android

import android.app.Notification
import android.content.Context
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.jarvis.assistant.JarvisForegroundService
import org.json.JSONObject

class JarvisNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "JarvisNotifListener"
        var instance: JarvisNotificationListenerService? = null

        var lastNotificationSender: String = ""
        var lastNotificationApp: String = ""
        var lastNotificationText: String = ""
        var lastNotificationPackage: String = ""
        var lastNotificationTime: Long = 0L
        var lastDirectReplyAction: Notification.Action? = null

        private var lastAnnouncedKey: String = ""
        private var lastAnnouncedTime: Long = 0L
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.d(TAG, "JarvisNotificationListenerService started")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val pkg = sbn.packageName ?: return

        // Ignore Jarvis's own notifications & ongoing persistent services
        if (pkg == packageName) return
        if (sbn.isOngoing && !sbn.isClearable) return

        try {
            val notification = sbn.notification ?: return
            val extras = notification.extras ?: return

            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
            val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: ""
            val preview = if (bigText.isNotEmpty()) bigText else text

            if (preview.isEmpty() && title.isEmpty()) return

            // Filter out system battery / charging / usb noise
            if (pkg.contains("android.systemui") && (title.contains("charging", true) || title.contains("usb", true))) {
                return
            }

            // Friendly App Name resolution
            val appName = getFriendlyAppName(pkg)
            val isMessagingApp = isMessagePackage(pkg) ||
                    extras.containsKey(Notification.EXTRA_IS_GROUP_CONVERSATION) ||
                    extras.containsKey(Notification.EXTRA_MESSAGING_PERSON)

            val isGroup = title.contains(":") || extras.containsKey(Notification.EXTRA_IS_GROUP_CONVERSATION)
            val sender = if (isGroup && title.contains(":")) title.substringBefore(":").trim() else title

            // Check duplicate suppression within 4 seconds
            val dedupeKey = "$pkg:$sender:$preview"
            val now = System.currentTimeMillis()
            if (dedupeKey == lastAnnouncedKey && (now - lastAnnouncedTime) < 4000L) {
                return
            }
            lastAnnouncedKey = dedupeKey
            lastAnnouncedTime = now

            // Save state for auto-replying
            lastNotificationSender = sender
            lastNotificationApp = appName
            lastNotificationText = preview
            lastNotificationPackage = pkg
            lastNotificationTime = now

            // Extract Direct Reply Action if available
            extractDirectReplyAction(notification)

            Log.i(TAG, "Notification received from [$appName] ($sender): $preview")

            // 1. Dispatch event to LiveKit Agent
            val packet = JSONObject().apply {
                put("type", "INCOMING_NOTIFICATION")
                put("app", appName)
                put("package", pkg)
                put("sender", sender)
                put("text", preview)
                put("is_message", isMessagingApp)
                put("timestamp", now)
            }
            JarvisForegroundService.instance?.sendDataPacket(packet)

            // 2. Local verbal announcement
            val announcement = if (isMessagingApp) {
                val s = if (sender.isNotBlank()) "$sender-এর কাছ থেকে " else ""
                "ভাই, $appName-এ ${s}মেসেজ আসছে: $preview"
            } else {
                "ভাই, $appName থেকে নোটিফিকেশন আসছে: $preview"
            }

            // If LiveKit room is not connected, speak using local Android TTS
            if (!JarvisForegroundService.isSessionActive) {
                JarvisForegroundService.instance?.speakTextLocally(announcement)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing incoming notification: ${e.message}")
        }
    }

    private fun isMessagePackage(pkg: String): Boolean {
        val p = pkg.lowercase()
        return p.contains("whatsapp") || p.contains("orca") || p.contains("messenger") ||
                p.contains("telegram") || p.contains("instagram") || p.contains("mms") ||
                p.contains("messaging") || p.contains("imo") || p.contains("viber") ||
                p.contains("twitter") || p.contains("line")
    }

    private fun getFriendlyAppName(pkg: String): String {
        return when {
            pkg.startsWith("com.whatsapp.w4b") -> "WhatsApp Business"
            pkg.startsWith("com.whatsapp") -> "WhatsApp"
            pkg.startsWith("com.facebook.orca") || pkg.startsWith("com.facebook.mlite") -> "Messenger"
            pkg.startsWith("com.facebook.katana") || pkg.startsWith("com.facebook.lite") -> "Facebook"
            pkg.startsWith("com.instagram.android") || pkg.startsWith("com.instagram.lite") -> "Instagram"
            pkg.startsWith("org.telegram.messenger") || pkg.contains("telegram") -> "Telegram"
            pkg.startsWith("com.google.android.apps.messaging") || pkg.startsWith("com.android.mms") -> "Messages"
            pkg.startsWith("com.google.android.gm") -> "Gmail"
            pkg.startsWith("com.google.android.youtube") -> "YouTube"
            pkg.startsWith("com.imo.android.imoim") -> "Imo"
            pkg.startsWith("com.bKash.customerapp") -> "bKash"
            pkg.startsWith("com.konasl.nagad") -> "Nagad"
            else -> {
                try {
                    val appInfo = packageManager.getApplicationInfo(pkg, 0)
                    packageManager.getApplicationLabel(appInfo).toString()
                } catch (_: Exception) {
                    pkg.substringAfterLast(".").replaceFirstChar { it.uppercase() }
                }
            }
        }
    }

    private fun extractDirectReplyAction(notification: Notification) {
        val actions = notification.actions ?: return
        for (action in actions) {
            val remoteInputs = action.remoteInputs ?: continue
            for (ri in remoteInputs) {
                if (ri.allowFreeFormInput) {
                    lastDirectReplyAction = action
                    Log.d(TAG, "Found free-form direct reply action for notification")
                    return
                }
            }
        }
    }

    /**
     * Sends a direct reply to the last message notification without opening the app if possible.
     */
    fun sendDirectReply(replyText: String): Boolean {
        val action = lastDirectReplyAction ?: return false
        val remoteInputs = action.remoteInputs ?: return false
        for (ri in remoteInputs) {
            try {
                val bundle = Bundle().apply {
                    putCharSequence(ri.resultKey, replyText)
                }
                val intent = android.content.Intent()
                android.app.RemoteInput.addResultsToIntent(arrayOf(ri), intent, bundle)
                action.actionIntent.send(this, 0, intent)
                Log.i(TAG, "Direct reply sent successfully: '$replyText'")
                return true
            } catch (e: Exception) {
                Log.e(TAG, "Error sending direct reply: ${e.message}")
            }
        }
        return false
    }
}
