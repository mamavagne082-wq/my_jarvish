package com.jarvis.assistant.automation

import com.jarvis.assistant.automation.core.ElementBounds
import com.jarvis.assistant.automation.core.ScreenDriver
import com.jarvis.assistant.automation.core.ScreenObservation
import com.jarvis.assistant.automation.core.UiElement

/**
 * Scripted fake ScreenDriver for JVM testing without Android framework dependencies.
 */
class FakeScreenDriver : ScreenDriver {

    var currentObservation: ScreenObservation = ScreenObservation.EMPTY
    var eventCounter: Long = 0
    var windowCounter: Long = 0

    val tappedElementIds = mutableListOf<String>()
    val tappedCoordinates = mutableListOf<Pair<Int, Int>>()
    val typedTexts = mutableMapOf<String, String>()
    var lastOpenedApp: String? = null
    var backPressedCount = 0

    var installedPackages = mutableSetOf(
        "com.whatsapp",
        "com.instagram.android",
        "com.facebook.katana"
    )

    fun emitEvent() {
        eventCounter++
    }

    fun emitWindowChange() {
        eventCounter++
        windowCounter++
    }

    override fun captureObservation(): ScreenObservation {
        return currentObservation.copy(
            eventStamp = eventCounter,
            windowStamp = windowCounter
        )
    }

    override fun getEventStamp(): Long = eventCounter

    override fun getWindowStamp(): Long = windowCounter

    override fun refreshNode(elementId: String): UiElement? {
        return currentObservation.findElementById(elementId)
    }

    override fun click(elementId: String, currentBounds: ElementBounds): Boolean {
        val element = currentObservation.findElementById(elementId) ?: return false
        if (!element.visible || !element.enabled) return false
        tappedElementIds.add(elementId)
        emitEvent()
        return true
    }

    override fun gestureTap(x: Int, y: Int): Boolean {
        tappedCoordinates.add(x to y)
        emitEvent()
        return true
    }

    override fun setText(elementId: String, text: String): Boolean {
        val element = currentObservation.findElementById(elementId) ?: return false
        typedTexts[elementId] = text
        // Update element text in observation
        val updatedElements = currentObservation.elements.map {
            if (it.elementId == elementId) it.copy(text = text) else it
        }
        currentObservation = currentObservation.copy(elements = updatedElements)
        emitEvent()
        return true
    }

    override fun clearText(elementId: String): Boolean {
        typedTexts.remove(elementId)
        val updatedElements = currentObservation.elements.map {
            if (it.elementId == elementId) it.copy(text = "") else it
        }
        currentObservation = currentObservation.copy(elements = updatedElements)
        emitEvent()
        return true
    }

    override fun scroll(direction: String): Boolean {
        emitEvent()
        return true
    }

    override fun pressBack(): Boolean {
        backPressedCount++
        emitEvent()
        return true
    }

    override fun pressHome(): Boolean {
        emitEvent()
        return true
    }

    override fun openApp(packageName: String): Boolean {
        lastOpenedApp = packageName
        emitWindowChange()
        return true
    }

    override fun isAppInstalled(packageName: String): Boolean {
        return installedPackages.contains(packageName)
    }
}
