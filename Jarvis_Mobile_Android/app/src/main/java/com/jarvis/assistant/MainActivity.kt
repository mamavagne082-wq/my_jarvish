package com.jarvis.assistant

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var tvServiceStatus: TextView
    private lateinit var tvAccessibilityStatus: TextView
    private lateinit var tvBatteryStatus: TextView
    private lateinit var btnToggleService: Button
    private lateinit var btnAccessibility: Button
    private lateinit var btnBatteryOptimization: Button

    companion object {
        private const val REQUEST_RECORD_AUDIO = 101
    }

    // ── Inactivity Auto-Minimize (20-30s timeout) ─────────────────────────
    private val AUTO_MINIMIZE_DELAY_MS = 25000L // 25 seconds idle timeout
    private val idleHandler = Handler(Looper.getMainLooper())
    private val autoMinimizeRunnable = Runnable {
        android.util.Log.i("MainActivity", "25s of inactivity elapsed. Automatically returning to background...")
        try {
            moveTaskToBack(true)
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "Error moving task to back: ${e.message}")
        }
    }

    fun resetAutoMinimizeTimer() {
        idleHandler.removeCallbacks(autoMinimizeRunnable)
        idleHandler.postDelayed(autoMinimizeRunnable, AUTO_MINIMIZE_DELAY_MS)
        android.util.Log.d("MainActivity", "Inactivity timer reset (25s countdown started).")
    }

    fun cancelAutoMinimizeTimer() {
        idleHandler.removeCallbacks(autoMinimizeRunnable)
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        // Reset 25-second timer on every touch/interaction
        resetAutoMinimizeTimer()
    }

    // ── [NEW] Wake Word & Idle Receiver ──────────────────────────────────
    // Listens for "Hey Jarvis" from JarvisForegroundService and speech/data updates.
    // Brings MainActivity to front and manages 25-second auto-hide lifecycle.
    private val wakeWordReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            if (action == JarvisForegroundService.ACTION_RESET_IDLE) {
                // Speech or command received → keep UI alive
                resetAutoMinimizeTimer()
                return
            }
            if (action == JarvisForegroundService.ACTION_WAKE_WORD_DETECTED) {
                val phrase = intent.getStringExtra("phrase") ?: "hey jarvis"
                android.util.Log.i("MainActivity", "Wake word received: \"$phrase\" → bringing app to foreground.")

                // Bring MainActivity to foreground
                val bringToFront = Intent(applicationContext, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                             Intent.FLAG_ACTIVITY_NEW_TASK or
                             Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra("from_wake_word", true)
                    putExtra("phrase", phrase)
                }
                startActivity(bringToFront)
                handleWakeWordActivation(phrase)
                resetAutoMinimizeTimer()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupListeners()
        checkAudioPermission()

        // Register wake word receiver for entire Activity lifetime
        val filter = IntentFilter().apply {
            addAction(JarvisForegroundService.ACTION_WAKE_WORD_DETECTED)
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

    private fun initViews() {
        tvServiceStatus = findViewById(R.id.tvServiceStatus)
        tvAccessibilityStatus = findViewById(R.id.tvAccessibilityStatus)
        tvBatteryStatus = findViewById(R.id.tvBatteryStatus)
        btnToggleService = findViewById(R.id.btnToggleService)
        btnAccessibility = findViewById(R.id.btnAccessibility)
        btnBatteryOptimization = findViewById(R.id.btnBatteryOptimization)
    }

    private fun setupListeners() {
        btnToggleService.setOnClickListener {
            if (JarvisForegroundService.isRunning) {
                stopJarvisService()
            } else {
                startJarvisService()
            }
            updateUIState()
        }

        btnAccessibility.setOnClickListener {
            openAccessibilitySettings()
        }

        btnBatteryOptimization.setOnClickListener {
            requestIgnoreBatteryOptimization()
        }
    }

    private fun updateUIState() {
        val isServiceRunning = JarvisForegroundService.isRunning
        if (isServiceRunning) {
            tvServiceStatus.text = "Service: Active & Listening (24/7)"
            tvServiceStatus.setTextColor(ContextCompat.getColor(this, R.color.success_green))
            btnToggleService.text = getString(R.string.btn_stop_service)
        } else {
            tvServiceStatus.text = "Service: Inactive"
            tvServiceStatus.setTextColor(ContextCompat.getColor(this, R.color.text_white))
            btnToggleService.text = getString(R.string.btn_start_service)
        }

        val isAccessibilityReady = isAccessibilityEnabled()
        if (isAccessibilityReady) {
            tvAccessibilityStatus.text = "Accessibility: Enabled (Screen & Lock Control Ready)"
            tvAccessibilityStatus.setTextColor(ContextCompat.getColor(this, R.color.success_green))
            btnAccessibility.isEnabled = false
        } else {
            tvAccessibilityStatus.text = "Accessibility: Disabled (Tap to enable)"
            tvAccessibilityStatus.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
            btnAccessibility.isEnabled = true
        }

        val isIgnoringBattery = isBatteryOptimizationIgnored()
        if (isIgnoringBattery) {
            tvBatteryStatus.text = "Battery Optimization: Unrestricted (Will not be killed)"
            tvBatteryStatus.setTextColor(ContextCompat.getColor(this, R.color.success_green))
            btnBatteryOptimization.isEnabled = false
        } else {
            tvBatteryStatus.text = "Battery Optimization: Standard (Tap to allow 24/7 run)"
            tvBatteryStatus.setTextColor(ContextCompat.getColor(this, R.color.text_muted))
            btnBatteryOptimization.isEnabled = true
        }
    }

    private fun startJarvisService() {
        JarvisForegroundService.setServiceEnabled(this, true)
        val serviceIntent = Intent(this, JarvisForegroundService::class.java).apply {
            action = JarvisForegroundService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, serviceIntent)
        } else {
            startService(serviceIntent)
        }
        Toast.makeText(this, "Jarvis Background Voice Service Started!", Toast.LENGTH_SHORT).show()
    }

    private fun stopJarvisService() {
        JarvisForegroundService.setServiceEnabled(this, false)
        val serviceIntent = Intent(this, JarvisForegroundService::class.java).apply {
            action = JarvisForegroundService.ACTION_STOP
        }
        startService(serviceIntent)
        Toast.makeText(this, "Jarvis Service Stopped.", Toast.LENGTH_SHORT).show()
    }

    private fun openAccessibilitySettings() {
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

    private fun isBatteryOptimizationIgnored(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            return pm.isIgnoringBatteryOptimizations(packageName)
        }
        return true
    }

    private fun requestIgnoreBatteryOptimization() {
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
            } else {
                Toast.makeText(this, "কল দেওয়া ও ভয়েস শোনার জন্য পারমিশন প্রয়োজন।", Toast.LENGTH_LONG).show()
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
                Toast.makeText(this, "Jarvis ফ্লোটিং বাবল ও ৩ডি ওভারলে সক্রিয় করতে পারমিশন দিন", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                android.util.Log.w("MainActivity", "Failed to open overlay settings: ${e.message}")
            }
        }
    }

    // ── [NEW] Wake word activation handler ────────────────────────────────
    private fun handleWakeWordActivation(phrase: String = "Hey Jarvis") {
        android.util.Log.i("MainActivity", "Handling wake word activation: \"$phrase\"")
        // Ensure service is running
        if (!JarvisForegroundService.isRunning) {
            startJarvisService()
        }
        // Auto-start Jarvis session with a short delay to allow UI to settle
        Handler(Looper.getMainLooper()).postDelayed({
            Toast.makeText(this, "🔊 Jarvis জাগ্রত! \"$phrase\" শোনা গেছে...", Toast.LENGTH_SHORT).show()
            updateUIState()
            resetAutoMinimizeTimer()
        }, 300)
    }
}
