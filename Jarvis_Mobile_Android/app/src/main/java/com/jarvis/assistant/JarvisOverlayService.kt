package com.jarvis.assistant

import android.annotation.SuppressLint
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.DisplayMetrics
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView

/**
 * Jarvis Active Overlay Service
 * Renders the Floating Mic Bubble / Screen Glow / Center 3D Orb over other apps
 * when Jarvis is running in the background or active during calls/automation.
 */
class JarvisOverlayService : Service() {

    companion object {
        private const val TAG = "JarvisOverlay"
        const val ACTION_SHOW_OVERLAY = "com.jarvis.assistant.SHOW_OVERLAY"
        const val ACTION_HIDE_OVERLAY = "com.jarvis.assistant.HIDE_OVERLAY"
        const val ACTION_UPDATE_STATE = "com.jarvis.assistant.UPDATE_OVERLAY_STATE"

        const val EXTRA_OVERLAY_MODE = "overlay_mode" // "bubble", "border_glow", "center_orb"
        const val EXTRA_AGENT_STATE = "agent_state"   // "idle", "listening", "speaking"

        var isOverlayShowing = false
            private set
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var currentMode = "bubble"

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_SHOW_OVERLAY

        when (action) {
            ACTION_SHOW_OVERLAY -> {
                currentMode = intent?.getStringExtra(EXTRA_OVERLAY_MODE) ?: "bubble"
                val state = intent?.getStringExtra(EXTRA_AGENT_STATE) ?: "listening"
                showOverlay(currentMode, state)
            }
            ACTION_HIDE_OVERLAY -> {
                hideOverlay()
            }
            ACTION_UPDATE_STATE -> {
                val state = intent?.getStringExtra(EXTRA_AGENT_STATE) ?: "listening"
                updateState(state)
            }
        }

        return START_NOT_STICKY
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun showOverlay(mode: String, state: String) {
        if (!Settings.canDrawOverlays(this)) {
            Log.w(TAG, "Cannot show overlay: SYSTEM_ALERT_WINDOW permission missing.")
            return
        }

        hideOverlay() // remove previous if exists

        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        when (mode) {
            "border_glow" -> {
                // Screen Border Glow
                val params = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    layoutFlag,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT
                )

                val glowFrame = FrameLayout(this).apply {
                    val border = GradientDrawable().apply {
                        setStroke(14, Color.parseColor("#06b6d4"))
                        setColor(Color.TRANSPARENT)
                    }
                    background = border
                }

                overlayView = glowFrame
                windowManager?.addView(overlayView, params)
            }

            "center_orb" -> {
                // Floating Center Orb
                val sizePx = (80 * resources.displayMetrics.density).toInt()
                val params = WindowManager.LayoutParams(
                    sizePx,
                    sizePx,
                    layoutFlag,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT
                ).apply {
                    gravity = Gravity.CENTER
                }

                val orbFrame = createOrbView(sizePx, state)
                overlayView = orbFrame
                windowManager?.addView(overlayView, params)
            }

            else -> {
                // Floating Mic Bubble (Default: MYRA / Jarvis Mic Bubble)
                val bubbleSize = (64 * resources.displayMetrics.density).toInt()
                val params = WindowManager.LayoutParams(
                    bubbleSize,
                    bubbleSize,
                    layoutFlag,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                    PixelFormat.TRANSLUCENT
                ).apply {
                    gravity = Gravity.TOP or Gravity.START
                    x = 40
                    y = 200
                }

                val bubble = createBubbleView(bubbleSize, state, params)
                overlayView = bubble
                windowManager?.addView(overlayView, params)
            }
        }

        isOverlayShowing = true
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun createBubbleView(
        size: Int,
        state: String,
        params: WindowManager.LayoutParams
    ): View {
        val frame = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(size, size)
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#0f172a"))
                setStroke(4, Color.parseColor("#06b6d4"))
            }
            background = bg
            elevation = 16f
        }

        val icon = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_btn_speak_now)
            setColorFilter(Color.parseColor("#38bdf8"))
            val iconSize = (32 * resources.displayMetrics.density).toInt()
            layoutParams = FrameLayout.LayoutParams(iconSize, iconSize, Gravity.CENTER)
        }
        frame.addView(icon)

        // Drag & Touch Handling
        frame.setOnTouchListener(object : View.OnTouchListener {
            private var initialX = 0
            private var initialY = 0
            private var initialTouchX = 0f
            private var initialTouchY = 0f

            override fun onTouch(v: View?, event: MotionEvent): Boolean {
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = params.x
                        initialY = params.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        params.x = initialX + (event.rawX - initialTouchX).toInt()
                        params.y = initialY + (event.rawY - initialTouchY).toInt()
                        windowManager?.updateViewLayout(frame, params)
                        return true
                    }
                    MotionEvent.ACTION_UP -> {
                        val diffX = Math.abs(event.rawX - initialTouchX)
                        val diffY = Math.abs(event.rawY - initialTouchY)
                        if (diffX < 10 && diffY < 10) {
                            // Tap detected: Bring MainActivity to front
                            val launchIntent = Intent(applicationContext, MainActivity::class.java).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                            }
                            startActivity(launchIntent)
                        }
                        return true
                    }
                }
                return false
            }
        })

        return frame
    }

    private fun createOrbView(size: Int, state: String): View {
        val frame = FrameLayout(this).apply {
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                colors = intArrayOf(
                    Color.parseColor("#38bdf8"),
                    Color.parseColor("#818cf8"),
                    Color.parseColor("#0f172a")
                )
                gradientType = GradientDrawable.RADIAL_GRADIENT
                gradientRadius = size.toFloat() / 2f
            }
            background = bg
        }
        return frame
    }

    private fun updateState(state: String) {
        // Can adjust pulse/color dynamically
    }

    private fun hideOverlay() {
        if (overlayView != null) {
            try {
                windowManager?.removeView(overlayView)
            } catch (e: Exception) {
                Log.w(TAG, "Error removing overlay view: ${e.message}")
            }
            overlayView = null
        }
        isOverlayShowing = false
    }

    override fun onDestroy() {
        super.onDestroy()
        hideOverlay()
    }
}
