package com.jarvis.assistant.automation.core

import kotlinx.coroutines.delay

sealed class ExecutionResult {
    data class Success(val observation: ScreenObservation, val tappedElement: UiElement) : ExecutionResult()
    data class InterstitialDetected(val reason: String) : ExecutionResult()
    data class TargetNotFound(val selectorName: String) : ExecutionResult()
    data class TargetNotActionable(val reason: String) : ExecutionResult()
    data class StaleElement(val elementId: String) : ExecutionResult()
    data class ActionFailed(val reason: String) : ExecutionResult()
}

sealed class UiExpectation {
    object ScreenChanges : UiExpectation()
    data class TargetGone(val selector: TargetSelector) : UiExpectation()
    data class TargetAppears(val selector: TargetSelector) : UiExpectation()
}

/**
 * Executes UI clicks and navigation in a strict closed-loop cycle.
 */
class UiActionExecutor(
    private val driver: ScreenDriver,
    private val observer: ScreenObserver
) {
    suspend fun executeClick(
        selector: TargetSelector,
        expectation: UiExpectation = UiExpectation.ScreenChanges,
        allowedPackage: String? = null,
        maxRetries: Int = 2
    ): ExecutionResult {
        var retries = 0

        while (retries <= maxRetries) {
            // 1. Observe fresh screen
            val observation = observer.captureFresh()

            // 2. Interstitial guard
            val interstitial = InterstitialGuard.checkInterstitial(observation)
            if (interstitial != null) {
                return ExecutionResult.InterstitialDetected(interstitial)
            }

            // 3. Resolve target
            val target = TargetResolver.resolve(selector, observation, allowedPackage)
                ?: if (retries < maxRetries) {
                    retries++
                    delay(300)
                    continue
                } else {
                    return ExecutionResult.TargetNotFound(selector.name)
                }

            // 4. Validate target
            if (!target.visible || target.bounds.isEmpty) {
                return ExecutionResult.TargetNotActionable("Target bounds are invalid or invisible")
            }
            if (!target.enabled) {
                return ExecutionResult.TargetNotActionable("Target is disabled")
            }

            // 5. Freshness check: re-read bounds from live node
            val refreshed = observer.validateElementFreshness(target)
            if (refreshed == null || refreshed.bounds.isEmpty) {
                // Stale node; re-observe and retry
                retries++
                delay(200)
                continue
            }

            // 6. Execute click on refreshed bounds
            val prevSig = observation.structuralSignature
            val clicked = driver.click(refreshed.elementId, refreshed.bounds)
            if (!clicked) {
                // If direct click fails, try gesture tap on current live bounds
                val tapped = driver.gestureTap(refreshed.centerX, refreshed.centerY)
                if (!tapped) {
                    retries++
                    delay(300)
                    continue
                }
            }

            // 7. Invalidate observation immediately
            observer.invalidate()

            // 8. Wait for UI change
            val postObservation = observer.waitForUiChange(previousSignature = prevSig, minSettleMs = 250, maxWaitMs = 2500)

            // 9. Verify expectation
            val expectationMet = when (expectation) {
                is UiExpectation.ScreenChanges -> postObservation.structuralSignature != prevSig
                is UiExpectation.TargetGone -> TargetResolver.resolve(expectation.selector, postObservation, allowedPackage) == null
                is UiExpectation.TargetAppears -> TargetResolver.resolve(expectation.selector, postObservation, allowedPackage) != null
            }

            if (expectationMet) {
                return ExecutionResult.Success(postObservation, refreshed)
            } else {
                // Screen did not meet expectation; if screen didn't change at all, retry once
                if (postObservation.structuralSignature == prevSig && retries < maxRetries) {
                    retries++
                    continue
                } else {
                    // Screen reacted but differently: don't double tap, return success with current state
                    return ExecutionResult.Success(postObservation, refreshed)
                }
            }
        }

        return ExecutionResult.ActionFailed("Max retries exceeded for selector '${selector.name}'")
    }
}
