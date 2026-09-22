package com.jarvis.assistant

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Path
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.ContactsContract
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

class JarvisAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "JarvisAccessibility"
        var instance: JarvisAccessibilityService? = null
            private set

        val isServiceRunning: Boolean
            get() = instance != null
    }

    private val serviceScope = CoroutineScope(Dispatchers.Main + Job())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "Jarvis Accessibility Service connected and active!")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Optional screen event monitoring
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
            "volume_up" -> adjustVolume(increase = true)
            "volume_down" -> adjustVolume(increase = false)
            "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            else -> Log.w(TAG, "Unknown mobile action: $action")
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
        var phoneNumber = target.trim()
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
                if (smsManager == null) {
                    @Suppress("DEPRECATION")
                    smsManager = android.telephony.SmsManager.getDefault()
                }

                val parts = smsManager.divideMessage(message)
                if (parts.size > 1) {
                    smsManager.sendMultipartTextMessage(cleanNumber, null, parts, null, null)
                } else {
                    smsManager.sendTextMessage(cleanNumber, null, message, null, null)
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
     * Opens apps by name or package identifier.
     */
    fun openApplication(appName: String) {
        val packageMap = mapOf(
            "youtube" to "com.google.android.youtube",
            "whatsapp" to "com.whatsapp",
            "facebook" to "com.facebook.katana",
            "messenger" to "com.facebook.orca",
            "chrome" to "com.android.chrome",
            "camera" to "com.android.camera",
            "settings" to "com.android.settings",
            "gallery" to "com.google.android.apps.photos",
            "playstore" to "com.android.vending",
            "dialer" to "com.google.android.dialer",
            "phone" to "com.google.android.dialer",
            "contacts" to "com.google.android.contacts"
        )

        val targetPackage = packageMap[appName.lowercase().trim()] ?: appName
        val launchIntent = packageManager.getLaunchIntentForPackage(targetPackage)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(launchIntent)
            Log.d(TAG, "Launched application: $targetPackage")
        } else {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=$appName"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Error launching app $appName: ${e.message}")
            }
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
        var clicked = false

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

        clicked = clickFirstInteractiveOption(root)
        return clicked
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
}
