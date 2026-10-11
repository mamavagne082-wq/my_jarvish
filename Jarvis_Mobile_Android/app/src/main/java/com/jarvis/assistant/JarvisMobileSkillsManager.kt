package com.jarvis.assistant

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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
    private var isTorchOn: Boolean = false

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
            listOf("torch", "টর্চ", "ফ্ল্যাশ", "flashlight") to "system-quick-toggle",
            listOf("wifi", "ওয়াইফাই", "ওয়াইফাই", "bluetooth", "ব্লুটুথ", "hotspot", "হটস্পট") to "system-quick-toggle",
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
            listOf("briefing", "দিন কেমন", "আপডেট দাও", "আজকের সারাংশ") to "daily-briefing",
            listOf("file", "ফাইল", "ডকুমেন্ট") to "file-manager"
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

    /**
     * Toggles flashlight on the device.
     */
    fun toggleTorch(context: Context, forceState: Boolean? = null): Boolean {
        return try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = cameraManager.cameraIdList.firstOrNull() ?: return false
            isTorchOn = forceState ?: !isTorchOn
            cameraManager.setTorchMode(cameraId, isTorchOn)
            isTorchOn
        } catch (e: Exception) {
            Log.e(TAG, "Error toggling torch: ${e.message}")
            false
        }
    }

    /**
     * [AUTOMATIC NATIVE SKILL EXECUTOR]
     * Directly executes any of the 85 skills on the mobile device without needing external API keys.
     */
    fun executeSkill(context: Context, skillNameOrSlug: String, userPrompt: String = ""): Pair<Boolean, String> {
        val slug = skillNameOrSlug.trim().lowercase().removePrefix("execute skill:").removePrefix("স্কিল:").trim()
        val prompt = userPrompt.lowercase()
        Log.i(TAG, "Executing native skill: '$slug' (prompt: '$userPrompt')")

        try {
            when {
                // 1. Torch / Flashlight & System Quick Toggles
                slug == "system-quick-toggle" || slug.contains("torch") || prompt.contains("টর্চ") || prompt.contains("ফ্ল্যাশ") -> {
                    val turnOn = if (prompt.contains("বন্ধ") || prompt.contains("অফ") || prompt.contains("off")) false else null
                    val state = toggleTorch(context, turnOn)
                    val msg = if (state) "টর্চ লাইট অন করা হয়েছে।" else "টর্চ লাইট বন্ধ করা হয়েছে।"
                    return Pair(true, msg)
                }

                // 2. Alarm Clock
                slug == "alarm-clock" || prompt.contains("অ্যালার্ম") || prompt.contains("alarm") -> {
                    try {
                        val intent = Intent(AlarmClock.ACTION_SHOW_ALARMS).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(intent)
                        return Pair(true, "অ্যালার্ম ঘড়ি ওপেন করা হয়েছে।")
                    } catch (_: Exception) {
                        val clockIntent = Intent(Intent.ACTION_MAIN).apply {
                            addCategory(Intent.CATEGORY_APP_CALENDAR)
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(clockIntent)
                        return Pair(true, "ক্লক ও অ্যালার্ম চালু করা হয়েছে।")
                    }
                }

                // 3. Camera Lens & Document / QR Scanner
                slug == "camera-lens" || slug == "document-scanner" || slug == "qr-code-scanner" || prompt.contains("ক্যামেরা") || prompt.contains("camera") -> {
                    val intent = Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "ক্যামেরা ওপেন করা হয়েছে।")
                }

                // 4. Screenshot Tool
                slug == "screenshot-tool" || slug == "screen-recorder" || prompt.contains("স্ক্রিনশট") || prompt.contains("screenshot") -> {
                    if (JarvisAccessibilityService.instance != null) {
                        JarvisAccessibilityService.instance?.captureAndSendScreenshot()
                        return Pair(true, "মোবাইল স্ক্রিনের স্ন্যাপশট নেওয়া হয়েছে।")
                    } else {
                        return Pair(true, "স্ক্রিনশটের জন্য Accessibility Settings থেকে Jarvis অন করুন।")
                    }
                }

                // 5. Calculator
                slug == "calculator-quick" || slug == "bill-split-calculator" || slug == "currency-converter" || slug == "unit-converter" || prompt.contains("ক্যালকুলেটর") || prompt.contains("calculator") -> {
                    val launched = JarvisForegroundService.instance?.launchApplicationLocally("calculator") ?: false
                    if (!launched) {
                        try {
                            val intent = Intent(Intent.ACTION_MAIN).apply {
                                addCategory(Intent.CATEGORY_APP_CALCULATOR)
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            context.startActivity(intent)
                        } catch (_: Exception) {}
                    }
                    return Pair(true, "ক্যালকুলেটর ওপেন করা হয়েছে।")
                }

                // 6. Contacts & Directory
                slug == "contacts-manager" || slug == "emergency-contact" || slug == "trusted-circle-checkin" || prompt.contains("কন্টাক্ট") || prompt.contains("contact") -> {
                    val intent = Intent(Intent.ACTION_VIEW, ContactsContract.Contacts.CONTENT_URI).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "ফোন কন্টাক্টস ওপেন করা হয়েছে।")
                }

                // 7. WhatsApp Pro & Social Messaging
                slug == "whatsapp-pro" || slug == "photo-share" || slug == "group-broadcast" || slug == "status-updater" || prompt.contains("whatsapp") || prompt.contains("হোয়াটসঅ্যাপ") -> {
                    JarvisForegroundService.instance?.launchApplicationLocally("whatsapp")
                    return Pair(true, "WhatsApp ওপেন করা হয়েছে।")
                }

                // 8. Music DJ & Media Playback
                slug == "music-dj" || slug == "playlist-builder" || slug == "radio-fm" || slug == "karaoke-mode" || prompt.contains("গান") || prompt.contains("music") -> {
                    val launched = JarvisForegroundService.instance?.launchApplicationLocally("music") ?: false
                    if (!launched) {
                        JarvisForegroundService.instance?.launchApplicationLocally("youtube")
                    }
                    return Pair(true, "মিউজিক প্লেয়ার চালু করা হয়েছে।")
                }

                // 9. Video Streaming & Podcasts
                slug == "video-streaming" || slug == "podcast-player" || slug == "ebook-reader" || prompt.contains("ভিডিও") || prompt.contains("video") -> {
                    JarvisForegroundService.instance?.launchApplicationLocally("youtube")
                    return Pair(true, "ভিডিও স্ট্রিমিং চালু করা হয়েছে।")
                }

                // 10. Notes Keeper & Shopping List
                slug == "notes-keeper" || slug == "quick-note-shopping-list" || slug == "task-list-manager" || slug == "reminders-tasks" || prompt.contains("নোট") || prompt.contains("note") -> {
                    val launched = JarvisForegroundService.instance?.launchApplicationLocally("notes") ?: false
                    if (!launched) {
                        val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://keep.google.com")).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(browserIntent)
                    }
                    return Pair(true, "নোটস ও টাস্ক ম্যানেজার ওপেন করা হয়েছে।")
                }

                // 11. Calendar & Routine
                slug == "calendar-events" || slug == "routine-builder" || slug == "sleep-schedule" || slug == "medicine-reminder" || slug == "water-reminder" || slug == "posture-break-reminder" -> {
                    try {
                        val intent = Intent(Intent.ACTION_MAIN).apply {
                            addCategory(Intent.CATEGORY_APP_CALENDAR)
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(intent)
                    } catch (_: Exception) {}
                    return Pair(true, "ক্যালেন্ডার ও রুটিন ম্যানেজার ওপেন করা হয়েছে।")
                }

                // 12. Weather Check
                slug == "weather-check" || prompt.contains("আবহাওয়া") || prompt.contains("weather") -> {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=weather+today")).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "আজকের আবহাওয়া ও পূর্বাভাস ওপেন করা হয়েছে।")
                }

                // 13. Maps & Navigation
                slug == "maps-navigation" || prompt.contains("ম্যাপ") || prompt.contains("maps") -> {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=maps")).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "গুগল ম্যাপস ও নেভিগেশন ওপেন করা হয়েছে।")
                }

                // 14. Browser Assistant & Full Agent
                slug == "browser-assistant" || slug == "browser-full-agent" || slug == "price-check" || slug == "order-tracking" -> {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com")).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "ব্রাউজার চালু করা হয়েছে।")
                }

                // 15. Voice Lock Command & Security
                slug == "voice-lock-command" || slug == "motion-lock" || slug == "app-lock-manager" || prompt.contains("লক") || prompt.contains("lock") -> {
                    if (JarvisAccessibilityService.instance != null) {
                        JarvisAccessibilityService.instance?.lockDevice()
                        return Pair(true, "মোবাইল স্ক্রিন লক করা হয়েছে।")
                    } else {
                        JarvisForegroundService.instance?.lockDeviceLocally()
                        return Pair(true, "স্ক্রিন লক কার্যকর হয়েছে।")
                    }
                }

                // 16. Battery Optimizer & Phone Care
                slug == "battery-optimizer-apps" || slug == "phone-care" || slug == "storage-cleaner-suggest" || slug == "low-battery-auto-message" -> {
                    try {
                        val intent = Intent(Intent.ACTION_POWER_USAGE_SUMMARY).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(intent)
                    } catch (_: Exception) {
                        val intent = Intent(Settings.ACTION_SETTINGS).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(intent)
                    }
                    return Pair(true, "ব্যাটারি ও সিস্টেম কেয়ার ওপেন করা হয়েছে।")
                }

                // 17. Volume Profiles & DND
                slug == "volume-profiles" || slug == "do-not-disturb-contacts" || slug == "study-focus" -> {
                    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                    audioManager.adjustVolume(AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
                    return Pair(true, "ভলিউম ও সাউন্ড প্রোফাইল নিয়ন্ত্রণ করা হয়েছে।")
                }

                // 18. Brightness Control & Dark Mode
                slug == "brightness-control" || slug == "dark-mode-toggle" || slug == "auto-rotate-toggle" || slug == "font-size-adjust" -> {
                    val intent = Intent(Settings.ACTION_DISPLAY_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "ডিসপ্লে ও ব্রাইটনেস সেটিংস ওপেন করা হয়েছে।")
                }

                // 19. Call Secretary
                slug == "call-secretary" || slug == "voicemail-check" || slug == "block-unblock" -> {
                    val intent = Intent(Intent.ACTION_DIAL).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "ফোন ডায়ালার ওপেন করা হয়েছে।")
                }

                // 20. SMS Messenger
                slug == "sms-messenger" -> {
                    try {
                        val intent = Intent(Intent.ACTION_MAIN).apply {
                            addCategory(Intent.CATEGORY_APP_MESSAGING)
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(intent)
                    } catch (_: Exception) {}
                    return Pair(true, "এসএমএস মেসেজিং অ্যাপ ওপেন করা হয়েছে।")
                }

                // 21. File Manager
                slug == "file-manager" -> {
                    val launched = JarvisForegroundService.instance?.launchApplicationLocally("files") ?: false
                    if (!launched) {
                        try {
                            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                                type = "*/*"
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            context.startActivity(intent)
                        } catch (_: Exception) {}
                    }
                    return Pair(true, "ফাইল ম্যানেজার ওপেন করা হয়েছে।")
                }

                // 22. Daily Briefing
                slug == "daily-briefing" || prompt.contains("সারাংশ") || prompt.contains("briefing") -> {
                    val dateStr = SimpleDateFormat("EEEE, dd MMMM yyyy", Locale("bn", "BD")).format(Date())
                    val timeStr = SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date())
                    val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
                    val batteryPct = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: 80
                    val briefing = "শুভ দিন! আজকের তারিখ $dateStr, সময় $timeStr। আপনার ফোনের ব্যাটারি চার্জ রয়েছে $batteryPct%।"
                    return Pair(true, briefing)
                }

                // 23. Universal App Control & Multitasking
                slug == "universal-app-control" || slug == "sub-agent-orchestrator" -> {
                    if (JarvisAccessibilityService.instance != null) {
                        JarvisAccessibilityService.instance?.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_RECENTS)
                    }
                    return Pair(true, "ইউনিভার্সাল অ্যাপ কন্ট্রোল সক্রিয় করা হয়েছে।")
                }

                // 24. AI Image Generator & Social Posts
                slug == "chatgpt-image-gen" || slug == "social-media-post" -> {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://chatgpt.com")).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                    return Pair(true, "AI ক্রিয়েটিভ টুল ব্রাউজারে চালু করা হয়েছে।")
                }

                // Fallback for any other custom skill: launch relevant app or search web
                else -> {
                    val cleanAppName = slug.replace("-", " ")
                    val launched = JarvisForegroundService.instance?.launchApplicationLocally(cleanAppName) ?: false
                    if (launched) {
                        return Pair(true, "স্কিল '$slug' অনুযায়ী অ্যাপ ওপেন করা হয়েছে।")
                    } else {
                        val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=${Uri.encode(slug)}")).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK
                        }
                        context.startActivity(webIntent)
                        return Pair(true, "স্কিল '$slug' সংক্রান্ত তথ্য ও টুল ওপেন করা হয়েছে।")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error executing skill $slug: ${e.message}")
            return Pair(false, "স্কিল কার্যকর করতে সমস্যা হয়েছে: ${e.message}")
        }
    }
}
