package com.jarvis.assistant.automation.whatsapp

import com.jarvis.assistant.automation.core.RegionPreference
import com.jarvis.assistant.automation.core.TargetSelector

/**
 * Encapsulates all selectors and structural anchors for WhatsApp and WhatsApp Business.
 */
object WhatsAppSelectors {

    const val PACKAGE_WHATSAPP = "com.whatsapp"
    const val PACKAGE_WHATSAPP_BUSINESS = "com.whatsapp.w4b"

    fun isWhatsAppPackage(pkg: String): Boolean {
        return pkg == PACKAGE_WHATSAPP || pkg == PACKAGE_WHATSAPP_BUSINESS
    }

    /**
     * Target selector for WhatsApp text compose field.
     */
    val COMPOSE_FIELD = TargetSelector(
        name = "whatsapp_compose_field",
        resourceIds = listOf("com.whatsapp:id/entry", "com.whatsapp.w4b:id/entry", "entry"),
        exactTexts = listOf("Message", "Type a message"),
        semanticHints = listOf("message", "type a message"),
        className = "android.widget.EditText",
        requireClickable = false,
        requireEditable = true,
        regionPreference = RegionPreference.BOTTOM
    )

    /**
     * Target selector for WhatsApp Send button.
     * Guaranteed to never match a long message bubble mentioning 'send'.
     */
    val SEND_BUTTON = TargetSelector(
        name = "whatsapp_send_button",
        resourceIds = listOf("com.whatsapp:id/send", "com.whatsapp.w4b:id/send", "send"),
        exactDescriptions = listOf("Send"),
        requireClickable = true,
        regionPreference = RegionPreference.BOTTOM,
        structuralAnchor = { candidate, obs ->
            // Anchor: clickable view on the bottom half of the screen, to the right of compose box
            val compose = obs.elements.firstOrNull {
                it.bareResourceId == "entry" || it.editable
            }
            if (compose != null) {
                candidate.bounds.centerY >= obs.screenHeight / 2 &&
                        candidate.bounds.left >= compose.bounds.centerX &&
                        candidate.bounds.onSameRow(compose.bounds, tolerancePx = 60)
            } else {
                candidate.bounds.centerY >= obs.screenHeight / 2 &&
                        (candidate.contentDescription.equals("Send", ignoreCase = true) ||
                                candidate.bareResourceId.equals("send", ignoreCase = true))
            }
        }
    )

    /**
     * Target selector for Search button in chat list.
     */
    val SEARCH_BUTTON = TargetSelector(
        name = "whatsapp_search_button",
        resourceIds = listOf(
            "com.whatsapp:id/menuitem_search",
            "com.whatsapp.w4b:id/menuitem_search",
            "menuitem_search"
        ),
        exactDescriptions = listOf("Search", "Search…"),
        requireClickable = true,
        regionPreference = RegionPreference.TOP
    )

    /**
     * Target selector for Search input text field.
     */
    val SEARCH_INPUT = TargetSelector(
        name = "whatsapp_search_input",
        resourceIds = listOf(
            "com.whatsapp:id/search_src_text",
            "com.whatsapp.w4b:id/search_src_text",
            "search_src_text",
            "com.whatsapp:id/search_input"
        ),
        requireClickable = false,
        requireEditable = true,
        regionPreference = RegionPreference.TOP
    )

    /**
     * Target selector for top 'More options' (three dots menu).
     */
    val MORE_OPTIONS = TargetSelector(
        name = "whatsapp_more_options",
        resourceIds = listOf("com.whatsapp:id/more_options", "more_options"),
        exactDescriptions = listOf("More options"),
        requireClickable = true,
        regionPreference = RegionPreference.TOP
    )

    /**
     * Target selector for 'Mute notifications' option in chat menu.
     */
    val MUTE_NOTIFICATIONS = TargetSelector(
        name = "whatsapp_mute_notifications",
        exactTexts = listOf("Mute notifications", "Mute"),
        normalizedTexts = listOf("mute notifications", "mute"),
        requireClickable = true
    )

    /**
     * Target selector for 'Unmute notifications' option.
     */
    val UNMUTE_NOTIFICATIONS = TargetSelector(
        name = "whatsapp_unmute_notifications",
        exactTexts = listOf("Unmute notifications", "Unmute"),
        normalizedTexts = listOf("unmute notifications", "unmute"),
        requireClickable = true
    )

    /**
     * Target selector for 'Mark as read' / 'Mark as unread'.
     */
    val MARK_AS_READ = TargetSelector(
        name = "whatsapp_mark_read",
        exactTexts = listOf("Mark as read"),
        normalizedTexts = listOf("mark as read"),
        requireClickable = true
    )

    /**
     * Builds selector for a specific contact result in search or chat list.
     */
    fun contactItem(contactName: String) = TargetSelector(
        name = "whatsapp_contact_$contactName",
        exactTexts = listOf(contactName),
        normalizedTexts = listOf(contactName.lowercase().trim()),
        semanticHints = listOf(contactName.lowercase().trim()),
        requireClickable = true
    )
}
