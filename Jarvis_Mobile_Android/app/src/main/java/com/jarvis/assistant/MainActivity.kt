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

    // ── [NEW] Wake Word Receiver ─────────────────────────────────────────
    // Receives broadcast from JarvisForegroundService when "Hey Jarvis" is heard.
    // Brings this Activity to the foreground and auto-starts the Jarvis session.
    private val wakeWordReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != JarvisForegroundService.ACTION_WAKE_WORD_DETECTED) return
            val phrase = intent.getStringExtra("phrase") ?: "hey jarvis"
            android.util.Log.i("MainActivity", "Wake word received: \"$phrase\" → bringing app to foreground.")

            // Bring MainActivity to foreground
            val bringToFront = Intent(applicationContext, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                         Intent.FLAG_ACTIVITY_NEW_TASK or
                         Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("from_wake_word", true)
            }
            startActivity(bringToFront)

            // Show toast feedback
            Toast.makeText(
                applicationContext,
                "🔊 Jarvis activated! (\"$phrase\" detected)",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupListeners()
        checkAudioPermission()

        // ── [NEW] Handle launch from wake word (intent extra) ────────────────
        if (intent?.getBooleanExtra("from_wake_word", false) == true) {
            handleWakeWordActivation()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // ── [NEW] Also handle wake word when activity is already running ─────
        if (intent.getBooleanExtra("from_wake_word", false)) {
            handleWakeWordActivation()
        }
    }

    override fun onResume() {
        super.onResume()
        if (JarvisForegroundService.isServiceEnabled(this) && !JarvisForegroundService.isRunning) {
            startJarvisService()
        }
        updateUIState()

        // ── [NEW] Register wake word receiver ──────────────────────────────
        val filter = IntentFilter(JarvisForegroundService.ACTION_WAKE_WORD_DETECTED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(wakeWordReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(wakeWordReceiver, filter)
        }
    }

    // ── [NEW] Unregister wake word receiver on pause ──────────────────────
    override fun onPause() {
        super.onPause()
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
            } else {
                Toast.makeText(this, "কল দেওয়া ও ভয়েস শোনার জন্য পারমিশন প্রয়োজন।", Toast.LENGTH_LONG).show()
            }
        }
    }

    // ── [NEW] Wake word activation handler ────────────────────────────────
    private fun handleWakeWordActivation() {
        android.util.Log.i("MainActivity", "Handling wake word activation.")
        // Ensure service is running
        if (!JarvisForegroundService.isRunning) {
            startJarvisService()
        }
        // Auto-start Jarvis session with a short delay to allow UI to settle
        Handler(Looper.getMainLooper()).postDelayed({
            Toast.makeText(this, "🎞️ Jarvis জাগ্রত! 'Hey Jarvis' শোনা গেছে...", Toast.LENGTH_SHORT).show()
            updateUIState()
        }, 300)
    }
}
