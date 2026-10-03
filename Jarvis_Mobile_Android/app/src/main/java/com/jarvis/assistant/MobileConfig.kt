package com.jarvis.assistant

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object MobileConfig {

    private const val PREFS_NAME = "jarvis_mobile_config"

    // Default Settings & Pre-configured Credentials
    const val DEFAULT_USER_NAME = "ALAMIN"
    const val DEFAULT_ASSISTANT_NAME = "Jarvis"
    const val DEFAULT_LLM_PROVIDER = "google"
    const val DEFAULT_LLM_MODEL = "gemini-3.8-live"

    const val DEFAULT_LIVEKIT_URL = "wss://jarvish-cdq66wc9.livekit.cloud"
    const val DEFAULT_LIVEKIT_KEY = "APIudafoJVHneWA"
    const val DEFAULT_LIVEKIT_SECRET = "QQlG0TxB5wxhZ3hiSkTNnXVNgsgbwSY1Yh1XFTzuTgL"

    const val DEFAULT_GOOGLE_KEY = "AQ.Ab8RN6JHF6heRWfsnO5USnfzLeb-FWVFikfabKfams1pJ7oAxQ"
    const val DEFAULT_OPENAI_KEY = "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"
    const val DEFAULT_MEM0_KEY = "m0-zXEwUTUVUBNC6xUyne1UtoFr5jSHrsspEfcBLS3S"
    const val DEFAULT_GOOGLE_SEARCH_KEY = "977565840084-3d463snmaaa7iq1rnr6lo26jdr3c38sk.apps.googleusercontent.com"
    const val DEFAULT_SEARCH_ENGINE_ID = "0669cc931ac6f4b1e"
    const val DEFAULT_OPENWEATHER_KEY = "df80983835aa91632af139cb1846be67"
    const val DEFAULT_XIAOMI_MIMO_KEY = "sk-s9mnjmqs3jesdkhnls9x94jm5aoj248zo85t89anckwmva1m"
    const val DEFAULT_ELEVENLABS_KEY = "sk_9177b45b24484fbbc84b3ea08febf2445d061bfb2a003f17"
    const val DEFAULT_ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"

    const val DEFAULT_ROOM_NAME = "jarvis-room"
    const val DEFAULT_PC_HOST = "http://192.168.0.100:3000"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getUserName(context: Context): String {
        val v = getPrefs(context).getString("user_name", DEFAULT_USER_NAME) ?: DEFAULT_USER_NAME
        return if (v.isNotBlank()) v else DEFAULT_USER_NAME
    }

    fun getAssistantName(context: Context): String {
        val v = getPrefs(context).getString("assistant_name", DEFAULT_ASSISTANT_NAME) ?: DEFAULT_ASSISTANT_NAME
        return if (v.isNotBlank()) v else DEFAULT_ASSISTANT_NAME
    }

    fun getLlmProvider(context: Context): String {
        val v = getPrefs(context).getString("llm_provider", DEFAULT_LLM_PROVIDER) ?: DEFAULT_LLM_PROVIDER
        return if (v.isNotBlank()) v else DEFAULT_LLM_PROVIDER
    }

    fun getLlmModel(context: Context): String {
        val v = getPrefs(context).getString("llm_model", DEFAULT_LLM_MODEL) ?: DEFAULT_LLM_MODEL
        return if (v.isNotBlank()) v else DEFAULT_LLM_MODEL
    }

    fun getLiveKitUrl(context: Context): String {
        val v = getPrefs(context).getString("livekit_url", DEFAULT_LIVEKIT_URL) ?: DEFAULT_LIVEKIT_URL
        return if (v.isNotBlank()) v else DEFAULT_LIVEKIT_URL
    }

    fun getLiveKitKey(context: Context): String {
        val v = getPrefs(context).getString("livekit_key", DEFAULT_LIVEKIT_KEY) ?: DEFAULT_LIVEKIT_KEY
        return if (v.isNotBlank()) v else DEFAULT_LIVEKIT_KEY
    }

    fun getLiveKitSecret(context: Context): String {
        val v = getPrefs(context).getString("livekit_secret", DEFAULT_LIVEKIT_SECRET) ?: DEFAULT_LIVEKIT_SECRET
        return if (v.isNotBlank()) v else DEFAULT_LIVEKIT_SECRET
    }

    fun getGoogleKey(context: Context): String {
        val v = getPrefs(context).getString("google_key", DEFAULT_GOOGLE_KEY) ?: DEFAULT_GOOGLE_KEY
        return if (v.isNotBlank()) v else DEFAULT_GOOGLE_KEY
    }

    fun getOpenAiKey(context: Context): String {
        val v = getPrefs(context).getString("openai_key", DEFAULT_OPENAI_KEY) ?: DEFAULT_OPENAI_KEY
        return if (v.isNotBlank()) v else DEFAULT_OPENAI_KEY
    }

    fun getMem0Key(context: Context): String {
        val v = getPrefs(context).getString("mem0_key", DEFAULT_MEM0_KEY) ?: DEFAULT_MEM0_KEY
        return if (v.isNotBlank()) v else DEFAULT_MEM0_KEY
    }

    fun getGoogleSearchKey(context: Context): String {
        val v = getPrefs(context).getString("google_search_key", DEFAULT_GOOGLE_SEARCH_KEY) ?: DEFAULT_GOOGLE_SEARCH_KEY
        return if (v.isNotBlank()) v else DEFAULT_GOOGLE_SEARCH_KEY
    }

    fun getSearchEngineId(context: Context): String {
        val v = getPrefs(context).getString("search_engine_id", DEFAULT_SEARCH_ENGINE_ID) ?: DEFAULT_SEARCH_ENGINE_ID
        return if (v.isNotBlank()) v else DEFAULT_SEARCH_ENGINE_ID
    }

    fun getOpenWeatherKey(context: Context): String {
        val v = getPrefs(context).getString("openweather_key", DEFAULT_OPENWEATHER_KEY) ?: DEFAULT_OPENWEATHER_KEY
        return if (v.isNotBlank()) v else DEFAULT_OPENWEATHER_KEY
    }

    fun getXiaomiMimoKey(context: Context): String {
        val v = getPrefs(context).getString("xiaomi_mimo_key", DEFAULT_XIAOMI_MIMO_KEY) ?: DEFAULT_XIAOMI_MIMO_KEY
        return if (v.isNotBlank()) v else DEFAULT_XIAOMI_MIMO_KEY
    }

    fun getElevenLabsKey(context: Context): String {
        val v = getPrefs(context).getString("elevenlabs_key", DEFAULT_ELEVENLABS_KEY) ?: DEFAULT_ELEVENLABS_KEY
        return if (v.isNotBlank()) v else DEFAULT_ELEVENLABS_KEY
    }

    fun getElevenLabsVoiceId(context: Context): String {
        val v = getPrefs(context).getString("elevenlabs_voice_id", DEFAULT_ELEVENLABS_VOICE_ID) ?: DEFAULT_ELEVENLABS_VOICE_ID
        return if (v.isNotBlank()) v else DEFAULT_ELEVENLABS_VOICE_ID
    }

    fun getPcHost(context: Context): String =
        getPrefs(context).getString("pc_host", DEFAULT_PC_HOST) ?: DEFAULT_PC_HOST

    fun getOrbTheme(context: Context): String =
        getPrefs(context).getString("orb_theme", "neon") ?: "neon"

    fun setOrbTheme(context: Context, theme: String) {
        getPrefs(context).edit().putString("orb_theme", theme).apply()
    }

    fun hasValidCredentials(context: Context): Boolean {
        val url = getLiveKitUrl(context)
        val key = getLiveKitKey(context)
        val sec = getLiveKitSecret(context)
        return url.isNotBlank() && key.isNotBlank() && sec.isNotBlank()
    }

    /**
     * Saves full configuration JSON received from mobile UI or cloud sync.
     */
    fun save(context: Context, json: JSONObject) {
        val editor = getPrefs(context).edit()

        if (json.has("user_name")) editor.putString("user_name", json.optString("user_name"))
        if (json.has("assistant_name")) editor.putString("assistant_name", json.optString("assistant_name"))
        if (json.has("llm_provider")) editor.putString("llm_provider", json.optString("llm_provider"))
        if (json.has("llm_model")) editor.putString("llm_model", json.optString("llm_model"))
        if (json.has("orb_theme")) editor.putString("orb_theme", json.optString("orb_theme"))
        if (json.has("pc_host")) editor.putString("pc_host", json.optString("pc_host"))

        // API Keys (either direct flat or nested inside api_keys)
        val apiKeys = json.optJSONObject("api_keys") ?: json

        if (apiKeys.has("livekit_url")) editor.putString("livekit_url", apiKeys.optString("livekit_url"))
        if (apiKeys.has("livekit_key")) editor.putString("livekit_key", apiKeys.optString("livekit_key"))
        if (apiKeys.has("livekit_secret")) editor.putString("livekit_secret", apiKeys.optString("livekit_secret"))
        if (apiKeys.has("google")) editor.putString("google_key", apiKeys.optString("google"))
        if (apiKeys.has("google_key")) editor.putString("google_key", apiKeys.optString("google_key"))
        if (apiKeys.has("openai")) editor.putString("openai_key", apiKeys.optString("openai"))
        if (apiKeys.has("openai_key")) editor.putString("openai_key", apiKeys.optString("openai_key"))
        if (apiKeys.has("mem0")) editor.putString("mem0_key", apiKeys.optString("mem0"))
        if (apiKeys.has("mem0_key")) editor.putString("mem0_key", apiKeys.optString("mem0_key"))
        if (apiKeys.has("google_search")) editor.putString("google_search_key", apiKeys.optString("google_search"))
        if (apiKeys.has("google_search_key")) editor.putString("google_search_key", apiKeys.optString("google_search_key"))
        if (apiKeys.has("search_engine_id")) editor.putString("search_engine_id", apiKeys.optString("search_engine_id"))
        if (apiKeys.has("openweather")) editor.putString("openweather_key", apiKeys.optString("openweather"))
        if (apiKeys.has("openweather_key")) editor.putString("openweather_key", apiKeys.optString("openweather_key"))
        if (apiKeys.has("xiaomi_mimo")) editor.putString("xiaomi_mimo_key", apiKeys.optString("xiaomi_mimo"))
        if (apiKeys.has("xiaomi_mimo_key")) editor.putString("xiaomi_mimo_key", apiKeys.optString("xiaomi_mimo_key"))
        if (apiKeys.has("elevenlabs")) editor.putString("elevenlabs_key", apiKeys.optString("elevenlabs"))
        if (apiKeys.has("elevenlabs_key")) editor.putString("elevenlabs_key", apiKeys.optString("elevenlabs_key"))
        if (apiKeys.has("elevenlabs_voice_id")) editor.putString("elevenlabs_voice_id", apiKeys.optString("elevenlabs_voice_id"))

        editor.apply()
    }

    /**
     * Returns full config as JSONObject for the Web UI.
     */
    fun getAllConfigJson(context: Context): JSONObject {
        return JSONObject().apply {
            put("user_name", getUserName(context))
            put("assistant_name", getAssistantName(context))
            put("llm_provider", getLlmProvider(context))
            put("llm_model", getLlmModel(context))
            put("orb_theme", getOrbTheme(context))
            put("pc_host", getPcHost(context))

            val keys = JSONObject().apply {
                put("livekit_url", getLiveKitUrl(context))
                put("livekit_key", getLiveKitKey(context))
                put("livekit_secret", getLiveKitSecret(context))
                put("google", getGoogleKey(context))
                put("openai", getOpenAiKey(context))
                put("mem0", getMem0Key(context))
                put("google_search", getGoogleSearchKey(context))
                put("search_engine_id", getSearchEngineId(context))
                put("openweather", getOpenWeatherKey(context))
                put("xiaomi_mimo", getXiaomiMimoKey(context))
                put("elevenlabs", getElevenLabsKey(context))
                put("elevenlabs_voice_id", getElevenLabsVoiceId(context))
            }
            put("api_keys", keys)
        }
    }

    /**
     * Generates a genuine, cryptographically signed LiveKit JWT token using HMAC-SHA256.
     * This connects to LiveKit Cloud without requiring a separate token server.
     */
    fun generateLiveKitToken(
        apiKey: String,
        apiSecret: String,
        roomName: String = DEFAULT_ROOM_NAME,
        identity: String = "mobile_user_alamin",
        participantName: String = DEFAULT_USER_NAME,
        ttlSeconds: Long = 86400L
    ): String {
        try {
            val header = JSONObject().apply {
                put("alg", "HS256")
                put("typ", "JWT")
            }

            val now = System.currentTimeMillis() / 1000
            val videoGrant = JSONObject().apply {
                put("room", roomName)
                put("roomJoin", true)
                put("canPublish", true)
                put("canSubscribe", true)
                put("canPublishData", true)
            }

            val roomConfig = JSONObject().apply {
                val agentsArray = JSONArray().apply {
                    put(JSONObject().apply { put("agentName", "jarvis") })
                }
                put("agents", agentsArray)
            }

            val metadata = JSONObject().apply {
                put("platform", "mobile")
                put("user", participantName)
            }

            val payload = JSONObject().apply {
                put("iss", apiKey)
                put("sub", identity)
                put("name", participantName)
                put("nbf", now - 5)
                put("exp", now + ttlSeconds)
                put("video", videoGrant)
                put("roomConfig", roomConfig)
                put("metadata", metadata.toString())
            }

            val base64Header = base64UrlEncode(header.toString().toByteArray(Charsets.UTF_8))
            val base64Payload = base64UrlEncode(payload.toString().toByteArray(Charsets.UTF_8))
            val signingInput = "$base64Header.$base64Payload"

            val mac = Mac.getInstance("HmacSHA256")
            val secretKey = SecretKeySpec(apiSecret.toByteArray(Charsets.UTF_8), "HmacSHA256")
            mac.init(secretKey)
            val signatureBytes = mac.doFinal(signingInput.toByteArray(Charsets.UTF_8))
            val base64Signature = base64UrlEncode(signatureBytes)

            return "$signingInput.$base64Signature"
        } catch (e: Exception) {
            android.util.Log.e("MobileConfig", "Error generating LiveKit JWT token: ${e.message}")
            return "fallback-token"
        }
    }

    private fun base64UrlEncode(bytes: ByteArray): String {
        return Base64.encodeToString(
            bytes,
            Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
        )
    }

    fun isPcPaired(context: Context): Boolean {
        return getPrefs(context).getBoolean("pc_is_paired", false)
    }

    fun setPcPaired(context: Context, paired: Boolean) {
        getPrefs(context).edit().putBoolean("pc_is_paired", paired).apply()
    }

    fun getPcIp(context: Context): String {
        return getPrefs(context).getString("pc_ip", "192.168.31.163") ?: "192.168.31.163"
    }

    fun setPcIp(context: Context, ip: String) {
        getPrefs(context).edit().putString("pc_ip", ip).apply()
    }

    fun getPcPort(context: Context): Int {
        return getPrefs(context).getInt("pc_port", 8765)
    }

    fun setPcPort(context: Context, port: Int) {
        getPrefs(context).edit().putInt("pc_port", port).apply()
    }

    fun getPcSecret(context: Context): String {
        return getPrefs(context).getString("pc_secret", "JARVIS-CORE-77") ?: "JARVIS-CORE-77"
    }

    fun setPcSecret(context: Context, secret: String) {
        getPrefs(context).edit().putString("pc_secret", secret).apply()
    }
}
