package com.jarvis.assistant.automation.android

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.jarvis.assistant.automation.core.ElementBounds
import com.jarvis.assistant.automation.core.ScreenDriver
import com.jarvis.assistant.automation.core.ScreenObservation
import com.jarvis.assistant.automation.core.UiElement
import java.util.concurrent.atomic.AtomicLong

/**
 * Concrete Android ScreenDriver backed by JarvisAccessibilityService.
 * Maps live AccessibilityNodeInfo hierarchy into pure Kotlin ScreenObservation.
 */
class AccessibilityScreenDriver(
    private val service: AccessibilityService
) : ScreenDriver {

    private val eventCounter = AtomicLong(0)
    private val windowCounter = AtomicLong(0)
    private val observationCounter = AtomicLong(0)

    fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        eventCounter.incrementAndGet()
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            windowCounter.incrementAndGet()
        }
    }

    override fun captureObservation(): ScreenObservation {
        val root = service.rootInActiveWindow
        val obsId = "obs-${observationCounter.incrementAndGet()}"
        val events = eventCounter.get()
        val windows = windowCounter.get()

        if (root == null) {
            return ScreenObservation(
                observationId = obsId,
                packageName = "",
                windowClass = "",
                screenWidth = 1080,
                screenHeight = 2400,
                eventStamp = events,
                windowStamp = windows,
                elements = emptyList()
            )
        }

        val pkgName = root.packageName?.toString() ?: ""
        val windowClass = root.className?.toString() ?: ""
        val elements = mutableListOf<UiElement>()

        traverseNodeTree(root, obsId, elements, depth = 0, parentIndex = -1)

        val displayMetrics = service.resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels

        return ScreenObservation(
            observationId = obsId,
            packageName = pkgName,
            windowClass = windowClass,
            screenWidth = screenWidth,
            screenHeight = screenHeight,
            eventStamp = events,
            windowStamp = windows,
            elements = elements
        )
    }

    private fun traverseNodeTree(
        node: AccessibilityNodeInfo,
        obsId: String,
        elements: MutableList<UiElement>,
        depth: Int,
        parentIndex: Int
    ) {
        val currentIndex = elements.size
        val rect = Rect()
        node.getBoundsInScreen(rect)

        val isPassword = node.isPassword
        // Redact password text at capture time
        val textStr = if (isPassword) "" else (node.text?.toString() ?: "")
        val descStr = if (isPassword) "" else (node.contentDescription?.toString() ?: "")
        val hintStr = if (isPassword) "" else (node.hintText?.toString() ?: "")

        val element = UiElement(
            elementId = UiElement.buildId(obsId, currentIndex),
            observationId = obsId,
            index = currentIndex,
            packageName = node.packageName?.toString() ?: "",
            className = node.className?.toString() ?: "",
            text = textStr,
            contentDescription = descStr,
            hintText = hintStr,
            resourceId = node.viewIdResourceName ?: "",
            bounds = ElementBounds(rect.left, rect.top, rect.right, rect.bottom),
            centerX = rect.centerX(),
            centerY = rect.centerY(),
            clickable = node.isClickable,
            longClickable = node.isLongClickable,
            enabled = node.isEnabled,
            selected = node.isSelected,
            focused = node.isFocused,
            focusable = node.isFocusable,
            scrollable = node.isScrollable,
            editable = node.isEditable,
            checkable = node.isCheckable,
            checked = node.isChecked,
            password = isPassword,
            visible = node.isVisibleToUser,
            depth = depth,
            parentIndex = parentIndex
        )
        elements.add(element)

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            traverseNodeTree(child, obsId, elements, depth + 1, currentIndex)
        }
    }

    override fun getEventStamp(): Long = eventCounter.get()

    override fun getWindowStamp(): Long = windowCounter.get()

    override fun refreshNode(elementId: String): UiElement? {
        val root = service.rootInActiveWindow ?: return null
        val obs = captureObservation()
        return obs.findElementById(elementId)
    }

    override fun click(elementId: String, currentBounds: ElementBounds): Boolean {
        val root = service.rootInActiveWindow ?: return false
        val node = findNodeByBounds(root, currentBounds)
        if (node != null) {
            if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
            // Check clickable parent
            var parent = node.parent
            while (parent != null) {
                if (parent.isClickable && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    return true
                }
                parent = parent.parent
            }
        }

        // Fallback: Gesture tap on center of validated bounds
        return gestureTap(currentBounds.centerX, currentBounds.centerY)
    }

    override fun gestureTap(x: Int, y: Int): Boolean {
        val path = Path().apply {
            moveTo(x.toFloat(), y.toFloat())
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, 50)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return service.dispatchGesture(gesture, null, null)
    }

    override fun setText(elementId: String, text: String): Boolean {
        val root = service.rootInActiveWindow ?: return false
        val obs = captureObservation()
        val el = obs.findElementById(elementId) ?: return false
        val node = findNodeByBounds(root, el.bounds) ?: return false

        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    override fun clearText(elementId: String): Boolean {
        return setText(elementId, "")
    }

    override fun scroll(direction: String): Boolean {
        val root = service.rootInActiveWindow ?: return false
        val action = if (direction.equals("up", ignoreCase = true)) {
            AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        } else {
            AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        }
        return root.performAction(action)
    }

    override fun pressBack(): Boolean {
        return service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
    }

    override fun pressHome(): Boolean {
        return service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
    }

    override fun openApp(packageName: String): Boolean {
        return try {
            val intent = service.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                service.startActivity(intent)
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    override fun isAppInstalled(packageName: String): Boolean {
        return try {
            service.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun findNodeByBounds(root: AccessibilityNodeInfo, bounds: ElementBounds): AccessibilityNodeInfo? {
        val rect = Rect()
        root.getBoundsInScreen(rect)
        if (rect.left == bounds.left && rect.top == bounds.top &&
            rect.right == bounds.right && rect.bottom == bounds.bottom
        ) {
            return root
        }

        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            val match = findNodeByBounds(child, bounds)
            if (match != null) return match
        }
        return null
    }
}
