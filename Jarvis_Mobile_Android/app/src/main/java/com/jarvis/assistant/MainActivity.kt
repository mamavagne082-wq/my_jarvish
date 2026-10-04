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
        val safeUser = JSONObject.quote(userText)
        val safeAssistant = JSONObject.quote(assistantText)
        webView.post {
            webView.evaluateJavascript("if (window.onDirectTranscript) window.onDirectTranscript($safeUser, $safeAssistant);", null)
        }
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
        if (!JarvisForegroundService.isSessionActive) {
            Handler(Looper.getMainLooper()).postDelayed({
                if (!JarvisForegroundService.isSessionActive) {
                    JarvisForegroundService.instance?.startAutonomousSession(initialGreeting = false)
                    webView.evaluateJavascript("if (window.startVoiceSession) window.startVoiceSession();", null)
                }
            }, 600)
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
        if (instance == this) {
            instance = null
        }
        cancelAutoMinimizeTimer()
        try { unregisterReceiver(wakeWordReceiver) } catch (_: Exception) {}
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

    // ── Bidirectional JavaScript Bridge (Exposed as window.JarvisNative) ──
    class JarvisNativeBridge(private val activity: MainActivity) {

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
                                Toast.makeText(activity, "⚠️ স্ক্রিন লক করার জন্য Accessibility Settings থেকে Jarvis Assistant অন করুন।", Toast.LENGTH_LONG).show()
                                activity.openAccessibilitySettings()
                            }
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
                        "whatsapp", "whatsapp_message" -> {
                            val msg = payload.optString("message", "")
                            if (target.isNotBlank() && msg.isNotBlank() && JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.handleCommand("whatsapp_message", payload)
                            } else {
                                val launchIntent = activity.packageManager.getLaunchIntentForPackage("com.whatsapp")
                                if (launchIntent != null) {
                                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    activity.startActivity(launchIntent)
                                    Toast.makeText(activity, "💬 WhatsApp ওপেন করা হয়েছে", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(activity, "WhatsApp ফোনে ইনস্টল নেই!", Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                        "youtube", "youtube_search" -> {
                            if (target.isNotBlank() && target != "Iron Man theme") {
                                if (JarvisAccessibilityService.instance != null) {
                                    JarvisAccessibilityService.instance?.handleCommand("youtube_search", payload)
                                } else {
                                    val intent = Intent(Intent.ACTION_SEARCH).apply {
                                        setPackage("com.google.android.youtube")
                                        putExtra("query", target)
                                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                    }
                                    try {
                                        activity.startActivity(intent)
                                    } catch (_: Exception) {
                                        val launchIntent = activity.packageManager.getLaunchIntentForPackage("com.google.android.youtube")
                                        if (launchIntent != null) activity.startActivity(launchIntent)
                                    }
                                }
                                Toast.makeText(activity, "▶️ YouTube-এ সার্চ ও প্লে করা হচ্ছে...", Toast.LENGTH_SHORT).show()
                            } else {
                                val launchIntent = activity.packageManager.getLaunchIntentForPackage("com.google.android.youtube")
                                if (launchIntent != null) {
                                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    activity.startActivity(launchIntent)
                                    Toast.makeText(activity, "▶️ YouTube ওপেন করা হয়েছে", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(activity, "YouTube ফোনে ইনস্টল নেই!", Toast.LENGTH_SHORT).show()
                                }
                            }
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
                        else -> {
                            if (JarvisAccessibilityService.instance != null) {
                                JarvisAccessibilityService.instance?.handleCommand(action, payload)
                            } else {
                                val launchIntent = activity.packageManager.getLaunchIntentForPackage(target)
                                if (launchIntent != null) {
                                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    activity.startActivity(launchIntent)
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
    }
}
