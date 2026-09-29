package com.jarvis.assistant.automation.social

import android.content.Context
import com.jarvis.assistant.automation.core.*
import kotlinx.coroutines.delay

/**
 * Closed-loop UI automation agent for Instagram and Facebook.
 * Enforces explicit confirmation gates, window transition verification, and target exclusions.
 */
class SocialMediaAgent(
    private val context: Context,
    private val driver: ScreenDriver,
    private val observer: ScreenObserver,
    private val actionExecutor: UiActionExecutor,
    private val textExecutor: TextInputExecutor
) {
    var activeTask: SocialMediaTask? = null
        private set

    suspend fun executeTask(task: SocialMediaTask): SocialMediaTask {
        val current = activeTask
        if (current != null && current.status == SocialTaskStatus.IN_PROGRESS && current.taskId != task.taskId) {
            task.status = SocialTaskStatus.BUSY
            task.statusMessage = "Another social media task is currently running"
            return task
        }

        activeTask = task
        task.status = SocialTaskStatus.IN_PROGRESS

        val targetPkg = when (task.platform) {
            SocialPlatform.INSTAGRAM -> InstagramSelectors.PACKAGE_INSTAGRAM
            SocialPlatform.FACEBOOK -> {
                if (driver.isAppInstalled(FacebookSelectors.PACKAGE_FACEBOOK)) {
                    FacebookSelectors.PACKAGE_FACEBOOK
                } else {
                    FacebookSelectors.PACKAGE_FACEBOOK_LITE
                }
            }
        }

        if (!driver.isAppInstalled(targetPkg)) {
            task.status = SocialTaskStatus.APP_NOT_INSTALLED
            task.statusMessage = "${task.platform.name} is not installed on this device"
            return task
        }

        // Instagram has no text-only posts
        if (task.platform == SocialPlatform.INSTAGRAM && task.action == SocialAction.TEXT_POST) {
            task.status = SocialTaskStatus.UNSUPPORTED_ACTION
            task.statusMessage = "Instagram does not support text-only posts. Please provide a photo or video."
            return task
        }

        return when (task.platform) {
            SocialPlatform.INSTAGRAM -> executeInstagramTask(task)
            SocialPlatform.FACEBOOK -> executeFacebookTask(task, targetPkg)
        }
    }

    suspend fun controlTask(command: String, taskId: String?): SocialMediaTask {
        val task = activeTask
        if (task == null || (taskId != null && task.taskId != taskId)) {
            return SocialMediaTask(
                taskId = taskId ?: "unknown",
                platform = SocialPlatform.INSTAGRAM,
                action = SocialAction.POST,
                status = SocialTaskStatus.FAILED,
                statusMessage = "No matching social media task found to control"
            )
        }

        when (command.lowercase().trim()) {
            "confirm" -> {
                if (task.status == SocialTaskStatus.AWAITING_CONFIRMATION) {
                    task.isConfirmed = true
                    task.status = SocialTaskStatus.IN_PROGRESS
                    return resumePublishAfterConfirmation(task)
                } else {
                    task.statusMessage = "Task is not awaiting confirmation"
                    return task
                }
            }
            "reject" -> {
                task.status = SocialTaskStatus.REJECTED
                task.statusMessage = "Post cancelled upon user rejection"
                driver.pressBack()
                activeTask = null
                return task
            }
            "cancel" -> {
                task.status = SocialTaskStatus.CANCELLED
                task.statusMessage = "Task cancelled by user"
                driver.pressBack()
                activeTask = null
                return task
            }
            "status" -> return task
            "resume" -> {
                val fresh = observer.captureFresh()
                val interstitial = InterstitialGuard.checkInterstitial(fresh)
                if (interstitial != null) {
                    task.status = SocialTaskStatus.USER_ACTION_REQUIRED
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

    private suspend fun executeInstagramTask(task: SocialMediaTask): SocialMediaTask {
        // Media check
        val mediaResolution = MediaResolver.resolveMedia(context, task.mediaUri)
        if (mediaResolution is MediaResolver.MediaResolutionResult.MediaRequired) {
            task.status = SocialTaskStatus.MEDIA_REQUIRED
            task.statusMessage = "Please share the photo or video with Jarvis first via the share menu in your gallery"
            return task
        }
        if (mediaResolution is MediaResolver.MediaResolutionResult.InvalidMedia) {
            task.status = SocialTaskStatus.FAILED
            task.statusMessage = mediaResolution.reason
            return task
        }

        // Open Instagram app
        driver.openApp(InstagramSelectors.PACKAGE_INSTAGRAM)
        delay(1200)

        // Step 1: Tap Create button (+)
        task.currentStep = "TAP_CREATE"
        val createClick = actionExecutor.executeClick(
            selector = InstagramSelectors.CREATE_BUTTON,
            allowedPackage = InstagramSelectors.PACKAGE_INSTAGRAM
        )
        if (createClick !is ExecutionResult.Success) {
            task.status = SocialTaskStatus.FAILED
            task.statusMessage = "Could not locate Instagram create button"
            return task
        }

        delay(800)

        // Step 2: Loop Next button until caption field or share button appears (Lesson 3: wait for button OR destination)
        task.currentStep = "TAP_NEXT"
        var nextSteps = 0
        while (nextSteps < 4) {
            val obs = observer.captureFresh()
            val captionField = TargetResolver.resolve(InstagramSelectors.CAPTION_FIELD, obs, InstagramSelectors.PACKAGE_INSTAGRAM)
            val shareBtn = TargetResolver.resolve(InstagramSelectors.SHARE_FEED_BUTTON, obs, InstagramSelectors.PACKAGE_INSTAGRAM)
            if (captionField != null || shareBtn != null) {
                // Arrived at final edit/share screen
                break
            }

            val nextBtn = TargetResolver.resolve(InstagramSelectors.NEXT_BUTTON, obs, InstagramSelectors.PACKAGE_INSTAGRAM)
            if (nextBtn != null) {
                actionExecutor.executeClick(InstagramSelectors.NEXT_BUTTON, allowedPackage = InstagramSelectors.PACKAGE_INSTAGRAM)
                delay(800)
                nextSteps++
            } else {
                break
            }
        }

        // Step 3: Type caption if provided
        if (!task.caption.isNullOrEmpty()) {
            task.currentStep = "TYPE_CAPTION"
            textExecutor.executeInput(
                selector = InstagramSelectors.CAPTION_FIELD,
                text = task.caption,
                allowedPackage = InstagramSelectors.PACKAGE_INSTAGRAM
            )
        }

        // Step 4: If draft mode, stop here
        if (task.mode == "draft") {
            task.status = SocialTaskStatus.DRAFT_READY
            task.statusMessage = "Instagram post draft prepared"
            return task
        }

        // ==========================================
        // STRICT CONFIRMATION GATE
        // ==========================================
        task.currentStep = "CONFIRM_PUBLISH"
        task.status = SocialTaskStatus.AWAITING_CONFIRMATION
        val captionDesc = if (task.caption.isNullOrEmpty()) "no caption" else "\"${task.caption}\""
        task.statusMessage = "Ready to publish on Instagram with $captionDesc. Do you confirm to publish this post?"
        return task
    }

    private suspend fun resumePublishAfterConfirmation(task: SocialMediaTask): SocialMediaTask {
        // DEFENSE IN DEPTH: Publish step refuses to run unless task was explicitly confirmed
        if (!task.isConfirmed) {
            task.status = SocialTaskStatus.FAILED
            task.statusMessage = "Security gate check failed: Publish was not explicitly confirmed"
            return task
        }

        task.currentStep = "TAP_SHARE"

        val selector = when (task.platform) {
            SocialPlatform.INSTAGRAM -> {
                if (task.action == SocialAction.STORY) InstagramSelectors.SHARE_STORY_BUTTON
                else InstagramSelectors.SHARE_FEED_BUTTON
            }
            SocialPlatform.FACEBOOK -> FacebookSelectors.PUBLISH_BUTTON
        }

        val targetPkg = when (task.platform) {
            SocialPlatform.INSTAGRAM -> InstagramSelectors.PACKAGE_INSTAGRAM
            SocialPlatform.FACEBOOK -> FacebookSelectors.PACKAGE_FACEBOOK
        }

        val shareResult = actionExecutor.executeClick(
            selector = selector,
            expectation = UiExpectation.ScreenChanges,
            allowedPackage = targetPkg,
            maxRetries = 1
        )

        when (shareResult) {
            is ExecutionResult.Success -> {
                task.currentStep = "VERIFY_POST"
                delay(1000)
                task.status = SocialTaskStatus.PUBLISHED
                task.statusMessage = "Post successfully published to ${task.platform.name}"
                activeTask = null
                return task
            }
            else -> {
                task.status = SocialTaskStatus.SUBMITTED_UNVERIFIED
                task.statusMessage = "Publish tap submitted, awaiting final on-screen verification"
                activeTask = null
                return task
            }
        }
    }

    private suspend fun executeFacebookTask(task: SocialMediaTask, fbPackage: String): SocialMediaTask {
        driver.openApp(fbPackage)
        delay(1200)

        // Step 1: Tap composer entry
        task.currentStep = "OPEN_COMPOSER"
        val composerClick = actionExecutor.executeClick(FacebookSelectors.COMPOSER_ENTRY, allowedPackage = fbPackage)
        if (composerClick !is ExecutionResult.Success) {
            task.status = SocialTaskStatus.FAILED
            task.statusMessage = "Could not open Facebook post composer"
            return task
        }

        delay(800)

        // Step 2: Type post text
        val textToType = task.caption ?: ""
        if (textToType.isNotEmpty()) {
            task.currentStep = "TYPE_POST_TEXT"
            textExecutor.executeInput(FacebookSelectors.COMPOSER_INPUT, textToType, allowedPackage = fbPackage)
        }

        // Step 3: Tap Next if present
        val obs = observer.captureFresh()
        val nextBtn = TargetResolver.resolve(FacebookSelectors.NEXT_BUTTON, obs, fbPackage)
        if (nextBtn != null && nextBtn.enabled) {
            actionExecutor.executeClick(FacebookSelectors.NEXT_BUTTON, allowedPackage = fbPackage)
            delay(600)
        }

        // ==========================================
        // STRICT CONFIRMATION GATE
        // ==========================================
        task.currentStep = "CONFIRM_PUBLISH"
        task.status = SocialTaskStatus.AWAITING_CONFIRMATION
        task.statusMessage = "Facebook post drafted with content: \"$textToType\". Do you confirm to publish this post?"
        return task
    }
}
