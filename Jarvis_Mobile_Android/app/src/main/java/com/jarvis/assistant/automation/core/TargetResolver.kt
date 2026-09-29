package com.jarvis.assistant.automation.core

/**
 * Pure function resolver: evaluates TargetSelector specifications against a ScreenObservation
 * strictly following the 7-tier priority hierarchy and deterministic tie-breaking.
 */
object TargetResolver {

    const val MAX_LABEL_LENGTH_FOR_HINT = 48

    /**
     * Resolves the best matching UiElement from the observation according to the selector.
     */
    fun resolve(
        selector: TargetSelector,
        observation: ScreenObservation,
        allowedPackage: String? = null
    ): UiElement? {
        val candidates = observation.elements.filter { el ->
            isValidCandidate(el, selector, allowedPackage, observation)
        }

        if (candidates.isEmpty()) return null

        // Score candidates based on priority tier (lower tier index = higher priority)
        val scored = candidates.mapNotNull { candidate ->
            val matchTier = evaluateMatchTier(candidate, selector, observation)
            if (matchTier != null) candidate to matchTier else null
        }

        if (scored.isEmpty()) return null

        // Deterministic tie-breaker
        val screenHeight = observation.screenHeight.coerceAtLeast(1)
        val midScreenY = screenHeight / 2

        return scored.minWithOrNull { (el1, tier1), (el2, tier2) ->
            // 1. Priority Tier (Tier 1 is best)
            if (tier1 != tier2) return@minWithOrNull tier1.compareTo(tier2)

            // 2. Clickable preference
            if (el1.clickable != el2.clickable) return@minWithOrNull if (el1.clickable) -1 else 1

            // 3. Enabled preference
            if (el1.enabled != el2.enabled) return@minWithOrNull if (el1.enabled) -1 else 1

            // 4. Region preference
            when (selector.regionPreference) {
                RegionPreference.TOP -> {
                    val r1 = if (el1.centerY < midScreenY) -1 else 1
                    val r2 = if (el2.centerY < midScreenY) -1 else 1
                    if (r1 != r2) return@minWithOrNull r1.compareTo(r2)
                }
                RegionPreference.BOTTOM -> {
                    val r1 = if (el1.centerY >= midScreenY) -1 else 1
                    val r2 = if (el2.centerY >= midScreenY) -1 else 1
                    if (r1 != r2) return@minWithOrNull r1.compareTo(r2)
                }
                RegionPreference.ANY -> {}
            }

            // 5. Smaller area (prefer tighter target over large container)
            val areaCmp = el1.bounds.area.compareTo(el2.bounds.area)
            if (areaCmp != 0) return@minWithOrNull areaCmp

            // 6. Top position (higher up on screen)
            val topCmp = el1.bounds.top.compareTo(el2.bounds.top)
            if (topCmp != 0) return@minWithOrNull topCmp

            // 7. Left position
            val leftCmp = el1.bounds.left.compareTo(el2.bounds.left)
            if (leftCmp != 0) return@minWithOrNull leftCmp

            // 8. Element index in observation
            el1.index.compareTo(el2.index)
        }?.first
    }

    private fun isValidCandidate(
        el: UiElement,
        selector: TargetSelector,
        allowedPackage: String?,
        observation: ScreenObservation
    ): Boolean {
        if (!el.visible || el.bounds.isEmpty) return false

        // On screen check
        if (el.bounds.right <= 0 || el.bounds.bottom <= 0) return false
        if (observation.screenWidth > 0 && el.bounds.left >= observation.screenWidth) return false
        if (observation.screenHeight > 0 && el.bounds.top >= observation.screenHeight) return false

        // Allowed package check
        if (allowedPackage != null && !el.packageName.equals(allowedPackage, ignoreCase = true)) {
            return false
        }

        // Editable requirement
        if (selector.requireEditable && !el.editable) return false

        // Clickable requirement
        if (selector.requireClickable && !el.clickable && !el.focusable) {
            // Also accept if ancestor is clickable
            val hasClickableAncestor = el.parentIndex >= 0 && observation.elements.any {
                it.index == el.parentIndex && (it.clickable || it.focusable)
            }
            if (!hasClickableAncestor) return false
        }

        // Exclude texts filter
        if (selector.excludeTexts.isNotEmpty()) {
            val textAndDesc = "${el.text} ${el.contentDescription}".lowercase()
            for (excluded in selector.excludeTexts) {
                if (textAndDesc.contains(excluded.lowercase())) return false
            }
        }

        return true
    }

    private fun evaluateMatchTier(
        el: UiElement,
        selector: TargetSelector,
        observation: ScreenObservation
    ): Int? {
        // Priority 1: resourceId (full id or bare name)
        if (selector.resourceIds.isNotEmpty()) {
            for (id in selector.resourceIds) {
                if (el.resourceId.equals(id, ignoreCase = true) ||
                    el.bareResourceId.equals(id, ignoreCase = true) ||
                    (id.contains("/") && el.resourceId.endsWith(id, ignoreCase = true))
                ) {
                    return 1
                }
            }
        }

        // Priority 2: exact contentDescription
        if (selector.exactDescriptions.isNotEmpty()) {
            for (desc in selector.exactDescriptions) {
                if (el.contentDescription.equals(desc, ignoreCase = true)) {
                    return 2
                }
            }
        }

        // Priority 3: exact visible text (case-insensitive)
        if (selector.exactTexts.isNotEmpty()) {
            for (text in selector.exactTexts) {
                if (el.text.equals(text, ignoreCase = true)) {
                    return 3
                }
            }
        }

        // Priority 4: normalized text (lowercase, punctuation stripped)
        if (selector.normalizedTexts.isNotEmpty()) {
            for (norm in selector.normalizedTexts) {
                val cleanTarget = norm.lowercase().replace(Regex("[.,:;!?'\"\\-_()/\\[\\]…]"), " ").trim()
                if (el.normalizedText == cleanTarget || el.normalizedContentDesc == cleanTarget) {
                    return 4
                }
            }
        }

        // Priority 5: semantic hint in SHORT label (max ~48 chars) or hint text
        if (selector.semanticHints.isNotEmpty()) {
            val isShortLabel = el.text.length <= MAX_LABEL_LENGTH_FOR_HINT &&
                    el.contentDescription.length <= MAX_LABEL_LENGTH_FOR_HINT
            if (isShortLabel) {
                val fullLabel = "${el.text} ${el.contentDescription} ${el.hintText}".lowercase()
                for (hint in selector.semanticHints) {
                    if (fullLabel.contains(hint.lowercase())) {
                        return 5
                    }
                }
            }
        }

        // Priority 6: class + structural anchor
        if (selector.structuralAnchor != null) {
            val classMatches = selector.className == null ||
                    el.className.endsWith(selector.className, ignoreCase = true)
            if (classMatches && selector.structuralAnchor.invoke(el, observation)) {
                return 6
            }
        }

        return null
    }
}
