package com.jarvis.assistant

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var loadingOverlay: View? = null

    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_RECORD_AUDIO = 101
    }

    // ── Inactivity Auto-Minimize (20-30s timeout matching PC) ─────────────
    private val AUTO_MINIMIZE_DELAY_MS = 25000L // 25 seconds idle timeout
    private val idleHandler = Handler(Looper.getMainLooper())
    private val autoMinimizeRunnable = Runnable {
        Log.i(TAG, "25s of inactivity elapsed. Automatically returning to background...")
        try {
            moveTaskToBack(true)
        } catch (e: Exception) {
            Log.w(TAG, "Error moving task to back: ${e.message}")
        }
    }

    fun resetAutoMinimizeTimer() {
        idleHandler.removeCallbacks(autoMinimizeRunnable)
        idleHandler.postDelayed(autoMinimizeRunnable, AUTO_MINIMIZE_DELAY_MS)
    }

    fun cancelAutoMinimizeTimer() {
        idleHandler.removeCallbacks(autoMinimizeRunnable)
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        resetAutoMinimizeTimer()
    }

    // ── Wake Word, Session State & Idle Receiver ─────────────────────────
    private val wakeWordReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            if (action == JarvisForegroundService.ACTION_RESET_IDLE) {
                resetAutoMinimizeTimer()
                return
            }
            if (action == JarvisForegroundService.ACTION_SESSION_STATE_CHANGED) {
                val active = intent.getBooleanExtra("active", false)
                val state = intent.getStringExtra("state") ?: "idle"
                val error = intent.getStringExtra("error")
                webView.post {
                    if (error == "missing_keys") {
                        webView.evaluateJavascript("if (window.onMissingApiKeys) window.onMissingApiKeys();", null)
                    } else {
                        webView.evaluateJavascript("if (window.onNativeSessionState) window.onNativeSessionState($active, '$state');", null)
                    }
                }
                updateUIState()
                return
            }
            if (action == JarvisForegroundService.ACTION_WAKE_WORD_DETECTED) {
                val phrase = intent.getStringExtra("phrase") ?: "hey jarvis"
                Log.i(TAG, "Wake word received: \"$phrase\" → bringing app to foreground.")

                val bringToFront = Intent(applicationContext, MainActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                    putExtra("from_wake_word", true)
                    putExtra("phrase", phrase)
                }
                startActivity(bringToFront)
                handleWakeWordActivation(phrase)
                resetAutoMinimizeTimer()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webViewMain)
        loadingOverlay = findViewById(R.id.loadingOverlay)

        setupWebView()
        checkAudioPermission()

        // Register wake word and session receiver for Activity lifetime
        val filter = IntentFilter().apply {
            addAction(JarvisForegroundService.ACTION_WAKE_WORD_DETECTED)
            addAction(JarvisForegroundService.ACTION_SESSION_STATE_CHANGED)
            addAction(JarvisForegroundService.ACTION_RESET_IDLE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wakeWordReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(wakeWordReceiver, filter)
        }

        // Handle launch from wake word (intent extra)
        if (intent?.getBooleanExtra("from_wake_word", false) == true) {
            val phrase = intent?.getStringExtra("phrase") ?: "hey jarvis"
            handleWakeWordActivation(phrase)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.loadsImagesAutomatically = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.addJavascriptInterface(JarvisNativeBridge(this), "JarvisNative")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                // Grant audio capture permissions inside webview if requested
                request?.grant(request.resources)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                loadingOverlay?.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                loadingOverlay?.visibility = View.GONE
                updateUIState()
            }
        }

        // Load bundled Cyberpunk HUD UI
        webView.loadUrl("file:///android_asset/web/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra("from_wake_word", false)) {
            val phrase = intent.getStringExtra("phrase") ?: "hey jarvis"
            handleWakeWordActivation(phrase)
        }
        resetAutoMinimizeTimer()
    }

    override fun onResume() {
        super.onResume()
        if (JarvisForegroundService.isServiceEnabled(this) && !JarvisForegroundService.isRunning) {
            startJarvisService()
        }
        updateUIState()
        resetAutoMinimizeTimer()
    }

    override fun onPause() {
        super.onPause()
        cancelAutoMinimizeTimer()
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelAutoMinimizeTimer()
        try { unregisterReceiver(wakeWordReceiver) } catch (_: Exception) {}
    }

    fun updateUIState() {
        val isServiceRunning = JarvisForegroundService.isRunning
        val isAccEnabled = isAccessibilityEnabled()
        val isBatIgnored = isBatteryOptimizationIgnored()
        val isSessionActive = JarvisForegroundService.isSessionActive

        webView.post {
            webView.evaluateJavascript(
                "if (window.updateServiceStatus) window.updateServiceStatus($isServiceRunning, $isAccEnabled, $isBatIgnored, $isSessionActive);",
                null
            )
        }
    }

    fun startJarvisService() {
        JarvisForegroundService.setServiceEnabled(this, true)
        val serviceIntent = Intent(this, JarvisForegroundService::class.java).apply {
            action = JarvisForegroundService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, serviceIntent)
        } else {
            startService(serviceIntent)
        }
        updateUIState()
    }

    fun stopJarvisService() {
        JarvisForegroundService.setServiceEnabled(this, false)
        val serviceIntent = Intent(this, JarvisForegroundService::class.java).apply {
            action = JarvisForegroundService.ACTION_STOP
        }
        startService(serviceIntent)
        updateUIState()
    }

    fun restartJarvisService() {
        stopJarvisService()
        Handler(Looper.getMainLooper()).postDelayed({
            startJarvisService()
        }, 1000)
    }

    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(intent)
        Toast.makeText(this, "Enable 'Jarvis AI Assistant' in the Accessibility list", Toast.LENGTH_LONG).show()
    }

    private fun isAccessibilityEnabled(): Boolean {
        if (JarvisAccessibilityService.isServiceRunning) return true
        try {
            val accessibilityEnabled = Settings.Secure.getInt(
                contentResolver,
                Settings.Secure.ACCESSIBILITY_ENABLED, 0
            )
            if (accessibilityEnabled == 1) {
                val serviceString = Settings.Secure.getString(
                    contentResolver,
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                ) ?: ""
                val expectedService = "$packageName/${JarvisAccessibilityService::class.java.canonicalName}"
                val shortExpected = "$packageName/.JarvisAccessibilityService"
                if (serviceString.contains(expectedService) || serviceString.contains(shortExpected) || serviceString.contains("JarvisAccessibilityService")) {
                    return true
                }
            }
        } catch (_: Exception) {}
        return false
    }

    fun isBatteryOptimizationIgnored(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            return pm.isIgnoringBatteryOptimizations(packageName)
        }
        return true
    }

    fun requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            try {
                startActivity(intent)
            } catch (e: Exception) {
                val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                startActivity(fallbackIntent)
            }
        }
    }

    fun toggleMicrophoneFromUI() {
        resetAutoMinimizeTimer()
        // If service is not running, start it
        if (!JarvisForegroundService.isRunning) {
            startJarvisService()
        }
    }

    private fun checkAudioPermission() {
        val requiredPermissions = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_CONTACTS
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requiredPermissions.add(Manifest.permission.READ_PHONE_STATE)
        }

        val missing = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                missing.toTypedArray(),
                REQUEST_RECORD_AUDIO
            )
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_RECORD_AUDIO) {
            val allGranted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (allGranted) {
                Toast.makeText(this, "সব পারমিশন সক্রিয় হয়েছে (মাইক, কল, কন্টাক্ট)!", Toast.LENGTH_SHORT).show()
                checkOverlayPermission()
            }
        }
    }

    private fun checkOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            try {
                startActivity(intent)
            } catch (_: Exception) {}
        }
    }

    private fun handleWakeWordActivation(phrase: String = "Hey Jarvis") {
        Log.i(TAG, "Handling wake word activation: \"$phrase\"")
        if (!JarvisForegroundService.isRunning) {
            startJarvisService()
        }
        webView.post {
            webView.evaluateJavascript(
                "if (window.onWakeWordDetected) window.onWakeWordDetected('$phrase');",
                null
            )
        }
        resetAutoMinimizeTimer()
    }

    // ── Bidirectional JavaScript Bridge (Exposed as window.JarvisNative) ──
    class JarvisNativeBridge(private val activity: MainActivity) {

        @JavascriptInterface
        fun getConfig(): String {
            return MobileConfig.getAllConfigJson(activity).toString()
        }

        @JavascriptInterface
        fun saveConfig(jsonStr: String): Boolean {
            return try {
                val json = JSONObject(jsonStr)
                MobileConfig.save(activity, json)
                activity.runOnUiThread {
                    Toast.makeText(activity, "Configuration saved successfully!", Toast.LENGTH_SHORT).show()
                    if (JarvisForegroundService.isRunning) {
                        activity.restartJarvisService()
                    }
                }
                true
            } catch (e: Exception) {
                Log.e(TAG, "Error saving config: ${e.message}")
                false
            }
        }

        @JavascriptInterface
        fun getServiceStatus(): String {
            val status = JSONObject().apply {
                put("serviceRunning", JarvisForegroundService.isRunning)
                put("sessionActive", JarvisForegroundService.isSessionActive)
                put("accessibilityEnabled", activity.isAccessibilityEnabled())
                put("batteryIgnored", activity.isBatteryOptimizationIgnored())
            }
            return status.toString()
        }

        @JavascriptInterface
        fun isSessionActive(): Boolean {
            return JarvisForegroundService.isSessionActive
        }

        @JavascriptInterface
        fun toggleService(enable: Boolean) {
            activity.runOnUiThread {
                if (enable) activity.startJarvisService() else activity.stopJarvisService()
            }
        }

        @JavascriptInterface
        fun openAccessibilitySettings() {
            activity.runOnUiThread {
                activity.openAccessibilitySettings()
            }
        }

        @JavascriptInterface
        fun requestBatteryOptimization() {
            activity.runOnUiThread {
                activity.requestIgnoreBatteryOptimization()
            }
        }

        @JavascriptInterface
        fun toggleMic() {
            activity.runOnUiThread {
                activity.toggleMicrophoneFromUI()
            }
        }

        @JavascriptInterface
        fun executeMobileAction(action: String, payloadJson: String) {
            activity.runOnUiThread {
                try {
                    val payload = if (payloadJson.isNotBlank()) JSONObject(payloadJson) else JSONObject()
                    JarvisAccessibilityService.instance?.handleCommand(action, payload)
                } catch (e: Exception) {
                    Log.e(TAG, "Error executing action: ${e.message}")
                }
            }
        }

        @JavascriptInterface
        fun minimizeApp() {
            activity.runOnUiThread {
                activity.moveTaskToBack(true)
            }
        }

        @JavascriptInterface
        fun startVoiceCall() {
            activity.runOnUiThread {
                if (!MobileConfig.hasValidCredentials(activity)) {
                    Toast.makeText(activity, "⚠️ LiveKit API কী পাওয়া যায়নি! Settings ট্যাবে কী সংরক্ষণ করুন।", Toast.LENGTH_LONG).show()
                    activity.webView.evaluateJavascript("if (window.onMissingApiKeys) window.onMissingApiKeys();", null)
                    return@runOnUiThread
                }
                if (!JarvisForegroundService.isRunning) {
                    activity.startJarvisService()
                    activity.webView.postDelayed({
                        JarvisForegroundService.instance?.connectSession()
                    }, 600)
                } else {
                    JarvisForegroundService.instance?.connectSession()
                }
                Toast.makeText(activity, "Jarvis সেশন শুরু হয়েছে...", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun endVoiceCall() {
            activity.runOnUiThread {
                JarvisForegroundService.instance?.disconnectSession(sendByePacket = true)
                Toast.makeText(activity, "Jarvis সেশন বন্ধ হয়েছে (বাই বাই!)", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun shutdownJarvis() {
            activity.runOnUiThread {
                activity.stopJarvisService()
                Toast.makeText(activity, "Jarvis সম্পূর্ণ বন্ধ করা হয়েছে।", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun setSpeakerphone(enabled: Boolean) {
            activity.runOnUiThread {
                JarvisForegroundService.instance?.setSpeakerphone(enabled)
            }
        }

        @JavascriptInterface
        fun resetIdleTimer() {
            activity.runOnUiThread {
                activity.resetAutoMinimizeTimer()
            }
        }
    }
}
