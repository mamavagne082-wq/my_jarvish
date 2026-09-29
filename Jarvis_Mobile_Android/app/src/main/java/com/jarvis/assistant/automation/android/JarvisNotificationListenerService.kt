package com.jarvis.assistant.automation.android

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.jarvis.assistant.automation.whatsapp.WhatsAppNotification
import com.jarvis.assistant.automation.whatsapp.WhatsAppNotificationReader
import com.jarvis.assistant.automation.whatsapp.WhatsAppSelectors

class JarvisNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "JarvisNotifListener"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val pkg = sbn.packageName ?: return

        if (!WhatsAppSelectors.isWhatsAppPackage(pkg)) {
            return
        }

        try {
            val extras = sbn.notification.extras ?: return
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
            val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
            val preview = if (bigText.isNotEmpty()) bigText else text

            val isGroup = title.contains(":") || extras.containsKey(Notification.EXTRA_IS_GROUP_CONVERSATION)
            val senderName = if (isGroup && title.contains(":")) title.substringBefore(":").trim() else title
            val groupName = if (isGroup && title.contains(":")) title.substringAfter(":").trim() else null

            // Detect hidden content or media without text
            val isHidden = preview.isEmpty() ||
                    preview.contains("new messages", ignoreCase = true) ||
                    preview.contains("hidden", ignoreCase = true)

            val conversationKey = groupName ?: senderName

            if (conversationKey.isNotEmpty()) {
                val notif = WhatsAppNotification(
                    conversationKey = conversationKey,
                    senderName = senderName.ifEmpty { "WhatsApp" },
                    previewText = preview,
                    isGroup = isGroup,
                    groupName = groupName,
                    timestamp = sbn.postTime,
                    isPreviewHidden = isHidden
                )
                WhatsAppNotificationReader.recordNotification(notif)
                Log.d(TAG, "Recorded WhatsApp notification from '$conversationKey'")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing notification: ${e.message}")
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val pkg = sbn.packageName ?: return
        if (!WhatsAppSelectors.isWhatsAppPackage(pkg)) return

        try {
            val title = sbn.notification.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val key = if (title.contains(":")) title.substringBefore(":").trim() else title
            if (key.isNotEmpty()) {
                WhatsAppNotificationReader.removeNotification(key)
                Log.d(TAG, "Cleared WhatsApp notification for '$key'")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling notification removal: ${e.message}")
        }
    }
}
