package com.jarvis.assistant.automation.social

import com.jarvis.assistant.automation.core.RegionPreference
import com.jarvis.assistant.automation.core.TargetSelector

object InstagramSelectors {

    const val PACKAGE_INSTAGRAM = "com.instagram.android"

    // Dangerous share targets to strictly exclude
    val DANGEROUS_TARGET_KEYWORDS = listOf("direct", "group", "message", "chat", "inbox", "messenger", "profile")

    /**
     * Home '+' Create button resolved via structural anchor (no hardcoded coordinates).
     * The clickable ImageView on the same row and entirely LEFT of 'Instagram Home Feed' / id 'title_logo'.
     */
    val CREATE_BUTTON = TargetSelector(
        name = "ig_create_button",
        resourceIds = listOf("action_bar_create_button", "creation_tab"),
        requireClickable = true,
        regionPreference = RegionPreference.TOP,
        structuralAnchor = { candidate, obs ->
            val homeLogo = obs.elements.firstOrNull {
                it.bareResourceId == "title_logo" ||
                        it.contentDescription.contains("Instagram", ignoreCase = true)
            }
            if (homeLogo != null) {
                candidate.bounds.onSameRow(homeLogo.bounds) &&
                        candidate.bounds.isEntirelyLeftOf(homeLogo.bounds) &&
                        candidate.clickable
            } else {
                candidate.contentDescription.contains("Create", ignoreCase = true) ||
                        candidate.contentDescription.contains("New post", ignoreCase = true)
            }
        }
    )

    /**
     * Next button across Gallery, Editor, and Reel editor.
     */
    val NEXT_BUTTON = TargetSelector(
        name = "ig_next_button",
        resourceIds = listOf(
            "com.instagram.android:id/next_button_textview",
            "next_button_textview",
            "com.instagram.android:id/media_thumbnail_tray_button",
            "media_thumbnail_tray_button",
            "com.instagram.android:id/clips_right_action_button",
            "clips_right_action_button"
        ),
        exactTexts = listOf("Next"),
        exactDescriptions = listOf("Next"),
        requireClickable = true
    )

    /**
     * Caption input field.
     */
    val CAPTION_FIELD = TargetSelector(
        name = "ig_caption_field",
        resourceIds = listOf(
            "com.instagram.android:id/caption_input_text_view",
            "caption_input_text_view"
        ),
        exactTexts = listOf("Add a caption..."),
        semanticHints = listOf("write a caption", "add a caption"),
        requireClickable = false,
        requireEditable = true
    )

    /**
     * Feed share button (publish).
     */
    val SHARE_FEED_BUTTON = TargetSelector(
        name = "ig_share_feed_button",
        resourceIds = listOf(
            "com.instagram.android:id/share_footer_button",
            "share_footer_button",
            "com.instagram.android:id/share_button",
            "share_button"
        ),
        exactDescriptions = listOf("Share"),
        exactTexts = listOf("Share"),
        excludeTexts = listOf("Save draft", "Direct"),
        requireClickable = true,
        regionPreference = RegionPreference.BOTTOM
    )

    /**
     * Story publish button ("Your stories" PLURAL, not "Subscribers").
     */
    val SHARE_STORY_BUTTON = TargetSelector(
        name = "ig_share_story_button",
        resourceIds = listOf(
            "com.instagram.android:id/your_story_share_shortcut_button",
            "your_story_share_shortcut_button"
        ),
        exactDescriptions = listOf("Your stories"),
        exactTexts = listOf("Your stories"),
        excludeTexts = listOf("Subscribers"),
        requireClickable = true,
        regionPreference = RegionPreference.BOTTOM
    )
}

object FacebookSelectors {

    const val PACKAGE_FACEBOOK = "com.facebook.katana"
    const val PACKAGE_FACEBOOK_LITE = "com.facebook.lite"

    /**
     * Facebook home feed composer entry ("What's on your mind?").
     */
    val COMPOSER_ENTRY = TargetSelector(
        name = "fb_composer_entry",
        exactTexts = listOf("What's on your mind?"),
        exactDescriptions = listOf("What's on your mind?"),
        semanticHints = listOf("what's on your mind"),
        requireClickable = true
    )

    /**
     * Composer text input.
     */
    val COMPOSER_INPUT = TargetSelector(
        name = "fb_composer_input",
        exactTexts = listOf("What's on your mind?"),
        semanticHints = listOf("what's on your mind", "write something"),
        requireClickable = false,
        requireEditable = true
    )

    /**
     * Composer Next button.
     */
    val NEXT_BUTTON = TargetSelector(
        name = "fb_next_button",
        exactTexts = listOf("Next"),
        exactDescriptions = listOf("Next"),
        requireClickable = true,
        regionPreference = RegionPreference.TOP
    )

    /**
     * Final Post / Share button. Excludes options like 'Share to groups'.
     */
    val PUBLISH_BUTTON = TargetSelector(
        name = "fb_publish_button",
        exactTexts = listOf("POST", "Post", "SHARE", "Share"),
        exactDescriptions = listOf("POST", "Post", "SHARE", "Share"),
        excludeTexts = listOf("Share to story", "Share to groups", "Save as draft", "Discard"),
        requireClickable = true,
        regionPreference = RegionPreference.TOP
    )
}
