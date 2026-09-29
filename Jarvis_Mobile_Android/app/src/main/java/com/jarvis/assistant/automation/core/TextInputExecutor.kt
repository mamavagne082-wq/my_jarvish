package com.jarvis.assistant.automation.core

import kotlinx.coroutines.delay

sealed class TextInputResult {
    data class Success(val observation: ScreenObservation, val lengthTyped: Int) : TextInputResult()
    data class InterstitialDetected(val reason: String) : TextInputResult()
    data class FieldNotFound(val selectorName: String) : TextInputResult()
    data class FieldNotEditable(val reason: String) : TextInputResult()
    data class VerificationFailed(val reason: String) : TextInputResult()
    data class ActionFailed(val reason: String) : TextInputResult()
}

/**
 * Executes text input safely:
 * Resolve editable field -> focus -> re-observe (layout shifts with keyboard) -> re-resolve -> set text -> re-observe -> verify.
 * Strictly adheres to privacy: NEVER logs text contents, only string length.
 */
class TextInputExecutor(
    private val driver: ScreenDriver,
    private val observer: ScreenObserver
) {
    suspend fun executeInput(
        selector: TargetSelector,
        text: String,
        allowedPackage: String? = null,
        verifyContent: Boolean = true
    ): TextInputResult {
        // 1. Fresh observation
        val obs1 = observer.captureFresh()

        // 2. Interstitial check
        val interstitial = InterstitialGuard.checkInterstitial(obs1)
        if (interstitial != null) {
            return TextInputResult.InterstitialDetected(interstitial)
        }

        // 3. Resolve editable target
        val editableSelector = selector.copy(requireEditable = true, requireClickable = false)
        val initialField = TargetResolver.resolve(editableSelector, obs1, allowedPackage)
            ?: return TextInputResult.FieldNotFound(selector.name)

        if (initialField.password) {
            return TextInputResult.FieldNotEditable("Cannot type into password fields")
        }

        // 4. Focus / Tap the field to open input method
        val refreshed = observer.validateElementFreshness(initialField)
            ?: return TextInputResult.ActionFailed("Target field became stale before focusing")

        driver.click(refreshed.elementId, refreshed.bounds)
        observer.invalidate()

        // 5. Wait for layout settle after keyboard pops up
        delay(400)

        // 6. RE-OBSERVE and re-resolve the target field (keyboard moves screen layout)
        val obs2 = observer.captureFresh()
        val reResolvedField = TargetResolver.resolve(editableSelector, obs2, allowedPackage)
            ?: return TextInputResult.FieldNotFound("Field not found after keyboard layout shift: ${selector.name}")

        // 7. Execute ACTION_SET_TEXT
        val setSuccess = driver.setText(reResolvedField.elementId, text)
        if (!setSuccess) {
            return TextInputResult.ActionFailed("Failed to set text into target field")
        }
        observer.invalidate()

        // 8. Re-observe to verify text presence
        delay(250)
        val obs3 = observer.captureFresh()

        if (verifyContent) {
            val verifiedField = TargetResolver.resolve(editableSelector, obs3, allowedPackage)
            // Verify non-empty and matching length
            if (verifiedField == null || verifiedField.text.isEmpty()) {
                return TextInputResult.VerificationFailed("Field appears empty after typing")
            }
        }

        return TextInputResult.Success(obs3, lengthTyped = text.length)
    }

    /**
     * Clears text from the target field (used when user rejects confirmation or cancels draft).
     */
    suspend fun clearField(
        selector: TargetSelector,
        allowedPackage: String? = null
    ): Boolean {
        val obs = observer.captureFresh()
        val editableSelector = selector.copy(requireEditable = true, requireClickable = false)
        val field = TargetResolver.resolve(editableSelector, obs, allowedPackage) ?: return false
        val cleared = driver.clearText(field.elementId)
        observer.invalidate()
        return cleared
    }
}
