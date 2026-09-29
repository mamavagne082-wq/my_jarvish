package com.jarvis.assistant.automation.core

/**
 * Pure Kotlin representation of an observed UI node.
 * Scoped strictly to the observation it was captured in.
 */
data class UiElement(
    val elementId: String, // e.g. "obs-12#5"
    val observationId: String,
    val index: Int,
    val packageName: String,
    val className: String,
    val text: String,
    val contentDescription: String,
    val hintText: String = "",
    val resourceId: String = "", // bare id or full resource-id
    val bounds: ElementBounds = ElementBounds.EMPTY,
    val centerX: Int = bounds.centerX,
    val centerY: Int = bounds.centerY,
    val clickable: Boolean = false,
    val longClickable: Boolean = false,
    val enabled: Boolean = true,
    val selected: Boolean = false,
    val focused: Boolean = false,
    val focusable: Boolean = false,
    val scrollable: Boolean = false,
    val editable: Boolean = false,
    val checkable: Boolean = false,
    val checked: Boolean = false,
    val password: Boolean = false,
    val visible: Boolean = true,
    val depth: Int = 0,
    val parentIndex: Int = -1,
    val parentPath: String = ""
) {
    /**
     * Bare resource id without package prefix (e.g. 'com.whatsapp:id/entry' -> 'entry')
     */
    val bareResourceId: String
        get() = if (resourceId.contains(":id/")) resourceId.substringAfter(":id/") else resourceId

    /**
     * Normalized display text for matching
     */
    val normalizedText: String
        get() = text.lowercase()
            .replace(Regex("[.,:;!?'\"\\-_()/\\[\\]…]"), " ")
            .trim()

    /**
     * Normalized content description for matching
     */
    val normalizedContentDesc: String
        get() = contentDescription.lowercase()
            .replace(Regex("[.,:;!?'\"\\-_()/\\[\\]…]"), " ")
            .trim()

    fun isClickableTarget(): Boolean = visible && enabled && !bounds.isEmpty && (clickable || focusable)

    companion object {
        fun buildId(observationId: String, index: Int): String = "$observationId#$index"
    }
}
