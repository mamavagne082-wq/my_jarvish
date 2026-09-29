package com.jarvis.assistant.automation.core

import java.security.MessageDigest

/**
 * Snapshot of the current screen state at a specific point in time.
 */
data class ScreenObservation(
    val observationId: String,
    val packageName: String,
    val windowClass: String,
    val screenWidth: Int,
    val screenHeight: Int,
    val eventStamp: Long,
    val windowStamp: Long,
    val elements: List<UiElement>,
    val timestamp: Long = System.currentTimeMillis()
) {
    /**
     * Deterministic numbered list of visible interactive elements for debugging.
     */
    val interactiveElements: List<UiElement> by lazy {
        elements.filter { it.visible && !it.bounds.isEmpty && (it.clickable || it.editable || it.focusable) }
    }

    /**
     * Compute a structural signature (package + window + element text/desc/id/bounds/enabled/selected)
     * to detect real screen changes without depending on transient system animations.
     */
    val structuralSignature: String by lazy {
        val sb = StringBuilder()
        sb.append(packageName).append("|").append(windowClass).append("|")
        for (el in elements) {
            if (el.visible && !el.bounds.isEmpty) {
                sb.append(el.resourceId).append(",")
                    .append(el.className).append(",")
                    .append(el.text).append(",")
                    .append(el.contentDescription).append(",")
                    .append(el.bounds.left).append(":").append(el.bounds.top).append(":")
                    .append(el.bounds.right).append(":").append(el.bounds.bottom).append(",")
                    .append(if (el.enabled) "1" else "0").append(",")
                    .append(if (el.selected) "1" else "0").append(";")
            }
        }
        val digest = MessageDigest.getInstance("MD5")
        val hashBytes = digest.digest(sb.toString().toByteArray(Charsets.UTF_8))
        hashBytes.joinToString("") { "%02x".format(it) }
    }

    fun findElementById(elementId: String): UiElement? {
        return elements.firstOrNull { it.elementId == elementId }
    }

    fun formatDebugTree(): String {
        val sb = StringBuilder()
        sb.append("=== OBSERVATION: $observationId (pkg=$packageName, win=$windowClass, events=$eventStamp, windows=$windowStamp) ===\n")
        interactiveElements.forEachIndexed { idx, el ->
            sb.append("ELEMENT $idx: [${el.elementId}] '${el.text}' desc='${el.contentDescription}' id='${el.bareResourceId}' bounds=[${el.bounds.left},${el.bounds.top},${el.bounds.right},${el.bounds.bottom}] click=${el.clickable} edit=${el.editable}\n")
        }
        return sb.toString()
    }

    companion object {
        val EMPTY = ScreenObservation(
            observationId = "obs-0",
            packageName = "",
            windowClass = "",
            screenWidth = 0,
            screenHeight = 0,
            eventStamp = 0,
            windowStamp = 0,
            elements = emptyList()
        )
    }
}
