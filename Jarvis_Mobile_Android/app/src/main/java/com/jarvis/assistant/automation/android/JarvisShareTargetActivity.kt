package com.jarvis.assistant.automation.android

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.jarvis.assistant.automation.social.JarvisMediaInbox
import com.jarvis.assistant.automation.social.SharedMediaItem
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * Handles incoming share intents from other applications (e.g. Gallery).
 * Displays a mandatory confirmation dialog, copies media into app-private storage,
 * and exposes it securely via FileProvider to the assistant inbox.
 */
class JarvisShareTargetActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "JarvisShareTarget"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val intent = intent
        val action = intent.action
        val type = intent.type

        if ((Intent.ACTION_SEND == action) && type != null) {
            val imageUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (imageUri != null) {
                promptUserConfirmation(imageUri, type)
                return
            }
        }

        Toast.makeText(this, "No media found to share with Jarvis", Toast.LENGTH_SHORT).show()
        finish()
    }

    private fun promptUserConfirmation(sourceUri: Uri, mimeType: String) {
        AlertDialog.Builder(this)
            .setTitle("Share with Jarvis")
            .setMessage("Do you want to give this ${if (mimeType.startsWith("video/")) "video" else "photo"} to Jarvis?")
            .setPositiveButton("Allow") { _, _ ->
                processSharedMedia(sourceUri, mimeType)
            }
            .setNegativeButton("Cancel") { _, _ ->
                finish()
            }
            .setCancelable(false)
            .show()
    }

    private fun processSharedMedia(sourceUri: Uri, mimeType: String) {
        try {
            val sharedDir = File(filesDir, "shared_media").apply { mkdirs() }
            val extension = if (mimeType.contains("png")) "png" else if (mimeType.contains("mp4")) "mp4" else "jpg"
            val targetFile = File(sharedDir, "media_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}.$extension")

            contentResolver.openInputStream(sourceUri)?.use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }

            val fileProviderUri = FileProvider.getUriForFile(
                this,
                "${applicationContext.packageName}.fileprovider",
                targetFile
            )

            val mediaItem = SharedMediaItem(
                id = UUID.randomUUID().toString(),
                contentUri = fileProviderUri.toString(),
                mimeType = mimeType,
                fileSize = targetFile.length(),
                timestamp = System.currentTimeMillis()
            )

            JarvisMediaInbox.recordMedia(this, mediaItem)
            Toast.makeText(this, "Media handed to Jarvis successfully", Toast.LENGTH_SHORT).show()
            Log.d(TAG, "Saved shared media item: ${mediaItem.contentUri} (${mediaItem.fileSize} bytes)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to import shared media: ${e.message}", e)
            Toast.makeText(this, "Error saving shared media", Toast.LENGTH_SHORT).show()
        } finally {
            finish()
        }
    }
}
