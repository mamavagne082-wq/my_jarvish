package com.jarvis.assistant.automation.whatsapp

/**
 * Representation of an incoming WhatsApp notification.
 */
data class WhatsAppNotification(
    val conversationKey: String, // sender or group name
    val senderName: String,
    val previewText: String,
    val isGroup: Boolean,
    val groupName: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val isPreviewHidden: Boolean = false
) {
    fun toSpeakableSummary(): String {
        return if (isPreviewHidden) {
            if (isGroup && groupName != null) {
                "You have a new message in group '$groupName' from $senderName, but preview content is hidden."
            } else {
                "You have a new message from $senderName, but preview content is hidden."
            }
        } else {
            if (isGroup && groupName != null) {
                "In group '$groupName', $senderName says: $previewText"
            } else {
                "Message from $senderName: $previewText"
            }
        }
    }
}
