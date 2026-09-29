package com.jarvis.assistant.automation.whatsapp

import java.util.concurrent.ConcurrentHashMap

/**
 * Tracks unread WhatsApp notifications captured by NotificationListenerService.
 * Read-only path that requires no screen automation or Accessibility privileges.
 */
object WhatsAppNotificationReader {

    // Keyed by conversation identifier (e.g. sender or group name)
    private val unreadMap = ConcurrentHashMap<String, WhatsAppNotification>()

    fun recordNotification(notification: WhatsAppNotification) {
        unreadMap[notification.conversationKey] = notification
    }

    fun removeNotification(conversationKey: String) {
        unreadMap.remove(conversationKey)
    }

    fun clearAll() {
        unreadMap.clear()
    }

    fun getUnreadCount(): Int = unreadMap.size

    fun getAllUnread(): List<WhatsAppNotification> {
        return unreadMap.values.sortedByDescending { it.timestamp }
    }

    fun getUnreadForContact(contactQuery: String): WhatsAppNotification? {
        val clean = contactQuery.trim().lowercase()
        return unreadMap.values.firstOrNull {
            it.senderName.lowercase().contains(clean) ||
                    (it.groupName?.lowercase()?.contains(clean) == true)
        }
    }

    fun getSummary(): String {
        val unreadList = getAllUnread()
        if (unreadList.isEmpty()) {
            return "No unread WhatsApp messages."
        }

        if (unreadList.size == 1) {
            val single = unreadList.first()
            return "You have 1 unread message. ${single.toSpeakableSummary()}"
        }

        val sb = StringBuilder()
        sb.append("You have ${unreadList.size} unread conversations: ")
        val summaries = unreadList.take(3).map {
            if (it.isPreviewHidden) "${it.senderName} (preview hidden)"
            else "${it.senderName}: \"${it.previewText}\""
        }
        sb.append(summaries.joinToString("; "))
        if (unreadList.size > 3) {
            sb.append(" and ${unreadList.size - 3} more.")
        }
        return sb.toString()
    }
}
