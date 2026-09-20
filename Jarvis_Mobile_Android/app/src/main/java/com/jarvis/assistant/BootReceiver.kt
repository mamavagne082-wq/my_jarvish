package com.jarvis.assistant

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "JarvisBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.d(TAG, "Device boot/restart event received: $action")

        val validActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            Intent.ACTION_REBOOT
        )

        if (action in validActions) {
            val isEnabled = JarvisForegroundService.isServiceEnabled(context)
            if (isEnabled) {
                Log.d(TAG, "Auto-start is enabled. Launching Jarvis 24/7 Service in background...")
                val serviceIntent = Intent(context, JarvisForegroundService::class.java).apply {
                    this.action = JarvisForegroundService.ACTION_START
                }

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        ContextCompat.startForegroundService(context, serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                    Log.d(TAG, "JarvisForegroundService successfully auto-started on boot!")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to auto-start service on boot: ${e.message}", e)
                }
            } else {
                Log.d(TAG, "User had explicitly stopped Jarvis service. Skipping auto-start.")
            }
        }
    }
}
