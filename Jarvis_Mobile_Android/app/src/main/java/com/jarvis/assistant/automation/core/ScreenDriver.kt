package com.jarvis.assistant.automation.core

/**
 * Pure Kotlin interface abstracting screen reading and action execution.
 * Allows core agent logic and state machines to be unit-tested on the JVM with scripted fakes.
 */
interface ScreenDriver {
    /**
     * Captures a fresh observation of the current screen.
     */
    fun captureObservation(): ScreenObservation

    /**
     * Current event counter (incremented on any accessibility UI event).
     */
    fun getEventStamp(): Long

    /**
     * Current window transition counter (incremented on TYPE_WINDOW_STATE_CHANGED).
     */
    fun getWindowStamp(): Long

    /**
     * Re-validates an element directly against the live UI tree.
     * Returns refreshed element with current bounds, or null if vanished/stale.
     */
    fun refreshNode(elementId: String): UiElement?

    /**
     * Taps an element using accessibility ACTION_CLICK, falling back to gesture tap on current bounds.
     */
    fun click(elementId: String, currentBounds: ElementBounds): Boolean

    /**
     * Executes a gesture tap at the specified screen coordinate.
     */
    fun gestureTap(x: Int, y: Int): Boolean

    /**
     * Sets text into an editable element using ACTION_SET_TEXT.
     */
    fun setText(elementId: String, text: String): Boolean

    /**
     * Clears text from an editable element.
     */
    fun clearText(elementId: String): Boolean

    /**
     * Scrolls in the given direction ("up", "down", "left", "right").
     */
    fun scroll(direction: String): Boolean

    /**
     * Performs system back navigation.
     */
    fun pressBack(): Boolean

    /**
     * Performs system home navigation.
     */
    fun pressHome(): Boolean

    /**
     * Opens an application by package name.
     */
    fun openApp(packageName: String): Boolean

    /**
     * Checks if an application package is installed on the device.
     */
    fun isAppInstalled(packageName: String): Boolean
}
