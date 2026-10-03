package com.jarvis.assistant

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Path
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.ContactsContract
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.util.Base64
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.io.ByteArrayOutputStream
import androidx.core.content.ContextCompat
import com.jarvis.assistant.automation.core.*
import com.jarvis.assistant.automation.whatsapp.*
import com.jarvis.assistant.automation.social.*
import com.jarvis.assistant.automation.android.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

class JarvisAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "JarvisAccessibility"
        var instance: JarvisAccessibilityService? = null
            private set

        val isServiceRunning: Boolean
            get() = instance != null
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())

    lateinit var screenDriver: AccessibilityScreenDriver
        private set
    lateinit var screenObserver: ScreenObserver
        private set
    lateinit var actionExecutor: UiActionExecutor
        private set
    lateinit var textExecutor: TextInputExecutor
        private set
    lateinit var whatsAppAgent: WhatsAppAgent
        private set
    lateinit var socialMediaAgent: SocialMediaAgent
        private set

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        screenDriver = AccessibilityScreenDriver(this)
        screenObserver = ScreenObserver(screenDriver)
        actionExecutor = UiActionExecutor(screenDriver, screenObserver)
        textExecutor = TextInputExecutor(screenDriver, screenObserver)
        whatsAppAgent = WhatsAppAgent(screenDriver, screenObserver, actionExecutor, textExecutor)
        socialMediaAgent = SocialMediaAgent(applicationContext, screenDriver, screenObserver, actionExecutor, textExecutor)
        Log.d(TAG, "Jarvis Accessibility Service connected with Closed-Loop Automation Engine!")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (::screenDriver.isInitialized) {
            screenDriver.onAccessibilityEvent(event)
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Jarvis Accessibility Service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
        serviceScope.cancel()
    }

    /**
     * Executes commands dispatched from Jarvis voice agent via LiveKit DataChannel.
     */
    fun handleCommand(action: String, payload: JSONObject) {
        Log.d(TAG, "Handling mobile command: action=$action, payload=$payload")
        when (action.lowercase().trim()) {
            "lock", "turn_off_screen" -> lockDevice()
            "capture_screen", "screenshot", "take_screenshot" -> {
                captureAndSendScreenshot()
            }
            "open_app" -> {
                val target = payload.optString("target", "")
                openApplication(target)
            }
            "youtube_search" -> {
                val query = payload.optString("target", "")
                searchAndPlayYouTube(query)
            }
            "survey_auto", "survey_tap" -> {
                performSurveyAutomation()
            }
            "call_phone", "dial_number", "make_call" -> {
                val target = payload.optString("target", "")
                val simSlot = payload.optInt("sim_slot", 1)
                val openDialpad = payload.optBoolean("open_dialpad", false)
                makePhoneCall(target, simSlot, openDialpad)
            }
            "send_sms", "sms_message" -> {
                val target = payload.optString("target", "")
                val message = payload.optString("message", "")
                val simSlot = payload.optInt("sim_slot", 1)
                sendSmsMessage(target, message, simSlot)
            }
            // ── Closed-Loop WhatsApp Assistant & Social Media Agents ───────
            "execute_whatsapp_task" -> {
                val taskId = payload.optString("task_id", UUID.randomUUID().toString())
                val waActionStr = payload.optString("action", "send_message")
                val waAction = WhatsAppAction.fromString(waActionStr) ?: WhatsAppAction.SEND_MESSAGE
                val contact = payload.optString("contact_query", "")
                val message = payload.optString("message", "")
                val mode = payload.optString("mode", "execute")
                val task = WhatsAppTask(
                    taskId = taskId,
                    action = waAction,
                    contactQuery = contact,
                    message = message,
                    mode = mode
                )
                serviceScope.launch {
                    val result = whatsAppAgent.executeTask(task)
                    sendTaskResultPacket("whatsapp", result.taskId, result.status.name, result.statusMessage, result.currentStep)
                }
            }
            "whatsapp_task_control" -> {
                val command = payload.optString("command", "confirm")
                val taskId = payload.optString("task_id", null)
                serviceScope.launch {
                    val result = whatsAppAgent.controlTask(command, taskId)
                    sendTaskResultPacket("whatsapp", result.taskId, result.status.name, result.statusMessage, result.currentStep)
                }
            }
            "execute_social_media_task" -> {
                val taskId = payload.optString("task_id", UUID.randomUUID().toString())
                val platformStr = payload.optString("platform", "instagram")
                val actionStr = payload.optString("action", "post")
                val platform = SocialPlatform.fromString(platformStr) ?: SocialPlatform.INSTAGRAM
                val smAction = SocialAction.fromString(actionStr) ?: SocialAction.POST
                val mediaUri = payload.optString("media_uri", null)
                val caption = payload.optString("caption", null)
                val mode = payload.optString("mode", "execute")
                val task = SocialMediaTask(
                    taskId = taskId,
                    platform = platform,
                    action = smAction,
                    mediaUri = mediaUri,
                    caption = caption,
                    mode = mode
                )
                serviceScope.launch {
                    val result = socialMediaAgent.executeTask(task)
                    sendTaskResultPacket("social", result.taskId, result.status.name, result.statusMessage, result.currentStep)
                }
            }
            "social_media_task_control" -> {
                val command = payload.optString("command", "confirm")
                val taskId = payload.optString("task_id", null)
                serviceScope.launch {
                    val result = socialMediaAgent.controlTask(command, taskId)
                    sendTaskResultPacket("social", result.taskId, result.status.name, result.statusMessage, result.currentStep)
                }
            }
            "whatsapp_message", "send_whatsapp" -> {
                val target = payload.optString("target", "")
                val message = payload.optString("message", "")
                sendWhatsAppMessage(target, message)
            }
            "whatsapp_call" -> {
                val target = payload.optString("target", "")
                val callType = payload.optString("call_type", "voice")
                makeWhatsAppCall(target, callType)
            }
            "messenger_message", "send_messenger" -> {
                val target = payload.optString("target", "")
                val message = payload.optString("message", "")
                sendMessengerMessage(target, message)
            }
            "messenger_call" -> {
                val target = payload.optString("target", "")
                val callType = payload.optString("call_type", "voice")
                makeMessengerCall(target, callType)
            }
            "instagram_message", "send_instagram" -> {
                val target = payload.optString("target", "")
                val message = payload.optString("message", "")
                sendInstagramMessage(target, message)
            }
            "twitter_message", "send_twitter" -> {
                val target = payload.optString("target", "")
                val message = payload.optString("message", "")
                sendTwitterMessage(target, message)
            }
            "volume_up" -> adjustVolume(increase = true)
            "volume_down" -> adjustVolume(increase = false)
            "volume_set", "set_volume" -> setVolumePercent(payload.optInt("percent", 50))
            "volume_mute", "mute" -> muteVolume()
            "brightness_up" -> adjustScreenBrightness(increase = true)
            "brightness_down" -> adjustScreenBrightness(increase = false)
            "brightness_set", "set_brightness" -> setScreenBrightnessPercent(payload.optInt("percent", 50))
            "scroll", "swipe" -> {
                val direction = payload.optString("direction", "down")
                performScroll(direction)
            }
            "open_settings" -> {
                val settingType = payload.optString("setting_type", "general")
                openDeviceSettings(settingType)
            }
            "click_element", "tap_element" -> {
                val target = payload.optString("target", "")
                clickElementByText(target)
            }
            "open_jarvis", "show_ui", "bring_to_front" -> {
                val phrase = payload.optString("phrase", "hey jarvis")
                bringAppToFront(phrase)
            }
            "minimize", "hide_ui", "background" -> {
                performGlobalAction(GLOBAL_ACTION_HOME)
            }
            "answer_call" -> answerIncomingCall()
            "end_call" -> endActiveCall()
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            else -> Log.w(TAG, "Unknown mobile action: $action")
        }
    }

    private fun sendTaskResultPacket(
        category: String,
        taskId: String,
        status: String,
        message: String,
        step: String
    ) {
        val packet = JSONObject().apply {
            put("type", "JARVIS_MOBILE_TASK_RESULT")
            put("category", category)
            put("task_id", taskId)
            put("status", status)
            put("message", message)
            put("step", step)
        }
        JarvisForegroundService.instance?.sendDataPacket(packet)
        Log.d(TAG, "Dispatched mobile task packet: $packet")
    }

    /**
     * Brings Jarvis MainActivity to the front immediately with system accessibility privileges.
     */
    fun bringAppToFront(phrase: String = "hey jarvis") {
        try {
            val bringIntent = Intent(applicationContext, MainActivity::class.java).apply {
                action = JarvisForegroundService.ACTION_WAKE_WORD_DETECTED
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                putExtra("from_wake_word", true)
                putExtra("phrase", phrase)
            }
            startActivity(bringIntent)
            Log.d(TAG, "AccessibilityService successfully launched MainActivity to front")
        } catch (e: Exception) {
            Log.e(TAG, "Error bringing app to front via Accessibility: ${e.message}")
        }
    }

    /**
     * Searches device contacts by name and returns phone number if found.
     */
    fun searchContactNumber(name: String): String? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "READ_CONTACTS permission not granted")
            return null
        }
        val cleanName = name.trim()
        if (cleanName.isEmpty()) return null

        val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        )

        try {
            contentResolver.query(
                uri,
                projection,
                "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
                arrayOf("%$cleanName%"),
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                    if (numberIndex >= 0) {
                        val number = cursor.getString(numberIndex)
                        Log.d(TAG, "Found contact: $cleanName -> $number")
                        return number
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error searching contact: ${e.message}")
        }
        return null
    }

    /**
     * Dials or initiates a phone call with SIM 1 (or designated slot).
     */
    fun makePhoneCall(target: String, simSlot: Int = 1, openDialpad: Boolean = false): Boolean {
        var phoneNumber = target.trim()
        // If target has no digits, search contacts by name
        if (!phoneNumber.any { it.isDigit() }) {
            val lookedUp = searchContactNumber(phoneNumber)
            if (lookedUp != null) {
                phoneNumber = lookedUp
            }
        }

        val cleanNumber = phoneNumber.replace(Regex("[^0-9+]"), "")
        if (cleanNumber.isEmpty()) {
            Log.w(TAG, "Cannot make call: invalid phone number for '$target'")
            return false
        }

        val slotIndex = if (simSlot <= 1) 0 else 1
        val hasCallPermission = ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED

        val action = if (openDialpad || !hasCallPermission) Intent.ACTION_DIAL else Intent.ACTION_CALL
        val intent = Intent(action, Uri.parse("tel:$cleanNumber")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK

            // Multi-vendor dual SIM extras for SIM 1 (Slot 0)
            putExtra("com.android.phone.extra.slot", slotIndex)
            putExtra("simSlot", slotIndex)
            putExtra("slot", slotIndex)
            putExtra("sim_slot", slotIndex)
            putExtra("Cdma_Supp", slotIndex)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                try {
                    val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                    val subInfo = subManager?.getActiveSubscriptionInfoForSimSlotIndex(slotIndex)
                    if (subInfo != null) {
                        putExtra("phone_subscription", subInfo.subscriptionId)
                        putExtra("subscription", subInfo.subscriptionId)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "SubscriptionManager lookup: ${e.message}")
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    val telecomManager = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
                    val accounts = telecomManager?.callCapablePhoneAccounts
                    if (!accounts.isNullOrEmpty() && accounts.size > slotIndex) {
                        putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, accounts[slotIndex])
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "TelecomManager lookup: ${e.message}")
                }
            }
        }

        try {
            startActivity(intent)
            Log.d(TAG, "Initiated call to $cleanNumber (SIM $simSlot, action=$action)")

            if (openDialpad || !hasCallPermission) {
                serviceScope.launch {
                    delay(1200)
                    clickSimCallButton(simSlot)
                }
            }
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch call intent: ${e.message}")
            return false
        }
    }

    private fun clickSimCallButton(simSlot: Int): Boolean {
        val root = rootInActiveWindow ?: return false
        val keywords = if (simSlot <= 1) {
            listOf("SIM 1", "SIM1", "Sim 1", "Call", "ডায়াল", "কল", "Dial")
        } else {
            listOf("SIM 2", "SIM2", "Sim 2", "Call 2", "Dial 2")
        }

        for (kw in keywords) {
            val nodes = root.findAccessibilityNodeInfosByText(kw)
            for (node in nodes) {
                if (node.isClickable) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    Log.d(TAG, "Clicked call button with text '$kw'")
                    return true
                } else if (node.parent?.isClickable == true) {
                    node.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    Log.d(TAG, "Clicked parent call button with text '$kw'")
                    return true
                }
            }
        }
        return false
    }

    /**
     * Sends WhatsApp message to a phone number or contact name.
     */
    fun sendWhatsAppMessage(target: String, message: String) {
        val cleanTarget = target.trim()
        val isCurrent = cleanTarget.isEmpty() || cleanTarget.equals("current", true) ||
                        cleanTarget.contains("ওপেন") || cleanTarget.contains("বর্তমান")
        if (isCurrent) {
            serviceScope.launch {
                autoSendWhatsAppText(message)
            }
            return
        }

        val isIndex = cleanTarget.contains("প্রথম") || cleanTarget.contains("১ম") || cleanTarget.contains("1st") ||
                      cleanTarget.contains("দ্বিতীয়") || cleanTarget.contains("২য়") || cleanTarget.contains("2nd") ||
                      cleanTarget.contains("তৃতীয়") || cleanTarget.contains("৩য়") || cleanTarget.contains("3rd") ||
                      cleanTarget.contains("...") || cleanTarget.contains("ডট")

        if (isIndex) {
            openApplication("whatsapp")
            serviceScope.launch {
                delay(2000)
                val root = rootInActiveWindow
                if (root != null) {
                    val listItems = mutableListOf<AccessibilityNodeInfo>()
                    findClickableNodes(root, listItems)
                    val idx = if (cleanTarget.contains("দ্বিতীয়") || cleanTarget.contains("২য়") || cleanTarget.contains("2nd")) 1
                              else if (cleanTarget.contains("তৃতীয়") || cleanTarget.contains("৩য়") || cleanTarget.contains("3rd")) 2
                              else 0
                    if (listItems.size > idx) {
                        listItems[idx].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    }
                }
                delay(1200)
                autoSendWhatsAppText(message)
            }
            return
        }

        var phoneNumber = cleanTarget
        if (!phoneNumber.any { it.isDigit() }) {
            val lookedUp = searchContactNumber(phoneNumber)
            if (lookedUp != null) {
                phoneNumber = lookedUp
            }
        }

        val cleanNumber = phoneNumber.replace(Regex("[^0-9]"), "")
        if (cleanNumber.isNotEmpty()) {
            val phoneForWa = if (cleanNumber.startsWith("0")) "88$cleanNumber" else cleanNumber
            try {
                val uri = Uri.parse("https://api.whatsapp.com/send?phone=$phoneForWa&text=" + Uri.encode(message))
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage("com.whatsapp")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(intent)
                Log.d(TAG, "Opened WhatsApp chat for $phoneForWa with pre-filled message")

                serviceScope.launch {
                    delay(2200)
                    clickWhatsAppSendButton()
                }
                return
            } catch (e: Exception) {
                Log.e(TAG, "Error opening WhatsApp with phone: ${e.message}")
            }
        }

        // Fallback: Contact name search in WhatsApp app
        openApplication("whatsapp")
        serviceScope.launch {
            delay(2000)
            searchAndMessageWhatsApp(target, message)
        }
    }

    private fun autoSendWhatsAppText(message: String) {
        val root = rootInActiveWindow ?: return
        val entryNodes = root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/entry")
        if (!entryNodes.isNullOrEmpty()) {
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, message)
            }
            entryNodes[0].performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            serviceScope.launch {
                delay(800)
                clickWhatsAppSendButton()
            }
        } else {
            val inputNodes = mutableListOf<AccessibilityNodeInfo>()
            findNodesByClassName(root, "EditText", inputNodes)
            if (inputNodes.isNotEmpty()) {
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, message)
                }
                inputNodes[0].performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                serviceScope.launch {
                    delay(800)
                    clickWhatsAppSendButton()
                }
            }
        }
    }

    private fun clickWhatsAppSendButton(): Boolean {
        val root = rootInActiveWindow ?: return false
        val sendNodes = root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/send")
        if (!sendNodes.isNullOrEmpty() && sendNodes[0].isClickable) {
            sendNodes[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
            Log.d(TAG, "Auto-tapped WhatsApp send button via id")
            return true
        }

        val descriptions = listOf("Send", "পাঠান", "সেন্ড")
        for (desc in descriptions) {
            val nodes = root.findAccessibilityNodeInfosByText(desc)
            for (node in nodes) {
                if (node.isClickable) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    Log.d(TAG, "Auto-tapped WhatsApp send button via text: $desc")
                    return true
                }
            }
        }
        return false
    }

    private fun searchAndMessageWhatsApp(contactName: String, message: String) {
        val root = rootInActiveWindow ?: return
        val searchNodes = root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/menuitem_search")
        if (!searchNodes.isNullOrEmpty()) {
            searchNodes[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
        } else {
            val searchTexts = root.findAccessibilityNodeInfosByText("Search")
            for (n in searchTexts) {
                if (n.isClickable) { n.performAction(AccessibilityNodeInfo.ACTION_CLICK); break }
            }
        }

        serviceScope.launch {
            delay(1500)
            val searchRoot = rootInActiveWindow ?: return@launch
            val editTexts = searchRoot.findAccessibilityNodeInfosByViewId("com.whatsapp:id/search_src_text")
            if (!editTexts.isNullOrEmpty()) {
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, contactName)
                }
                editTexts[0].performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            }

            delay(1500)
            val resultRoot = rootInActiveWindow ?: return@launch
            val contactNodes = resultRoot.findAccessibilityNodeInfosByText(contactName)
            for (node in contactNodes) {
                if (node.isClickable) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    break
                } else if (node.parent?.isClickable == true) {
                    node.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    break
                }
            }

            delay(1500)
            val chatRoot = rootInActiveWindow ?: return@launch
            val entryNodes = chatRoot.findAccessibilityNodeInfosByViewId("com.whatsapp:id/entry")
            if (!entryNodes.isNullOrEmpty()) {
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, message)
                }
                entryNodes[0].performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                delay(800)
                clickWhatsAppSendButton()
            }
        }
    }

    /**
     * Sends message via Facebook Messenger.
     */
    fun sendMessengerMessage(target: String, message: String) {
        try {
            val cleanTarget = target.trim()
            val isCurrent = cleanTarget.isEmpty() || cleanTarget.equals("current", true) ||
                            cleanTarget.contains("ওপেন") || cleanTarget.contains("বর্তমান")
            if (isCurrent) {
                serviceScope.launch {
                    autoSendMessengerText(message)
                }
                return
            }

            val isIndex = cleanTarget.contains("প্রথম") || cleanTarget.contains("১ম") || cleanTarget.contains("1st") ||
                          cleanTarget.contains("দ্বিতীয়") || cleanTarget.contains("২য়") || cleanTarget.contains("2nd") ||
                          cleanTarget.contains("তৃতীয়") || cleanTarget.contains("৩য়") || cleanTarget.contains("3rd") ||
                          cleanTarget.contains("...") || cleanTarget.contains("ডট")

            if (isIndex || cleanTarget.any { it > '\u007F' }) {
                openApplication("messenger")
                serviceScope.launch {
                    delay(2000)
                    val root = rootInActiveWindow
                    if (root != null) {
                        if (cleanTarget.contains("দ্বিতীয়") || cleanTarget.contains("২য়") || cleanTarget.contains("2nd")) {
                            val listItems = mutableListOf<AccessibilityNodeInfo>()
                            findClickableNodes(root, listItems)
                            if (listItems.size >= 2) listItems[1].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        } else if (cleanTarget.contains("তৃতীয়") || cleanTarget.contains("৩য়") || cleanTarget.contains("3rd")) {
                            val listItems = mutableListOf<AccessibilityNodeInfo>()
                            findClickableNodes(root, listItems)
                            if (listItems.size >= 3) listItems[2].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        } else {
                            val nodes = root.findAccessibilityNodeInfosByText(cleanTarget)
                            if (nodes.isNotEmpty()) {
                                nodes.first().performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            } else {
                                val listItems = mutableListOf<AccessibilityNodeInfo>()
                                findClickableNodes(root, listItems)
                                if (listItems.isNotEmpty()) listItems[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            }
                        }
                    }
                    delay(1200)
                    autoSendMessengerText(message)
                }
                return
            }

            val uri = Uri.parse("https://m.me/$cleanTarget")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                setPackage("com.facebook.orca")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            Log.d(TAG, "Launched Messenger for target: $cleanTarget")

            serviceScope.launch {
                delay(2500)
                autoSendMessengerText(message)
            }
        } catch (e: Exception) {
            openApplication("messenger")
            serviceScope.launch {
                delay(2000)
                autoSendMessengerText(message)
            }
        }
    }

    private fun autoSendMessengerText(message: String) {
        val root = rootInActiveWindow ?: return
        val inputNodes = mutableListOf<AccessibilityNodeInfo>()
        findNodesByClassName(root, "EditText", inputNodes)
        if (inputNodes.isNotEmpty()) {
            val input = inputNodes.first()
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, message)
            }
            input.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            serviceScope.launch {
                delay(800)
                val currentRoot = rootInActiveWindow ?: return@launch
                val sendTexts = listOf("Send", "পাঠান", "সেন্ড")
                for (kw in sendTexts) {
                    val nodes = currentRoot.findAccessibilityNodeInfosByText(kw)
                    for (n in nodes) {
                        if (n.isClickable) { n.performAction(AccessibilityNodeInfo.ACTION_CLICK); return@launch }
                    }
                }
            }
        }
    }

    /**
     * Sends an Instagram Direct Message (DM) on mobile.
     */
    fun sendInstagramMessage(target: String, message: String) {
        val cleanTarget = target.trim()
        val isCurrent = cleanTarget.isEmpty() || cleanTarget.equals("current", true) ||
                        cleanTarget.contains("ওপেন") || cleanTarget.contains("বর্তমান")
        if (isCurrent) {
            serviceScope.launch { autoSendMessengerText(message) }
            return
        }

        try {
            val uri = if (cleanTarget.isNotEmpty() && !cleanTarget.contains("প্রথম") && !cleanTarget.contains("১ম")) {
                Uri.parse("https://instagram.com/_u/${cleanTarget.removePrefix("@")}")
            } else {
                Uri.parse("instagram://direct")
            }
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                setPackage("com.instagram.android")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            serviceScope.launch {
                delay(2500)
                autoSendMessengerText(message)
            }
        } catch (e: Exception) {
            openApplication("instagram")
            serviceScope.launch {
                delay(2000)
                autoSendMessengerText(message)
            }
        }
    }

    /**
     * Sends a Direct Message (DM) on X / Twitter on mobile.
     */
    fun sendTwitterMessage(target: String, message: String) {
        try {
            Log.d(TAG, "sendTwitterMessage to $target: $message")
            openApplication("twitter")
            serviceScope.launch {
                delay(2500)
                autoSendMessengerText(message)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error launching Twitter on mobile: ${e.message}")
        }
    }

    /**
     * Performs hands-free scrolling or swiping on mobile.
     */
    fun performScroll(direction: String) {
        val clean = direction.lowercase().trim()
        val root = rootInActiveWindow
        if (root != null) {
            val scrollNodes = mutableListOf<AccessibilityNodeInfo>()
            findScrollableNodes(root, scrollNodes)
            if (scrollNodes.isNotEmpty()) {
                val targetNode = scrollNodes.first()
                if (clean == "up") {
                    targetNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
                    return
                } else {
                    targetNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
                    return
                }
            }
        }

        // Gesture-based swipe fallback (Android 7.0+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val displayMetrics = resources.displayMetrics
            val width = displayMetrics.widthPixels.toFloat()
            val height = displayMetrics.heightPixels.toFloat()
            val path = Path()

            when (clean) {
                "up" -> { // scroll up -> swipe down
                    path.moveTo(width / 2f, height * 0.3f)
                    path.lineTo(width / 2f, height * 0.8f)
                }
                "left" -> { // swipe left
                    path.moveTo(width * 0.8f, height / 2f)
                    path.lineTo(width * 0.2f, height / 2f)
                }
                "right" -> { // swipe right
                    path.moveTo(width * 0.2f, height / 2f)
                    path.lineTo(width * 0.8f, height / 2f)
                }
                else -> { // scroll down -> swipe up
                    path.moveTo(width / 2f, height * 0.8f)
                    path.lineTo(width / 2f, height * 0.3f)
                }
            }

            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 350))
                .build()
            dispatchGesture(gesture, null, null)
            Log.d(TAG, "Dispatched scroll gesture: $clean")
        }
    }

    private fun findScrollableNodes(node: AccessibilityNodeInfo, results: MutableList<AccessibilityNodeInfo>) {
        if (node.isScrollable) {
            results.add(node)
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findScrollableNodes(child, results)
        }
    }

    /**
     * Opens Android Settings or System Update purely by voice.
     */
    fun openDeviceSettings(type: String) {
        val clean = type.lowercase().trim()
        val intent = when {
            clean.contains("update") || clean.contains("আপডেট") -> {
                Intent("android.settings.SYSTEM_UPDATE_SETTINGS")
            }
            clean.contains("security") || clean.contains("সিকিউরিটি") -> {
                Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS)
            }
            clean.contains("accessibility") || clean.contains("সহজ ব্যবহার") || clean.contains("প্রতিবন্ধী") -> {
                Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)
            }
            clean.contains("app") || clean.contains("অ্যাপস") -> {
                Intent(android.provider.Settings.ACTION_APPLICATION_SETTINGS)
            }
            clean.contains("wifi") || clean.contains("নেটওয়ার্ক") -> {
                Intent(android.provider.Settings.ACTION_WIFI_SETTINGS)
            }
            clean.contains("bluetooth") || clean.contains("ব্লুটুথ") -> {
                Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)
            }
            else -> Intent(android.provider.Settings.ACTION_SETTINGS)
        }
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        try {
            startActivity(intent)
            Log.d(TAG, "Opened device settings: $clean")
        } catch (e: Exception) {
            Log.e(TAG, "Error opening settings $clean: ${e.message}")
            try {
                val fallback = Intent(android.provider.Settings.ACTION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(fallback)
            } catch (ex: Exception) {
                Log.e(TAG, "Fallback settings failed: ${ex.message}")
            }
        }
    }

    /**
     * Clicks an element by visible text on mobile screen.
     */
    fun clickElementByText(text: String) {
        val root = rootInActiveWindow ?: return
        val nodes = root.findAccessibilityNodeInfosByText(text)
        for (node in nodes) {
            if (node.isClickable) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                Log.d(TAG, "Clicked element by text: $text")
                return
            } else if (node.parent?.isClickable == true) {
                node.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                Log.d(TAG, "Clicked parent of element: $text")
                return
            }
        }
    }

    /**
     * Answers incoming calls on mobile hands-free.
     */
    fun answerIncomingCall() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val tm = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED) {
                try {
                    tm?.acceptRingingCall()
                    Log.d(TAG, "TelecomManager accepted ringing call")
                    return
                } catch (e: Exception) {
                    Log.e(TAG, "Error accepting call via TelecomManager: ${e.message}")
                }
            }
        }
        val root = rootInActiveWindow ?: return
        val answerTexts = listOf("Answer", "Accept", "রিসিভ", "উত্তর দিন", "Receive")
        for (kw in answerTexts) {
            val nodes = root.findAccessibilityNodeInfosByText(kw)
            for (n in nodes) {
                if (n.isClickable) { n.performAction(AccessibilityNodeInfo.ACTION_CLICK); return }
            }
        }
    }

    /**
     * Ends active calls on mobile hands-free.
     */
    fun endActiveCall() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val tm = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED) {
                try {
                    tm?.endCall()
                    Log.d(TAG, "TelecomManager ended active call")
                    return
                } catch (e: Exception) {
                    Log.e(TAG, "Error ending call via TelecomManager: ${e.message}")
                }
            }
        }
        val root = rootInActiveWindow ?: return
        val endTexts = listOf("End", "Decline", "Reject", "কেটে দিন", "বাতিল", "Hang up")
        for (kw in endTexts) {
            val nodes = root.findAccessibilityNodeInfosByText(kw)
            for (n in nodes) {
                if (n.isClickable) { n.performAction(AccessibilityNodeInfo.ACTION_CLICK); return }
            }
        }
    }

    /**
     * Sends an SMS message to a contact or phone number using the specified SIM card slot.
     */
    fun sendSmsMessage(target: String, message: String, simSlot: Int = 1) {
        var phoneNumber = target.trim()
        if (!phoneNumber.any { it.isDigit() }) {
            val lookedUp = searchContactNumber(phoneNumber)
            if (lookedUp != null) {
                phoneNumber = lookedUp
            }
        }
        val cleanNumber = phoneNumber.replace(Regex("[^0-9+]"), "")
        if (cleanNumber.isEmpty()) {
            Log.w(TAG, "Cannot send SMS: invalid phone number for '$target'")
            return
        }

        val slotIndex = if (simSlot <= 1) 0 else 1
        var sentDirectly = false

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED) {
            try {
                var smsManager: android.telephony.SmsManager? = null
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
                    val subManager = getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
                    val subInfo = subManager?.getActiveSubscriptionInfoForSimSlotIndex(slotIndex)
                    if (subInfo != null) {
                        smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            getSystemService(android.telephony.SmsManager::class.java).createForSubscriptionId(subInfo.subscriptionId)
                        } else {
                            @Suppress("DEPRECATION")
                            android.telephony.SmsManager.getSmsManagerForSubscriptionId(subInfo.subscriptionId)
                        }
                    }
                }
                val manager = smsManager ?: @Suppress("DEPRECATION") android.telephony.SmsManager.getDefault()

                val parts = manager.divideMessage(message)
                if (parts.size > 1) {
                    manager.sendMultipartTextMessage(cleanNumber, null, parts, null, null)
                } else {
                    manager.sendTextMessage(cleanNumber, null, message, null, null)
                }
                sentDirectly = true
                Log.d(TAG, "SMS directly sent to $cleanNumber via SIM $simSlot: '$message'")
            } catch (e: Exception) {
                Log.e(TAG, "Error sending SMS directly: ${e.message}")
            }
        }

        // Fallback or visual feedback via SMS App intent
        if (!sentDirectly) {
            try {
                val smsIntent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$cleanNumber")).apply {
                    putExtra("sms_body", message)
                    putExtra("simSlot", slotIndex)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(smsIntent)
                Log.d(TAG, "Opened SMS app for $cleanNumber with prefilled text")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch SMS intent: ${e.message}")
            }
        }
    }

    /**
     * Initiates a voice or video call on WhatsApp.
     */
    fun makeWhatsAppCall(target: String, callType: String = "voice") {
        var phoneNumber = target.trim()
        if (!phoneNumber.any { it.isDigit() }) {
            val lookedUp = searchContactNumber(phoneNumber)
            if (lookedUp != null) {
                phoneNumber = lookedUp
            }
        }
        val cleanNumber = phoneNumber.replace(Regex("[^0-9]"), "")
        val isVideo = callType.lowercase().contains("video") || callType.contains("ভিডিও")

        if (cleanNumber.isNotEmpty()) {
            val phoneForWa = if (cleanNumber.startsWith("0")) "88$cleanNumber" else cleanNumber
            try {
                val uri = Uri.parse("https://api.whatsapp.com/send?phone=$phoneForWa")
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage("com.whatsapp")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(intent)
                Log.d(TAG, "Opened WhatsApp chat for call with $phoneForWa")

                serviceScope.launch {
                    delay(2500)
                    clickWhatsAppCallButton(isVideo)
                }
                return
            } catch (e: Exception) {
                Log.e(TAG, "Error opening WhatsApp chat for call: ${e.message}")
            }
        }

        // Fallback: search contact in WhatsApp and click call
        openApplication("whatsapp")
        serviceScope.launch {
            delay(2000)
            searchAndCallWhatsApp(target, isVideo)
        }
    }

    private fun clickWhatsAppCallButton(isVideo: Boolean): Boolean {
        val root = rootInActiveWindow ?: return false
        val buttonIds = if (isVideo) {
            listOf("com.whatsapp:id/video_call", "com.whatsapp:id/menuitem_video_call")
        } else {
            listOf("com.whatsapp:id/voice_call", "com.whatsapp:id/menuitem_call")
        }
        for (bId in buttonIds) {
            val nodes = root.findAccessibilityNodeInfosByViewId(bId)
            if (!nodes.isNullOrEmpty() && nodes[0].isClickable) {
                nodes[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                Log.d(TAG, "Clicked WhatsApp call button: $bId")
                return true
            }
        }
        val textKeywords = if (isVideo) listOf("Video call", "ভিডিও কল") else listOf("Voice call", "Call", "কল")
        for (kw in textKeywords) {
            val nodes = root.findAccessibilityNodeInfosByText(kw)
            for (node in nodes) {
                if (node.isClickable) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    return true
                }
            }
        }
        return false
    }

    private fun searchAndCallWhatsApp(contactName: String, isVideo: Boolean) {
        val root = rootInActiveWindow ?: return
        val searchNodes = root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/menuitem_search")
        if (!searchNodes.isNullOrEmpty()) {
            searchNodes[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }
        serviceScope.launch {
            delay(1500)
            val searchRoot = rootInActiveWindow ?: return@launch
            val editTexts = searchRoot.findAccessibilityNodeInfosByViewId("com.whatsapp:id/search_src_text")
            if (!editTexts.isNullOrEmpty()) {
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, contactName)
                }
                editTexts[0].performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
            }
            delay(1500)
            val resultRoot = rootInActiveWindow ?: return@launch
            val contactNodes = resultRoot.findAccessibilityNodeInfosByText(contactName)
            for (node in contactNodes) {
                if (node.isClickable) { node.performAction(AccessibilityNodeInfo.ACTION_CLICK); break }
                else if (node.parent?.isClickable == true) { node.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK); break }
            }
            delay(1800)
            clickWhatsAppCallButton(isVideo)
        }
    }

    /**
     * Initiates a voice or video call on Facebook Messenger.
     */
    fun makeMessengerCall(target: String, callType: String = "voice") {
        val isVideo = callType.lowercase().contains("video") || callType.contains("ভিডিও")
        try {
            val cleanTarget = target.trim()
            val uri = Uri.parse("https://m.me/$cleanTarget")
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                setPackage("com.facebook.orca")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            Log.d(TAG, "Launched Messenger for call target: $cleanTarget")

            serviceScope.launch {
                delay(2800)
                clickMessengerCallButton(isVideo)
            }
        } catch (e: Exception) {
            openApplication("messenger")
            serviceScope.launch {
                delay(2500)
                clickMessengerCallButton(isVideo)
            }
        }
    }

    private fun clickMessengerCallButton(isVideo: Boolean): Boolean {
        val root = rootInActiveWindow ?: return false
        val keywords = if (isVideo) listOf("Video Call", "Start Video Call", "ভিডিও কল") else listOf("Audio Call", "Start Call", "কল")
        for (kw in keywords) {
            val nodes = root.findAccessibilityNodeInfosByText(kw)
            for (node in nodes) {
                if (node.isClickable) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    return true
                }
            }
        }
        return false
    }

    private fun findNodesByClassName(node: AccessibilityNodeInfo?, targetClass: String, result: MutableList<AccessibilityNodeInfo>) {
        if (node == null) return
        if (node.className?.toString()?.contains(targetClass, ignoreCase = true) == true) {
            result.add(node)
        }
        for (i in 0 until node.childCount) {
            findNodesByClassName(node.getChild(i), targetClass, result)
        }
    }

    private fun findClickableNodes(node: AccessibilityNodeInfo?, result: MutableList<AccessibilityNodeInfo>) {
        if (node == null) return
        if (node.isClickable) {
            result.add(node)
        }
        for (i in 0 until node.childCount) {
            findClickableNodes(node.getChild(i), result)
        }
    }

    /**
     * Instantly locks the Android phone screen using official Android Accessibility API.
     */
    fun lockDevice(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val success = performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
            Log.d(TAG, "Lock device result: $success")
            success
        } else {
            Log.w(TAG, "GLOBAL_ACTION_LOCK_SCREEN requires Android 9 (Pie) or higher")
            false
        }
    }

    /**
     * Captures current mobile screen using AccessibilityService API (Android 11+)
     * and streams it to Jarvis via LiveKit DataChannel.
     */
    fun captureAndSendScreenshot() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                takeScreenshot(
                    Display.DEFAULT_DISPLAY,
                    mainExecutor,
                    object : TakeScreenshotCallback {
                        override fun onSuccess(screenshotResult: ScreenshotResult) {
                            serviceScope.launch(Dispatchers.Default) {
                                try {
                                    val hwBuffer = screenshotResult.hardwareBuffer
                                    val colorSpace = screenshotResult.colorSpace
                                    val bitmap = Bitmap.wrapHardwareBuffer(hwBuffer, colorSpace)
                                    if (bitmap != null) {
                                        val softBitmap = bitmap.copy(Bitmap.Config.ARGB_8888, false)
                                        hwBuffer.close()

                                        // Downscale to max dimension 800 for fast WebRTC DataChannel delivery
                                        val maxDim = 800
                                        val maxSide = Math.max(softBitmap.width, softBitmap.height)
                                        val scale = if (maxSide > maxDim) maxDim.toFloat() / maxSide else 1.0f
                                        val scaledBitmap = if (scale < 1.0f) {
                                            Bitmap.createScaledBitmap(
                                                softBitmap,
                                                (softBitmap.width * scale).toInt(),
                                                (softBitmap.height * scale).toInt(),
                                                true
                                            )
                                        } else {
                                            softBitmap
                                        }

                                        val baos = ByteArrayOutputStream()
                                        scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 60, baos)
                                        val base64Img = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)

                                        val packet = JSONObject().apply {
                                            put("type", "JARVIS_MOBILE_SCREENSHOT")
                                            put("image", base64Img)
                                        }
                                        JarvisForegroundService.instance?.sendDataPacket(packet)
                                        Log.d(TAG, "Sent mobile screenshot packet: ${baos.size()} bytes compressed")

                                        if (scaledBitmap != softBitmap) scaledBitmap.recycle()
                                        softBitmap.recycle()
                                        bitmap.recycle()
                                    } else {
                                        hwBuffer.close()
                                        Log.w(TAG, "Bitmap wrapHardwareBuffer returned null")
                                    }
                                } catch (e: Exception) {
                                    Log.e(TAG, "Error encoding screenshot: ${e.message}", e)
                                }
                            }
                        }

                        override fun onFailure(errorCode: Int) {
                            Log.e(TAG, "takeScreenshot failed with error code: $errorCode")
                        }
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Exception calling takeScreenshot: ${e.message}", e)
            }
        } else {
            Log.w(TAG, "Accessibility takeScreenshot requires Android 11 (API 30)+")
        }
    }

    /**
     * Opens apps by name or package identifier with comprehensive Bengali/English mapping
     * and dynamic fallback across all installed launcher applications.
     * NEVER redirects to a browser Google search if app is not found!
     */
    fun openApplication(appName: String) {
        val packageMap = mapOf(
            // Specific Official & Lite variants requested by user
            "facebook_official" to "com.facebook.katana",
            "facebook official" to "com.facebook.katana",
            "ফেসবুক অফিসিয়াল" to "com.facebook.katana",
            "ফেসবুক অফিশিয়াল" to "com.facebook.katana",
            "facebook_lite" to "com.facebook.lite",
            "facebook lite" to "com.facebook.lite",
            "ফেসবুক লাইট" to "com.facebook.lite",
            "messenger_lite" to "com.facebook.mlite",
            "messenger lite" to "com.facebook.mlite",
            "মেসেঞ্জার লাইট" to "com.facebook.mlite",
            "instagram_lite" to "com.instagram.lite",
            "instagram lite" to "com.instagram.lite",
            "ইনস্টাগ্রাম লাইট" to "com.instagram.lite",
            "youtube_music" to "com.google.android.apps.youtube.music",
            "youtube music" to "com.google.android.apps.youtube.music",
            "ইউটিউব মিউজিক" to "com.google.android.apps.youtube.music",
            "whatsapp_business" to "com.whatsapp.w4b",
            "whatsapp business" to "com.whatsapp.w4b",
            "হোয়াটসঅ্যাপ বিজনেস" to "com.whatsapp.w4b",

            // Bengali names
            "মেসেঞ্জার" to "com.facebook.orca",
            "ফেসবুক" to "com.facebook.katana",
            "এফবি" to "com.facebook.katana",
            "হোয়াটসঅ্যাপ" to "com.whatsapp",
            "ইউটিউব" to "com.google.android.youtube",
            "ক্যামেরা" to "com.android.camera",
            "গ্যালারি" to "com.google.android.apps.photos",
            "গ্যালারী" to "com.google.android.apps.photos",
            "সেটিংস" to "com.android.settings",
            "প্লে স্টোর" to "com.android.vending",
            "ডায়ালার" to "com.google.android.dialer",
            "ফোন" to "com.google.android.dialer",
            "কন্টাক্ট" to "com.google.android.contacts",
            "ক্রোম" to "com.android.chrome",
            "ব্রাউজার" to "com.android.chrome",
            "ইনস্টাগ্রাম" to "com.instagram.android",
            "ইন্সটাগ্রাম" to "com.instagram.android",
            "টুইটার" to "com.twitter.android",
            "টেলিগ্রাম" to "org.telegram.messenger",
            "ইমো" to "com.imo.android.imoim",
            "বিকাশ" to "com.bKash.customerapp",
            "নগদ" to "com.konasl.nagad",
            "রকেট" to "com.dbbl.mbs.apps.ayushman",
            // English names
            "messenger" to "com.facebook.orca",
            "facebook" to "com.facebook.katana",
            "fb" to "com.facebook.katana",
            "whatsapp" to "com.whatsapp",
            "youtube" to "com.google.android.youtube",
            "instagram" to "com.instagram.android",
            "twitter" to "com.twitter.android",
            "x" to "com.twitter.android",
            "telegram" to "org.telegram.messenger",
            "imo" to "com.imo.android.imoim",
            "tiktok" to "com.zhiliaoapp.musically",
            "chrome" to "com.android.chrome",
            "browser" to "com.android.chrome",
            "camera" to "com.android.camera",
            "settings" to "com.android.settings",
            "gallery" to "com.google.android.apps.photos",
            "photos" to "com.google.android.apps.photos",
            "playstore" to "com.android.vending",
            "play store" to "com.android.vending",
            "dialer" to "com.google.android.dialer",
            "phone" to "com.google.android.dialer",
            "contacts" to "com.google.android.contacts",
            "calculator" to "com.google.android.calculator",
            "calendar" to "com.google.android.calendar",
            "clock" to "com.google.android.deskclock",
            "maps" to "com.google.android.apps.maps",
            "gmail" to "com.google.android.gm",
            "bkash" to "com.bKash.customerapp",
            "nagad" to "com.konasl.nagad",
            "rocket" to "com.dbbl.mbs.apps.ayushman"
        )

        val cleanName = appName.lowercase().trim()
        var targetPackage = packageMap[cleanName]

        // If not in static map, dynamically query installed apps by label
        if (targetPackage == null) {
            try {
                val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
                    addCategory(Intent.CATEGORY_LAUNCHER)
                }
                val pkgAppsList = packageManager.queryIntentActivities(mainIntent, 0)
                for (resolveInfo in pkgAppsList) {
                    val label = resolveInfo.loadLabel(packageManager).toString().lowercase()
                    if (label.contains(cleanName) || (cleanName.length >= 3 && cleanName.contains(label))) {
                        targetPackage = resolveInfo.activityInfo.packageName
                        Log.d(TAG, "Found dynamic package match for '$appName': $targetPackage (label='$label')")
                        break
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Dynamic app search failed: ${e.message}")
            }
        }

        if (targetPackage == null) {
            targetPackage = cleanName
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(targetPackage)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
            startActivity(launchIntent)
            Log.d(TAG, "Launched application: $targetPackage")
        } else {
            Log.w(TAG, "App '$appName' ($targetPackage) is not installed on this device. (NO BROWSER REDIRECT)")
        }
    }

    /**
     * Opens YouTube and directly queries for the video.
     */
    fun searchAndPlayYouTube(query: String) {
        try {
            val intent = Intent(Intent.ACTION_SEARCH).apply {
                setPackage("com.google.android.youtube")
                putExtra("query", query)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(intent)
            Log.d(TAG, "YouTube search launched for: $query")
        } catch (e: Exception) {
            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/results?search_query=$query")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            startActivity(webIntent)
        }
    }

    /**
     * Automated Survey Assistant:
     * Inspects active window hierarchy, clicks first viable option, or clicks Next / Continue buttons.
     */
    fun performSurveyAutomation(): Boolean {
        val root = rootInActiveWindow ?: return false

        val nextKeywords = listOf("Next", "Continue", "Submit", "নেক্সট", "পরবর্তী", "Proceed", "Done", "Start")
        for (keyword in nextKeywords) {
            val nodes = root.findAccessibilityNodeInfosByText(keyword)
            for (node in nodes) {
                if (node.isClickable || node.parent?.isClickable == true) {
                    val target = if (node.isClickable) node else node.parent
                    target?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    Log.d(TAG, "Survey auto-click: clicked '$keyword' button")
                    return true
                }
            }
        }

        return clickFirstInteractiveOption(root)
    }

    private fun clickFirstInteractiveOption(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) return false

        val className = node.className?.toString() ?: ""
        if (className.contains("RadioButton") || className.contains("CheckBox")) {
            if (node.isClickable) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                Log.d(TAG, "Survey auto-click: selected option ($className)")
                return true
            } else if (node.parent?.isClickable == true) {
                node.parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                return true
            }
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            if (clickFirstInteractiveOption(child)) {
                return true
            }
        }
        return false
    }

    /**
     * Dispatches a tap gesture at specific coordinates on the mobile screen.
     */
    fun tapCoordinates(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply {
                moveTo(x, y)
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
                .build()
            dispatchGesture(gesture, null, null)
            Log.d(TAG, "Dispatched tap gesture at ($x, $y)")
        }
    }

    /**
     * Adjusts mobile media volume.
     */
    fun adjustVolume(increase: Boolean) {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val direction = if (increase) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
        audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI)
        Log.d(TAG, "Adjusted volume: increase=$increase")
    }

    fun setVolumePercent(percent: Int) {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val safePercent = percent.coerceIn(0, 100)
        val targetVol = (maxVol * safePercent) / 100
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetVol, AudioManager.FLAG_SHOW_UI)
        Log.d(TAG, "Set volume to $safePercent% (index: $targetVol/$maxVol)")
    }

    fun muteVolume() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, 0, AudioManager.FLAG_SHOW_UI)
        Log.d(TAG, "Muted volume")
    }

    fun adjustScreenBrightness(increase: Boolean) {
        try {
            val resolver = contentResolver
            val currentBrightness = Settings.System.getInt(resolver, Settings.System.SCREEN_BRIGHTNESS, 128)
            val delta = if (increase) 40 else -40
            val newBrightness = (currentBrightness + delta).coerceIn(10, 255)
            if (Settings.System.canWrite(applicationContext)) {
                Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, newBrightness)
                Log.d(TAG, "Adjusted screen brightness to: $newBrightness/255")
            } else {
                Log.w(TAG, "Cannot write system settings for brightness without permission")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Brightness adjustment exception: ${e.message}")
        }
    }

    fun setScreenBrightnessPercent(percent: Int) {
        try {
            val resolver = contentResolver
            val safePercent = percent.coerceIn(5, 100)
            val targetBrightness = (255 * safePercent) / 100
            if (Settings.System.canWrite(applicationContext)) {
                Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, targetBrightness)
                Log.d(TAG, "Set screen brightness to: $safePercent% ($targetBrightness/255)")
            } else {
                Log.w(TAG, "Cannot write system settings for brightness without permission")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Set brightness exception: ${e.message}")
        }
    }
}
