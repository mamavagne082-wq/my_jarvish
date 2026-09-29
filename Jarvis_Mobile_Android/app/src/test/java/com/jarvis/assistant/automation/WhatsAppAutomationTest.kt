package com.jarvis.assistant.automation

import com.jarvis.assistant.automation.core.*
import com.jarvis.assistant.automation.whatsapp.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class WhatsAppAutomationTest {

    private lateinit var fakeDriver: FakeScreenDriver
    private lateinit var observer: ScreenObserver
    private lateinit var actionExecutor: UiActionExecutor
    private lateinit var textExecutor: TextInputExecutor
    private lateinit var whatsAppAgent: WhatsAppAgent

    @Before
    fun setUp() {
        fakeDriver = FakeScreenDriver()
        observer = ScreenObserver(fakeDriver)
        actionExecutor = UiActionExecutor(fakeDriver, observer)
        textExecutor = TextInputExecutor(fakeDriver, observer)
        whatsAppAgent = WhatsAppAgent(fakeDriver, observer, actionExecutor, textExecutor)
    }

    @Test
    fun testTargetResolverPriorityHierarchy() {
        val obsId = "obs-1"
        val elements = listOf(
            UiElement(
                elementId = "$obsId#0",
                observationId = obsId,
                index = 0,
                packageName = "com.whatsapp",
                className = "android.widget.TextView",
                text = "Send",
                contentDescription = "",
                resourceId = "other_id",
                bounds = ElementBounds(100, 100, 200, 200),
                clickable = true
            ),
            UiElement(
                elementId = "$obsId#1",
                observationId = obsId,
                index = 1,
                packageName = "com.whatsapp",
                className = "android.widget.ImageButton",
                text = "",
                contentDescription = "Send",
                resourceId = "send",
                bounds = ElementBounds(300, 300, 400, 400),
                clickable = true
            )
        )
        val observation = ScreenObservation(
            observationId = obsId,
            packageName = "com.whatsapp",
            windowClass = "com.whatsapp.Conversation",
            screenWidth = 1080,
            screenHeight = 2400,
            eventStamp = 1,
            windowStamp = 1,
            elements = elements
        )

        // Tier 1 (resourceId 'send') should beat Tier 3 (text 'Send')
        val resolved = TargetResolver.resolve(WhatsAppSelectors.SEND_BUTTON, observation)
        assertNotNull(resolved)
        assertEquals("$obsId#1", resolved?.elementId)
    }

    @Test
    fun testTaskStateMachineTransitions() {
        val sm = TaskStateMachine(TaskState.IDLE)
        assertEquals(TaskState.IDLE, sm.currentState)

        sm.transitionTo(TaskState.OPENING_APP)
        assertEquals(TaskState.OPENING_APP, sm.currentState)

        sm.transitionTo(TaskState.WAITING_FOR_UI)
        assertEquals(TaskState.WAITING_FOR_UI, sm.currentState)

        sm.transitionTo(TaskState.OBSERVING)
        sm.transitionTo(TaskState.RESOLVING_TARGET)
        sm.transitionTo(TaskState.VALIDATING_TARGET)
        sm.transitionTo(TaskState.WAITING_FOR_CONFIRMATION)

        // Cannot skip directly from WAITING_FOR_CONFIRMATION to COMPLETED (illegal move)
        try {
            sm.transitionTo(TaskState.COMPLETED)
            fail("Expected IllegalStateException on illegal transition")
        } catch (e: IllegalStateException) {
            // Expected
            assertEquals(TaskState.FAILED, sm.currentState)
        }
    }

    @Test
    fun testConfirmationGatePreventsAutonomousSend() = runBlocking {
        // Setup initial WhatsApp chat screen with compose field and send button
        val obsId = "obs-chat-1"
        val elements = listOf(
            UiElement(
                elementId = "$obsId#0",
                observationId = obsId,
                index = 0,
                packageName = "com.whatsapp",
                className = "android.widget.EditText",
                text = "",
                contentDescription = "Message",
                resourceId = "com.whatsapp:id/entry",
                bounds = ElementBounds(50, 2000, 800, 2100),
                clickable = true,
                editable = true
            ),
            UiElement(
                elementId = "$obsId#1",
                observationId = obsId,
                index = 1,
                packageName = "com.whatsapp",
                className = "android.widget.ImageButton",
                text = "",
                contentDescription = "Send",
                resourceId = "com.whatsapp:id/send",
                bounds = ElementBounds(850, 2000, 950, 2100),
                clickable = true
            ),
            UiElement(
                elementId = "$obsId#2",
                observationId = obsId,
                index = 2,
                packageName = "com.whatsapp",
                className = "android.widget.TextView",
                text = "Mummy",
                contentDescription = "Mummy",
                resourceId = "com.whatsapp:id/conversation_contact_name",
                bounds = ElementBounds(50, 100, 500, 200),
                clickable = true
            )
        )
        fakeDriver.currentObservation = ScreenObservation(
            observationId = obsId,
            packageName = "com.whatsapp",
            windowClass = "com.whatsapp.Conversation",
            screenWidth = 1080,
            screenHeight = 2400,
            eventStamp = 1,
            windowStamp = 1,
            elements = elements
        )

        val task = WhatsAppTask(
            taskId = "test-wa-1",
            action = WhatsAppAction.SEND_MESSAGE,
            contactQuery = "Mummy",
            message = "Main late aaunga"
        )

        // Execute task
        val result = whatsAppAgent.executeTask(task)

        // MUST stop at AWAITING_CONFIRMATION! Send button MUST NOT be tapped yet!
        assertEquals(WhatsAppStatus.AWAITING_CONFIRMATION, result.status)
        assertEquals("CONFIRM_SEND", result.currentStep)
        assertFalse("Task must not be marked confirmed", result.isConfirmed)
        assertFalse("Send button should NOT have been clicked yet", fakeDriver.tappedElementIds.contains("$obsId#1"))

        // Now test User Rejection:
        val rejectResult = whatsAppAgent.controlTask("reject", task.taskId)
        assertEquals(WhatsAppStatus.REJECTED, rejectResult.status)
        assertNull("Active task must be cleared on reject", whatsAppAgent.activeTask)
    }

    @Test
    fun testNotificationReaderSummary() {
        WhatsAppNotificationReader.clearAll()
        assertEquals(0, WhatsAppNotificationReader.getUnreadCount())

        val notif1 = WhatsAppNotification(
            conversationKey = "Papa",
            senderName = "Papa",
            previewText = "Ghar kab aaoge?",
            isGroup = false,
            timestamp = System.currentTimeMillis()
        )
        WhatsAppNotificationReader.recordNotification(notif1)

        assertEquals(1, WhatsAppNotificationReader.getUnreadCount())
        val summary = WhatsAppNotificationReader.getSummary()
        assertTrue(summary.contains("Papa"))
        assertTrue(summary.contains("Ghar kab aaoge?"))

        // Test hidden preview
        val notif2 = WhatsAppNotification(
            conversationKey = "Mummy",
            senderName = "Mummy",
            previewText = "",
            isGroup = false,
            timestamp = System.currentTimeMillis(),
            isPreviewHidden = true
        )
        WhatsAppNotificationReader.recordNotification(notif2)
        assertEquals(2, WhatsAppNotificationReader.getUnreadCount())
    }

    @Test
    fun testInterstitialGuardDetectsSecurityScreens() {
        val obsId = "obs-sec-1"
        val elements = listOf(
            UiElement(
                elementId = "$obsId#0",
                observationId = obsId,
                index = 0,
                packageName = "com.whatsapp",
                className = "android.widget.EditText",
                text = "",
                contentDescription = "Enter PIN",
                password = true,
                bounds = ElementBounds(100, 500, 900, 600)
            )
        )
        val observation = ScreenObservation(
            observationId = obsId,
            packageName = "com.whatsapp",
            windowClass = "com.whatsapp.IdentityVerificationActivity",
            screenWidth = 1080,
            screenHeight = 2400,
            eventStamp = 1,
            windowStamp = 1,
            elements = elements
        )

        val interstitial = InterstitialGuard.checkInterstitial(observation)
        assertNotNull("Should detect password/PIN challenge", interstitial)
    }
}
