package com.jarvis.assistant.automation.core

enum class RegionPreference {
    ANY,
    TOP,
    BOTTOM
}

/**
 * Specifications for resolving a UI target element on screen.
 */
data class TargetSelector(
    val name: String,
    val resourceIds: List<String> = emptyList(),
    val exactDescriptions: List<String> = emptyList(),
    val exactTexts: List<String> = emptyList(),
    val normalizedTexts: List<String> = emptyList(),
    val semanticHints: List<String> = emptyList(),
    val className: String? = null,
    val excludeTexts: List<String> = emptyList(),
    val requireClickable: Boolean = true,
    val requireEditable: Boolean = false,
    val regionPreference: RegionPreference = RegionPreference.ANY,
    val structuralAnchor: ((candidate: UiElement, observation: ScreenObservation) -> Boolean)? = null
) {
    companion object {
        fun byId(name: String, vararg ids: String, clickable: Boolean = true) = TargetSelector(
            name = name,
            resourceIds = ids.toList(),
            requireClickable = clickable
        )

        fun byDesc(name: String, vararg descs: String, clickable: Boolean = true) = TargetSelector(
            name = name,
            exactDescriptions = descs.toList(),
            requireClickable = clickable
        )

        fun byText(name: String, vararg texts: String, clickable: Boolean = true) = TargetSelector(
            name = name,
            exactTexts = texts.toList(),
            requireClickable = clickable
        )
    }
}
