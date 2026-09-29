package com.jarvis.assistant.automation.whatsapp

import com.jarvis.assistant.automation.core.*
import kotlinx.coroutines.delay

/**
 * Closed-loop UI automation agent for WhatsApp.
 * Enforces explicit confirmation gates, stale-element protection, and honest result verification.
 */
class WhatsAppAgent(
    private val driver: ScreenDriver,
    private val observer: ScreenObserver,
    private val actionExecutor: UiActionExecutor,
    private val textExecutor: TextInputExecutor
) {
    // Currently active task
    var activeTask: WhatsAppTask? = null
        private set

    private var targetPackage: String = WhatsAppSelectors.PACKAGE_WHATSAPP

    /**
     * Executes a WhatsApp task according to its action plan.
     */
    suspend fun executeTask(task: WhatsAppTask): WhatsAppTask {
        // Enforce concurrency limit: only one active task at a time
        val current = activeTask
        if (current != null && current.status == WhatsAppStatus.IN_PROGRESS && current.taskId != task.taskId) {
            task.status = WhatsAppStatus.BUSY
            task.statusMessage = "Another WhatsApp task is currently running"
            return task
        }

        activeTask = task
        task.status = WhatsAppStatus.IN_PROGRESS

        // Check if WhatsApp or WhatsApp Business is installed
        val isWaInstalled = driver.isAppInstalled(WhatsAppSelectors.PACKAGE_WHATSAPP)
        val isW4bInstalled = driver.isAppInstalled(WhatsAppSelectors.PACKAGE_WHATSAPP_BUSINESS)

        if (!isWaInstalled && !isW4bInstalled) {
            task.status = WhatsAppStatus.APP_NOT_INSTALLED
            task.statusMessage = "WhatsApp is not installed on this device"
            return task
        }

        targetPackage = if (isWaInstalled) WhatsAppSelectors.PACKAGE_WHATSAPP else WhatsAppSelectors.PACKAGE_WHATSAPP_BUSINESS

        return when (task.action) {
            WhatsAppAction.SEND_MESSAGE -> executeSendMessage(task)
            WhatsAppAction.READ_UNREAD -> executeReadUnread(task)
            WhatsAppAction.READ_CHAT -> executeReadChat(task)
            WhatsAppAction.MUTE_CHAT -> executeMuteChat(task, mute = true)
            WhatsAppAction.UNMUTE_CHAT -> executeMuteChat(task, mute = false)
            WhatsAppAction.MARK_READ -> executeMarkRead(task)
            WhatsAppAction.SEARCH_CHAT -> executeSearchChat(task)
        }
    }

    /**
     * Handles external control signals (confirm, reject, cancel, resume, status).
     */
    suspend fun controlTask(command: String, taskId: String?): WhatsAppTask {
        val task = activeTask
        if (task == null || (taskId != null && task.taskId != taskId)) {
            return WhatsAppTask(
                taskId = taskId ?: "unknown",
                action = WhatsAppAction.SEND_MESSAGE,
                status = WhatsAppStatus.FAILED,
                statusMessage = "No matching task found to control"
            )
        }

        when (command.lowercase().trim()) {
            "confirm" -> {
                if (task.status == WhatsAppStatus.AWAITING_CONFIRMATION) {
                    task.isConfirmed = true
                    task.status = WhatsAppStatus.IN_PROGRESS
                    return resumeSendMessageAfterConfirmation(task)
                } else {
                    task.statusMessage = "Task is not awaiting confirmation"
                    return task
                }
            }
            "reject" -> {
                // Clear the typed draft so no message is left unsent
                textExecutor.clearField(WhatsAppSelectors.COMPOSE_FIELD, targetPackage)
                task.status = WhatsAppStatus.REJECTED
                task.statusMessage = "Draft discarded upon user rejection"
                activeTask = null
                return task
            }
            "cancel" -> {
                textExecutor.clearField(WhatsAppSelectors.COMPOSE_FIELD, targetPackage)
                task.status = WhatsAppStatus.CANCELLED
                task.statusMessage = "Task cancelled by user"
                activeTask = null
                return task
            }
            "status" -> return task
            "resume" -> {
                // Resume after user completed an interstitial
                val fresh = observer.captureFresh()
                val interstitial = InterstitialGuard.checkInterstitial(fresh)
                if (interstitial != null) {
                    task.status = WhatsAppStatus.USER_ACTION_REQUIRED
                    task.statusMessage = interstitial
                    return task
                }
                return executeTask(task)
            }
            else -> {
                task.statusMessage = "Unknown control command: $command"
                return task
            }
        }
    }

    private suspend fun executeSendMessage(task: WhatsAppTask): WhatsAppTask {
        val recipient = task.contactQuery?.trim()
        if (recipient.isNullOrEmpty()) {
            task.status = WhatsAppStatus.CONTACT_NOT_FOUND
            task.statusMessage = "Recipient contact name or phone number is missing"
            return task
        }

        val msgText = task.message?.trim()
        if (msgText.isNullOrEmpty()) {
            task.status = WhatsAppStatus.FAILED
            task.statusMessage = "Message content is empty"
            return task
        }

        task.currentStep = "OPEN_CHAT"
        val opened = openChatForRecipient(recipient)
        if (!opened) {
            task.status = WhatsAppStatus.CONTACT_NOT_FOUND
            task.statusMessage = "Could not find or open chat for '$recipient'"
            return task
        }
        task.resolvedContact = recipient

        task.currentStep = "TYPE_MESSAGE"
        val inputResult = textExecutor.executeInput(
            selector = WhatsAppSelectors.COMPOSE_FIELD,
            text = msgText,
            allowedPackage = targetPackage,
            verifyContent = true
        )

        when (inputResult) {
            is TextInputResult.InterstitialDetected -> {
                task.status = WhatsAppStatus.USER_ACTION_REQUIRED
                task.statusMessage = inputResult.reason
                return task
            }
            is TextInputResult.Success -> {
                // If caller requested draft mode only:
                if (task.mode == "draft") {
                    task.status = WhatsAppStatus.DRAFT_READY
                    task.statusMessage = "Message draft prepared for $recipient"
                    return task
                }

                // ==========================================
                // STRICT CONFIRMATION GATE
                // ==========================================
                task.currentStep = "CONFIRM_SEND"
                task.status = WhatsAppStatus.AWAITING_CONFIRMATION
                task.statusMessage = "Drafted message to '$recipient': \"$msgText\". Waiting for explicit user confirmation to send."
                return task
            }
            is TextInputResult.FieldNotFound -> {
                task.status = WhatsAppStatus.FAILED
                task.statusMessage = "Could not locate WhatsApp message compose field"
                return task
            }
            is TextInputResult.FieldNotEditable -> {
                task.status = WhatsAppStatus.FAILED
                task.statusMessage = inputResult.reason
                return task
            }
            is TextInputResult.VerificationFailed -> {
                task.status = WhatsAppStatus.FAILED
                task.statusMessage = "Message typing verification failed"
                return task
            }
            is TextInputResult.ActionFailed -> {
                task.status = WhatsAppStatus.FAILED
                task.statusMessage = inputResult.reason
                return task
            }
        }
    }

    /**
     * Resumes send flow ONLY after explicit confirmation has been recorded.
     */
    private suspend fun resumeSendMessageAfterConfirmation(task: WhatsAppTask): WhatsAppTask {
        // DEFENSE IN DEPTH: Refuse to execute send tap unless confirmed
        if (!task.isConfirmed) {
            task.status = WhatsAppStatus.FAILED
            task.statusMessage = "Security gate check failed: Task was not explicitly confirmed"
            return task
        }

        task.currentStep = "TAP_SEND"

        // Fresh observation to confirm Send button is enabled and visible
        val obs = observer.captureFresh()
        val sendBtn = TargetResolver.resolve(WhatsAppSelectors.SEND_BUTTON, obs, targetPackage)
        if (sendBtn == null || !sendBtn.enabled) {
            task.status = WhatsAppStatus.FAILED
            task.statusMessage = "Send button not found or disabled"
            return task
        }

        // Click send button
        val clickResult = actionExecutor.executeClick(
            selector = WhatsAppSelectors.SEND_BUTTON,
            expectation = UiExpectation.ScreenChanges,
            allowedPackage = targetPackage,
            maxRetries = 1
        )

        when (clickResult) {
            is ExecutionResult.Success -> {
                task.currentStep = "VERIFY_SENT"
                delay(600)
                val verifyObs = observer.captureFresh()
                // In WhatsApp, upon sending, the send button transforms back to the voice note mic button
                val sendButtonStillThere = TargetResolver.resolve(WhatsAppSelectors.SEND_BUTTON, verifyObs, targetPackage) != null
                if (!sendButtonStillThere) {
                    task.status = WhatsAppStatus.SENT
                    task.statusMessage = "Message verified sent to '${task.resolvedContact}'"
                } else {
                    task.status = WhatsAppStatus.SUBMITTED_UNVERIFIED
                    task.statusMessage = "Send was tapped, but delivery state could not be verified on screen"
                }
                activeTask = null
                return task
            }
            is ExecutionResult.InterstitialDetected -> {
                task.status = WhatsAppStatus.USER_ACTION_REQUIRED
                task.statusMessage = clickResult.reason
                return task
            }
            else -> {
                task.status = WhatsAppStatus.FAILED
                task.statusMessage = "Failed to tap WhatsApp send button"
                return task
            }
        }
    }

    private suspend fun executeReadUnread(task: WhatsAppTask): WhatsAppTask {
        // First check NotificationListenerService read-only path
        val notifCount = WhatsAppNotificationReader.getUnreadCount()
        if (notifCount > 0) {
            task.status = WhatsAppStatus.SENT // Reusing success
            task.statusMessage = WhatsAppNotificationReader.getSummary()
            return task
        }

        // If no notifications cached, open WhatsApp to inspect chat list
        driver.openApp(targetPackage)
        delay(1200)
        val obs = observer.captureFresh()
        val unreadTexts = obs.elements.filter { el ->
            el.visible && (el.bareResourceId.contains("unread") || el.contentDescription.contains("unread", ignoreCase = true))
        }

        task.status = WhatsAppStatus.SENT
        task.statusMessage = if (unreadTexts.isNotEmpty()) {
            "Found ${unreadTexts.size} chats with unread messages in WhatsApp."
        } else {
            "No unread messages found."
        }
        return task
    }

    private suspend fun executeReadChat(task: WhatsAppTask): WhatsAppTask {
        val contact = task.contactQuery?.trim()
        if (contact.isNullOrEmpty()) {
            task.status = WhatsAppStatus.CONTACT_NOT_FOUND
            task.statusMessage = "Contact name required to read chat"
            return task
        }

        val opened = openChatForRecipient(contact)
        if (!opened) {
            task.status = WhatsAppStatus.CONTACT_NOT_FOUND
            task.statusMessage = "Could not open chat with '$contact'"
            return task
        }

        delay(800)
        val obs = observer.captureFresh()
        // Extract visible message bubbles
        val messageElements = obs.elements.filter { el ->
            el.visible && el.text.isNotEmpty() &&
                    (el.bareResourceId.contains("message_text") || el.bareResourceId.contains("entry") == false) &&
                    el.text != "Type a message" && el.text != "Message"
        }

        val lastMessages = messageElements.takeLast(3).map { it.text }
        task.status = WhatsAppStatus.SENT
        task.statusMessage = if (lastMessages.isNotEmpty()) {
            "Last messages from $contact: " + lastMessages.joinToString(" | ")
        } else {
            "No recent text messages found in chat with $contact."
        }
        return task
    }

    private suspend fun executeMuteChat(task: WhatsAppTask, mute: Boolean): WhatsAppTask {
        val contact = task.contactQuery?.trim()
        if (!contact.isNullOrEmpty()) {
            openChatForRecipient(contact)
        }

        // Tap more options
        val moreResult = actionExecutor.executeClick(
            selector = WhatsAppSelectors.MORE_OPTIONS,
            allowedPackage = targetPackage
        )
        if (moreResult !is ExecutionResult.Success) {
            task.status = WhatsAppStatus.FAILED
            task.statusMessage = "Could not open chat options menu"
            return task
        }

        delay(300)
        val selector = if (mute) WhatsAppSelectors.MUTE_NOTIFICATIONS else WhatsAppSelectors.UNMUTE_NOTIFICATIONS
        val clickMute = actionExecutor.executeClick(selector = selector, allowedPackage = targetPackage)

        task.status = if (clickMute is ExecutionResult.Success) WhatsAppStatus.SENT else WhatsAppStatus.FAILED
        task.statusMessage = if (clickMute is ExecutionResult.Success) {
            if (mute) "Chat muted successfully" else "Chat unmuted successfully"
        } else {
            "Could not find ${if (mute) "Mute" else "Unmute"} option in menu"
        }
        return task
    }

    private suspend fun executeMarkRead(task: WhatsAppTask): WhatsAppTask {
        val contact = task.contactQuery?.trim()
        if (contact != null) {
            WhatsAppNotificationReader.removeNotification(contact)
        }
        task.status = WhatsAppStatus.SENT
        task.statusMessage = "Chat marked as read"
        return task
    }

    private suspend fun executeSearchChat(task: WhatsAppTask): WhatsAppTask {
        val query = task.contactQuery?.trim() ?: ""
        driver.openApp(targetPackage)
        delay(1000)

        // Tap search button
        actionExecutor.executeClick(WhatsAppSelectors.SEARCH_BUTTON, allowedPackage = targetPackage)
        delay(400)

        // Type search query
        textExecutor.executeInput(WhatsAppSelectors.SEARCH_INPUT, query, allowedPackage = targetPackage)
        delay(600)

        // Tap first result
        val obs = observer.captureFresh()
        val result = TargetResolver.resolve(WhatsAppSelectors.contactItem(query), obs, targetPackage)
        if (result != null) {
            driver.click(result.elementId, result.bounds)
            task.status = WhatsAppStatus.SENT
            task.statusMessage = "Opened chat for '$query'"
        } else {
            task.status = WhatsAppStatus.CONTACT_NOT_FOUND
            task.statusMessage = "No search result found for '$query'"
        }
        return task
    }

    private suspend fun openChatForRecipient(recipient: String): Boolean {
        driver.openApp(targetPackage)
        delay(1000)

        // Tap search
        val searchClicked = actionExecutor.executeClick(WhatsAppSelectors.SEARCH_BUTTON, allowedPackage = targetPackage)
        if (searchClicked !is ExecutionResult.Success) return false

        delay(400)
        // Type contact name
        val typed = textExecutor.executeInput(WhatsAppSelectors.SEARCH_INPUT, recipient, allowedPackage = targetPackage)
        if (typed !is TextInputResult.Success) return false

        delay(800)
        val obs = observer.captureFresh()
        val contactMatch = TargetResolver.resolve(WhatsAppSelectors.contactItem(recipient), obs, targetPackage)
        if (contactMatch != null) {
            driver.click(contactMatch.elementId, contactMatch.bounds)
            delay(800)
            return true
        }

        return false
    }
}
