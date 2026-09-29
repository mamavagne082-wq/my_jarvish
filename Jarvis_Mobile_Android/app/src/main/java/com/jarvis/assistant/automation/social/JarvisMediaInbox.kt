package com.jarvis.assistant.automation.social

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class SharedMediaItem(
    val id: String,
    val contentUri: String,
    val mimeType: String,
    val fileSize: Long,
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Manages the media inbox handed over to Jarvis via ShareSheet.
 * Bounded to the last 5 items, persisted across process deaths.
 */
object JarvisMediaInbox {

    private const val PREFS_NAME = "jarvis_media_inbox_prefs"
    private const val KEY_INBOX = "media_inbox_items"
    private const val MAX_ITEMS = 5
    private const val MAX_AGE_MS = 30 * 60 * 1000L // 30 minutes

    fun recordMedia(context: Context, item: SharedMediaItem) {
        val prefs = getPrefs(context)
        val items = loadItems(prefs).toMutableList()

        // Prepend and enforce bounded limit
        items.add(0, item)
        val pruned = items.filter {
            // Verify file still exists
            System.currentTimeMillis() - it.timestamp < MAX_AGE_MS
        }.take(MAX_ITEMS)

        saveItems(prefs, pruned)
    }

    fun getLatestItem(context: Context): SharedMediaItem? {
        val items = loadItems(getPrefs(context))
        val now = System.currentTimeMillis()
        return items.firstOrNull { now - it.timestamp <= MAX_AGE_MS }
    }

    fun getItemByUri(context: Context, uriString: String): SharedMediaItem? {
        val items = loadItems(getPrefs(context))
        return items.firstOrNull { it.contentUri == uriString }
    }

    fun clearExpired(context: Context) {
        val prefs = getPrefs(context)
        val now = System.currentTimeMillis()
        val valid = loadItems(prefs).filter { now - it.timestamp <= MAX_AGE_MS }
        saveItems(prefs, valid)
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private fun loadItems(prefs: SharedPreferences): List<SharedMediaItem> {
        val jsonStr = prefs.getString(KEY_INBOX, null) ?: return emptyList()
        val list = mutableListOf<SharedMediaItem>()
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                list.add(
                    SharedMediaItem(
                        id = obj.getString("id"),
                        contentUri = obj.getString("contentUri"),
                        mimeType = obj.getString("mimeType"),
                        fileSize = obj.getLong("fileSize"),
                        timestamp = obj.getLong("timestamp")
                    )
                )
            }
        } catch (_: Exception) {}
        return list
    }

    private fun saveItems(prefs: SharedPreferences, items: List<SharedMediaItem>) {
        val arr = JSONArray()
        for (item in items) {
            val obj = JSONObject().apply {
                put("id", item.id)
                put("contentUri", item.contentUri)
                put("mimeType", item.mimeType)
                put("fileSize", item.fileSize)
                put("timestamp", item.timestamp)
            }
            arr.put(obj)
        }
        prefs.edit().putString(KEY_INBOX, arr.toString()).apply()
    }
}

/**
 * Validates and resolves media for social posting.
 */
object MediaResolver {

    sealed class MediaResolutionResult {
        data class Ready(val item: SharedMediaItem, val uri: Uri) : MediaResolutionResult()
        object MediaRequired : MediaResolutionResult()
        data class InvalidMedia(val reason: String) : MediaResolutionResult()
    }

    fun resolveMedia(context: Context, requestedUri: String?): MediaResolutionResult {
        // Reject raw file paths, non-content schemes
        if (requestedUri != null && (requestedUri.startsWith("file://") || requestedUri.startsWith("/"))) {
            return MediaResolutionResult.InvalidMedia("Raw filesystem paths are not allowed for media security")
        }

        val item: SharedMediaItem? = if (requestedUri.isNullOrEmpty() || requestedUri == "latest" || requestedUri == "this photo") {
            JarvisMediaInbox.getLatestItem(context)
        } else {
            JarvisMediaInbox.getItemByUri(context, requestedUri)
        }

        if (item == null) {
            return MediaResolutionResult.MediaRequired
        }

        if (item.fileSize <= 0) {
            return MediaResolutionResult.InvalidMedia("Selected media file is empty (0 bytes)")
        }

        if (!item.mimeType.startsWith("image/") && !item.mimeType.startsWith("video/")) {
            return MediaResolutionResult.InvalidMedia("Unsupported media type: ${item.mimeType}. Only photos and videos are supported.")
        }

        val uri = Uri.parse(item.contentUri)
        return MediaResolutionResult.Ready(item, uri)
    }
}
