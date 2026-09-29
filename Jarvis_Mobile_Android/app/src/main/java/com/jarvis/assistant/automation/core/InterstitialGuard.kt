package com.jarvis.assistant.automation.core

/**
 * Detects security interstitials, login forms, 2FA, CAPTCHA, and permission dialogs.
 * Requires immediate hand-off to the user without attempting automated bypass.
 */
object InterstitialGuard {

    private val PERMISSION_CONTROLLER_PACKAGES = setOf(
        "com.google.android.permissioncontroller",
        "com.android.permissioncontroller",
        "com.android.packageinstaller"
    )

    private val SENSITIVE_INTERSTITIAL_KEYWORDS = listOf(
        "verification code",
        "verify your phone",
        "enter 6-digit code",
        "two-step verification",
        "restore from backup",
        "restore backup",
        "security checkpoint",
        "account may be at risk",
        "enter pin",
        "confirm pin",
        "captcha",
        "type the characters you see",
        "login to your account",
        "log in",
        "enter password",
        "verify it's you"
    )

    /**
     * Inspects an observation for any interstitial or security challenge.
     * Returns a descriptive reason if an interstitial is detected, or null if safe to proceed.
     */
    fun checkInterstitial(observation: ScreenObservation): String? {
        // 1. Check for runtime permission dialogs
        if (PERMISSION_CONTROLLER_PACKAGES.contains(observation.packageName.lowercase())) {
            return "Runtime permission dialog detected (${observation.packageName})"
        }

        // 2. Check for password or PIN fields
        val hasPasswordField = observation.elements.any { it.password && it.visible }
        if (hasPasswordField) {
            return "Password / PIN input screen detected"
        }

        // 3. Check for security/interstitial text patterns
        val allText = observation.elements.filter { it.visible }.joinToString(" ") {
            "${it.text} ${it.contentDescription}"
        }.lowercase()

        for (keyword in SENSITIVE_INTERSTITIAL_KEYWORDS) {
            if (allText.contains(keyword)) {
                return "Security interstitial or verification screen detected: '$keyword'"
            }
        }

        return null
    }
}
