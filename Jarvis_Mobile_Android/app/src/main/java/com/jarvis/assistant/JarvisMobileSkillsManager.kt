package com.jarvis.assistant

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader

data class SkillItem(
    val name: String,
    val description: String,
    val file: String,
    val updated: String
)

object JarvisMobileSkillsManager {
    private const val TAG = "JarvisMobileSkills"
    private var cachedSkills: List<SkillItem>? = null
    private var cachedCatalogJson: String? = null

    fun getSkillsList(context: Context): List<SkillItem> {
        cachedSkills?.let { return it }

        val list = mutableListOf<SkillItem>()
        try {
            val assetManager = context.assets
            val inputStream = assetManager.open("skills/index.json")
            val reader = BufferedReader(InputStreamReader(inputStream, Charsets.UTF_8))
            val jsonString = reader.use { it.readText() }

            val root = JSONObject(jsonString)
            val arr = root.optJSONArray("skills") ?: JSONArray()
            for (i in 0 until arr.length()) {
                val item = arr.getJSONObject(i)
                val name = item.optString("name", "")
                val desc = item.optString("description", "")
                val file = item.optString("file", "")
                val updated = item.optString("updated", "")
                if (name.isNotBlank()) {
                    list.add(SkillItem(name, desc, file, updated))
                }
            }
            cachedSkills = list
            cachedCatalogJson = jsonString
            Log.i(TAG, "Successfully loaded ${list.size} skills from Android assets.")
        } catch (e: Exception) {
            Log.e(TAG, "Error loading skills from assets: ${e.message}")
        }
        return list
    }

    fun getSkillCatalogJson(context: Context): String {
        cachedCatalogJson?.let { return it }
        getSkillsList(context)
        return cachedCatalogJson ?: "{\"skills\":[]}"
    }

    fun getSkillContent(context: Context, skillName: String): String {
        val cleanName = skillName.trim().lowercase().removeSuffix(".md")
        try {
            val assetManager = context.assets
            val filePath = if (cleanName.startsWith("skills/")) "$cleanName.md" else "skills/$cleanName.md"
            val inputStream = assetManager.open(filePath)
            return BufferedReader(InputStreamReader(inputStream, Charsets.UTF_8)).use { it.readText() }
        } catch (e: Exception) {
            // Try matching in list
            val skills = getSkillsList(context)
            val found = skills.firstOrNull { it.name.equals(cleanName, ignoreCase = true) }
            if (found != null && found.file.isNotBlank()) {
                try {
                    val stream = context.assets.open(found.file)
                    return BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
                } catch (_: Exception) {}
            }
            return "Skill '$skillName' playbook not found."
        }
    }

    fun findMatchingSkill(context: Context, userPrompt: String): SkillItem? {
        val skills = getSkillsList(context)
        val lower = userPrompt.lowercase()

        // 1. Direct name match
        for (skill in skills) {
            val sName = skill.name.replace("-", " ")
            if (lower.contains(sName) || lower.contains(skill.name)) {
                return skill
            }
        }

        // 2. High-priority keyword mapping
        val keywordMap = listOf(
            listOf("alarm", "অ্যালার্ম", "জাগিয়ে", "জাগিয়ে", "সকালে ডাক") to "alarm-clock",
            listOf("whatsapp", "হোয়াটসঅ্যাপ", "হোয়াটসঅ্যাপ") to "whatsapp-pro",
            listOf("torch", "টর্চ", "ফ্ল্যাশ", "wifi", "ওয়াইফাই", "ওয়াইফাই", "bluetooth", "ব্লুটুথ", "hotspot", "হটস্পট") to "system-quick-toggle",
            listOf("camera", "ক্যামেরা", "ছবি তোলো", "সেলফি", "ছবি তোল") to "camera-lens",
            listOf("contact", "কন্টাক্ট", "নাম্বার সেভ", "নম্বর সেভ") to "contacts-manager",
            listOf("sms", "মেসেজ পাঠাও", "টেক্সট পাঠাও") to "sms-messenger",
            listOf("battery", "ব্যাটারি", "চার্জ") to "battery-optimizer-apps",
            listOf("note", "নোট", "লিখে রাখ", "টুকে রাখ") to "notes-keeper",
            listOf("weather", "আবহাওয়া", "আবহাওয়া", "বৃষ্টি", "তাপমাত্রা") to "weather-check",
            listOf("screenshot", "স্ক্রিনশট", "স্ক্রিন শট") to "screenshot-tool",
            listOf("screen record", "রেকর্ড স্ক্রিন", "স্ক্রিন রেকর্ড") to "screen-recorder",
            listOf("volume", "ভলিউম", "আওয়াজ", "আওয়াজ", "সাউন্ড") to "volume-profiles",
            listOf("silent", "সাইলেন্ট", "dnd", "বিরক্ত") to "do-not-disturb-contacts",
            listOf("map", "ম্যাপ", "রাস্তা", "লোকেশন", "নেভিগেশন", "navigation") to "maps-navigation",
            listOf("calculator", "হিসাব", "ক্যালকুলেটর") to "calculator-quick",
            listOf("translate", "অনুবাদ", "অর্থ কি", "মানে কি") to "translate-on-the-fly",
            listOf("sos", "বাঁচাও", "ইমার্জেন্সি", "বিপদ", "জরুরি") to "emergency-contact",
            listOf("medicine", "ওষুধ", "ঔষধ") to "medicine-reminder",
            listOf("water", "পানি খাও", "জল খাও") to "water-reminder",
            listOf("music", "গান বাজাও", "গান চালাও") to "music-dj",
            listOf("podcast", "পডকাস্ট") to "podcast-player",
            listOf("video", "ভিডিও") to "video-streaming",
            listOf("dark mode", "ডার্ক মোড", "নাইট মোড") to "dark-mode-toggle",
            listOf("brightness", "ব্রাইটনেস", "উজ্জ্বলতা") to "brightness-control",
            listOf("call", "কল ধরো", "কে ফোন দিচ্ছে") to "call-secretary",
            listOf("routine", "রুটিন", "সকালের রুটিন") to "routine-builder",
            listOf("briefing", "দিন কেমন", "আপডেট দাও", "আজকের সারাংশ") to "daily-briefing"
        )

        for ((keys, skillSlug) in keywordMap) {
            for (k in keys) {
                if (lower.contains(k)) {
                    val match = skills.firstOrNull { it.name == skillSlug }
                    if (match != null) return match
                }
            }
        }

        return null
    }

    fun buildSystemPromptWithSkills(context: Context, userPrompt: String, baseSysPrompt: String): String {
        val matchedSkill = findMatchingSkill(context, userPrompt)
        if (matchedSkill != null) {
            val content = getSkillContent(context, matchedSkill.name)
            val cleanContent = if (content.length > 2500) content.substring(0, 2500) + "\n..." else content
            return "$baseSysPrompt\n\n" +
                    "### ACTIVE SKILL PLAYBOOK: [${matchedSkill.name}]\n" +
                    "Follow these skill guidelines for the user request:\n" +
                    cleanContent
        }
        return baseSysPrompt
    }
}
