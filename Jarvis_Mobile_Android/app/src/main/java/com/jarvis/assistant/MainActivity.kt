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
import android.app.Dialog
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import org.json.JSONObject
import java.io.File
import kotlinx.coroutines.*

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var loadingOverlay: View? = null

    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_RECORD_AUDIO = 101
        var instance: MainActivity? = null
            private set
    }

    fun postDirectTranscript(userText: String, assistantText: String) {
        val u = userText.trim()
        val a = assistantText.trim()
        if (u.isBlank() || u.equals("null", ignoreCase = true) || u.equals("undefined", ignoreCase = true)) return
        if (a.isBlank() || a.equals("null", ignoreCase = true) || a.equals("undefined", ignoreCase = true)) return
        val safeUser = JSONObject.quote(u)
        val safeAssistant = JSONObject.quote(a)
        webView.post {
            webView.evaluateJavascript("if (window.onDirectTranscript) window.onDirectTranscript($safeUser, $safeAssistant);", null)
        }
    }

    // ── Inactivity Auto-Minimize ──────────────────────────────────────────
    // ONLY auto-minimize if the app was awakened hands-free via wake word.
    // If the user opened the app normally by tapping the app icon, keep it open!
    private var isAwakenedByWakeWord = false
    private val AUTO_MINIMIZE_DELAY_MS = 60000L // 60s idle timeout when woken by voice
    private val idleHandler = Handler(Looper.getMainLooper())
    private val autoMinimizeRunnable = Runnable {
        if (isAwakenedByWakeWord) {
            Log.i(TAG, "Inactivity after wake word elapsed. Returning to background...")
            try {
                moveTaskToBack(true)
            } catch (e: Exception) {
                Log.w(TAG, "Error moving task to back: ${e.message}")
            }
            isAwakenedByWakeWord = false
        }
    }

    fun resetAutoMinimizeTimer() {
        idleHandler.removeCallbacks(autoMinimizeRunnable)
        if (isAwakenedByWakeWord) {
            idleHandler.postDelayed(autoMinimizeRunnable, AUTO_MINIMIZE_DELAY_MS)
        }
    }

    fun cancelAutoMinimizeTimer() {
        isAwakenedByWakeWord = false
        idleHandler.removeCallbacks(autoMinimizeRunnable)
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        // User touched or interacted with screen -> cancel auto-minimize so app stays open
        cancelAutoMinimizeTimer()
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
                isAwakenedByWakeWord = true
                handleWakeWordActivation(phrase)
                resetAutoMinimizeTimer()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
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
            isAwakenedByWakeWord = true
            val phrase = intent?.getStringExtra("phrase") ?: "hey jarvis"
            handleWakeWordActivation(phrase)
            resetAutoMinimizeTimer()
        } else {
            isAwakenedByWakeWord = false
            cancelAutoMinimizeTimer()
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

                // Immediately trigger background API Health check to populate top health bar
                JarvisNativeBridge(this@MainActivity).checkApiHealthAsync()

                // Auto-start Jarvis service and connect to autonomous voice session on launch
                if (!JarvisForegroundService.isRunning) {
                    startJarvisService()
                }
                Handler(Looper.getMainLooper()).postDelayed({
                    if (!JarvisForegroundService.isSessionActive) {
                        JarvisForegroundService.instance?.startAutonomousSession(initialGreeting = true)
                        webView.evaluateJavascript("if (window.startVoiceSession) window.startVoiceSession();", null)
                    }
                }, 800)
            }
        }

        // Load bundled Cyberpunk HUD UI
        webView.loadUrl("file:///android_asset/web/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra("from_wake_word", false)) {
            isAwakenedByWakeWord = true
            val phrase = intent.getStringExtra("phrase") ?: "hey jarvis"
            handleWakeWordActivation(phrase)
            resetAutoMinimizeTimer()
        } else {
            isAwakenedByWakeWord = false
            cancelAutoMinimizeTimer()
        }
    }

    override fun onResume() {
        super.onResume()
        if (JarvisForegroundService.isServiceEnabled(this) && !JarvisForegroundService.isRunning) {
            startJarvisService()
        }
        if (!JarvisForegroundService.isSessionActive) {
            Handler(Looper.getMainLooper()).postDelayed({
                if (!JarvisForegroundService.isSessionActive) {
                    JarvisForegroundService.instance?.startAutonomousSession(initialGreeting = false)
                    webView.evaluateJavascript("if (window.startVoiceSession) window.startVoiceSession();", null)
                }
            }, 600)
        }
        updateUIState()
        if (isAwakenedByWakeWord) {
            resetAutoMinimizeTimer()
        } else {
            cancelAutoMinimizeTimer()
        }
    }

    override fun onPause() {
        super.onPause()
        cancelAutoMinimizeTimer()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
        cancelAutoMinimizeTimer()
        try { unregisterReceiver(wakeWordReceiver) } catch (_: Exception) {}
    }

    override fun onBackPressed() {
        // If webView can go back in history, go back
        if (webView.canGoBack()) {
            webView.goBack()
            return
        }
        // Switch back to home tab first if in another tab, or smoothly minimize to background
        webView.evaluateJavascript(
            "(function() { if (window.state && window.state.currentTab !== 'home') { window.switchTab('home'); return true; } return false; })()",
            { result ->
                if (result != "true") {
                    // Minimize to background so Jarvis stays running silently in background
                    moveTaskToBack(true)
                }
            }
        )
    }

    fun updateUIState() {
        val isServiceRunning = JarvisForegroundService.isRunning
        val isAccEnabled = isAccessibilityEnabled()
        val isBatIgnored = isBatteryOptimizationIgnored()
        val isSessionActive = JarvisForegroundService.isSessionActive
        val isNotifEnabled = isNotificationListenerEnabled()

        webView.post {
            webView.evaluateJavascript(
                "if (window.updateServiceStatus) window.updateServiceStatus($isServiceRunning, $isAccEnabled, $isBatIgnored, $isSessionActive, $isNotifEnabled);",
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

    fun isNotificationListenerEnabled(): Boolean {
        return try {
            val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
            flat != null && flat.contains(packageName)
        } catch (_: Exception) {
            false
        }
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

    // ── In-App Gemini Pro & Google Account Embedded Login (No External Browsers) ──
    @SuppressLint("SetJavaScriptEnabled")
    fun openInAppGeminiLogin(tier: String = "Gemini Pro") {
        runOnUiThread {
            try {
                val dialog = Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar_Fullscreen)

                val root = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    setBackgroundColor(Color.parseColor("#0a0d14"))
                }

                // Top Header Bar
                val topBar = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                    setBackgroundColor(Color.parseColor("#121722"))
                    setPadding(32, 28, 32, 28)
                    gravity = Gravity.CENTER_VERTICAL
                }

                val titleLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f)
                }

                val titleText = TextView(this).apply {
                    text = "🔑 Google / $tier ইন-অ্যাপ লগইন"
                    setTextColor(Color.parseColor("#22d3ee"))
                    textSize = 15f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }

                val subText = TextView(this).apply {
                    text = "ব্রাউজার ছাড়া সরাসরি Jarvis-এর ভেতরে লগইন (24/7 একাউন্ট সক্রিয়)"
                    setTextColor(Color.parseColor("#94a3b8"))
                    textSize = 11f
                }
                titleLayout.addView(titleText)
                titleLayout.addView(subText)

                val btnDone = Button(this).apply {
                    text = "✓ সম্পন্ন"
                    setTextColor(Color.parseColor("#0a0d14"))
                    setBackgroundColor(Color.parseColor("#22d3ee"))
                    textSize = 12f
                    setPadding(24, 0, 24, 0)
                    setOnClickListener {
                        val cookies = CookieManager.getInstance().getCookie("https://gemini.google.com") ?: ""
                        if (cookies.contains("SID") || cookies.contains("__Secure") || cookies.contains("HSID")) {
                            MobileConfig.setGeminiWebLoggedIn(this@MainActivity, true, tier = tier)
                            Toast.makeText(this@MainActivity, "✅ $tier একাউন্ট সফলভাবে সক্রিয় ও সংযুক্ত করা হয়েছে!", Toast.LENGTH_LONG).show()
                            webView.evaluateJavascript("if (window.onGeminiLoginSuccess) window.onGeminiLoginSuccess('$tier');", null)
                        }
                        dialog.dismiss()
                    }
                }

                val btnClose = Button(this).apply {
                    text = "✕"
                    setTextColor(Color.parseColor("#ef4444"))
                    setBackgroundColor(Color.TRANSPARENT)
                    textSize = 18f
                    setOnClickListener { dialog.dismiss() }
                }

                topBar.addView(titleLayout)
                topBar.addView(btnDone)
                topBar.addView(btnClose)

                // Progress Bar
                val progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 8)
                    isIndeterminate = true
                    visibility = View.VISIBLE
                }

                // In-App Login WebView (Strictly inside modal container; NO external browser launch)
                val loginWebView = WebView(this).apply {
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1.0f)

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        setSupportMultipleWindows(false)
                        mediaPlaybackRequiresUserGesture = false
                        allowFileAccess = true
                        allowContentAccess = true
                        // Standard Chrome Mobile User Agent prevents Google's 403 disallowed_useragent block!
                        userAgentString = "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
                    }

                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                    webChromeClient = object : WebChromeClient() {
                        override fun onProgressChanged(view: WebView?, newProgress: Int) {
                            if (newProgress >= 100) {
                                progressBar.visibility = View.GONE
                            } else {
                                progressBar.visibility = View.VISIBLE
                            }
                        }
                    }

                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            // KEEP ALL NAVIGATION 100% IN-APP! Never launch external intent!
                            return false
                        }

                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            progressBar.visibility = View.VISIBLE
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            progressBar.visibility = View.GONE
                            if (url != null && (url.contains("gemini.google.com") || url.contains("myaccount.google.com"))) {
                                val cookies = CookieManager.getInstance().getCookie(url) ?: ""
                                if (cookies.contains("SID") || cookies.contains("__Secure") || cookies.contains("HSID")) {
                                    MobileConfig.setGeminiWebLoggedIn(this@MainActivity, true, tier = tier)
                                    CookieManager.getInstance().flush()
                                    Toast.makeText(this@MainActivity, "✅ $tier একাউন্ট সফলভাবে ইন-অ্যাপ লগইন হয়েছে!", Toast.LENGTH_SHORT).show()
                                    webView.evaluateJavascript("if (window.onGeminiLoginSuccess) window.onGeminiLoginSuccess('$tier');", null)
                                }
                            }
                        }
                    }
                }

                root.addView(topBar)
                root.addView(progressBar)
                root.addView(loginWebView)

                dialog.setContentView(root)
                dialog.show()

                // Load Gemini sign-in inside the in-app modal
                loginWebView.loadUrl("https://accounts.google.com/ServiceLogin?service=mail&continue=https%3A%2F%2Fgemini.google.com%2Fapp")
            } catch (e: Exception) {
                Log.e(TAG, "Error opening in-app Gemini login: ${e.message}", e)
                Toast.makeText(this, "ইন-অ্যাপ লগইন ওপেন করতে সমস্যা: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ── Bidirectional JavaScript Bridge (Exposed as window.JarvisNative) ──
    class JarvisNativeBridge(private val activity: MainActivity) {

        @JavascriptInterface
        fun openInAppGeminiLogin(tier: String) {
            activity.openInAppGeminiLogin(tier)
        }

        @JavascriptInterface
        fun getGeminiLoginStatus(): String {
            val loggedIn = MobileConfig.isGeminiWebLoggedIn(activity)
            val email = MobileConfig.getGeminiWebActiveEmail(activity)
            val tier = MobileConfig.getGeminiWebActiveTier(activity)
            val obj = JSONObject().apply {
                put("isLoggedIn", loggedIn)
                put("email", email)
                put("tier", tier)
            }
            return obj.toString()
        }

        @JavascriptInterface
        fun logoutGeminiWeb() {
            activity.runOnUiThread {
                MobileConfig.clearGeminiWebLogin(activity)
                try {
                    CookieManager.getInstance().removeAllCookies(null)
                    CookieManager.getInstance().flush()
                } catch (_: Exception) {}
                Toast.makeText(activity, "জেমিনি একাউন্ট লগআউট করা হয়েছে।", Toast.LENGTH_SHORT).show()
                activity.webView.evaluateJavascript("if (window.onGeminiLogoutSuccess) window.onGeminiLogoutSuccess();", null)
            }
        }

        @JavascriptInterface
        fun getConfig(): String {
            return MobileConfig.getAllConfigJson(activity).toString()
        }

        @JavascriptInterface
        fun getApiHealth(): String {
            val cached = ApiHealthChecker.getCachedHealth()
            return cached?.toString() ?: org.json.JSONObject().apply {
                put("overall_health_percent", 100)
                put("checked_at", "--:--")
                put("results", org.json.JSONArray())
            }.toString()
        }

        @JavascriptInterface
        fun checkApiHealthAsync() {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val health = ApiHealthChecker.checkAllHealth(activity, force = true)
                    activity.runOnUiThread {
                        activity.webView.evaluateJavascript("if (window.onApiHealthUpdated) window.onApiHealthUpdated($health);", null)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "checkApiHealthAsync error: ${e.message}")
                }
            }
        }

        @JavascriptInterface
        fun checkSingleKeyHealth(provider: String, key: String): String {
            val resultObj = org.json.JSONObject()
            runBlocking {
                val res = ApiHealthChecker.checkSingleKey(provider, key)
                resultObj.put("provider", res.provider)
                resultObj.put("name", res.name)
                resultObj.put("status", res.status)
                resultObj.put("usage_percent", res.usagePercent)
                resultObj.put("message", res.message)
                resultObj.put("detail", res.message)
            }
            return resultObj.toString()
        }

        @JavascriptInterface
        fun saveConfig(jsonStr: String): Boolean {
            return try {
                val json = JSONObject(jsonStr)
                MobileConfig.save(activity, json)

                // Immediately run health check to update the top API Health Bar in real time
                checkApiHealthAsync()

                // Reconnect active session with new credentials immediately
                if (JarvisForegroundService.isRunning) {
                    JarvisForegroundService.instance?.reconnectWithUpdatedKeys()
                    JarvisForegroundService.instance?.sendConfigSyncPacket(json)
                }

                // Sync config to PC Bridge if reachable
                syncConfigToPc(json)

                activity.runOnUiThread {
                    Toast.makeText(activity, "কনফিগারেশন ও API কী সফলভাবে আপডেট হয়েছে!", Toast.LENGTH_SHORT).show()
                }
                true
            } catch (e: Exception) {
                Log.e(TAG, "Error saving config: ${e.message}")
                false
            }
        }

        private fun syncConfigToPc(json: JSONObject) {
            val ip = MobileConfig.getPcIp(activity)
            val port = MobileConfig.getPcPort(activity)
            if (ip.isBlank()) return
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val url = java.net.URL("http://$ip:$port/api/config")
                    val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 3000
                        readTimeout = 3000
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                    }
                    conn.outputStream.use { os ->
                        os.write(json.toString().toByteArray(Charsets.UTF_8))
                    }
                    val code = conn.responseCode
                    conn.disconnect()
                    Log.i(TAG, "Synced config to PC at $ip:$port (HTTP $code)")
                } catch (e: Exception) {
                    Log.d(TAG, "PC sync skipped: ${e.message}")
                }
            }
        }

        @JavascriptInterface
        fun getServiceStatus(): String {
            val status = JSONObject().apply {
                put("serviceRunning", JarvisForegroundService.isRunning)
                put("sessionActive", JarvisForegroundService.isSessionActive)
                put("accessibilityEnabled", activity.isAccessibilityEnabled())
                put("batteryIgnored", activity.isBatteryOptimizationIgnored())
                put("notificationListenerEnabled", activity.isNotificationListenerEnabled())
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
        fun openNotificationListenerSettings() {
            activity.runOnUiThread {
                try {
                    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    activity.startActivity(intent)
                    Toast.makeText(activity, "Jarvis Assistant-কে Notification Access অন করুন", Toast.LENGTH_LONG).show()
                } catch (e: Exception) {
                    Log.e(TAG, "Error opening notification listener settings: ${e.message}")
                }
            }
        }

        @JavascriptInterface
        fun isNotificationListenerEnabled(): Boolean {
            return activity.isNotificationListenerEnabled()
        }

        @JavascriptInterface
        fun toggleMic() {
            activity.runOnUiThread {
                activity.toggleMicrophoneFromUI()
            }
        }

        @JavascriptInterface
        fun sendTextMessage(text: String) {
            val clean = text.trim()
            if (clean.isBlank()) return
            activity.runOnUiThread {
                activity.resetAutoMinimizeTimer()
                JarvisForegroundService.instance?.handleUserSpokenCommand(clean)
            }
        }

        @JavascriptInterface
        fun executeMobileAction(action: String, payloadJson: String) {
            activity.runOnUiThread {
                try {
                    val payload = if (payloadJson.isNotBlank()) JSONObject(payloadJson) else JSONObject()
                    val target = payload.optString("target", "")

                    when (action.lowercase().trim()) {
                        "lock" -> {
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.handleCommand("lock", payload)
                                Toast.makeText(activity, "🔒 মোবাইল স্ক্রিন লক করা হচ্ছে...", Toast.LENGTH_SHORT).show()
                            } else {
                                val locked = JarvisForegroundService.instance?.lockDeviceLocally() ?: false
                                if (locked) {
                                    Toast.makeText(activity, "🔒 মোবাইল স্ক্রিন লক করা হয়েছে", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(activity, "⚠️ স্ক্রিন লক করার জন্য Accessibility Settings থেকে Jarvis Assistant অন করুন।", Toast.LENGTH_LONG).show()
                                    activity.openAccessibilitySettings()
                                }
                            }
                        }
                        "unlock" -> {
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.unlockDevice()
                                Toast.makeText(activity, "🔓 মোবাইল স্ক্রিন আনলক করা হচ্ছে...", Toast.LENGTH_SHORT).show()
                            } else {
                                JarvisForegroundService.instance?.unlockDeviceLocally()
                                Toast.makeText(activity, "🔓 স্ক্রিন জাগানো হয়েছে...", Toast.LENGTH_SHORT).show()
                            }
                        }
                        "minimize" -> {
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.minimizeApp()
                            } else {
                                activity.moveTaskToBack(true)
                            }
                            Toast.makeText(activity, "📱 মিনিমাইজ করা হয়েছে", Toast.LENGTH_SHORT).show()
                        }
                        "close_app", "close_application", "facebook_close", "whatsapp_close" -> {
                            val appToClose = when (action.lowercase().trim()) {
                                "facebook_close" -> "facebook"
                                "whatsapp_close" -> "whatsapp"
                                else -> payload.optString("app_name", target)
                            }
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.closeApplication(appToClose)
                            } else {
                                JarvisForegroundService.instance?.closeApplicationLocally(appToClose)
                            }
                            Toast.makeText(activity, "❌ '$appToClose' বন্ধ করা হচ্ছে...", Toast.LENGTH_SHORT).show()
                        }
                        "browser_search", "search_browser", "search", "google_search" -> {
                            val query = payload.optString("query", target)
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.searchBrowser(query)
                            } else {
                                JarvisForegroundService.instance?.searchBrowserLocally(query)
                            }
                            Toast.makeText(activity, "🌐 গুগলে সার্চ করা হচ্ছে: $query", Toast.LENGTH_SHORT).show()
                        }
                        "screen_control", "scroll_up", "scroll_down", "recents" -> {
                            val controlType = if (action.startsWith("scroll") || action == "recents") action else payload.optString("control_type", target)
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.performScreenControl(controlType, payload)
                            } else {
                                Toast.makeText(activity, "⚠️ স্ক্রিন কন্ট্রোলের জন্য Accessibility অন করুন", Toast.LENGTH_SHORT).show()
                                activity.openAccessibilitySettings()
                            }
                        }
                        "facebook", "facebook_open" -> {
                            var launched = false
                            if (JarvisAccessibilityService.instance != null) {
                                launched = JarvisAccessibilityService.instance?.openApplication("facebook") ?: false
                            }
                            if (!launched) {
                                launched = JarvisForegroundService.instance?.launchApplicationLocally("facebook") ?: false
                            }
                            Toast.makeText(activity, "📘 Facebook ওপেন করা হচ্ছে...", Toast.LENGTH_SHORT).show()
                        }
                        "whatsapp", "whatsapp_open" -> {
                            var launched = false
                            if (JarvisAccessibilityService.instance != null) {
                                launched = JarvisAccessibilityService.instance?.openApplication("whatsapp") ?: false
                            }
                            if (!launched) {
                                launched = JarvisForegroundService.instance?.launchApplicationLocally("whatsapp") ?: false
                            }
                            Toast.makeText(activity, "💬 WhatsApp ওপেন করা হয়েছে", Toast.LENGTH_SHORT).show()
                        }
                        "call_phone" -> {
                            if (target == "1" || target.isEmpty() || target.equals("dialer", true)) {
                                val intent = Intent(Intent.ACTION_DIAL).apply {
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                }
                                activity.startActivity(intent)
                                Toast.makeText(activity, "📞 ফোন ডায়ালার ওপেন করা হয়েছে (SIM 1)", Toast.LENGTH_SHORT).show()
                            } else {
                                if (JarvisAccessibilityService.instance != null) {
                                    JarvisAccessibilityService.instance?.handleCommand("call_phone", payload)
                                } else {
                                    val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$target")).apply {
                                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                    }
                                    activity.startActivity(dialIntent)
                                }
                            }
                        }
                        "whatsapp_message" -> {
                            val msg = payload.optString("message", "")
                            if (target.isNotBlank() && msg.isNotBlank() && JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.handleCommand("whatsapp_message", payload)
                            } else {
                                var launched = false
                                if (JarvisAccessibilityService.instance != null) {
                                    launched = JarvisAccessibilityService.instance?.openApplication("whatsapp") ?: false
                                }
                                if (!launched) {
                                    launched = JarvisForegroundService.instance?.launchApplicationLocally("whatsapp") ?: false
                                }
                                Toast.makeText(activity, "💬 WhatsApp ওপেন করা হয়েছে", Toast.LENGTH_SHORT).show()
                            }
                        }
                        "youtube", "youtube_open" -> {
                            var launched = false
                            if (JarvisAccessibilityService.instance != null) {
                                launched = JarvisAccessibilityService.instance?.openApplication("youtube") ?: false
                            }
                            if (!launched) {
                                launched = JarvisForegroundService.instance?.launchApplicationLocally("youtube") ?: false
                            }
                            Toast.makeText(activity, "▶️ YouTube ওপেন করা হয়েছে", Toast.LENGTH_SHORT).show()
                        }
                        "youtube_search" -> {
                            val query = payload.optString("query", target)
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.handleCommand("youtube_search", payload)
                            } else {
                                JarvisForegroundService.instance?.searchYouTubeLocally(query)
                            }
                            Toast.makeText(activity, "▶️ YouTube-এ সার্চ ও প্লে করা হচ্ছে...", Toast.LENGTH_SHORT).show()
                        }
                        "survey_auto" -> {
                            if (JarvisAccessibilityService.instance != null) {
                                val ran = JarvisAccessibilityService.instance?.performSurveyAutomation() ?: false
                                Toast.makeText(activity, if (ran) "📋 সার্ভে অটোমেশন কার্যকর হয়েছে" else "📋 কোনো সক্রিয় সার্ভে পেজ পাওয়া যায়নি", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(activity, "⚠️ অটো সার্ভের জন্য Accessibility Settings থেকে Jarvis অন করুন।", Toast.LENGTH_LONG).show()
                                activity.openAccessibilitySettings()
                            }
                        }
                        "open_app", "open_application" -> {
                            val appName = payload.optString("app_name", target)
                            if (appName.isNotBlank()) {
                                var launched = false
                                if (JarvisAccessibilityService.instance != null) {
                                    launched = JarvisAccessibilityService.instance?.openApplication(appName) ?: false
                                }
                                if (!launched) {
                                    launched = JarvisForegroundService.instance?.launchApplicationLocally(appName) ?: false
                                }
                                if (!launched) {
                                    try {
                                        val pkg = JarvisAccessibilityService.packageMap[appName.lowercase()] ?: appName
                                        val launchIntent = activity.packageManager.getLaunchIntentForPackage(pkg)
                                        if (launchIntent != null) {
                                            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                            activity.startActivity(launchIntent)
                                            launched = true
                                        }
                                    } catch (_: Exception) {}
                                }
                                Toast.makeText(activity, if (launched) "🚀 '$appName' ওপেন করা হচ্ছে..." else "⚠️ '$appName' অ্যাপ পাওয়া যায়নি", Toast.LENGTH_SHORT).show()
                            }
                        }
                        else -> {
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.handleCommand(action, payload)
                            } else {
                                var launched = JarvisForegroundService.instance?.launchApplicationLocally(target) ?: false
                                if (!launched) {
                                    val launchIntent = activity.packageManager.getLaunchIntentForPackage(target)
                                    if (launchIntent != null) {
                                        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                        activity.startActivity(launchIntent)
                                    }
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error executing action: ${e.message}")
                    Toast.makeText(activity, "Action error: ${e.message}", Toast.LENGTH_SHORT).show()
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
                if (!JarvisForegroundService.isRunning) {
                    activity.startJarvisService()
                    activity.webView.postDelayed({
                        JarvisForegroundService.instance?.startAutonomousSession(initialGreeting = false)
                    }, 500)
                } else {
                    JarvisForegroundService.instance?.startAutonomousSession(initialGreeting = false)
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
        fun speakTextLocally(text: String) {
            activity.runOnUiThread {
                JarvisForegroundService.instance?.speakTextLocally(text)
            }
        }

        @JavascriptInterface
        fun exitAndCloseApp(playByeVoice: Boolean) {
            activity.runOnUiThread {
                Log.i(TAG, "Full 1-Click App Exit triggered by user.")
                activity.cancelAutoMinimizeTimer()
                Toast.makeText(activity, "বাই বাই! Jarvis ও মাইক্রোফোন সম্পূর্ণ বন্ধ হচ্ছে...", Toast.LENGTH_SHORT).show()

                // Play verbal Bye if requested
                if (playByeVoice) {
                    try {
                        JarvisForegroundService.instance?.speakTextLocally("বাই বাই জানু, ধন্যবাদ তোমাকে!")
                    } catch (_: Exception) {}
                }

                // Disconnect session and release microphone immediately
                try {
                    JarvisForegroundService.instance?.disconnectSession(sendByePacket = true)
                } catch (_: Exception) {}

                // Disable service and stop it completely
                JarvisForegroundService.setServiceEnabled(activity, false)
                activity.stopJarvisService()

                // Finish activity and kill process cleanly
                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        activity.finishAffinity()
                    } catch (_: Exception) {
                        activity.finish()
                    }
                    try {
                        android.os.Process.killProcess(android.os.Process.myPid())
                    } catch (_: Exception) {}
                }, if (playByeVoice) 850L else 200L)
            }
        }

        @JavascriptInterface
        fun shutdownJarvis() {
            exitAndCloseApp(true)
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

        @JavascriptInterface
        fun pairWithPc(ip: String, port: Int, secret: String) {
            val safeIp = ip.trim()
            val safePort = if (port > 0) port else 8765
            val safeSecret = secret.trim()

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val url = java.net.URL("http://$safeIp:$safePort/pair")
                    val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 4000
                        readTimeout = 4000
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                    }
                    val reqJson = JSONObject().apply {
                        put("device_name", "Jarvis Mobile Assistant")
                        put("secret", safeSecret)
                    }
                    java.io.OutputStreamWriter(conn.outputStream).use { it.write(reqJson.toString()) }
                    val code = conn.responseCode
                    if (code == 200) {
                        val respStr = conn.inputStream.bufferedReader().use { it.readText() }
                        val resp = JSONObject(respStr)
                        if (resp.optBoolean("success", false)) {
                            MobileConfig.setPcIp(activity, safeIp)
                            MobileConfig.setPcPort(activity, safePort)
                            MobileConfig.setPcSecret(activity, safeSecret)
                            MobileConfig.setPcPaired(activity, true)
                            JarvisForegroundService.instance?.sendPlatformIdentify(true)
                            withContext(Dispatchers.Main) {
                                Toast.makeText(activity, "✅ পিসির সাথে সফলভাবে কানেক্ট ও পেয়ার হয়েছে!", Toast.LENGTH_LONG).show()
                                activity.webView.evaluateJavascript("if (window.onPcPairStatusChanged) window.onPcPairStatusChanged(true, '$safeIp:$safePort', '${resp.optString("pc_name", "PC")}');", null)
                            }
                            return@launch
                        }
                    }
                    withContext(Dispatchers.Main) {
                        Toast.makeText(activity, "❌ পেয়ারিং ব্যর্থ হয়েছে: সিকিউরিটি কোড ভুল অথবা পিসি রিজেক্ট করেছে।", Toast.LENGTH_LONG).show()
                        activity.webView.evaluateJavascript("if (window.onPcPairStatusChanged) window.onPcPairStatusChanged(false, null, null);", null)
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Pair with PC error: ${e.message}")
                    withContext(Dispatchers.Main) {
                        Toast.makeText(activity, "⚠️ পিসির সাথে সংযোগ করা যায়নি! পিসি ও মোবাইল একই ওয়াইফাই বা নেটওয়ার্কে আছে কিনা নিশ্চিত করুন।", Toast.LENGTH_LONG).show()
                        activity.webView.evaluateJavascript("if (window.onPcPairStatusChanged) window.onPcPairStatusChanged(false, null, null);", null)
                    }
                }
            }
        }

        @JavascriptInterface
        fun unpairFromPc() {
            val ip = MobileConfig.getPcIp(activity)
            val port = MobileConfig.getPcPort(activity)
            MobileConfig.setPcPaired(activity, false)
            JarvisForegroundService.instance?.sendPlatformIdentify(false)
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val url = java.net.URL("http://$ip:$port/unpair")
                    val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 3000
                        readTimeout = 3000
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                    }
                    java.io.OutputStreamWriter(conn.outputStream).use { it.write("{}") }
                    conn.responseCode
                } catch (_: Exception) {}
            }
            activity.runOnUiThread {
                Toast.makeText(activity, "🔌 পিসি থেকে আনপেয়ার করা হয়েছে।", Toast.LENGTH_SHORT).show()
                activity.webView.evaluateJavascript("if (window.onPcPairStatusChanged) window.onPcPairStatusChanged(false, null, null);", null)
            }
        }

        @JavascriptInterface
        fun getPcPairingStatus(): String {
            val paired = MobileConfig.isPcPaired(activity)
            val ip = MobileConfig.getPcIp(activity)
            val port = MobileConfig.getPcPort(activity)
            val secret = MobileConfig.getPcSecret(activity)
            val obj = JSONObject().apply {
                put("paired", paired)
                put("ip", ip)
                put("port", port)
                put("secret", secret)
            }
            return obj.toString()
        }

        @JavascriptInterface
        fun sendPcAction(action: String, target: String) {
            if (!MobileConfig.isPcPaired(activity)) {
                activity.runOnUiThread {
                    Toast.makeText(activity, "⚠️ পিসির সাথে মোবাইল এখনো পেয়ার বা কানেক্ট করা হয়নি!", Toast.LENGTH_SHORT).show()
                }
                return
            }
            val ip = MobileConfig.getPcIp(activity)
            val port = MobileConfig.getPcPort(activity)

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val url = java.net.URL("http://$ip:$port/pc_action")
                    val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 4000
                        readTimeout = 4000
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                    }
                    val reqJson = JSONObject().apply {
                        put("action", action)
                        put("target", target)
                    }
                    java.io.OutputStreamWriter(conn.outputStream).use { it.write(reqJson.toString()) }
                    val code = conn.responseCode
                    if (code == 200) {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(activity, "🖥️ পিসি কমান্ড কার্যকর হয়েছে: $action", Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(activity, "❌ পিসি কমান্ড গ্রহণ করেনি ($code)", Toast.LENGTH_SHORT).show()
                        }
                    }
                } catch (e: Exception) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(activity, "পিসিতে কমান্ড পাঠাতে সমস্যা: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }

        @JavascriptInterface
        fun fetchPcScreen() {
            if (!MobileConfig.isPcPaired(activity)) {
                activity.runOnUiThread {
                    Toast.makeText(activity, "পিসির স্ক্রিন দেখতে আগে পিসির সাথে পেয়ার করুন।", Toast.LENGTH_SHORT).show()
                }
                return
            }
            val ip = MobileConfig.getPcIp(activity)
            val port = MobileConfig.getPcPort(activity)

            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val url = java.net.URL("http://$ip:$port/pc_screen")
                    val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 4000
                        readTimeout = 6000
                    }
                    if (conn.responseCode == 200) {
                        val resp = conn.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(resp)
                        val b64 = json.optString("image", "")
                        if (b64.isNotBlank()) {
                            withContext(Dispatchers.Main) {
                                activity.webView.evaluateJavascript("if (window.onPcScreenReceived) window.onPcScreenReceived('$b64');", null)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("MainActivity", "Error fetching PC screen: ${e.message}")
                }
            }
        }

        @JavascriptInterface
        fun getSkillsCatalogJson(): String {
            return JarvisMobileSkillsManager.getSkillCatalogJson(activity)
        }

        @JavascriptInterface
        fun getSkillDetails(skillName: String): String {
            return JarvisMobileSkillsManager.getSkillContent(activity, skillName)
        }

        @JavascriptInterface
        fun executeSkillFromUi(skillName: String) {
            activity.runOnUiThread {
                val (success, reply) = JarvisMobileSkillsManager.executeSkill(activity, skillName)
                Toast.makeText(activity, "⚡ $reply", Toast.LENGTH_SHORT).show()
                activity.postDirectTranscript("Execute skill: $skillName", reply)
                JarvisForegroundService.instance?.speakTextLocally(reply)
            }
        }

        // ── ByteDance UI-TARS Mobile Operator Bridge ─────────────────────────
        @JavascriptInterface
        fun getUiTarsStatusJson(): String {
            val serviceActive = JarvisAccessibilityService.isServiceRunning
            val obj = JSONObject()
            obj.put("enabled", true)
            obj.put("accessibilityActive", serviceActive)
            obj.put("engine", "ByteDance UI-TARS Mobile Operator")
            obj.put("supportedActions", "uitars_tap, uitars_double_tap, uitars_drag, uitars_scroll, uitars_type, uitars_key")
            return obj.toString()
        }

        @JavascriptInterface
        fun triggerUiTarsTestTap(xNorm: Float, yNorm: Float): Boolean {
            val service = JarvisAccessibilityService.instance ?: return false
            service.performUiTarsTap(xNorm, yNorm)
            activity.runOnUiThread {
                Toast.makeText(activity, "⚡ UI-TARS Tap executed at ($xNorm, $yNorm)", Toast.LENGTH_SHORT).show()
            }
            return true
        }

        // ── Lia AI Feature: Live 3D Website Forge & File Operations ──────────
        @JavascriptInterface
        fun saveWebsiteFile(filename: String, htmlContent: String): String {
            return try {
                val websitesDir = File(activity.filesDir, "Websites").apply { mkdirs() }
                val cleanName = filename.replace("[^a-zA-Z0-9_.-]".toRegex(), "_")
                val targetFile = File(websitesDir, cleanName)
                targetFile.writeText(htmlContent, Charsets.UTF_8)
                activity.runOnUiThread {
                    Toast.makeText(activity, "💾 ওয়েবসাইট লোকাল ড্রাইভে সেভ হয়েছে: ${targetFile.name}", Toast.LENGTH_LONG).show()
                }
                targetFile.absolutePath
            } catch (e: Exception) {
                Log.e(TAG, "Error saving website: ${e.message}")
                ""
            }
        }

        @JavascriptInterface
        fun openExternalBrowser(urlOrPath: String) {
            activity.runOnUiThread {
                try {
                    val uri = if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
                        Uri.parse(urlOrPath)
                    } else {
                        val file = File(urlOrPath)
                        androidx.core.content.FileProvider.getUriForFile(
                            activity,
                            "${activity.packageName}.fileprovider",
                            file
                        )
                    }
                    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                    }
                    activity.startActivity(Intent.createChooser(intent, "ব্রাউজারে ওয়েবসাইট ওপেন করুন"))
                } catch (e: Exception) {
                    Toast.makeText(activity, "ব্রাউজার ওপেন করা যায়নি: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun shareWebsite(filename: String, htmlContent: String) {
            activity.runOnUiThread {
                try {
                    val sendIntent = Intent().apply {
                        action = Intent.ACTION_SEND
                        putExtra(Intent.EXTRA_TITLE, filename)
                        putExtra(Intent.EXTRA_TEXT, htmlContent)
                        type = "text/html"
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    activity.startActivity(Intent.createChooser(sendIntent, "ওয়েবসাইট কোড শেয়ার করুন"))
                } catch (e: Exception) {
                    Toast.makeText(activity, "শেয়ার করা যায়নি: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // ── Lia AI Feature: 10 Personalities & Language Matrix ───────────────
        @JavascriptInterface
        fun getActivePersonality(): String {
            return MobileConfig.getPersonality(activity)
        }

        @JavascriptInterface
        fun setActivePersonality(personality: String) {
            MobileConfig.setPersonality(activity, personality)
            activity.runOnUiThread {
                Toast.makeText(activity, "🎭 পার্সোনালিটি সেট করা হয়েছে: $personality", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun getActiveLanguage(): String {
            return MobileConfig.getLanguage(activity)
        }

        @JavascriptInterface
        fun setActiveLanguage(lang: String) {
            MobileConfig.setLanguage(activity, lang)
            activity.runOnUiThread {
                Toast.makeText(activity, "🌐 ভাষা সেট করা হয়েছে: $lang", Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun getOrbStyle(): String {
            return MobileConfig.getOrbStyle(activity)
        }

        @JavascriptInterface
        fun setOrbStyle(style: String) {
            MobileConfig.setOrbStyle(activity, style)
        }
    }
}
