package com.jarvis.assistant.automation.core

import kotlinx.coroutines.delay

/**
 * ScreenObserver tracks observations, enforces freshness guarantees, and guards against stale elements.
 */
class ScreenObserver(private val driver: ScreenDriver) {

    private var latestObservation: ScreenObservation? = null
    private var lastObservedEventStamp: Long = -1
    private var lastObservedWindowStamp: Long = -1
    private var isInvalidated: Boolean = true

    /**
     * Captures a fresh observation from the live screen and marks it as current.
     */
    fun captureFresh(): ScreenObservation {
        val eventStampBefore = driver.getEventStamp()
        val observation = driver.captureObservation()
        latestObservation = observation
        lastObservedEventStamp = eventStampBefore
        lastObservedWindowStamp = observation.windowStamp
        isInvalidated = false
        return observation
    }

    /**
     * Returns the latest observation if still fresh and valid, or captures a new one.
     */
    fun getOrCaptureFresh(): ScreenObservation {
        val current = latestObservation
        if (current == null || isStale()) {
            return captureFresh()
        }
        return current
    }

    /**
     * Manually invalidates the current observation (e.g. after a click or input action).
     */
    fun invalidate() {
        isInvalidated = true
    }

    /**
     * Checks if the latest observation has become stale due to events or manual invalidation.
     */
    fun isStale(): Boolean {
        if (isInvalidated) return true
        val current = latestObservation ?: return true
        val currentEvents = driver.getEventStamp()
        // An observation is stale if any UI event arrived since capture
        return currentEvents > lastObservedEventStamp
    }

    /**
     * Checks if a new window transition has occurred since a given window stamp.
     */
    fun hasWindowChangedSince(previousWindowStamp: Long): Boolean {
        return driver.getWindowStamp() > previousWindowStamp
    }

    /**
     * Waits for the screen to settle or for a structural change.
     */
    suspend fun waitForUiChange(
        previousSignature: String,
        minSettleMs: Long = 200,
        maxWaitMs: Long = 3000,
        pollIntervalMs: Long = 100
    ): ScreenObservation {
        delay(minSettleMs)
        val startTime = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < maxWaitMs) {
            val fresh = captureFresh()
            if (fresh.structuralSignature != previousSignature) {
                return fresh
            }
            delay(pollIntervalMs)
        }
        return captureFresh()
    }

    /**
     * Waits until an element matching the selector appears on screen or times out.
     */
    suspend fun waitForElement(
        selector: TargetSelector,
        timeoutMs: Long = 4000,
        pollIntervalMs: Long = 200,
        allowedPackage: String? = null
    ): Pair<UiElement, ScreenObservation>? {
        val startTime = System.currentTimeMillis()
        while (System.currentTimeMillis() - startTime < timeoutMs) {
            val observation = captureFresh()
            val match = TargetResolver.resolve(selector, observation, allowedPackage)
            if (match != null) {
                return match to observation
            }
            delay(pollIntervalMs)
        }
        return null
    }

    /**
     * Re-validates a target element to guarantee it is still present and valid before interaction.
     */
    fun validateElementFreshness(element: UiElement): UiElement? {
        val current = latestObservation ?: return null
        if (element.observationId != current.observationId) {
            return null // Reject non-current observation IDs
        }
        return driver.refreshNode(element.elementId)
    }
}
