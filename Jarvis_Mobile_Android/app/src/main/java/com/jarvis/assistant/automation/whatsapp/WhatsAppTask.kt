package com.jarvis.assistant.automation.whatsapp

enum class WhatsAppAction {
    SEND_MESSAGE,
    READ_UNREAD,
    READ_CHAT,
    MUTE_CHAT,
    UNMUTE_CHAT,
    MARK_READ,
    SEARCH_CHAT;

    companion object {
        fun fromString(str: String): WhatsAppAction? {
            return when (str.trim().lowercase()) {
                "send_message", "send", "compose" -> SEND_MESSAGE
                "read_unread", "unread" -> READ_UNREAD
                "read_chat", "read" -> READ_CHAT
                "mute_chat", "mute" -> MUTE_CHAT
                "unmute_chat", "unmute" -> UNMUTE_CHAT
                "mark_read" -> MARK_READ
                "search_chat", "search" -> SEARCH_CHAT
                else -> null
            }
        }
    }
}

enum class WhatsAppStatus {
    IDLE,
    IN_PROGRESS,
    AWAITING_CONFIRMATION,
    DRAFT_READY,
    SENT,
    SUBMITTED_UNVERIFIED,
    FAILED,
    CANCELLED,
    REJECTED,
    BUSY,
    APP_NOT_INSTALLED,
    ACCESSIBILITY_NOT_ENABLED,
    CONTACT_NOT_FOUND,
    CONTACT_AMBIGUOUS,
    USER_ACTION_REQUIRED,
    UNSUPPORTED_ACTION
}

data class WhatsAppTask(
    val taskId: String,
    val action: WhatsAppAction,
    val contactQuery: String? = null,
    var resolvedContact: String? = null,
    val message: String? = null,
    val mediaUri: String? = null,
    val mode: String = "execute", // "execute" or "draft"
    var currentStep: String = "START",
    var status: WhatsAppStatus = WhatsAppStatus.IDLE,
    var statusMessage: String = "",
    var isConfirmed: Boolean = false,
    var retryCount: Int = 0,
    val maxRetries: Int = 2
)
