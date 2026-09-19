package com.jarvis.assistant

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

class JarvisAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "JarvisAccessibility"
        var instance: JarvisAccessibilityService? = null
            private set

        val isServiceRunning: Boolean
            get() = instance != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "Jarvis Accessibility Service connected and active!")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Optional screen event monitoring
    }

    override fun onInterrupt() {
        Log.w(TAG, "Jarvis Accessibility Service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
    }

    /**
     * Executes commands dispatched from Jarvis voice agent via LiveKit DataChannel.
     */
    fun handleCommand(action: String, payload: JSONObject) {
        Log.d(TAG, "Handling mobile command: action=$action, payload=$payload")
        when (action.lowercase().trim()) {
            "lock", "turn_off_screen" -> lockDevice()
            "open_app" -> {
                val target = payload.optString("target", "")
                openApplication(target)
            }
            "youtube_search" -> {
                val query = payload.optString("target", "")
                searchAndPlayYouTube(query)
            }
            "survey_auto", "survey_tap" -> {
                performSurveyAutomation()
            }
            "volume_up" -> adjustVolume(increase = true)
            "volume_down" -> adjustVolume(increase = false)
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            else -> Log.w(TAG, "Unknown mobile action: $action")
        }
    }

    /**
     * Instantly locks the Android phone screen using official Android Accessibility API.
     */
    fun lockDevice(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val success = performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
            Log.d(TAG, "Lock device result: $success")
            success
        } else {
            Log.w(TAG, "GLOBAL_ACTION_LOCK_SCREEN requires Android 9 (Pie) or higher")
            false
        }
    }

    /**
     * Opens apps by name or package identifier.
     */
    fun openApplication(appName: String) {
        val packageMap = mapOf(
            "youtube" to "com.google.android.youtube",
            "whatsapp" to "com.whatsapp",
            "facebook" to "com.facebook.katana",
            "messenger" to "com.facebook.orca",
            "chrome" to "com.android.chrome",
            "camera" to "com.android.camera",
            "settings" to "com.android.settings",
            "gallery" to "com.google.android.apps.photos",
            "playstore" to "com.android.vending"
        )

        val targetPackage = packageMap[appName.lowercase().trim()] ?: appName
        val launchIntent = packageManager.getLaunchIntentForPackage(targetPackage)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(launchIntent)
            Log.d(TAG, "Launched application: $targetPackage")
        } else {
            // Fallback generic search intent
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=$appName"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error launching app $appName: ${e.message}")
            }
        }
    }

    /**
     * Opens YouTube and directly queries for the video.
     */
    fun searchAndPlayYouTube(query: String) {
        try {
            val intent = Intent(Intent.ACTION_SEARCH).apply {
                setPackage("com.google.android.youtube")
                putExtra("query", query)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            Log.d(TAG, "YouTube search launched for: $query")
        } catch (e: Exception) {
            // Fallback to web YouTube
            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/results?search_query=$query")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(webIntent)
        }
    }

    /**
     * Automated Survey Assistant:
     * Inspects active window hierarchy, clicks first viable option, or clicks Next / Continue buttons.
     */
    fun performSurveyAutomation(): Boolean {
        val root = rootInActiveWindow ?: return false
        var clicked = false

        // 1. Look for Next / Submit / Continue buttons first if an option is already selected
        val nextKeywords = listOf("Next", "Continue", "Submit", "নেক্সট", "পরবর্তী", "Proceed", "Done", "Start")
        for (keyword in nextKeywords) {
            val nodes = root.findAccessibilityNodeInfosByText(keyword)
            for (node in nodes) {
                if (node.isClickable || node.parent?.isClickable == true) {
                    val target = if (node.isClickable) node else node.parent
                    target?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    Log.d(TAG, "Survey auto-click: clicked '$keyword' button")
                    return true
                }
            }
        }

        // 2. Look for RadioButtons or CheckBoxes to answer questions
        clicked = clickFirstInteractiveOption(root)
        return clicked
    }

    private fun clickFirstInteractiveOption(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) return false

        val className = node.className?.toString() ?: ""
        if (className.contains("RadioButton") || className.contains("CheckBox")) {
            if (node.isClickable) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                Log.d(TAG, "Survey auto-click: selected option ($className)")
                return true
            } else if (node.parent?.isClickable == true) {
                node.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                return true
            }
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            if (clickFirstInteractiveOption(child)) {
                return true
            }
        }
        return false
    }

    /**
     * Dispatches a tap gesture at specific coordinates on the mobile screen.
     */
    fun tapCoordinates(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply {
                moveTo(x, y)
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
                .build()
            dispatchGesture(gesture, null, null)
            Log.d(TAG, "Dispatched tap gesture at ($x, $y)")
        }
    }

    /**
     * Adjusts mobile media volume.
     */
    fun adjustVolume(increase: Boolean) {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val direction = if (increase) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
        audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI)
        Log.d(TAG, "Adjusted volume: increase=$increase")
    }
}
