package com.jarvis.assistant

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ApiHealthChecker {

    private const val TAG = "ApiHealthChecker"

    data class ApiResult(
        val provider: String,
        val name: String,
        val status: String, // "HEALTHY", "NEAR_LIMIT", "LIMIT_EXCEEDED", "INVALID_KEY", "NOT_CONFIGURED", "NETWORK_ERROR"
        val usagePercent: Int = 0,
        val message: String
    )

    private var cachedHealthJson: JSONObject? = null
    private var lastCheckedTimestamp: Long = 0L

    fun getCachedHealth(): JSONObject? = cachedHealthJson

    suspend fun checkAllHealth(context: Context, force: Boolean = false): JSONObject = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        if (!force && cachedHealthJson != null && (now - lastCheckedTimestamp) < 30_000L) {
            return@withContext cachedHealthJson!!
        }

        val results = mutableListOf<ApiResult>()

        val googleKey = MobileConfig.getGoogleKey(context)
        val openAiKey = MobileConfig.getOpenAiKey(context)
        val openRouterKey = MobileConfig.getOpenRouterKey(context)
        val elevenLabsKey = MobileConfig.getElevenLabsKey(context)
        val grokKey = MobileConfig.getGrokKey(context)
        val mimoKey = MobileConfig.getXiaomiMimoKey(context)
        val mem0Key = MobileConfig.getMem0Key(context)

        // Check Google Gemini
        results.add(checkGoogleGemini(googleKey))

        // Check OpenAI
        results.add(checkOpenAI(openAiKey))

        // Check OpenRouter
        results.add(checkOpenRouter(openRouterKey))

        // Check ElevenLabs
        results.add(checkElevenLabs(elevenLabsKey))

        // Check Grok
        results.add(checkGrok(grokKey))

        // Check Xiaomi MiMo
        results.add(checkXiaomiMimo(mimoKey))

        // Check Mem0
        results.add(checkMem0(mem0Key))

        // Calculate overall percentage
        val configured = results.filter { it.status != "NOT_CONFIGURED" }
        val healthyCount = configured.count { it.status == "HEALTHY" || it.status == "NEAR_LIMIT" }
        val overallPct = if (configured.isEmpty()) 100 else Math.round((healthyCount.toFloat() / configured.size.toFloat()) * 100)

        val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

        val jsonResults = JSONArray()
        for (r in results) {
            val obj = JSONObject().apply {
                put("provider", r.provider)
                put("name", r.name)
                put("status", r.status)
                put("usage_percent", r.usagePercent)
                put("message", r.message)
            }
            jsonResults.put(obj)
        }

        val finalJson = JSONObject().apply {
            put("results", jsonResults)
            put("overall_health_percent", overallPct)
            put("checked_at", timeStr)
        }

        cachedHealthJson = finalJson
        lastCheckedTimestamp = now
        return@withContext finalJson
    }

    suspend fun checkSingleKey(provider: String, key: String): ApiResult = withContext(Dispatchers.IO) {
        when (provider.lowercase().trim()) {
            "google", "gemini" -> checkGoogleGemini(key)
            "openai" -> checkOpenAI(key)
            "openrouter" -> checkOpenRouter(key)
            "elevenlabs" -> checkElevenLabs(key)
            "grok" -> checkGrok(key)
            "xiaomi_mimo", "mimo" -> checkXiaomiMimo(key)
            "mem0" -> checkMem0(key)
            else -> ApiResult(provider, provider, "HEALTHY", 0, "$provider: Validated ✅")
        }
    }

    private fun checkGoogleGemini(key: String): ApiResult {
        if (key.isBlank() || key == "0") {
            return ApiResult("google", "Gemini", "NOT_CONFIGURED", 0, "Google Gemini: কী দেওয়া হয়নি")
        }
        return try {
            val endpoint = "https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}"
            val url = URL(endpoint)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 5000
                readTimeout = 5000
                instanceFollowRedirects = true
            }
            val code = conn.responseCode
            conn.disconnect()

            when (code) {
                200 -> ApiResult("google", "Gemini", "HEALTHY", 0, "Google Gemini: Healthy ✅ (সক্রিয়)")
                429 -> ApiResult("google", "Gemini", "LIMIT_EXCEEDED", 100, "Google Gemini: কোটা শেষ (Quota Exceeded) 🚨")
                400, 403 -> ApiResult("google", "Gemini", "INVALID_KEY", 0, "Google Gemini: ইনভ্যালিড কি (Invalid Key) ❌")
                else -> ApiResult("google", "Gemini", "NETWORK_ERROR", 0, "Google Gemini: HTTP $code ⚠️")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Google Gemini health check error: ${e.message}")
            ApiResult("google", "Gemini", "NETWORK_ERROR", 0, "Google Gemini: নেটওয়ার্ক সংযোগ এরর ⚠️")
        }
    }

    private fun checkOpenAI(key: String): ApiResult {
        if (key.isBlank() || key == "0") {
            return ApiResult("openai", "OpenAI", "NOT_CONFIGURED", 0, "OpenAI: কী দেওয়া হয়নি")
        }
        return try {
            val url = URL("https://api.openai.com/v1/models")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer ${key.trim()}")
                connectTimeout = 5000
                readTimeout = 5000
            }
            val code = conn.responseCode
            conn.disconnect()

            when (code) {
                200 -> ApiResult("openai", "OpenAI", "HEALTHY", 0, "OpenAI: Healthy ✅")
                401 -> ApiResult("openai", "OpenAI", "INVALID_KEY", 0, "OpenAI: ইনভ্যালিড কি ❌")
                429 -> ApiResult("openai", "OpenAI", "LIMIT_EXCEEDED", 100, "OpenAI: লিমিট শেষ / ব্যালেন্স নেই 🚨")
                else -> ApiResult("openai", "OpenAI", "NETWORK_ERROR", 0, "OpenAI: HTTP $code ⚠️")
            }
        } catch (e: Exception) {
            ApiResult("openai", "OpenAI", "NETWORK_ERROR", 0, "OpenAI: নেটওয়ার্ক এরর ⚠️")
        }
    }

    private fun checkOpenRouter(key: String): ApiResult {
        if (key.isBlank() || key == "0") {
            return ApiResult("openrouter", "OpenRouter", "NOT_CONFIGURED", 0, "OpenRouter: কী দেওয়া হয়নি")
        }
        return try {
            val url = URL("https://openrouter.ai/api/v1/auth/key")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer ${key.trim()}")
                connectTimeout = 5000
                readTimeout = 5000
            }
            val code = conn.responseCode
            if (code == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val resp = reader.readText()
                reader.close()
                conn.disconnect()

                val json = JSONObject(resp)
                val data = json.optJSONObject("data")
                val usage = data?.optDouble("usage", 0.0) ?: 0.0
                val limit = data?.optDouble("limit", 0.0) ?: 0.0

                val pct = if (limit > 0) Math.round((usage / limit) * 100).toInt() else 0
                val status = if (pct >= 80) "NEAR_LIMIT" else "HEALTHY"
                val mark = if (status == "HEALTHY") "✅" else "⚠️"
                ApiResult("openrouter", "OpenRouter", status, pct, "OpenRouter: $mark $pct% ($${String.format(Locale.US, "%.2f", usage)}/$${String.format(Locale.US, "%.2f", limit)})")
            } else if (code == 401) {
                conn.disconnect()
                ApiResult("openrouter", "OpenRouter", "INVALID_KEY", 0, "OpenRouter: Unauthorized / ইনভ্যালিড কি ❌")
            } else {
                conn.disconnect()
                ApiResult("openrouter", "OpenRouter", "NETWORK_ERROR", 0, "OpenRouter: HTTP $code ⚠️")
            }
        } catch (e: Exception) {
            ApiResult("openrouter", "OpenRouter", "NETWORK_ERROR", 0, "OpenRouter: নেটওয়ার্ক এরর ⚠️")
        }
    }

    private fun checkElevenLabs(key: String): ApiResult {
        if (key.isBlank() || key == "0") {
            return ApiResult("elevenlabs", "ElevenLabs", "NOT_CONFIGURED", 0, "ElevenLabs: কী দেওয়া হয়নি")
        }
        return try {
            val url = URL("https://api.elevenlabs.io/v1/user/subscription")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("xi-api-key", key.trim())
                connectTimeout = 5000
                readTimeout = 5000
            }
            val code = conn.responseCode
            if (code == 200) {
                val reader = BufferedReader(InputStreamReader(conn.inputStream))
                val resp = reader.readText()
                reader.close()
                conn.disconnect()

                val json = JSONObject(resp)
                val used = json.optLong("character_count", 0L)
                val limit = json.optLong("character_limit", 10000L)
                val pct = if (limit > 0) Math.round((used.toDouble() / limit.toDouble()) * 100).toInt() else 0
                val status = if (pct >= 80) "NEAR_LIMIT" else "HEALTHY"
                val mark = if (status == "HEALTHY") "✅" else "⚠️"
                ApiResult("elevenlabs", "ElevenLabs", status, pct, "ElevenLabs: $mark $pct% ($used/$limit chars)")
            } else if (code == 401) {
                conn.disconnect()
                ApiResult("elevenlabs", "ElevenLabs", "INVALID_KEY", 0, "ElevenLabs: Unauthorized ❌")
            } else if (code == 429) {
                conn.disconnect()
                ApiResult("elevenlabs", "ElevenLabs", "LIMIT_EXCEEDED", 100, "ElevenLabs: লিমিট শেষ 🚨")
            } else {
                conn.disconnect()
                ApiResult("elevenlabs", "ElevenLabs", "NETWORK_ERROR", 0, "ElevenLabs: HTTP $code ⚠️")
            }
        } catch (e: Exception) {
            ApiResult("elevenlabs", "ElevenLabs", "NETWORK_ERROR", 0, "ElevenLabs: নেটওয়ার্ক এরর ⚠️")
        }
    }

    private fun checkGrok(key: String): ApiResult {
        if (key.isBlank() || key == "0") {
            return ApiResult("grok", "Grok", "NOT_CONFIGURED", 0, "Grok: কী দেওয়া হয়নি")
        }
        return try {
            val url = URL("https://api.x.ai/v1/models")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Authorization", "Bearer ${key.trim()}")
                connectTimeout = 5000
                readTimeout = 5000
            }
            val code = conn.responseCode
            conn.disconnect()

            when (code) {
                200 -> ApiResult("grok", "Grok", "HEALTHY", 0, "Grok (xAI): Healthy ✅")
                401 -> ApiResult("grok", "Grok", "INVALID_KEY", 0, "Grok: ইনভ্যালিড কি ❌")
                429 -> ApiResult("grok", "Grok", "LIMIT_EXCEEDED", 100, "Grok: লিমিট শেষ 🚨")
                else -> ApiResult("grok", "Grok", "NETWORK_ERROR", 0, "Grok: HTTP $code ⚠️")
            }
        } catch (e: Exception) {
            ApiResult("grok", "Grok", "NETWORK_ERROR", 0, "Grok: নেটওয়ার্ক এরর ⚠️")
        }
    }

    private fun checkXiaomiMimo(key: String): ApiResult {
        if (key.isBlank() || key == "0") {
            return ApiResult("xiaomi_mimo", "MiMo", "NOT_CONFIGURED", 0, "Xiaomi MiMo: কী দেওয়া হয়নি")
        }
        return if (key.startsWith("sk-") && key.length > 20) {
            ApiResult("xiaomi_mimo", "MiMo", "HEALTHY", 0, "Xiaomi MiMo: Healthy ✅")
        } else {
            ApiResult("xiaomi_mimo", "MiMo", "INVALID_KEY", 0, "Xiaomi MiMo: ইনভ্যালিড কি ফরম্যাট ❌")
        }
    }

    private fun checkMem0(key: String): ApiResult {
        if (key.isBlank() || key == "0") {
            return ApiResult("mem0", "Mem0", "NOT_CONFIGURED", 0, "Mem0: কী দেওয়া হয়নি")
        }
        return if (key.startsWith("m0-") && key.length > 15) {
            ApiResult("mem0", "Mem0", "HEALTHY", 0, "Mem0 Memory: Healthy ✅")
        } else {
            ApiResult("mem0", "Mem0", "INVALID_KEY", 0, "Mem0: ইনভ্যালিড কি ফরম্যাট ❌")
        }
    }
}
