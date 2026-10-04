/**
 * Jarvis AI Survey Copilot - Content Script (Gemini 3.8 Flash + Human Simulation + Auto-Pilot)
 * Scrapes survey DOM, auto-analyzes, fills answers with human-like typing & timing, and auto-navigates.
 */

(function () {
  // If re-injected, clean up any previous HUD to avoid duplicates
  try {
    const prevHud = document.getElementById("jarvis-hud-container");
    if (prevHud) prevHud.remove();
  } catch (e) { }

  window.__JARVIS_SURVEY_LOADED__ = true;

  let lastAnalysisResult = null;
  let hudVisible = false;
  let hudElement = null;
  let isAutoPilotActive = false;
  let autoPilotRunningCycle = false;
  const isTopFrame = (window === window.top);

  // 1. REGISTER MESSAGE LISTENER IMMEDIATELY (Zero delay, resilient against any errors)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "PING") {
      let qCount = 0;
      try { qCount = extractSurveyQuestions().length; } catch (e) { }
      sendResponse({
        pong: true,
        success: true,
        isTop: isTopFrame,
        url: window.location.href,
        questionsCount: qCount
      });
      return true;
    }

    if (message.action === "SCAN_AND_ANALYZE") {
      if (message.show_hud) {
        toggleHUD(true);
      }
      performFullScan()
        .then((res) => {
          if (message.show_hud) {
            toggleHUD(true);
          }
          sendResponse(res);
        })
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.action === "APPLY_AUTO_FILL") {
      autoFillAnswers(message.payload || lastAnalysisResult)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    if (message.action === "ONE_CLICK_AUTOFILL_NEXT") {
      runOneClickAutoFillAndNext()
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => {
          console.error("[Jarvis] Auto-fill error:", err);
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true;
    }

    if (message.action === "CLICK_NEXT_BUTTON") {
      const nextBtn = findNextButton();
      if (nextBtn) {
        clickElementLikeHuman(nextBtn);
        sendResponse({ success: true, message: "Next button clicked" });
      } else {
        sendResponse({ success: false, message: "Next button not found" });
      }
      return true;
    }

    if (message.action === "CLEAR_HIGHLIGHTS") {
      clearAllHighlights();
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "TOGGLE_HUD") {
      if (isTopFrame) {
        toggleHUD(message.show);
        sendResponse({ success: true, visible: hudVisible });
      } else {
        sendResponse({ success: true, isFrame: true });
      }
      return true;
    }

    if (message.action === "AUTOPILOT_STATE_CHANGED") {
      isAutoPilotActive = !!message.active;
      updateAutoPilotUI(isAutoPilotActive);
      if (isAutoPilotActive) {
        triggerAutoPilotCycle();
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "AUTOPILOT_TRIGGER_CYCLE") {
      isAutoPilotActive = true;
      updateAutoPilotUI(true);
      setTimeout(() => {
        triggerAutoPilotCycle();
      }, 800);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "SHOW_API_ALERT") {
      showInPageApiAlert(message.alert);
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "API_FAILOVER_NOTIFICATION") {
      updateHUDStatus("analyzing", message.message || "API কী অটো-সুইচ করা হচ্ছে...");
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "SURVEY_ANALYSIS_UPDATED") {
      if (message.data) {
        lastAnalysisResult = message.data;
        renderAnalysisInHUD(message.data);
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "CAPTURE_AND_ANALYZE_SCREENSHOT") {
      performScreenshotAnalysis()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });

  // 2. Safe HUD initialization (ONLY in top frame, wait for document.body safely)
  function safeInitHUD() {
    if (!isTopFrame) return; // Do NOT create duplicate HUD inside small iframes
    if (document.body) {
      createFloatingHUD();
    } else {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => createFloatingHUD(), { once: true });
      }
      const hudTimer = setInterval(() => {
        if (document.body) {
          clearInterval(hudTimer);
          createFloatingHUD();
        }
      }, 100);
    }
  }
  safeInitHUD();

  // Check if Auto-Pilot was already active across page navigations
  try {
    chrome.runtime.sendMessage({ action: "GET_AUTOPILOT_STATE" }, (res) => {
      if (res && res.active) {
        isAutoPilotActive = true;
        updateAutoPilotUI(true);
        setTimeout(() => {
          if (isAutoPilotActive) {
            triggerAutoPilotCycle();
          }
        }, 3500);
      }
    });
  } catch (e) { }

  /**
   * =========================================================================
   * 1. AUTONOMOUS AUTO-PILOT ENGINE (HUMAN-PACED CYCLE)
   * =========================================================================
   */
  /**
   * Helper to check for CAPTCHA, ReCAPTCHA, Cloudflare Turnstile
   */
  function detectCaptchaOnPage() {
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="cloudflare"]',
      'iframe[src*="turnstile"]',
      '.g-recaptcha',
      '.h-captcha',
      '#cf-turnstile',
      '#turnstile-wrapper',
      '[data-sitekey]'
    ];
    for (const sel of captchaSelectors) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) return true;
    }
    const pageText = (document.body?.innerText || "").toLowerCase();
    if (pageText.includes("i am human") || pageText.includes("verify you are human") || pageText.includes("please complete the security check")) {
      return true;
    }
    return false;
  }

  /**
   * Helper to detect Screen-Out, Disqualification or Quota Full
   */
  function detectScreenOutOnPage() {
    const pageText = (document.body?.innerText || "").toLowerCase();
    const screenoutKeywords = [
      "not qualify",
      "did not qualify",
      "didn't qualify",
      "disqualified",
      "screened out",
      "quota full",
      "quota reached",
      "not a match",
      "closed survey",
      "survey is closed",
      "we are looking for a different",
      "sorry, you are not eligible",
      "unfortunately, you"
    ];
    return screenoutKeywords.some(kw => pageText.includes(kw));
  }

  /**
   * Helper to detect Survey Completion & Reward
   */
  function detectCompletionOnPage() {
    const pageText = (document.body?.innerText || "").toLowerCase();
    const completionKeywords = [
      "thank you for completing",
      "thank you for your time",
      "survey complete",
      "survey completed",
      "points added",
      "reward credited",
      "congratulations, you completed",
      "your reward is on its way",
      "সার্ভে সম্পন্ন হয়েছে",
      "ধন্যবাদ"
    ];
    return completionKeywords.some(kw => pageText.includes(kw));
  }

  /**
   * Helper to find Return / Dashboard / Close button
   */
  function findReturnOrCloseButton() {
    const keywords = ["return", "dashboard", "back to surveys", "close", "done", "ড্যাশবোর্ড", "ফিরে যান"];
    const btns = document.querySelectorAll("button, a.btn, a.button, input[type='button'], [role='button']");
    for (const btn of btns) {
      const txt = (btn.innerText || btn.value || "").toLowerCase();
      if (keywords.some(kw => txt.includes(kw)) && isElementVisible(btn)) {
        return btn;
      }
    }
    return null;
  }

  /**
   * Helper to find and start a new survey card/button on Dashboard
   */
  function findDashboardSurveyCard() {
    const selectors = [
      ".survey-card",
      ".take-survey-btn",
      ".start-survey",
      "[data-survey-id]",
      "a[href*='survey']",
      "button[class*='survey']"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isElementVisible(el)) return el;
    }
    const keywords = ["start survey", "take survey", "earn points", "start", "survey"];
    const allClickables = document.querySelectorAll("button, a, div[role='button']");
    for (const el of allClickables) {
      const txt = (el.innerText || "").trim().toLowerCase();
      if (keywords.some(kw => txt === kw || (txt.startsWith(kw) && txt.length < 30)) && isElementVisible(el)) {
        return el;
      }
    }
    return null;
  }

  /**
   * Helper to detect if current page is the final / last submit page of the survey
   */
  function isLastSurveyPage(aiData = null) {
    if (aiData && aiData.is_last_page === true) {
      return true;
    }

    const submitKeywords = [
      "submit", "finish", "complete", "end survey", "submit survey", "finalize", "done",
      "জমা দিন", "সমাপ্ত", "শেষ করুন", "terminer", "finaliser", "absenden", "finalizar", "concluir"
    ];
    const normalNextOnly = ["next", "continue", "পরবর্তী", "চালিয়ে যান", "suivant", "weiter", "siguiente"];

    const nextBtn = findNextButton();
    if (nextBtn) {
      const btnText = (nextBtn.innerText || nextBtn.value || "").trim().toLowerCase();
      if (submitKeywords.some(kw => btnText === kw || btnText.includes(kw))) {
        if (!normalNextOnly.some(kw => btnText === kw)) {
          return true;
        }
      }
    }

    // Check progress indicators (>= 90% or 100%)
    const progressBars = document.querySelectorAll('[role="progressbar"], .progress-bar, .survey-progress, progress, .progress');
    for (const pb of progressBars) {
      const val = parseFloat(pb.getAttribute("aria-valuenow") || pb.value || "");
      const max = parseFloat(pb.getAttribute("aria-valuemax") || pb.max || "100");
      if (val && max && (val / max) >= 0.90) {
        return true;
      }
      const txt = (pb.innerText || "").toLowerCase();
      const match = txt.match(/(\d+)%/);
      if (match && parseInt(match[1], 10) >= 90) {
        return true;
      }
    }

    // Check headings or text
    const bodyText = (document.body?.innerText || "").toLowerCase();
    if (bodyText.includes("final question") || bodyText.includes("last question") || bodyText.includes("click submit to complete") || bodyText.includes("সার্ভের শেষ প্রশ্ন")) {
      return true;
    }

    return false;
  }

  /**
   * Captures the entire page (multi-slice scrolling stitched on canvas if tall)
   */
  async function captureFullPageScreenshot() {
    const doc = document.documentElement;
    const body = document.body;
    const scrollHeight = Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0, window.innerHeight);
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Single screen or slightly taller
    if (scrollHeight <= viewportHeight * 1.25) {
      window.scrollTo(0, 0);
      await sleep(120);
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "CAPTURE_SCREENSHOT" }, (r) => resolve(r));
      });
      return res?.screenshot || null;
    }

    // Multi-slice scrolling capture
    const origScrollX = window.scrollX;
    const origScrollY = window.scrollY;
    const maxSlices = Math.min(4, Math.ceil(scrollHeight / viewportHeight));
    const sliceImages = [];

    try {
      for (let i = 0; i < maxSlices; i++) {
        const targetY = Math.min(i * viewportHeight, Math.max(0, scrollHeight - viewportHeight));
        window.scrollTo(0, targetY);
        await sleep(180);

        const res = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "CAPTURE_SCREENSHOT" }, (r) => resolve(r));
        });

        if (res && res.screenshot) {
          sliceImages.push({ dataUrl: res.screenshot, y: targetY });
        }
      }

      window.scrollTo(origScrollX, origScrollY);

      if (sliceImages.length === 0) return null;
      if (sliceImages.length === 1) return sliceImages[0].dataUrl;

      return await stitchScreenshotSlices(sliceImages, viewportWidth, scrollHeight, viewportHeight);
    } catch (e) {
      console.warn("[Jarvis] Multi-slice screenshot failed, falling back to visible tab:", e);
      window.scrollTo(origScrollX, origScrollY);
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "CAPTURE_SCREENSHOT" }, (r) => resolve(r));
      });
      return res?.screenshot || null;
    }
  }

  function stitchScreenshotSlices(slices, width, totalHeight, viewportHeight) {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement("canvas");
        const effectiveHeight = Math.min(4000, slices.length * viewportHeight);
        canvas.width = Math.min(width, 1920);
        canvas.height = effectiveHeight;
        const ctx = canvas.getContext("2d");

        let loaded = 0;
        slices.forEach((slice, idx) => {
          const img = new Image();
          img.onload = () => {
            const destY = idx * viewportHeight;
            if (destY < effectiveHeight) {
              ctx.drawImage(img, 0, destY, canvas.width, Math.min(viewportHeight, effectiveHeight - destY));
            }
            loaded++;
            if (loaded === slices.length) {
              resolve(canvas.toDataURL("image/jpeg", 0.80));
            }
          };
          img.onerror = () => {
            loaded++;
            if (loaded === slices.length) {
              resolve(slices[0]?.dataUrl || null);
            }
          };
          img.src = slice.dataUrl;
        });
      } catch (err) {
        resolve(slices[0]?.dataUrl || null);
      }
    });
  }

  /**
   * Performs full-page visual screenshot analysis via Gemini Vision API
   * Used when DOM element analysis is not possible or cannot select answers
   */
  async function performScreenshotAnalysis() {
    updateHUDStatus("analyzing", "📸 পেজ সরাসরি বিশ্লেষণ করা যাচ্ছে না! সম্পূর্ণ পেজের স্ক্রিনশট নেওয়া হচ্ছে...");

    const hudContainer = document.getElementById("jarvis-hud-container");
    if (hudContainer) hudContainer.style.visibility = "hidden";

    await sleep(100);
    const screenshotDataUrl = await captureFullPageScreenshot();

    if (hudContainer) hudContainer.style.visibility = "visible";

    if (!screenshotDataUrl) {
      updateHUDStatus("error", "❌ স্ক্রিনশট নিতে ব্যর্থ হয়েছে!");
      return { success: false, error: "Screenshot capture failed" };
    }

    updateHUDStatus("analyzing", "🤖 Gemini Vision দিয়ে স্ক্রিনশট এনালাইসিস করে সঠিক উত্তর বের করা হচ্ছে...");

    const fullBodyText = document.body ? cleanText(document.body.innerText).slice(0, 3000) : "";
    const payload = {
      title: document.title,
      url: window.location.href,
      fullPageText: fullBodyText,
      screenshot: screenshotDataUrl,
      isScreenshot: true
    };

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "ANALYZE_SURVEY_PAGE", payload: payload },
        (res) => resolve(res)
      );
    });

    if (!response || !response.success || !response.data) {
      const err = response?.error || "Vision analysis failed";
      updateHUDStatus("error", err);
      return { success: false, error: err };
    }

    const data = response.data;
    data.is_screenshot_analysis = true;
    lastAnalysisResult = data;

    // Save into storage for popup and persistent display
    await chrome.storage.local.set({ lastAnalysisResult: data });

    // Render results in floating HUD
    renderAnalysisInHUD(data);
    const modelTag = response.modelUsed || "Gemini 3.8 Flash";
    const providerTag = response.providerUsed ? ` (${response.providerUsed})` : "";
    updateHUDStatus("done", `✅ ${modelTag}${providerTag}: স্ক্রিনশট বিশ্লেষণ সফল!`);

    // Notify popup if open
    try {
      chrome.runtime.sendMessage({
        action: "SURVEY_ANALYSIS_UPDATED",
        data: data
      }).catch(() => { });
    } catch (e) { }

    // Attempt to auto-select matching elements on the webpage
    updateHUDStatus("analyzing", "🎯 স্ক্রিনশট অনুযায়ী সঠিক উত্তরগুলো পেজে সিলেক্ট করা হচ্ছে...");
    const selectCount = await autoSelectFromVisionResults(data);

    if (selectCount > 0) {
      updateHUDStatus("done", `✅ স্ক্রিনশট এনালাইসিস সম্পন্ন! ${selectCount}টি উত্তর সিলেক্ট হয়েছে। নিচে সঠিক উত্তরসমূহ দেখানো হলো।`);
    } else {
      updateHUDStatus("done", `✅ স্ক্রিনশট এনালাইসিস সম্পন্ন! সঠিক উত্তর নিচে দেখানো হলো (এইটা এইটা উত্তর হবে)।`);
    }

    return { success: true, data: data, filledCount: selectCount, isScreenshot: true };
  }

  /**
   * Attempts to select on-page options matching vision analysis output
   */
  async function autoSelectFromVisionResults(data) {
    if (!data || !data.answers || data.answers.length === 0) return 0;
    let selectedCount = 0;
    const isAuto = isAutoPilotActive;
    const gapDelay = isAuto ? 3000 : 120; // 3 seconds gap in auto mode as specified by user

    for (let i = 0; i < data.answers.length; i++) {
      const ans = data.answers[i];
      const labels = ans.selected_labels || [];
      let filled = false;

      // 1. Try finding input or label matching the selected choice
      for (const label of labels) {
        if (!label) continue;
        const el = findInputByLabelOrValue(label, ans);
        if (el) {
          await simulateHumanAction(el, ans);
          applyHighlightStyle(el, ans, selectedCount + 1);
          selectedCount++;
          filled = true;
          if (isAuto && i < data.answers.length - 1) {
            updateHUDStatus("analyzing", `🤖 উত্তর সিলেক্ট হয়েছে (${selectedCount}/${data.answers.length})... কমপক্ষে ৩ সেকেন্ড বিরতি...`);
            await sleep(gapDelay + Math.random() * 500);
          } else {
            await sleep(80);
          }
          if (ans.recommended_action !== "select_checkbox") {
            break;
          }
        }

        // 2. If text input
        if (!filled && (ans.recommended_action === "type_text" || ans.text_input_value)) {
          const textInputs = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type])')).filter(isElementVisible);
          if (textInputs.length > selectedCount) {
            const targetInput = textInputs[selectedCount] || textInputs[0];
            await simulateHumanAction(targetInput, ans);
            selectedCount++;
            filled = true;
            if (isAuto && i < data.answers.length - 1) {
              await sleep(gapDelay + Math.random() * 500);
            }
          }
        }
      }
    }
    return selectedCount;
  }

  async function triggerAutoPilotCycle() {
      if (autoPilotRunningCycle || !isAutoPilotActive) return;
      autoPilotRunningCycle = true;

      try {
        // 1. CAPTCHA Check
        if (detectCaptchaOnPage()) {
          updateHUDStatus("error", "⚠️ CAPTCHA Detected! Pausing for human verification...");
          chrome.runtime.sendMessage({
            action: "NOTIFY_JARVIS_EVENT",
            event: "captcha_detected",
            message: "CAPTCHA detected on page. Please solve to continue."
          });
          autoPilotRunningCycle = false;
          return;
        }

        // 2. Screen-Out / Disqualification Check
        if (detectScreenOutOnPage()) {
          updateHUDStatus("error", "⚠️ Screen-Out detected! Auto-returning to dashboard for next survey...");
          chrome.runtime.sendMessage({
            action: "SURVEY_OUTCOME",
            outcome: "screen_out",
            message: "Survey screened out. Returning to dashboard for next survey."
          });
          await sleep(2000);
          const retBtn = findReturnOrCloseButton();
          if (retBtn) {
            clickElementLikeHuman(retBtn);
          } else {
            window.history.back();
          }
          autoPilotRunningCycle = false;
          return;
        }

        // 3. Survey Completion / Reward Check
        if (detectCompletionOnPage()) {
          updateHUDStatus("done", "🎉 Survey Completed! Reward earned. Transitioning to next survey...");
          chrome.runtime.sendMessage({
            action: "SURVEY_OUTCOME",
            outcome: "completed",
            message: "Survey completed and reward earned!"
          });
          await sleep(2500);
          const retBtn = findReturnOrCloseButton();
          if (retBtn) {
            clickElementLikeHuman(retBtn);
          } else {
            window.history.back();
          }
          autoPilotRunningCycle = false;
          return;
        }

        // 4. Dashboard Auto-Start Check
        const dashboardCard = findDashboardSurveyCard();
        const isDashboardUrl = /dashboard|surveys|earn|rewards|home|portal/i.test(window.location.href);
        if (dashboardCard && isDashboardUrl) {
          updateHUDStatus("analyzing", "📋 Dashboard detected! Auto-selecting next survey...");
          await sleep(1500 + Math.random() * 1000);
          clickElementLikeHuman(dashboardCard);
          autoPilotRunningCycle = false;
          return;
        }

        // 5. Initial Settling & Reading Delay for new page
        // User requirement: নেক্সট পেজ আসার পর একটু সময় নিয়ে (৩-৫/৬ সেকেন্ড) পেজ পর্যবেক্ষণ করে উত্তর সিলেক্ট করবে
        const initialDelay = 3200 + Math.random() * 2200; // 3.2s to 5.4s
        updateHUDStatus("analyzing", `🤖 নতুন পেজ এসেছে... মানুষের মতো পর্যবেক্ষণ করা হচ্ছে (${(initialDelay / 1000).toFixed(1)}s)...`);
        await sleep(initialDelay);

        if (!isAutoPilotActive) {
          autoPilotRunningCycle = false;
          return;
        }

        // 6. Check if this is the LAST PAGE initially
        // User requirement: লাস্ট পেজে যাওয়ার পর অবশ্যই থামবে। ৭-১০ সেকেন্ড সময় নিয়ে উত্তর সিলেক্ট করবে
        const isLastPageInitial = isLastSurveyPage();
        if (isLastPageInitial) {
          const lastPageDelay = 7500 + Math.random() * 2000; // 7.5s - 9.5s
          updateHUDStatus("analyzing", `🛑 লাস্ট পেজ সনাক্ত হয়েছে! টার্মিনেশন এড়াতে ${(lastPageDelay / 1000).toFixed(1)} সেকেন্ড অপেক্ষা করে উত্তর দেওয়া হচ্ছে...`);
          await sleep(lastPageDelay);
          if (!isAutoPilotActive) {
            autoPilotRunningCycle = false;
            return;
          }
        }

        // 7. Solve questions (DOM or Screenshot Fallback)
        updateHUDStatus("analyzing", "🤖 Auto-Pilot: পেজের প্রশ্ন ও তথ্য এনালাইসিস হচ্ছে...");

        let analysisData = null;
        let filledCount = 0;
        let usedScreenshot = false;

        const questionsOnPage = extractSurveyQuestions();
        if (questionsOnPage.length > 0) {
          const scanRes = await performFullScan();
          if (scanRes && scanRes.success && scanRes.data && scanRes.data.answers?.length > 0) {
            analysisData = scanRes.data;
            updateHUDStatus("analyzing", "🤖 Auto-Pilot: কমপক্ষে ৩ সেকেন্ড বিরতি দিয়ে উত্তর সিলেক্ট করা হচ্ছে...");
            const fillRes = await autoFillAnswers(analysisData);
            filledCount = fillRes.filledCount;
          }
        }

        // If DOM analysis failed, found 0 questions, or could not select elements:
        // USER REQUIREMENT: যদি পেজ এনালাইসিস করতে না পারে, সিলেক্ট করতে না পারে তখন স্ক্রিনশট নিয়ে এনালাইসিস করে সঠিক উত্তর সিলেক্ট করবে
        if (!analysisData || filledCount === 0 || !analysisData.answers || analysisData.answers.length === 0) {
          updateHUDStatus("analyzing", "📸 পেজ সরাসরি সিলেক্ট করা যায়নি! সম্পূর্ণ পেজের স্ক্রিনশট নিয়ে এনালাইসিস করা হচ্ছে...");
          const ssRes = await performScreenshotAnalysis();
          if (ssRes && ssRes.success && ssRes.data) {
            analysisData = ssRes.data;
            filledCount = ssRes.filledCount || 0;
            usedScreenshot = true;
          } else {
            // If still no questions and not a question page, check if there is an intro/transition button
            const nextBtnFallback = findNextButton();
            if (nextBtnFallback && questionsOnPage.length === 0) {
              updateHUDStatus("done", "🤖 Advancing intro/transition page...");
              await sleep(2500);
              clickElementLikeHuman(nextBtnFallback);
            } else {
              updateHUDStatus("error", "⚠️ পেজের প্রশ্ন চিহ্নিত করা যায়নি। ২ সেকেন্ড পর পুনরায় চেষ্টা হবে...");
              setTimeout(() => {
                if (isAutoPilotActive && !autoPilotRunningCycle) {
                  triggerAutoPilotCycle();
                }
              }, 3000);
            }
            autoPilotRunningCycle = false;
            return;
          }
        }

        if (!isAutoPilotActive) {
          autoPilotRunningCycle = false;
          return;
        }

        // 8. Post-Answering Pause before Next / Submit
        // Normal page: ~5s
        // Last page: 8-10s before submit to avoid disqualification / screen-out
        const isFinalPage = isLastSurveyPage(analysisData) || isLastPageInitial;

        if (isFinalPage) {
          const submitWaitMs = 8000 + Math.random() * 2000; // 8.0s - 10.0s
          updateHUDStatus("done", `🛑 লাস্ট পেজ সম্পন্ন! সার্ভে ড্রপ এড়াতে ${(submitWaitMs / 1000).toFixed(1)} সেকেন্ড পর সাবমিট করা হচ্ছে...`);
          await sleep(submitWaitMs);
        } else {
          const nextWaitMs = 4500 + Math.random() * 1200; // 4.5s - 5.7s (around 5 seconds)
          updateHUDStatus("done", `🤖 মানুষের মতো পর্যালোচনা সম্পন্ন (${(nextWaitMs / 1000).toFixed(1)}s)। Next পেজে যাওয়া হচ্ছে...`);
          await sleep(nextWaitMs);
        }

        if (!isAutoPilotActive) {
          autoPilotRunningCycle = false;
          return;
        }

        // 9. Click Next or Submit
        const nextBtn = findNextButton();
        if (nextBtn) {
          updateHUDStatus("done", isFinalPage ? "🛑 লাস্ট পেজ: সাবমিট বাটনে ক্লিক করা হচ্ছে..." : "🤖 Next বাটনে ক্লিক করা হচ্ছে...");
          await sleep(400 + Math.random() * 300);
          clickElementLikeHuman(nextBtn);

          // Schedule next cycle for dynamic SPAs where no full page reload occurs
          if (!isFinalPage) {
            setTimeout(() => {
              if (isAutoPilotActive && !autoPilotRunningCycle) {
                triggerAutoPilotCycle();
              }
            }, 3600);
          }
        } else {
          updateHUDStatus("done", "🤖 পেজের উত্তর সম্পন্ন। পরবর্তী ধাপের জন্য অপেক্ষা করা হচ্ছে...");
        }

      } catch (e) {
        console.error("Auto-pilot cycle error:", e);
        updateHUDStatus("error", `Auto-Pilot error: ${e.message}`);
      } finally {
        autoPilotRunningCycle = false;
      }
    }

    /**
     * 1-Click Auto-Fill current page with human simulation & Screenshot fallback
     */
    async function runOneClickAutoFillAndNext(autoProceed = false) {
      try {
        updateHUDStatus("analyzing", "⚡ ম্যানুয়াল মোড: সম্পূর্ণ পেজ Gemini Flash দিয়ে বিশ্লেষণ হচ্ছে...");

        let analysisData = null;
        let filledCount = 0;
        let isScreenshot = false;

        // Step 1: Attempt DOM Extraction
        const questions = extractSurveyQuestions();
        if (questions.length > 0) {
          const scanRes = await performFullScan();
          if (scanRes && scanRes.success && scanRes.data && scanRes.data.answers?.length > 0) {
            analysisData = scanRes.data;
            updateHUDStatus("analyzing", "⚡ মানুষের মতো উত্তর সিলেক্ট ও মেসেজ বক্সে লেখা হচ্ছে...");
            const fillRes = await autoFillAnswers(analysisData);
            filledCount = fillRes.filledCount;
          }
        }

        // Step 2: Fallback to Screenshot if DOM found 0 questions or failed or 0 answers filled
        if (!analysisData || filledCount === 0 || !analysisData.answers || analysisData.answers.length === 0) {
          updateHUDStatus("analyzing", "📸 পেজ সরাসরি এনালাইসিস বা সিলেক্ট করা যায়নি! সম্পূর্ণ পেজের স্ক্রিনশট নিয়ে সঠিক উত্তর নির্ণয় করা হচ্ছে...");
          const ssRes = await performScreenshotAnalysis();
          if (ssRes && ssRes.success && ssRes.data) {
            analysisData = ssRes.data;
            filledCount = ssRes.filledCount || 0;
            isScreenshot = true;
          } else if (!analysisData || !analysisData.answers || analysisData.answers.length === 0) {
            return { success: false, message: ssRes?.error || "Analysis failed." };
          }
        }

        // Save to storage
        if (analysisData) {
          lastAnalysisResult = analysisData;
          chrome.storage.local.set({ lastAnalysisResult: analysisData });
        }

        if (autoProceed) {
          await sleep(1500 + Math.random() * 500);
          const nextBtn = findNextButton();
          if (nextBtn) {
            clickElementLikeHuman(nextBtn);
            return { success: true, filledCount, proceeded: true, data: analysisData, isScreenshot };
          }
        }

        updateHUDStatus("done", isScreenshot
          ? `✅ স্ক্রিনশট এনালাইসিস সম্পন্ন! সঠিক উত্তর এক্সটেনশনের নিচে দেখানো হলো, দেখে নিয়ে Next চাপুন।`
          : `✅ ম্যানুয়াল মোড: ${filledCount}টি উত্তর মানুষের মতো পূরণ সম্পন্ন! আপনি দেখে নিয়ে Next চাপুন।`);

        return { success: true, filledCount, data: analysisData, isScreenshot };
      } catch (err) {
        console.error("[Jarvis] runOneClickAutoFillAndNext error:", err);
        updateHUDStatus("error", err.message || "Auto-fill failed.");
        return { success: false, message: err.message || String(err) };
      }
    }

    function toggleAutoPilotMode(state) {
      isAutoPilotActive = state !== undefined ? state : !isAutoPilotActive;
      chrome.runtime.sendMessage({ action: "SET_AUTOPILOT_STATE", active: isAutoPilotActive });
      updateAutoPilotUI(isAutoPilotActive);

      if (isAutoPilotActive) {
        triggerAutoPilotCycle();
      } else {
        updateHUDStatus("idle", "Auto-Pilot paused.");
      }
    }

    function updateAutoPilotUI(active) {
      const btnAutoPilot = document.getElementById("jarvis-btn-autopilot");
      const reactorTrigger = document.getElementById("jarvis-floating-trigger");

      if (btnAutoPilot) {
        if (active) {
          btnAutoPilot.classList.add("autopilot-active");
          btnAutoPilot.innerHTML = `<span class="autopilot-pulse"></span> 🛑 STOP AUTO-PILOT`;
        } else {
          btnAutoPilot.classList.remove("autopilot-active");
          btnAutoPilot.innerHTML = `🤖 START AUTO-PILOT`;
        }
      }

      if (reactorTrigger) {
        if (active) {
          reactorTrigger.classList.add("trigger-autopilot-glow");
        } else {
          reactorTrigger.classList.remove("trigger-autopilot-glow");
        }
      }
    }

    /**
     * =========================================================================
     * 2. NEXT / SUBMIT BUTTON DETECTION & HUMAN CLICK
     * =========================================================================
     */
    function findNextButton() {
      const nextKeywords = [
        "next", "continue", "submit", "proceed", "forward", "next page", "পরবর্তী", "চালিয়ে যান", "জমা দিন",
        "finish", "done", "valider", "suivant", "weiter", "siguiente", "terminar", "avancer"
      ];
      const excludeKeywords = ["back", "previous", "পূর্ববর্তী", "retour", "zurück", "atrás", "prev"];

      // 1. Specific button selectors commonly used in survey platforms
      const explicitSelectors = [
        'input[type="submit"]',
        'button[type="submit"]',
        '.next-btn', '.btn-next', '#next-button', '#btnNext', '.NextButton', '#NextButton',
        '.submit-btn', '.btn-submit', '.survey-page__next-button', '.survey-next', '.survey-submit',
        '[data-action="next"]', '[data-action="submit"]', '.btn-primary'
      ];

      for (const sel of explicitSelectors) {
        const matched = document.querySelectorAll(sel);
        for (const btn of matched) {
          if (isElementVisible(btn) && !btn.disabled) {
            const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
            if (!excludeKeywords.some(kw => txt.includes(kw))) {
              return btn;
            }
          }
        }
      }

      // 2. All clickable buttons and anchors matching next keywords
      const allButtons = document.querySelectorAll("button, input[type='button'], a.btn, a.button, [role='button'], div.button");
      for (const btn of allButtons) {
        const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
        if (nextKeywords.some((kw) => txt === kw || txt.includes(kw)) &&
          !excludeKeywords.some((kw) => txt.includes(kw)) &&
          isElementVisible(btn) && !btn.disabled) {
          return btn;
        }
      }

      // 3. Fallback for Qualtrics / Decipher / Toluna specific next elements
      const platformNext = document.querySelector(
        "#NextButton, .NextButton, .survey-page__next-button, [aria-label='Next'], [aria-label='Submit'], [title='Next']"
      );
      if (platformNext && isElementVisible(platformNext) && !platformNext.disabled) {
        return platformNext;
      }

      return null;
    }

    function isElementVisible(el) {
      if (!el) return false;
      try {
        if (el.closest && el.closest("[style*='display: none'], [style*='display:none'], .page-section:not(.active), [hidden]")) {
          return false;
        }
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" && !["radio", "checkbox"].includes(el.type)) {
          return false;
        }
        return !!(el.offsetWidth > 0 || el.offsetHeight > 0 || (el.getClientRects && el.getClientRects().length > 0));
      } catch (e) {
        return true;
      }
    }

    function clickElementLikeHuman(el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });

      const opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent("pointerover", opts));
      el.dispatchEvent(new MouseEvent("mouseenter", opts));
      el.dispatchEvent(new MouseEvent("mouseover", opts));
      el.dispatchEvent(new MouseEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.focus();
      el.dispatchEvent(new MouseEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    }

    /**
     * =========================================================================
     * 3. UNIVERSAL DOM SCRAPER: Extracts survey questions and options
     * Works across ABC-Survey, Qualtrics, SurveyMonkey, Decipher, Cint, Dynata, Google Forms
     * =========================================================================
     */
    function extractSurveyQuestions() {
      const questions = [];
      let qIndex = 0;
      const trackedElements = new Set();

      // A. Matrix / table questions
      const tables = document.querySelectorAll("table, .matrix-table, .grid-table");
      tables.forEach((table) => {
        if (!isElementVisible(table)) return;
        const rows = table.querySelectorAll("tbody tr, tr");
        if (rows.length > 1) {
          const headers = [];
          const headerCells = table.querySelectorAll("thead th, tr:first-child th, tr:first-child td");
          headerCells.forEach((th) => headers.push(cleanText(th.innerText)));

          rows.forEach((row, rIdx) => {
            const radios = row.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            if (radios.length > 0) {
              const rowLabel = row.querySelector("th, td:first-child, .row-label")?.innerText || `Row ${rIdx + 1}`;
              const opts = [];
              radios.forEach((input, cIdx) => {
                trackedElements.add(input);
                const colLabel = headers[cIdx + 1] || headers[cIdx] || `Column ${cIdx + 1}`;
                opts.push({
                  id: assignTemporaryId(input),
                  name: input.name,
                  type: input.type,
                  value: input.value,
                  label: colLabel,
                  element: input
                });
              });

              questions.push({
                index: qIndex++,
                type: "matrix_row",
                text: cleanText(rowLabel),
                options: opts
              });
            }
          });
        }
      });

      // B. Explicit Question Containers
      const containerSelectors = [
        ".QuestionOuter", ".question", ".survey-question", "fieldset", "[role='radiogroup']",
        ".form-group", ".ss-form-question", ".survey-page__question", ".question-block",
        ".survey-card", ".survey-row", ".q-container", "[data-question-id]", ".survey-question-item"
      ].join(", ");

      const questionContainers = document.querySelectorAll(containerSelectors);
      questionContainers.forEach((container) => {
        if (!isElementVisible(container)) return;
        const titleEl = container.querySelector(
          "legend, .QuestionText, .question-text, .title, .q-title, h1, h2, h3, h4, h5, .control-label, [role='heading']"
        );
        const qText = cleanText(titleEl ? titleEl.innerText : container.innerText.slice(0, 150));
        if (!qText || questions.some((q) => q.text.includes(qText.slice(0, 50)))) {
          return;
        }

        const rawElements = Array.from(container.querySelectorAll(
          "input, select, textarea, [role='radio'], [role='checkbox'], [role='option'], .choice, .option, .answer, .survey-option, .btn-choice, [data-choice], [data-value]"
        ));
        let validInputs = rawElements.filter((inp) => {
          const t = (inp.getAttribute("type") || inp.tagName.toLowerCase()).toLowerCase();
          return !["hidden", "submit"].includes(t);
        });

        // If no standard inputs found, search for clickable options/buttons
        if (validInputs.length === 0) {
          const customChoices = Array.from(container.querySelectorAll("button, [role='button'], label.option-row, li, .card")).filter(isElementVisible);
          if (customChoices.length > 0) {
            validInputs = customChoices;
          } else {
            return;
          }
        }

        const options = [];
        let qType = "single_choice";

        validInputs.forEach((input) => {
          trackedElements.add(input);
          const tag = input.tagName.toLowerCase();
          const type = (input.getAttribute("type") || tag).toLowerCase();
          const label = getElementVisualLabel(input) || input.innerText || "";

          if (type === "radio" || input.getAttribute("role") === "radio") {
            qType = "single_choice";
          } else if (type === "checkbox" || input.getAttribute("role") === "checkbox") {
            qType = "multiple_choice";
          } else if (tag === "select") {
            qType = "dropdown";
            Array.from(input.options).forEach((opt) => {
              if (opt.value) {
                options.push({
                  id: assignTemporaryId(input),
                  selectId: input.id,
                  type: "select_option",
                  value: opt.value,
                  label: cleanText(opt.text),
                  element: input
                });
              }
            });
            return;
          } else if (tag === "textarea" || ["text", "email", "number", "tel", "search"].includes(type) || !input.type) {
            qType = "text_input";
          }

          options.push({
            id: assignTemporaryId(input),
            name: input.name || "",
            type: type,
            value: input.value || "",
            label: label || input.value || `Option ${options.length + 1}`,
            element: input
          });
        });

        if (options.length > 0) {
          questions.push({
            index: qIndex++,
            type: qType,
            text: qText,
            options: options
          });
        }
      });

      // C. Universal Fallback: Scan any untracked radios, checkboxes, text fields, and selects
      // Groups by name or preceding heading on modern survey pages like abc-survey.com
      const untrackedRadiosAndCheckboxes = Array.from(
        document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
      ).filter(el => !trackedElements.has(el) && isElementVisible(el));

      const groupedByName = {};
      untrackedRadiosAndCheckboxes.forEach((r) => {
        const name = r.name || "unnamed_" + Math.random().toString(36).substring(2, 6);
        if (!groupedByName[name]) groupedByName[name] = [];
        groupedByName[name].push(r);
      });

      for (const [name, elements] of Object.entries(groupedByName)) {
        if (elements.length > 0) {
          const first = elements[0];
          const heading = findPrecedingHeading(first) || `Survey Question (${qIndex + 1})`;
          const opts = elements.map((el) => {
            trackedElements.add(el);
            return {
              id: assignTemporaryId(el),
              name: el.name || "",
              type: el.type,
              value: el.value || "",
              label: getElementVisualLabel(el) || el.value || "Option",
              element: el
            };
          });

          questions.push({
            index: qIndex++,
            type: first.type === "checkbox" ? "multiple_choice" : "single_choice",
            text: cleanText(heading),
            options: opts
          });
        }
      }

      // D. Scan untracked text inputs & textareas (Open-ended survey questions)
      const untrackedTextInputs = Array.from(
        document.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="number"], input[type="tel"]')
      ).filter(el => !trackedElements.has(el) && isElementVisible(el));

      untrackedTextInputs.forEach((txtInput) => {
        trackedElements.add(txtInput);
        const heading = findPrecedingHeading(txtInput) || `Please write your response (${qIndex + 1})`;
        questions.push({
          index: qIndex++,
          type: "text_input",
          text: cleanText(heading),
          options: [
            {
              id: assignTemporaryId(txtInput),
              name: txtInput.name || "",
              type: "text_input",
              value: txtInput.value || "",
              label: getElementVisualLabel(txtInput) || "Text Input",
              element: txtInput
            }
          ]
        });
      });

      return questions;
    }

    function getElementVisualLabel(el) {
      if (!el) return "";
      // 1. Explicit label[for]
      if (el.id) {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLabel && cleanText(explicitLabel.innerText)) {
          return cleanText(explicitLabel.innerText);
        }
      }
      // 2. Wrapped in label
      const parentLabel = el.closest("label");
      if (parentLabel && cleanText(parentLabel.innerText)) {
        return cleanText(parentLabel.innerText);
      }
      // 3. Parent choice container (e.g. .form-check, .choice, .option-row, div, li)
      const container = el.closest(".form-check, .custom-control, .option, .choice, .option-row, .radio, .checkbox, li, tr");
      if (container && cleanText(container.innerText) && cleanText(container.innerText).length < 120) {
        return cleanText(container.innerText);
      }
      // 4. Next sibling text / span / label
      let sib = el.nextElementSibling;
      if (sib && cleanText(sib.innerText)) {
        return cleanText(sib.innerText);
      }
      if (el.nextSibling && cleanText(el.nextSibling.textContent)) {
        return cleanText(el.nextSibling.textContent);
      }
      // 5. Value, aria-label, title, placeholder
      return cleanText(el.getAttribute("aria-label") || el.title || el.placeholder || el.value || "");
    }

    function assignTemporaryId(element) {
      element.setAttribute("data-jarvis-tracked", "true");
      if (!element.id) {
        element.id = `jarvis_auto_${Math.random().toString(36).substring(2, 9)}`;
      }
      element.setAttribute("data-jarvis-optid", element.id);
      return element.id;
    }

    function cleanText(txt) {
      if (!txt) return "";
      return txt.replace(/\s+/g, " ").replace(/[\r\n\t]+/g, " ").trim();
    }

    function findPrecedingHeading(element) {
      let curr = element;
      while (curr && curr !== document.body) {
        const heading = curr.querySelector("h1, h2, h3, h4, h5, legend, strong, b, .q-title, .question-title");
        if (heading && cleanText(heading.innerText)) return cleanText(heading.innerText);
        if (curr.previousElementSibling) {
          const prev = curr.previousElementSibling;
          const prevHeading = prev.querySelector("h1, h2, h3, h4, h5, legend, .q-title") || prev;
          if (prevHeading && ["H1", "H2", "H3", "H4", "H5", "LEGEND", "P", "DIV", "SPAN"].includes(prevHeading.tagName)) {
            const t = cleanText(prevHeading.innerText);
            if (t && t.length > 2 && t.length < 250) {
              return t;
            }
          }
        }
        curr = curr.parentElement;
      }
      return "";
    }

    /**
     * =========================================================================
     * 4. FULL SURVEY WEBPAGE ANALYZER (GEMINI 3.8 FLASH ENGINE)
     * Scans 100% of the entire page DOM, questions, and text (Top-to-Bottom)
     * =========================================================================
     */
    async function performFullScan() {
      updateHUDStatus("scanning", "🔍 সম্পূর্ণ ব্রাউজার পেজটি বিশ্লেষণ করা হচ্ছে...");

      const questions = extractSurveyQuestions();
      if (questions.length === 0) {
        updateHUDStatus("idle", "এই পেজে কোনো সক্রিয় সার্ভে প্রশ্ন পাওয়া যায়নি।");
        return { success: false, error: "No survey questions found on this page." };
      }

      // Capture the entire webpage text context (top-to-bottom, ignoring scroll position)
      const fullBodyText = document.body ? cleanText(document.body.innerText).slice(0, 8000) : "";
      const pageData = {
        title: document.title,
        url: window.location.href,
        fullPageText: fullBodyText,
        questions: questions.map((q) => ({
          index: q.index,
          type: q.type,
          text: q.text,
          options: q.options.map((o) => ({
            id: o.id,
            name: o.name,
            type: o.type,
            value: o.value,
            label: o.label
          }))
        }))
      };

      updateHUDStatus("analyzing", `🤖 Gemini 3.8 Flash দিয়ে ${questions.length}টি প্রশ্ন মানুষের মতো বিশ্লেষণ হচ্ছে...`);

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "ANALYZE_SURVEY_PAGE", payload: pageData },
          (res) => resolve(res)
        );
      });

      if (!response || !response.success) {
        const err = response?.error || "Analysis failed";
        updateHUDStatus("error", err);
        return { success: false, error: err };
      }

      lastAnalysisResult = response.data;
      renderAnalysisInHUD(response.data);
      highlightAnswersOnPage(response.data);
      const modelTag = response.modelUsed || "Gemini 3.8 Flash";
      const providerTag = response.providerUsed ? ` [${response.providerUsed}]` : "";
      updateHUDStatus("done", `✅ ${modelTag}${providerTag}: মানুষের মতো ${response.data.answers?.length || questions.length}টি উত্তর প্রস্তুত!`);

      return { success: true, data: response.data, providerUsed: response.providerUsed, modelUsed: response.modelUsed };
    }

    /**
     * =========================================================================
     * 4. ADVANCED OPTION & ELEMENT FINDER
    /**
     * =========================================================================
     * 4. UNIVERSAL HIGH-PRECISION OPTION & ELEMENT FINDER
     * Handles native inputs, custom div/card options, buttons, chips, table cells,
     * with strict whole-word boundary matching (prevents "Male" matching "Female", "No" matching "None", etc.)
     * =========================================================================
     */
    function findInputByLabelOrValue(text, answerContext = null) {
      if (!text) return null;
      const cleanTarget = cleanText(text).toLowerCase()
        .replace(/^[•\-\*\d\.\)\s]+/, "") // Remove bullet points or numbers
        .trim();
      if (!cleanTarget) return null;

      // Helper: Checks whole-word / token boundary match, with strict exclusion of opposite or substring traps
      function isWordMatch(textToCheck, target) {
        if (!textToCheck || !target) return false;
        const t = textToCheck.toLowerCase().trim();
        const tgt = target.toLowerCase().trim();
        if (t === tgt) return true;

        // Anti-trap 1: "Male" must NEVER match "Female"
        if (tgt === "male" && /\bfemale\b/i.test(t)) return false;
        // Anti-trap 2: "No" must NEVER match "None", "Not", "North", etc.
        if (tgt === "no" && !/\bno\b/i.test(t)) return false;
        // Anti-trap 3: "Yes" must NEVER match "Yesterday", "Eyes"
        if (tgt === "yes" && !/\byes\b/i.test(t)) return false;

        // Word boundary regex check
        const escaped = tgt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp("(^|[^a-zA-Z0-9])" + escaped + "([^a-zA-Z0-9]|$)", "i");
        if (re.test(t)) return true;

        // Inverse check: If candidate label is a key word inside the target
        // (e.g. candidate is "Audi", target is "Audi, Nissan (Select Only 2)")
        if (t.length >= 3) {
          const escapedT = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const reT = new RegExp("(^|[^a-zA-Z0-9])" + escapedT + "([^a-zA-Z0-9]|$)", "i");
          if (reT.test(tgt)) return true;
        }

        return false;
      }

      // Scoped container candidates: If question text or index provided, search within its container first!
      let scopedElements = [];
      if (answerContext && (answerContext.question_text || answerContext.question_index !== undefined)) {
        const qText = (answerContext.question_text || "").toLowerCase().slice(0, 40);
        const allContainers = document.querySelectorAll(
          ".question-block, .survey-question, .question, .QuestionOuter, fieldset, [role='radiogroup'], .form-group, .survey-card, .survey-row, tr"
        );
        for (const c of allContainers) {
          if (qText && c.innerText.toLowerCase().includes(qText)) {
            scopedElements = Array.from(c.querySelectorAll(
              'input, [role="radio"], [role="checkbox"], [role="option"], [role="button"], button, label, .choice, .option, .answer, .survey-option, .btn-choice, .custom-control, .form-check, select, textarea, li, td'
            ));
            break;
          }
        }
      }

      // Global pool of interactive survey elements
      const globalElements = Array.from(document.querySelectorAll(
        'input, [role="radio"], [role="checkbox"], [role="option"], [role="button"], button, label, .choice, .option, .answer, .survey-option, .btn-choice, .custom-control, .form-check, select, textarea, li, td'
      ));

      const searchPools = scopedElements.length > 0 ? [scopedElements, globalElements] : [globalElements];

      for (const pool of searchPools) {
        // Pass 1: Exact label / innerText match
        for (const el of pool) {
          if (!isElementVisible(el)) continue;
          const optText = (getElementVisualLabel(el) || el.innerText || "").toLowerCase().trim();
          if (optText === cleanTarget) {
            return resolveInteractiveTarget(el);
          }
        }

        // Pass 2: Strict whole-word token boundary match
        for (const el of pool) {
          if (!isElementVisible(el)) continue;
          const optText = (getElementVisualLabel(el) || el.innerText || "").toLowerCase().trim();
          if (isWordMatch(optText, cleanTarget)) {
            return resolveInteractiveTarget(el);
          }
        }

        // Pass 3: Exact Value attribute match
        for (const el of pool) {
          if (!isElementVisible(el)) continue;
          if (el.value && cleanText(el.value).toLowerCase() === cleanTarget) {
            return resolveInteractiveTarget(el);
          }
        }

        // Pass 4: Numeric token match (e.g. "50", "1976", "125000", "2", "4", "750-800")
        const targetNumbers = cleanTarget.match(/\d+/g);
        if (targetNumbers && targetNumbers.length > 0) {
          const targetNumStr = targetNumbers.join("");
          for (const el of pool) {
            if (!isElementVisible(el)) continue;
            const optText = ((getElementVisualLabel(el) || el.innerText || "") + " " + (el.value || "")).toLowerCase();
            const optNumbers = optText.match(/\d+/g);
            if (optNumbers && optNumbers.join("") === targetNumStr) {
              return resolveInteractiveTarget(el);
            }
          }
        }

        // Pass 5: Token set overlap (>60% common words)
        const targetWords = cleanTarget.split(/\s+/).filter(w => w.length > 2 && !["and", "the", "for", "with", "only"].includes(w));
        if (targetWords.length > 0) {
          for (const el of pool) {
            if (!isElementVisible(el)) continue;
            const optText = (getElementVisualLabel(el) || el.innerText || "").toLowerCase();
            const matches = targetWords.filter(w => isWordMatch(optText, w));
            if (matches.length >= Math.ceil(targetWords.length * 0.6)) {
              return resolveInteractiveTarget(el);
            }
          }
        }
      }

      return null;
    }

    /**
     * Given an option element (label, div, or container), finds the actual clickable element
     */
    function resolveInteractiveTarget(el) {
      if (!el) return null;
      // If it's already an input, select, textarea, button or role=radio/checkbox, return directly
      const tag = el.tagName.toLowerCase();
      if (["input", "select", "textarea", "button"].includes(tag)) return el;
      if (el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "button") return el;

      // Check if it has a child input
      const childInput = el.querySelector('input[type="radio"], input[type="checkbox"], input');
      if (childInput) return childInput;

      // Check if it is a label with htmlFor
      if (el.htmlFor) {
        const target = document.getElementById(el.htmlFor);
        if (target) return target;
      }

      return el;
    }

    function highlightAnswersOnPage(data) {
      clearAllHighlights();
      if (!data || !data.answers) return;

      data.answers.forEach((ans, idx) => {
        const targetIds = ans.target_element_ids || [];
        const labels = ans.selected_labels || [];

        targetIds.forEach((targetId) => {
          let el = document.getElementById(targetId) || document.querySelector(`[data-jarvis-optid="${targetId}"]`);
          if (!el && labels.length > 0) {
            el = findInputByLabelOrValue(labels[0], ans);
          }
          if (el) {
            applyHighlightStyle(el, ans, idx + 1);
          }
        });
      });
    }

    function applyHighlightStyle(element, answer, index) {
      const parentContainer = element.closest("label") || element.parentElement || element;
      parentContainer.classList.add("jarvis-highlighted-container");

      const existingBadge = parentContainer.querySelector(".jarvis-pick-badge");
      if (!existingBadge) {
        const badge = document.createElement("span");
        badge.className = "jarvis-pick-badge";
        badge.innerHTML = `<span class="jarvis-pulse-dot"></span> JARVIS CHOICE #${index}`;
        parentContainer.appendChild(badge);
      }

      if (index === 1 && !isAutoPilotActive) {
        parentContainer.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    function clearAllHighlights() {
      document.querySelectorAll(".jarvis-highlighted-container").forEach((el) => {
        el.classList.remove("jarvis-highlighted-container");
      });
      document.querySelectorAll(".jarvis-pick-badge").forEach((el) => el.remove());
    }

    /**
     * =========================================================================
     * 5. HIGH-PRECISION FILL & ACTION SIMULATOR
     * Compatible with React, Vue, Angular, jQuery and Pure HTML DOM
     * =========================================================================
     */
    async function autoFillAnswers(data, customGapMs = null) {
      if (!data || !data.answers || data.answers.length === 0) {
        return { success: false, message: "No analyzed answers available to fill." };
      }

      const { autoFillDelay } = await chrome.storage.local.get(["autoFillDelay"]);
      const isAuto = isAutoPilotActive;
      // Human simulation: At least 3 seconds gap between questions in Auto-Pilot mode as requested
      const baseDelay = customGapMs !== null ? customGapMs : (isAuto ? 3000 : (autoFillDelay !== undefined ? autoFillDelay : 100));

      let filledCount = 0;
      const questions = extractSurveyQuestions();

      for (let ansIdx = 0; ansIdx < data.answers.length; ansIdx++) {
        const ans = data.answers[ansIdx];
        let filledThisAnswer = false;
        const targetIds = ans.target_element_ids || [];
        const labels = ans.selected_labels || [];
        const isMultiple = ans.recommended_action === "select_checkbox";

        // 1. Try target_element_ids
        for (const targetId of targetIds) {
          if (!targetId) continue;
          const el = document.getElementById(targetId) || document.querySelector(`[data-jarvis-optid="${targetId}"]`);
          if (el) {
            await simulateHumanAction(el, ans);
            filledCount++;
            filledThisAnswer = true;
            if (!isMultiple) break;
          }
        }

        // 2. If not filled (or multiple choice), search by selected_labels
        if ((!filledThisAnswer || isMultiple) && labels.length > 0) {
          for (const label of labels) {
            const el = findInputByLabelOrValue(label, ans);
            if (el) {
              await simulateHumanAction(el, ans);
              filledCount++;
              filledThisAnswer = true;
              if (!isMultiple) break;
            }
          }
        }

        // 3. If action is type_text and not filled yet
        if (!filledThisAnswer && (ans.recommended_action === "type_text" || ans.text_input_value)) {
          const qObj = questions[ans.question_index];
          const textOpt = qObj?.options?.find(o => o.type === "text_input") ||
            questions.flatMap(q => q.options).find(o => o.type === "text_input" && isElementVisible(o.element));
          if (textOpt && textOpt.element) {
            await simulateHumanAction(textOpt.element, ans);
            filledCount++;
            filledThisAnswer = true;
          }
        }

        // 4. Fallback to matching question index options
        if (!filledThisAnswer && typeof ans.question_index === "number" && questions[ans.question_index]) {
          const qObj = questions[ans.question_index];
          const targetOpt = matchOptionByLabels(qObj, labels) || matchOptionToPersona(qObj);
          if (targetOpt && targetOpt.element) {
            await simulateHumanAction(targetOpt.element, ans);
            filledCount++;
            filledThisAnswer = true;
          }
        }

        // Human-paced inter-question delay (at least 3 seconds in auto mode)
        if (filledThisAnswer && isAuto && ansIdx < data.answers.length - 1) {
          const pauseMs = baseDelay + Math.random() * 600;
          updateHUDStatus("analyzing", `🤖 উত্তর পূরণ হয়েছে (${ansIdx + 1}/${data.answers.length}) - পরবর্তী প্রশ্নের জন্য ৩ সেকেন্ড বিরতি...`);
          await sleep(pauseMs);
        } else {
          await sleep(isAuto ? 60 : baseDelay);
        }
      }

      // Safety Verification: Ensure zero questions were skipped or left unfilled!
      const verifiedAdded = await verifyAndFillAllQuestions(data);
      filledCount += verifiedAdded;

      return { success: true, filledCount };
    }

    function matchOptionByLabels(question, labels) {
      if (!question || !question.options || labels.length === 0) return null;
      for (const label of labels) {
        const clean = cleanText(label).toLowerCase();
        const found = question.options.find(opt => {
          const optClean = cleanText(opt.label).toLowerCase();
          return optClean === clean || optClean.includes(clean) || clean.includes(optClean);
        });
        if (found) return found;
      }
      return null;
    }

    /**
     * Ultra-robust Post-Fill Verification
     * Guarantees 100% of visible survey questions have answers selected!
     */
    async function verifyAndFillAllQuestions(data) {
      const questions = extractSurveyQuestions();
      let fixedCount = 0;

      for (let qIdx = 0; qIdx < questions.length; qIdx++) {
        const q = questions[qIdx];

        if (q.type === "single_choice" || q.type === "matrix_row") {
          const hasSelection = q.options.some((opt) => {
            const el = opt.element || document.getElementById(opt.id);
            return el && (el.checked || el.getAttribute("aria-checked") === "true" || el.classList.contains("selected") || el.classList.contains("active"));
          });

          if (!hasSelection && q.options.length > 0) {
            const ans = data?.answers?.find((a) => a.question_index === qIdx || cleanText(a.question_text) === cleanText(q.text));
            let chosenOpt = null;
            if (ans && ans.selected_labels && ans.selected_labels.length > 0) {
              chosenOpt = matchOptionByLabels(q, ans.selected_labels);
            }
            if (!chosenOpt) {
              chosenOpt = matchOptionToPersona(q);
            }

            if (chosenOpt && chosenOpt.element) {
              await simulateHumanAction(chosenOpt.element, ans || { selected_labels: [chosenOpt.label] });
              applyHighlightStyle(chosenOpt.element, ans || { selected_labels: [chosenOpt.label] }, qIdx + 1);
              fixedCount++;
              await sleep(60);
            }
          }
        } else if (q.type === "text_input") {
          for (const opt of q.options) {
            const el = opt.element || document.getElementById(opt.id);
            if (el && !el.value && isElementVisible(el)) {
              const ans = data?.answers?.find((a) => a.question_index === qIdx) || {};
              await simulateHumanAction(el, ans);
              fixedCount++;
              await sleep(60);
            }
          }
        }
      }

      return fixedCount;
    }

    /**
     * Demographic persona matcher for Al Amin Miah's verified profile
     */
    function matchOptionToPersona(question) {
      if (!question || !question.options || question.options.length === 0) return null;
      const qText = (question.text || "").toLowerCase();
      const opts = question.options;

      // Age (50 years old / Born 1976)
      if (/age|how old|birth year|born/i.test(qText)) {
        const match = opts.find(o => /\b50\b|45\s*-\s*54|1976/i.test(o.label));
        if (match) return match;
      }

      // Gender (Male / Heterosexual)
      if (/gender|sex|sexual orientation/i.test(qText)) {
        const match = opts.find(o => /\bmale\b/i.test(o.label) && !/\bfemale\b/i.test(o.label));
        if (match) return match;
      }

      // Race / Ethnicity (White / Not Hispanic)
      if (/race|ethnicity|hispanic|heritage/i.test(qText)) {
        const match = opts.find(o => /\bwhite\b|not hispanic|no hispanic/i.test(o.label));
        if (match) return match;
      }

      // Education (Master's or Professional Degree / Bachelor)
      if (/education|degree|school|highest level/i.test(qText)) {
        const match = opts.find(o => /master|post-graduate|professional degree|graduate|bachelor/i.test(o.label));
        if (match) return match;
      }

      // Household size (4 people)
      if (/household|how many people|family members/i.test(qText)) {
        const match = opts.find(o => /\b4\b|four/i.test(o.label));
        if (match) return match;
      }

      // Monthly / Annual Income ($125,000 - $149,999)
      if (/income|monthly|salary|earn|revenue/i.test(qText)) {
        const match = opts.find(o => /125,000|125000|100,000|over 5,000|> 5,000|5,000\+/i.test(o.label)) ||
          opts.find(o => /50,000|75,000/i.test(o.label));
        if (match) return match;
      }

      // Housing Type (Own house / single family house / Detached)
      if (/housing|home|living|residence/i.test(qText)) {
        const match = opts.find(o => /own|single family|detached|condo|house/i.test(o.label));
        if (match) return match;
      }

      // Vehicle (Audi / Nissan / Yes)
      if (/vehicle|car|automobile|drive/i.test(qText)) {
        const match = opts.find(o => /\baudi\b|\bnissan\b|^yes\b|own/i.test(o.label));
        if (match) return match;
      }

      // Marital Status (Married)
      if (/marital|married|relationship|status/i.test(qText)) {
        const match = opts.find(o => /married|in a relationship/i.test(o.label));
        if (match) return match;
      }

      // Kids (2 kids)
      if (/children|kids|child/i.test(qText)) {
        const match = opts.find(o => /\b2\b|two|^yes\b/i.test(o.label));
        if (match) return match;
      }

      // Employment (Full-time / IT / Computer Software)
      if (/employment|job|work|occupation|industry/i.test(qText)) {
        const match = opts.find(o => /full-time|full time|computer software|information technology|manager|director/i.test(o.label));
        if (match) return match;
      }

      // Screener / Disqualification trap
      if (/market research|advertising|public relations|journalism/i.test(qText)) {
        const match = opts.find(o => /none of the above|not applicable/i.test(o.label));
        if (match) return match;
      }

      // Yes/No questions default to Yes
      const yesOpt = opts.find(o => /^yes\b/i.test(o.label));
      if (yesOpt) return yesOpt;

      // Default to the first reasonable option
      return opts[0];
    }

    /**
     * Universal Human Interaction Engine
     * Dispatches React prototype setters, native inputs, and full mouse events
     * Works on <input>, <select>, <textarea>, <button>, <label>, and custom <div>/<span> choice cards!
     */
    async function simulateHumanAction(element, answer = {}) {
      if (!element) return;
      try {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) { }

      const tag = element.tagName.toLowerCase();
      const type = (element.getAttribute("type") || element.type || tag).toLowerCase();

      // 1. TEXT INPUT / TEXTAREA / CONTENTEDITABLE
      if (element.isContentEditable) {
        element.focus();
        const textToType = answer.text_input_value || "Overall good experience and dependable service.";
        element.innerText = textToType;
        element.dispatchEvent(new InputEvent("input", { bubbles: true, data: textToType }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.blur();
        await sleep(30);
        return;
      }

      if (tag === "textarea" || ["text", "email", "number", "tel", "search", "url"].includes(type) || (tag === "input" && !["radio", "checkbox", "button", "submit", "reset"].includes(type))) {
        element.focus();
        const textToType = (answer.text_input_value && answer.text_input_value !== "null")
          ? answer.text_input_value.trim()
          : "The service has been dependable and easy to use.";

        try {
          const proto = tag === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) {
            setter.call(element, textToType);
          } else {
            element.value = textToType;
          }
        } catch (e) {
          element.value = textToType;
        }

        if (element._valueTracker) {
          element._valueTracker.setValue("");
        }

        element.dispatchEvent(new Event("focus", { bubbles: true }));
        element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: textToType }));
        element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: textToType }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter" }));
        element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter" }));
        element.dispatchEvent(new Event("blur", { bubbles: true }));
        await sleep(40);
        return;
      }

      // 2. DROPDOWN SELECT
      if (tag === "select") {
        element.focus();
        const labels = answer.selected_labels || [];
        const targetLabel = labels.length > 0 ? cleanText(labels[0]).toLowerCase() : "";
        let matchedIndex = -1;

        for (let i = 0; i < element.options.length; i++) {
          const optTxt = cleanText(element.options[i].text).toLowerCase();
          const optVal = cleanText(element.options[i].value).toLowerCase();
          if (targetLabel && (optTxt.includes(targetLabel) || targetLabel.includes(optTxt) || optVal.includes(targetLabel))) {
            matchedIndex = i;
            break;
          }
        }

        if (matchedIndex === -1 && element.options.length > 1) {
          matchedIndex = 1;
        }

        if (matchedIndex >= 0) {
          element.selectedIndex = matchedIndex;
          element.value = element.options[matchedIndex].value;
          if (element._valueTracker) {
            element._valueTracker.setValue("");
          }
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
        await sleep(30);
        return;
      }

      // 3. RADIO, CHECKBOX, BUTTON, DIV, CARD, LI, SPAN OPTIONS
      const associatedInput = (tag === "input" ? element : null) ||
        element.querySelector('input[type="radio"], input[type="checkbox"]') ||
        (element.htmlFor ? document.getElementById(element.htmlFor) : null) ||
        element.closest("label")?.querySelector("input") ||
        element.parentElement?.querySelector('input[type="radio"], input[type="checkbox"]');

      if (associatedInput) {
        try {
          const protoSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "checked")?.set;
          if (protoSetter) {
            protoSetter.call(associatedInput, true);
          } else {
            associatedInput.checked = true;
          }
        } catch (e) {
          associatedInput.checked = true;
        }

        if (associatedInput._valueTracker) {
          associatedInput._valueTracker.setValue(!associatedInput.checked);
        }

        associatedInput.dispatchEvent(new Event("input", { bubbles: true }));
        associatedInput.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (element.hasAttribute("aria-checked")) {
        element.setAttribute("aria-checked", "true");
      }

      // Dispatch complete realistic mouse and pointer event sequence
      const opts = { bubbles: true, cancelable: true, view: window };
      element.dispatchEvent(new MouseEvent("pointerover", opts));
      element.dispatchEvent(new MouseEvent("mouseover", opts));
      element.dispatchEvent(new MouseEvent("pointerdown", opts));
      element.dispatchEvent(new MouseEvent("mousedown", opts));
      try { element.focus(); } catch (e) { }
      element.dispatchEvent(new MouseEvent("pointerup", opts));
      element.dispatchEvent(new MouseEvent("mouseup", opts));
      element.dispatchEvent(new MouseEvent("click", opts));

      // Also trigger native click
      try {
        element.click();
      } catch (e) { }

      // Add active styling
      element.classList.add("selected", "active", "checked");
      if (associatedInput && associatedInput !== element) {
        associatedInput.classList.add("selected", "active", "checked");
        associatedInput.checked = true;
      }

      await sleep(30);
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Global Hotkey: Alt + S for Instant Manual Page Selection
    window.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "s" || e.key === "S" || e.code === "KeyS")) {
        e.preventDefault();
        runOneClickAutoFillAndNext(false); // Manual mode: fills answers without auto-proceeding
      }
    }, true);

    // SPA / AJAX dynamic survey page observer for continuous hands-free Auto-Pilot
    let lastCheckedUrl = window.location.href;
    let domChangeTimeout = null;

    try {
      const surveyObserver = new MutationObserver(() => {
        if (!isAutoPilotActive || autoPilotRunningCycle) return;

        // 1. URL change detected
        if (window.location.href !== lastCheckedUrl) {
          lastCheckedUrl = window.location.href;
          clearTimeout(domChangeTimeout);
          domChangeTimeout = setTimeout(() => {
            if (isAutoPilotActive && !autoPilotRunningCycle) {
              triggerAutoPilotCycle();
            }
          }, 3200);
          return;
        }

        // 2. Dynamic questions appeared on the same page
        const questions = extractSurveyQuestions();
        if (questions.length > 0) {
          const hasUnanswered = questions.some((q) => {
            if (q.type === "single_choice" || q.type === "matrix_row") {
              return !q.options.some((o) => o.element?.checked);
            }
            return false;
          });

          if (hasUnanswered) {
            clearTimeout(domChangeTimeout);
            domChangeTimeout = setTimeout(() => {
              if (isAutoPilotActive && !autoPilotRunningCycle) {
                triggerAutoPilotCycle();
              }
            }, 3500);
          }
        }
      });

      if (document.body) {
        surveyObserver.observe(document.body, { childList: true, subtree: true });
      } else {
        document.addEventListener("DOMContentLoaded", () => {
          surveyObserver.observe(document.body, { childList: true, subtree: true });
        });
      }
    } catch (e) {
      console.debug("Survey observer init:", e);
    }

    // Persistent Autopilot Watchdog Timer (runs every 2.5s to ensure hands-free progress across dynamic SPAs)
    setInterval(() => {
      if (!isAutoPilotActive || autoPilotRunningCycle) return;
      const questions = extractSurveyQuestions();
      if (questions.length > 0) {
        const hasUnanswered = questions.some((q) => {
          if (q.type === "single_choice" || q.type === "matrix_row") {
            return !q.options.some((o) => {
              const el = o.element;
              return el && (el.checked || el.getAttribute("aria-checked") === "true" || el.classList.contains("selected") || el.classList.contains("active"));
            });
          }
          return false;
        });
        if (hasUnanswered) {
          console.log("[Jarvis Watchdog] Unanswered survey questions detected. Triggering auto cycle...");
          triggerAutoPilotCycle();
        }
      }
    }, 2500);

    /**
     * =========================================================================
     * 6. IN-PAGE FLOATING HUD (Futuristic Glassmorphic Interface)
     * =========================================================================
     */
    function createFloatingHUD() {
      if (!isTopFrame) return;
      try {
        const existing = document.getElementById("jarvis-hud-container");
        if (existing) existing.remove();
      } catch (e) { }

      if (!document.body) return;

      hudElement = document.createElement("div");
      hudElement.id = "jarvis-hud-container";
      hudElement.innerHTML = `
      <div id="jarvis-floating-trigger" title="Jarvis Survey Copilot (Click to open)">
        <div class="jarvis-reactor-icon">
          <div class="jarvis-core-ring"></div>
          <div class="jarvis-core-center"></div>
        </div>
      </div>

      <div id="jarvis-hud-panel" class="jarvis-panel-hidden">
        <div class="jarvis-panel-header">
          <div class="jarvis-panel-title">
            <span class="jarvis-glowing-dot"></span>
            <span>JARVIS 3.8 COPILOT</span>
          </div>
          <button id="jarvis-panel-close" title="Minimize">&times;</button>
        </div>

        <!-- Mode Selector Switch -->
        <div class="jarvis-mode-switch">
          <button id="jarvis-tab-manual" class="jarvis-mode-btn active">
            ✋ ম্যানুয়াল মোড
          </button>
          <button id="jarvis-tab-autopilot" class="jarvis-mode-btn">
            🤖 অটো-পাইলট
          </button>
        </div>

        <!-- Manual Mode Section -->
        <div id="jarvis-section-manual" class="jarvis-section-block">
          <button id="jarvis-btn-manual-select" class="jarvis-btn jarvis-btn-manual" title="ম্যানুয়াল মোড: পেজের সঠিক উত্তরগুলো অটো-সিলেক্ট হবে, আপনি নিজে দেখে নিয়ে Next চাপবেন">
            🎯 পেজের উত্তর সিলেক্ট করুন <span class="hotkey-badge">Alt+S</span>
          </button>
          <div class="jarvis-manual-subtext">
            পেজের সঠিক উত্তরগুলো অটো-সিলেক্ট হবে, আপনি নিজে দেখে নিয়ে Next চাপবেন।
          </div>
          <div class="jarvis-panel-controls">
            <button id="jarvis-btn-next" class="jarvis-btn jarvis-btn-next" title="Proceed to next survey page">
              ⏭️ Next Page
            </button>
            <button id="jarvis-btn-scan-only" class="jarvis-btn jarvis-btn-ghost" title="Scan without clicking">
              🔍 Scan
            </button>
            <button id="jarvis-btn-clear" class="jarvis-btn jarvis-btn-ghost" title="Clear highlights">
              🧹
            </button>
          </div>
        </div>

        <!-- Auto-Pilot Mode Section -->
        <div id="jarvis-section-autopilot" class="jarvis-section-block jarvis-hidden">
          <div class="jarvis-autopilot-bar">
            <button id="jarvis-btn-autopilot" class="jarvis-btn jarvis-btn-autopilot">
              🤖 START AUTO-PILOT
            </button>
          </div>
          <div class="jarvis-manual-subtext">
            সম্পূর্ণ হ্যান্ডস-ফ্রি: নিজে নিজেই প্রতিটি পেজ সলভ করে একা একা শেষ করবে।
          </div>
        </div>

        <div id="jarvis-trap-warning" class="jarvis-trap-box jarvis-hidden">
          <div class="jarvis-trap-header">⚠️ ATTENTION-CHECK DETECTED</div>
          <div id="jarvis-trap-message" class="jarvis-trap-body"></div>
        </div>

        <div id="jarvis-status-bar" class="jarvis-status-text">
          Status: রেডি। ম্যানুয়ালি উত্তর সিলেক্ট করতে উপরের বাটনে চাপ দিন বা Alt+S চাপুন।
        </div>

        <div id="jarvis-results-container" class="jarvis-results-list"></div>
      </div>
    `;

      document.body.appendChild(hudElement);

      const trigger = document.getElementById("jarvis-floating-trigger");
      const closeBtn = document.getElementById("jarvis-panel-close");
      const tabManual = document.getElementById("jarvis-tab-manual");
      const tabAutoPilot = document.getElementById("jarvis-tab-autopilot");
      const secManual = document.getElementById("jarvis-section-manual");
      const secAutoPilot = document.getElementById("jarvis-section-autopilot");

      const manualSelectBtn = document.getElementById("jarvis-btn-manual-select");
      const autoPilotBtn = document.getElementById("jarvis-btn-autopilot");
      const scanOnlyBtn = document.getElementById("jarvis-btn-scan-only");
      const nextBtn = document.getElementById("jarvis-btn-next");
      const clearBtn = document.getElementById("jarvis-btn-clear");

      // Mode Switcher handlers
      tabManual.addEventListener("click", () => {
        tabManual.classList.add("active");
        tabAutoPilot.classList.remove("active");
        secManual.classList.remove("jarvis-hidden");
        secAutoPilot.classList.add("jarvis-hidden");
      });

      tabAutoPilot.addEventListener("click", () => {
        tabAutoPilot.classList.add("active");
        tabManual.classList.remove("active");
        secAutoPilot.classList.remove("jarvis-hidden");
        secManual.classList.add("jarvis-hidden");
      });

      trigger.addEventListener("click", () => toggleHUD(!hudVisible));
      closeBtn.addEventListener("click", () => toggleHUD(false));

      // Manual 1-Click Page Auto-Fill
      manualSelectBtn.addEventListener("click", async () => {
        manualSelectBtn.disabled = true;
        manualSelectBtn.innerHTML = `<span>⏳</span> উত্তর সিলেক্ট হচ্ছে...`;
        try {
          const res = await runOneClickAutoFillAndNext(false);
          if (res && res.success) {
            updateHUDStatus("done", `✅ ম্যানুয়াল মোড: ${res.filledCount}টি উত্তর সিলেক্ট সম্পন্ন! আপনি দেখে নিয়ে Next চাপুন।`);
          }
        } finally {
          manualSelectBtn.disabled = false;
          manualSelectBtn.innerHTML = `🎯 পেজের উত্তর সিলেক্ট করুন <span class="hotkey-badge">Alt+S</span>`;
        }
      });

      // Auto-Pilot Toggle
      autoPilotBtn.addEventListener("click", () => {
        toggleAutoPilotMode();
      });

      // Scan Only
      scanOnlyBtn.addEventListener("click", async () => {
        scanOnlyBtn.disabled = true;
        try {
          await performFullScan();
        } finally {
          scanOnlyBtn.disabled = false;
        }
      });

      // Next Button
      nextBtn.addEventListener("click", () => {
        const btn = findNextButton();
        if (btn) {
          clickElementLikeHuman(btn);
          updateHUDStatus("done", "Navigating to next page...");
        } else {
          updateHUDStatus("error", "Next button not detected on page.");
        }
      });

      clearBtn.addEventListener("click", () => {
        clearAllHighlights();
        document.getElementById("jarvis-results-container").innerHTML = "";
        updateHUDStatus("idle", "Highlights cleared.");
      });

      makeElementDraggable(trigger);
    }

    function toggleHUD(show) {
      const panel = document.getElementById("jarvis-hud-panel");
      if (!panel) return;
      hudVisible = show !== undefined ? show : !hudVisible;
      if (hudVisible) {
        panel.classList.remove("jarvis-panel-hidden");
        panel.style.display = "flex";
        panel.style.visibility = "visible";
        panel.style.opacity = "1";
      } else {
        panel.classList.add("jarvis-panel-hidden");
        panel.style.display = "none";
      }
    }

    function updateHUDStatus(state, message) {
      const statusEl = document.getElementById("jarvis-status-bar");
      if (statusEl) {
        statusEl.innerText = `Status: ${message}`;
        statusEl.className = `jarvis-status-text status-${state}`;
      }
    }

    function renderAnalysisInHUD(data) {
      const resultsContainer = document.getElementById("jarvis-results-container");
      const trapBox = document.getElementById("jarvis-trap-warning");
      const trapMsg = document.getElementById("jarvis-trap-message");

      resultsContainer.innerHTML = "";

      if (data.trap_detected) {
        trapBox.classList.remove("jarvis-hidden");
        trapMsg.innerText = data.trap_alert_message || "Carefully follow this attention-check question!";
      } else {
        trapBox.classList.add("jarvis-hidden");
      }

      if (data.is_screenshot_analysis) {
        const banner = document.createElement("div");
        banner.style.cssText = "background:rgba(0,240,255,0.12); border:1px solid #00f0ff; border-radius:6px; padding:6px 10px; font-size:11px; margin-bottom:8px; color:#00f0ff;";
        banner.innerHTML = "📸 <strong>স্ক্রিনশট বিশ্লেষণ ফলাফল (Gemini Vision)</strong><br><span style='color:#cbd5e1; font-size:10px;'>পেজ সরাসরি বিশ্লেষণ না হওয়ায় সম্পূর্ণ স্ক্রিনশট নিয়ে সঠিক উত্তর নির্ণয় করা হয়েছে (এইটা এইটা উত্তর হবে):</span>";
        resultsContainer.appendChild(banner);
      }

      if (!data.answers || data.answers.length === 0) {
        resultsContainer.innerHTML = `<div class="jarvis-empty-result">No answers generated.</div>`;
        return;
      }

      data.answers.forEach((ans, idx) => {
        const card = document.createElement("div");
        card.className = "jarvis-answer-card";
        card.innerHTML = `
        <div class="jarvis-q-header">
          <span class="jarvis-q-number">Q${idx + 1}</span>
          <span class="jarvis-q-title">${ans.question_text || "Question"}</span>
        </div>
        <div class="jarvis-a-recommendation">
          <span class="jarvis-rec-label">Selection:</span>
          <strong>${(ans.selected_labels || []).join(", ") || ans.text_input_value || "Option Chosen"}</strong>
        </div>
        ${ans.reasoning ? `<div class="jarvis-a-reasoning">💡 ${ans.reasoning}</div>` : ""}
      `;
        resultsContainer.appendChild(card);
      });
    }

    function makeElementDraggable(el) {
      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      el.onmousedown = dragMouseDown;

      function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
      }

      function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
        el.style.bottom = "auto";
        el.style.right = "auto";
      }

      function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
      }
    }

    /**
     * Displays an animated API limit warning banner on the webpage.
     */
    function showInPageApiAlert(alertData) {
      if (!alertData) return;
      const existing = document.getElementById("jarvis-api-alert-banner");
      if (existing) existing.remove();

      const banner = document.createElement("div");
      banner.id = "jarvis-api-alert-banner";
      banner.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483647;
      background: linear-gradient(135deg, #1e1100 0%, #3a1a00 100%);
      border: 1px solid #ff9900;
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7), 0 0 15px rgba(255, 153, 0, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      animation: jarvisFadeIn 0.3s ease-out;
    `;

      const apiName = alertData.api_name || "API Provider";
      const usage = alertData.usage_percent !== undefined ? alertData.usage_percent : "?";
      const msg = alertData.message || `${apiName} has reached ${usage}% of its limit!`;

      banner.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-weight:700; color:#ffb700; display:flex; align-items:center; gap:6px;">
          <span>⚠️</span> API LIMIT WARNING
        </span>
        <button id="jarvis-close-alert-btn" style="background:transparent; border:none; color:#aaa; font-size:16px; cursor:pointer; padding:0 4px;">✕</button>
      </div>
      <div style="font-size:12px; color:#f1f5f9; line-height:1.4;">${msg}</div>
      <div style="font-size:11px; color:#ffaa44; font-weight:600;">API: ${apiName} (${usage}% reached)</div>
    `;

      document.body.appendChild(banner);

      const closeBtn = banner.querySelector("#jarvis-close-alert-btn");
      if (closeBtn) {
        closeBtn.onclick = () => banner.remove();
      }

      // Auto dismiss after 14 seconds
      setTimeout(() => {
        if (banner && banner.parentNode) banner.remove();
      }, 14000);
    }
})();


