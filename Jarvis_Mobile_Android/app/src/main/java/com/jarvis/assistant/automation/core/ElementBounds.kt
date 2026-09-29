package com.jarvis.assistant.automation.core

/**
 * Pure Kotlin representation of screen boundaries.
 * Keeps core automation logic decoupled from android.graphics.Rect for JVM testability.
 */
data class ElementBounds(
    val left: Int = 0,
    val top: Int = 0,
    val right: Int = 0,
    val bottom: Int = 0
) {
    val width: Int get() = (right - left).coerceAtLeast(0)
    val height: Int get() = (bottom - top).coerceAtLeast(0)
    val centerX: Int get() = left + width / 2
    val centerY: Int get() = top + height / 2
    val area: Int get() = width * height
    val isEmpty: Boolean get() = width <= 0 || height <= 0

    fun contains(x: Int, y: Int): Boolean {
        return x in left until right && y in top until bottom
    }

    fun isEntirelyLeftOf(other: ElementBounds): Boolean {
        return this.right <= other.left
    }

    fun isEntirelyRightOf(other: ElementBounds): Boolean {
        return this.left >= other.right
    }

    fun isEntirelyAbove(other: ElementBounds): Boolean {
        return this.bottom <= other.top
    }

    fun isEntirelyBelow(other: ElementBounds): Boolean {
        return this.top >= other.bottom
    }

    fun onSameRow(other: ElementBounds, tolerancePx: Int = 30): Boolean {
        val verticalOverlap = (top - other.top).coerceAtLeast(0) < tolerancePx ||
                (other.top - top).coerceAtLeast(0) < tolerancePx
        val centerDistance = kotlin.math.abs(centerY - other.centerY)
        return verticalOverlap || centerDistance <= tolerancePx
    }

    companion object {
        val EMPTY = ElementBounds(0, 0, 0, 0)
    }
}
