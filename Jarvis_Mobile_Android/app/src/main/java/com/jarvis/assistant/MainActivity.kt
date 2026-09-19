package com.jarvis.assistant

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupListeners()
        checkAudioPermission()
    }

    override fun onResume() {
        super.onResume()
        updateUIState()
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

        val isAccessibilityEnabled = JarvisAccessibilityService.isServiceRunning
        if (isAccessibilityEnabled) {
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
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                REQUEST_RECORD_AUDIO
            )
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_RECORD_AUDIO) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "Microphone permission granted!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Microphone permission is required for voice commands", Toast.LENGTH_LONG).show()
            }
        }
    }
}
