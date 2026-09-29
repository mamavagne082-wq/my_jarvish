package com.jarvis.assistant.automation.social

enum class SocialPlatform {
    INSTAGRAM,
    FACEBOOK;

    companion object {
        fun fromString(str: String): SocialPlatform? {
            return when (str.trim().lowercase()) {
                "instagram", "ig" -> INSTAGRAM
                "facebook", "fb" -> FACEBOOK
                else -> null
            }
        }
    }
}

enum class SocialAction {
    POST,
    REEL,
    STORY,
    TEXT_POST;

    companion object {
        fun fromString(str: String): SocialAction? {
            return when (str.trim().lowercase()) {
                "post", "photo_post", "feed_post" -> POST
                "reel", "video_post" -> REEL
                "story" -> STORY
                "text_post", "status" -> TEXT_POST
                else -> null
            }
        }
    }
}

enum class SocialTaskStatus {
    IDLE,
    IN_PROGRESS,
    AWAITING_CONFIRMATION,
    DRAFT_READY,
    PUBLISHED,
    SUBMITTED_UNVERIFIED,
    FAILED,
    CANCELLED,
    REJECTED,
    BUSY,
    APP_NOT_INSTALLED,
    ACCESSIBILITY_NOT_ENABLED,
    MEDIA_REQUIRED,
    SHARE_TARGET_NOT_FOUND,
    USER_ACTION_REQUIRED,
    UNSUPPORTED_ACTION
}

data class SocialMediaTask(
    val taskId: String,
    val platform: SocialPlatform,
    val action: SocialAction,
    val mediaUri: String? = null,
    val mediaMimeType: String? = null,
    val caption: String? = null,
    val mode: String = "execute", // "execute" or "draft"
    val targetAccount: String? = null,
    var currentStep: String = "START",
    var status: SocialTaskStatus = SocialTaskStatus.IDLE,
    var statusMessage: String = "",
    var isConfirmed: Boolean = false,
    var retryCount: Int = 0,
    val maxRetries: Int = 2
)
