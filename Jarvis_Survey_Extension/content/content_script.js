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
        renderProminentAnswersBox(message.data);
        attachInPageAnswerBadges(message.data);
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

    const fullBodyText = document.body ? cleanText(document.body.innerText).slice(0, 5000) : "";
    let scannedQuestions = [];
    try {
      scannedQuestions = scanSurveyPage() || [];
    } catch (_) {}

    const payload = {
      title: document.title,
      url: window.location.href,
      fullPageText: fullBodyText,
      questions: scannedQuestions.map((q) => ({
        index: q.index,
        type: q.type,
        text: q.text,
        options: (q.options || []).map((o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          value: o.value,
          label: o.label
        }))
      })),
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
    renderProminentAnswersBox(data);
    attachInPageAnswerBadges(data);
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
      updateHUDStatus("done", `✅ স্ক্রিনশট এনালাইসিস সম্পন্ন! ${selectCount}টি উত্তর সিলেক্ট হয়েছে। নিচে সঠিক উত্তরসমূহ বোল্ড করে দেখানো হলো।`);
    } else {
      updateHUDStatus("done", `💡 স্ক্রিনশট এনালাইসিস সম্পন্ন! পেজে অটো-সিলেক্ট বা টাইপ করা যায়নি—নিচে ও পেজে বোল্ড করে দেখানো হলো: '👉 এটা হবে সঠিক উত্তর'।`);
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

  let lastHandledQuestionFingerprint = "";
  let spaMutationObserver = null;
  let spaDebounceTimer = null;

  function getQuestionsFingerprint() {
    try {
      const qs = extractSurveyQuestions();
      if (!qs || qs.length === 0) return "";
      return qs.map(q => {
        const textPart = (q.text || "").slice(0, 80).trim().toLowerCase();
        const optPart = (q.options || []).map(o => (o.label || o.value || o.text || "").slice(0, 30).trim().toLowerCase()).join("|");
        return `${textPart}::${optPart}`;
      }).join("###");
    } catch (e) {
      return "";
    }
  }

  let userManuallyInteracting = false;
  let userInteractionTimer = null;

  document.addEventListener("click", (e) => {
    if (e.isTrusted) {
      // User is manually clicking or changing an answer
      userManuallyInteracting = true;
      clearTimeout(userInteractionTimer);
      userInteractionTimer = setTimeout(() => {
        userManuallyInteracting = false;
      }, 4000);
    }
  }, true);

  function setupSpaDynamicWatcher() {
    if (spaMutationObserver) return;
    try {
      spaMutationObserver = new MutationObserver(() => {
        if (!isAutoPilotActive || autoPilotRunningCycle || userManuallyInteracting) return;
        clearTimeout(spaDebounceTimer);
        spaDebounceTimer = setTimeout(() => {
          if (!isAutoPilotActive || autoPilotRunningCycle || userManuallyInteracting) return;
          const currentFingerprint = getQuestionsFingerprint();
          if (currentFingerprint && currentFingerprint !== lastHandledQuestionFingerprint) {
            console.log("[Jarvis AutoPilot] SPA DOM question change detected in-place! Triggering auto-pilot cycle...");
            triggerAutoPilotCycle();
          }
        }, 1200);
      });

      if (document.body) {
        spaMutationObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "aria-hidden", "hidden", "data-state", "disabled"]
        });
      }
    } catch (e) {
      console.warn("[Jarvis AutoPilot] SPA observer setup warning:", e);
    }
  }

  async function triggerAutoPilotCycle() {
      if (autoPilotRunningCycle || !isAutoPilotActive) return;
      autoPilotRunningCycle = true;

      try {
        setupSpaDynamicWatcher();

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

        // Capture initial fingerprint of questions on page before processing
        const initialQuestionsSig = getQuestionsFingerprint();

        // 5. Quick DOM Settling Delay for new page (Fast analysis under 10-second total limit)
        const initialDelay = 450 + Math.floor(Math.random() * 200); // 450ms - 650ms
        updateHUDStatus("analyzing", `🤖 পেজ পর্যবেক্ষণ ও বিশ্লেষণ শুরু হচ্ছে...`);
        await sleep(initialDelay);

        if (!isAutoPilotActive) {
          autoPilotRunningCycle = false;
          return;
        }

        // 6. Check if this is the LAST PAGE initially
        const isLastPageInitial = isLastSurveyPage();
        if (isLastPageInitial) {
          updateHUDStatus("analyzing", `🛑 লাস্ট পেজ সনাক্ত হয়েছে! সতর্কতার সাথে উত্তর সম্পন্ন হচ্ছে...`);
          await sleep(1500);
          if (!isAutoPilotActive) {
            autoPilotRunningCycle = false;
            return;
          }
        }

        // 7. Solve questions (DOM or Screenshot Fallback)
        updateHUDStatus("analyzing", "⚡ Auto-Pilot: দ্রুত পেজ এনালাইসিস হচ্ছে...");

        let analysisData = null;
        let filledCount = 0;
        let usedScreenshot = false;
        let fillRes = null;

        const questionsOnPage = extractSurveyQuestions();
        if (questionsOnPage.length > 0) {
          const scanRes = await performFullScan();
          if (scanRes && scanRes.success && scanRes.data && scanRes.data.answers?.length > 0) {
            analysisData = scanRes.data;
            updateHUDStatus("analyzing", "⚡ Auto-Pilot: উত্তরসমূহ দ্রুত সিলেক্ট ও পূরণ করা হচ্ছে...");
            fillRes = await autoFillAnswers(analysisData);
            filledCount = fillRes?.filledCount || 0;
          }
        }

        // If DOM analysis failed, found 0 questions, or could not select elements:
        if (!analysisData || filledCount === 0 || !analysisData.answers || analysisData.answers.length === 0) {
          updateHUDStatus("analyzing", "📸 সম্পূর্ণ পেজের স্ক্রিনশট নিয়ে এনালাইসিস করা হচ্ছে...");
          const ssRes = await performScreenshotAnalysis();
          if (ssRes && ssRes.success && ssRes.data) {
            analysisData = ssRes.data;
            filledCount = ssRes.filledCount || 0;
            usedScreenshot = true;
            renderAnalysisInHUD(analysisData);
            renderProminentAnswersBox(analysisData);
            attachInPageAnswerBadges(analysisData);
          } else {
            // If still no questions and not a question page, check if there is an intro/transition button
            const nextBtnFallback = findNextButton();
            if (nextBtnFallback && questionsOnPage.length === 0) {
              updateHUDStatus("done", "🤖 Advancing intro/transition page...");
              await sleep(1200);
              clickElementLikeHuman(nextBtnFallback);
            } else {
              updateHUDStatus("error", "⚠️ পেজের প্রশ্ন চিহ্নিত করা যায়নি। পুনরায় চেষ্টা হচ্ছে...");
              setTimeout(() => {
                if (isAutoPilotActive && !autoPilotRunningCycle) {
                  triggerAutoPilotCycle();
                }
              }, 1800);
            }
            autoPilotRunningCycle = false;
            return;
          }
        }

        if (filledCount === 0 && analysisData?.answers?.length > 0) {
          // Emergency attempt: direct click matching text elements
          for (const ans of analysisData.answers) {
            for (const lbl of (ans.selected_labels || [])) {
              const cleanL = cleanText(lbl).toLowerCase();
              if (!cleanL || cleanL.length < 2) continue;
              const cand = Array.from(document.querySelectorAll("button, label, [role='button'], [role='radio'], [role='checkbox'], div, span, td, a"))
                .find(el => isElementVisible(el) && !el.closest("#jarvis-hud-container") && el.children.length <= 4 && cleanText(el.innerText || "").toLowerCase().includes(cleanL));
              if (cand) {
                const target = cand.closest("button, label, [role='button'], [role='radio'], [role='checkbox'], div, tr, td") || cand;
                await simulateHumanAction(target, ans);
                filledCount++;
                break;
              }
            }
          }
          if (filledCount === 0) {
            // Check if page has Next button (transition, disclosure, or single button page)
            const nextBtnFallback = findNextButton();
            if (nextBtnFallback) {
              updateHUDStatus("done", "🤖 পেজের নেক্সট বাটনে ক্লিক করে অগ্রসর হওয়া হচ্ছে...");
              await sleep(1200);
              clickElementLikeHuman(nextBtnFallback);
              setTimeout(() => { if (isAutoPilotActive && !autoPilotRunningCycle) triggerAutoPilotCycle(); }, 1600);
              autoPilotRunningCycle = false;
              return;
            }
            updateHUDStatus("done", "💡 পেজে উত্তর নিচে বোল্ড করে প্রদর্শিত হয়েছে। দেখে সিলেক্ট করে Next চাপুন।");
            autoPilotRunningCycle = false;
            return;
          }
        }

        if (!isAutoPilotActive) {
          autoPilotRunningCycle = false;
          return;
        }

        // 8. Auto-Advance & Next Page Transition Logic (Strict 3-4 Second Observation Rule)
        // User Requirement:
        // উত্তর সিলেক্ট করার পর ৩ সেকেন্ড সময় নিয়ে দেখবে স্বয়ংক্রিয়ভাবে নেক্সট পেজ আসে কিনা।
        // যদি স্বয়ংক্রিয়ভাবে নেক্সট পেজ আসে, তবে নতুন পেজ এনালাইসিস করে উত্তর দিবে (Next চাপবে না)।
        // আর যদি ৩ সেকেন্ডের মধ্যে নেক্সট পেজ না আসে, তবে স্বয়ংক্রিয়ভাবে Next বাটনে ক্লিক করবে।
        let didAutoAdvance = fillRes?.autoAdvanced || false;
        if (!didAutoAdvance) {
          updateHUDStatus("analyzing", "👀 উত্তর সিলেক্ট সম্পন্ন! ৩ সেকেন্ড পর্যবেক্ষণ করা হচ্ছে স্বয়ংক্রিয় নেক্সট পেজ আসে কিনা...");
          const watchStart = Date.now();
          while (Date.now() - watchStart < 3000) {
            await sleep(200);
            if (!isAutoPilotActive) { autoPilotRunningCycle = false; return; }
            const currentSig = getQuestionsFingerprint();
            if (currentSig && currentSig !== initialQuestionsSig) {
              didAutoAdvance = true;
              break;
            }
          }
        }

        if (didAutoAdvance) {
          lastHandledQuestionFingerprint = initialQuestionsSig;
          updateHUDStatus("analyzing", "⚡ সার্ভে নিজে থেকেই পরবর্তী প্রশ্নে চলে গেছে! তাৎক্ষণিক নতুন প্রশ্ন সমাধান শুরু হচ্ছে...");
          autoPilotRunningCycle = false;
          setTimeout(() => {
            if (isAutoPilotActive && !autoPilotRunningCycle) {
              triggerAutoPilotCycle();
            }
          }, 400);
          return;
        }

        // If after 3 seconds it did not auto-advance, click Next / Submit
        const isFinalPage = isLastSurveyPage(analysisData) || isLastPageInitial;
        const nextBtn = findNextButton();
        if (nextBtn) {
          updateHUDStatus("done", isFinalPage ? "🛑 লাস্ট পেজ: সাবমিট বাটনে ক্লিক করা হচ্ছে..." : "🤖 ৩ সেকেন্ড অপেক্ষা শেষে Next বাটনে ক্লিক করা হচ্ছে...");
          await sleep(250);
          lastHandledQuestionFingerprint = initialQuestionsSig;
          clickElementLikeHuman(nextBtn);

          // Schedule next cycle for dynamic SPAs or multi-step question flow
          if (!isFinalPage) {
            setTimeout(() => {
              if (isAutoPilotActive && !autoPilotRunningCycle) {
                triggerAutoPilotCycle();
              }
            }, 1400);
          }
        } else {
          lastHandledQuestionFingerprint = initialQuestionsSig;
          updateHUDStatus("analyzing", "🤖 ইন-পেজ সার্ভে: কোনো Next বাটন নেই, পরবর্তী প্রশ্ন পর্যবেক্ষণ করা হচ্ছে...");

          // Polling loop for in-place question transitions (supports 10-15+ sequential questions on same page!)
          let detectedNextQuestion = false;
          let detectedDelayedNextBtn = null;
          const pollStart = Date.now();
          const maxWaitMs = 14000; // monitor for up to 14 seconds

          while (Date.now() - pollStart < maxWaitMs) {
            await sleep(600);
            if (!isAutoPilotActive) { autoPilotRunningCycle = false; return; }

            const currentSig = getQuestionsFingerprint();
            if (currentSig && currentSig !== initialQuestionsSig) {
              console.log("[Jarvis AutoPilot] Next in-place question detected! Proceeding to next question in sequence...");
              detectedNextQuestion = true;
              break;
            }

            const delayedBtn = findNextButton();
            if (delayedBtn && isElementVisible(delayedBtn)) {
              detectedDelayedNextBtn = delayedBtn;
              break;
            }
          }

          if (detectedNextQuestion) {
            // Human reading pause for next question (2.5s - 4.0s)
            const humanReadMs = 2600 + Math.random() * 1200;
            updateHUDStatus("analyzing", `🤖 পরবর্তী প্রশ্ন দৃশ্যমান হয়েছে! মানুষের মতো পর্যবেক্ষণ চলছে (${(humanReadMs / 1000).toFixed(1)}s)...`);
            autoPilotRunningCycle = false;
            setTimeout(() => {
              if (isAutoPilotActive && !autoPilotRunningCycle) {
                triggerAutoPilotCycle();
              }
            }, humanReadMs);
            return;
          }

          if (detectedDelayedNextBtn) {
            const nextWaitMs = 2800 + Math.random() * 1000;
            updateHUDStatus("done", `🤖 সমস্ত প্রশ্ন সম্পন্ন, Next বাটনে ক্লিক করা হচ্ছে (${(nextWaitMs / 1000).toFixed(1)}s)...`);
            await sleep(nextWaitMs);
            if (!isAutoPilotActive) { autoPilotRunningCycle = false; return; }
            clickElementLikeHuman(detectedDelayedNextBtn);
            setTimeout(() => {
              if (isAutoPilotActive && !autoPilotRunningCycle) {
                triggerAutoPilotCycle();
              }
            }, 3200);
            return;
          }

          updateHUDStatus("done", "🤖 পেজের উত্তর সম্পন্ন। স্বয়ংক্রিয় পরিবর্তনের জন্য ব্যাকগ্রাউন্ডে পর্যবেক্ষণ চলছে...");
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
        toggleHUD(true);
        updateHUDStatus("analyzing", "⚡ ম্যানুয়াল মোড: সম্পূর্ণ পেজ বিশ্লেষণ করা হচ্ছে...");

        let analysisData = null;
        let filledCount = 0;
        let isScreenshot = false;

        // Step 1: Attempt DOM Extraction
        const questions = extractSurveyQuestions();
        if (questions.length > 0) {
          const scanRes = await performFullScan();
          if (scanRes && scanRes.success && scanRes.data && scanRes.data.answers?.length > 0) {
            analysisData = scanRes.data;
            renderAnalysisInHUD(analysisData);
            renderProminentAnswersBox(analysisData);
            attachInPageAnswerBadges(analysisData);
            updateHUDStatus("analyzing", "⚡ মানুষের মতো উত্তর সিলেক্ট ও পূরণ করা হচ্ছে...");
            const fillRes = await autoFillAnswers(analysisData);
            filledCount = fillRes.filledCount;
            if (fillRes.autoAdvanced) {
              updateHUDStatus("done", "⚡ উত্তর সিলেক্ট করা মাত্রই সার্ভে স্বয়ংক্রিয়ভাবে পরবর্তী প্রশ্নে চলে গেছে!");
              return { success: true, filledCount, autoAdvanced: true, data: analysisData };
            }
          }
        }

        // Step 2: Fallback to Screenshot if DOM found 0 questions or failed or 0 answers filled
        if (!analysisData || filledCount === 0 || !analysisData.answers || analysisData.answers.length === 0) {
          updateHUDStatus("analyzing", "📸 পেজ সরাসরি সিলেক্ট করা যায়নি! সম্পূর্ণ পেজের স্ক্রিনশট নিয়ে সঠিক উত্তর নির্ণয় করা হচ্ছে...");
          const ssRes = await performScreenshotAnalysis();
          if (ssRes && ssRes.success && ssRes.data) {
            analysisData = ssRes.data;
            filledCount = ssRes.filledCount || 0;
            isScreenshot = true;
            renderAnalysisInHUD(analysisData);
            renderProminentAnswersBox(analysisData);
            attachInPageAnswerBadges(analysisData);
          } else if (!analysisData || !analysisData.answers || analysisData.answers.length === 0) {
            updateHUDStatus("error", ssRes?.error || "Analysis failed.");
            return { success: false, message: ssRes?.error || "Analysis failed." };
          }
        }

        // Save to storage
        if (analysisData) {
          lastAnalysisResult = analysisData;
          chrome.storage.local.set({ lastAnalysisResult: analysisData });
          renderProminentAnswersBox(analysisData);
          attachInPageAnswerBadges(analysisData);
        }

        if (autoProceed) {
          await sleep(1500 + Math.random() * 500);
          const nextBtn = findNextButton();
          if (nextBtn) {
            clickElementLikeHuman(nextBtn);
            return { success: true, filledCount, proceeded: true, data: analysisData, isScreenshot };
          }
        }

        if (filledCount > 0) {
          updateHUDStatus("done", isScreenshot
            ? `✅ স্ক্রিনশট থেকে ${filledCount}টি উত্তর সিলেক্ট করা হয়েছে! নিচে সঠিক উত্তরসমূহ বোল্ড করে দেখানো হলো, দেখে Next চাপুন।`
            : `✅ ম্যানুয়াল মোড: ${filledCount}টি উত্তর মানুষের মতো পূরণ সম্পন্ন! আপনি দেখে নিয়ে Next চাপুন।`);
        } else {
          updateHUDStatus("done", `💡 পেজে উত্তর অটো-সিলেক্ট বা টাইপ করা যায়নি—নিচে ও পেজে বোল্ড করে দেখানো হলো: '👉 এটা হবে সঠিক উত্তর'। দেখে সিলেক্ট বা টাইপ করে Next চাপুন।`);
        }

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
        "finish", "done", "valider", "suivant", "weiter", "siguiente", "terminar", "avancer",
        ">", "»", "→", ">>", "chevron_right", "arrow_forward", "forward_arrow"
      ];
      const excludeKeywords = ["back", "previous", "পূর্ববর্তী", "retour", "zurück", "atrás", "prev", "<", "«", "←"];

      // Helper: check if element or its children contains right-arrow SVG or icon
      function hasRightArrowIcon(el) {
        if (!el) return false;
        const txt = (el.innerText || el.textContent || "").trim();
        if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || txt === "▶") return true;

        const svgs = el.querySelectorAll("svg, i, span[class*='icon' i], [class*='chevron' i], [class*='arrow' i]");
        for (const icon of svgs) {
          const cls = (icon.getAttribute("class") || icon.className || "").toString().toLowerCase();
          if (cls.includes("right") || cls.includes("forward") || cls.includes("next") || cls.includes("chevron") || cls.includes("arrow")) {
            return true;
          }
          const paths = icon.querySelectorAll("path, polygon, polyline");
          if (paths.length > 0) return true;
        }
        const aria = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
        if (aria.includes("next") || aria.includes("forward") || aria.includes("continue") || aria.includes("proceed")) return true;
        const svgAria = el.querySelector("svg[aria-label*='next' i], svg[title*='next' i], svg[aria-label*='forward' i]");
        if (svgAria) return true;
        return false;
      }

      // 1. Specific button selectors commonly used in survey platforms (MrlWeb, Confirmit, Kantar, Qualtrics, Appinio, Decipher, etc.)
      const explicitSelectors = [
        'input[name="_NNext"]', 'button[name="_NNext"]', 'input[name*="Next" i]', 'button[name*="Next" i]',
        '.mrNext', '.nextNav', '#nextBtn', '#btnNext', '#NextButton', '.NextButton',
        'input[type="submit"]', 'button[type="submit"]',
        '.next-btn', '.btn-next', '#next-button', '#btn_next', '.forward-btn', '.btn-forward',
        '.submit-btn', '.btn-submit', '.survey-page__next-button', '.survey-next', '.survey-submit',
        '[data-action="next"]', '[data-action="submit"]', '[data-direction="next"]',
        '[aria-label*="next" i]', '[title*="next" i]', '[aria-label*="continue" i]',
        'button[class*="next" i]', 'a[class*="next" i]', 'div[class*="next" i][role="button"]'
      ];

      for (const sel of explicitSelectors) {
        const matched = document.querySelectorAll(sel);
        for (const btn of matched) {
          if (isElementVisible(btn) && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
            const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
            if (!excludeKeywords.some(kw => txt.includes(kw))) {
              return btn;
            }
          }
        }
      }

      // 2. Search bottom navigation / footer bars for arrow or next buttons (e.g. sa.ktrmr.com, Decipher, Appinio)
      const bottomContainers = document.querySelectorAll(
        "#mrForm, .survey-footer, .footer, .nav-buttons, .navigation, .bottom-bar, .survey-bottom, .buttonBar, .bottom-nav, .nav-bar, .survey-navigation, [class*='bottom-nav' i], [class*='footer' i], [class*='navigation' i], [class*='nav' i], [class*='action' i]"
      );
      for (const container of bottomContainers) {
        const btns = Array.from(container.querySelectorAll("button, input[type='button'], input[type='submit'], a, div[role='button'], div[class*='btn' i], div[class*='button' i], div[class*='next' i], div[class*='nav' i], span[role='button'], div, span"))
          .filter(b => isElementVisible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true" && !b.closest("#jarvis-hud-container"));

        // If container has 2 interactive elements (typical: [Back <] on left and [Next >] on right)
        if (btns.length === 2) {
          const firstTxt = (btns[0].innerText || btns[0].value || "").trim().toLowerCase();
          const secondTxt = (btns[1].innerText || btns[1].value || "").trim().toLowerCase();
          if (excludeKeywords.some(kw => firstTxt === kw || firstTxt.includes(kw)) || firstTxt.includes("<")) {
            return btns[1];
          }
          if (secondTxt === ">" || hasRightArrowIcon(btns[1]) || nextKeywords.some(kw => secondTxt.includes(kw))) {
            return btns[1];
          }
          const r0 = btns[0].getBoundingClientRect();
          const r1 = btns[1].getBoundingClientRect();
          if (r1.left > r0.left) return btns[1];
        }

        for (const btn of btns) {
          const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
          if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || hasRightArrowIcon(btn) || nextKeywords.some(kw => txt === kw || txt.includes(kw))) {
            if (!excludeKeywords.some(kw => txt.includes(kw))) {
              return btn;
            }
          }
        }
      }

      // 3. Rightmost or Centered Colored Block in bottom navigation area (Direct fix for Kantar, Decipher, Appinio)
      // Handles Screenshots 1, 2, 3: full-width blue bar with centered '>' or split footer with '>' on right
      const bottomElements = Array.from(document.querySelectorAll("div, button, a, footer, [class*='footer' i], [class*='bottom' i], [class*='nav' i]")).filter(el => {
        if (!isElementVisible(el) || el.closest("#jarvis-hud-container")) return false;
        const rect = el.getBoundingClientRect();
        if (rect.bottom >= window.innerHeight * 0.65 && rect.height >= 26) {
          const txt = (el.innerText || el.textContent || "").trim().toLowerCase();
          if (excludeKeywords.some(kw => txt === kw || (txt.startsWith(kw) && txt.length < 8))) return false;
          if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || hasRightArrowIcon(el)) {
            return true;
          }
          // Check if styled with blue/primary color (Kantar/Decipher brand colors)
          const bg = window.getComputedStyle(el).backgroundColor;
          if (bg && /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.test(bg)) {
            const [_, r, g, b] = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/).map(Number);
            if (b > 110 && b > r + 15) {
              // Centered or right-aligned arrow button inside blue bar
              if (hasRightArrowIcon(el) || el.querySelector("svg, [class*='arrow' i], [class*='chevron' i], path") || rect.left > window.innerWidth * 0.25) {
                return true;
              }
            }
          }
        }
        return false;
      });

      if (bottomElements.length > 0) {
        // Prioritize exact right arrow icon or chevron
        const withArrow = bottomElements.find(el => hasRightArrowIcon(el) || (el.innerText || "").trim() === ">");
        if (withArrow) {
          const innerClickable = withArrow.querySelector("button, [role='button'], a, svg") || withArrow;
          return innerClickable;
        }
        const sorted = bottomElements.sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return rb.left - ra.left; // Rightmost first
        });
        return sorted[0];
      }

      // 4. All clickable buttons and anchors matching next keywords or right arrow
      const allButtons = document.querySelectorAll("button, input[type='button'], a.btn, a.button, [role='button'], div.button");
      for (const btn of allButtons) {
        if (!isElementVisible(btn) || btn.disabled || btn.getAttribute("aria-disabled") === "true") continue;
        const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
        if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || hasRightArrowIcon(btn) || nextKeywords.some((kw) => txt === kw || txt.includes(kw))) {
          if (!excludeKeywords.some((kw) => txt.includes(kw))) {
            return btn;
          }
        }
      }

      // 5. Primary / blue styled action button on bottom half of page (common in modern surveys like Decipher/Appinio)
      const primaryButtons = Array.from(document.querySelectorAll('.btn-primary, button.primary, [class*="primary" i], .survey-button-next, .c-button--primary')).filter(isElementVisible);
      for (const pb of primaryButtons) {
        const rect = pb.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.4) {
          const txt = (pb.innerText || pb.value || "").trim().toLowerCase();
          if (!excludeKeywords.some(kw => txt.includes(kw)) && (txt === ">" || hasRightArrowIcon(pb) || nextKeywords.some(kw => txt.includes(kw)) || txt === "")) {
            return pb;
          }
        }
      }

      // 6. Fallback for Qualtrics / Decipher / Toluna specific next elements
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
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        // Radios and checkboxes in modern styled surveys (MrlWeb, Confirmit, Kantar) are frequently
        // visually hidden (opacity: 0, position: absolute, clip, 0px) while their label/card is visible!
        if (["radio", "checkbox"].includes(el.type)) {
          const parentOrLabel = (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null) ||
            el.closest("label") ||
            el.parentElement ||
            el.closest("tr, .mrRow, .mrCard, .card, td");
          if (parentOrLabel) {
            const pStyle = window.getComputedStyle(parentOrLabel);
            if (pStyle.display !== "none" && pStyle.visibility !== "hidden") {
              if (parentOrLabel.offsetWidth > 0 || parentOrLabel.offsetHeight > 0 || (parentOrLabel.getClientRects && parentOrLabel.getClientRects().length > 0)) {
                return true;
              }
            }
          }
        }
        if (style.opacity === "0" && !["radio", "checkbox"].includes(el.type)) {
          return false;
        }
        return !!(el.offsetWidth > 0 || el.offsetHeight > 0 || (el.getClientRects && el.getClientRects().length > 0));
      } catch (e) {
        return true;
      }
    }

    function clickElementLikeHuman(el) {
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (_) {}

      const opts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
      try {
        el.dispatchEvent(new PointerEvent("pointerover", opts));
        el.dispatchEvent(new MouseEvent("mouseenter", opts));
        el.dispatchEvent(new MouseEvent("mouseover", opts));
        el.dispatchEvent(new PointerEvent("pointerdown", opts));
        el.dispatchEvent(new MouseEvent("mousedown", opts));
        el.focus();
        el.dispatchEvent(new PointerEvent("pointerup", opts));
        el.dispatchEvent(new MouseEvent("mouseup", opts));
        el.dispatchEvent(new MouseEvent("click", opts));
        if (typeof el.click === "function") {
          el.click();
        }
      } catch (err) {
        try { el.click(); } catch (_) {}
      }
    }

    /**
     * =========================================================================
     * 3. UNIVERSAL DOM SCRAPER: Extracts survey questions and options
     * Works across Confirmit (sa.ktrmr.com / mrlWeb), Qualtrics, SurveyMonkey,
     * Decipher, Cint, Dynata, Google Forms, and custom modern cards
     * =========================================================================
     */
    function extractSurveyQuestions() {
      const questions = [];
      let qIndex = 0;
      const trackedElements = new Set();

      // Special helper: detect question title and contextual prompt on any survey platform
      function detectPageQuestionTitle() {
        let mainQuestion = "";
        let contextPrompt = "";

        const titleCandidates = document.querySelectorAll(
          ".mrQuestionText, .mrBannerText, .mrQuestionTextContainer, .QuestionText, .question-text, .q-title, h1, h2, h3, h4, [role='heading'], legend, [class*='question' i]:not([class*='option' i]):not([class*='choice' i]):not([class*='item' i]), [class*='prompt' i], [class*='title' i]"
        );
        for (const t of titleCandidates) {
          if (!isElementVisible(t) || t.closest("#jarvis-hud-container")) continue;
          const txt = cleanText(t.innerText);
          if (txt && txt.length > 5 && !/jarvis|copilot/i.test(txt) && !/terms|privacy|cookie/i.test(txt)) {
            if (!mainQuestion) mainQuestion = txt;
            else if (!contextPrompt && txt !== mainQuestion && txt.length < 80) contextPrompt = txt;
          }
        }

        // Check for strong, heading, or paragraph ending with question mark or asking survey question
        if (!mainQuestion) {
          const pTags = document.querySelectorAll("p, strong, b, div, span");
          for (const p of pTags) {
            if (!isElementVisible(p) || p.children.length > 3 || p.closest("#jarvis-hud-container")) continue;
            const txt = cleanText(p.innerText);
            if (txt && txt.length > 10 && txt.length < 350 && (txt.includes("?") || /select|which of|how much|when added|what color|associate with/i.test(txt)) && !/jarvis|copilot/i.test(txt)) {
              mainQuestion = txt;
              break;
            }
          }
        }

        // Check for intermediate context banner card (e.g. "With dinner", "For breakfast")
        const contextCards = document.querySelectorAll('[class*="banner" i], [class*="context" i], [class*="prompt" i], [class*="card" i] strong, [class*="header" i] h2, [class*="header" i] h3');
        for (const cc of contextCards) {
          if (!isElementVisible(cc) || cc.closest("#jarvis-hud-container")) continue;
          const cTxt = cleanText(cc.innerText);
          if (cTxt && cTxt.length >= 3 && cTxt.length <= 60 && cTxt !== mainQuestion && !/next|back|jarvis/i.test(cTxt)) {
            if (/with|for|at|during|about|category|brand/i.test(cTxt)) {
              contextPrompt = cTxt;
              break;
            }
          }
        }

        if (mainQuestion && contextPrompt && !mainQuestion.includes(contextPrompt)) {
          return `${mainQuestion} (Context: ${contextPrompt})`;
        }
        return mainQuestion || "";
      }

      // A. Confirmit / MrlWeb / Kantar specific parser (e.g. sa.ktrmr.com)
      const mrlQuestions = document.querySelectorAll(".mrQuestionTable, .mrQuestion, form#mrForm .mrGrid, form[name='mrForm'] table");
      mrlQuestions.forEach((mrContainer) => {
        if (!isElementVisible(mrContainer)) return;
        const qTextEl = mrContainer.querySelector(".mrQuestionText, .mrBannerText, th, legend") ||
          document.querySelector(".mrQuestionText, .mrBannerText");
        const qText = cleanText(qTextEl ? qTextEl.innerText : "") || detectPageQuestionTitle() || `Survey Question ${qIndex + 1}`;

        const inputs = Array.from(mrContainer.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        if (inputs.length > 0) {
          const isMulti = inputs.some(i => i.type === "checkbox") || /select no more than|select all|which of the following|attributes/i.test(qText);
          const opts = [];
          inputs.forEach((input) => {
            trackedElements.add(input);
            const label = getElementVisualLabel(input) || input.value || `Option ${opts.length + 1}`;
            opts.push({
              id: assignTemporaryId(input),
              name: input.name || "",
              type: input.type,
              value: input.value || "",
              label: label,
              element: input
            });
          });

          if (opts.length > 0) {
            questions.push({
              index: qIndex++,
              type: isMulti ? "multiple_choice" : "single_choice",
              text: qText,
              options: opts
            });
          }
        }
      });

      // B. Matrix / table questions
      const tables = document.querySelectorAll("table, .matrix-table, .grid-table");
      tables.forEach((table) => {
        if (!isElementVisible(table) || table.closest(".mrQuestionTable")) return;
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

      // C. Explicit Question Containers (Qualtrics, Decipher, Kantar, SurveyMonkey, etc.)
      const containerSelectors = [
        ".QuestionOuter", ".question", ".survey-question", "fieldset", "[role='radiogroup']",
        ".form-group", ".ss-form-question", ".survey-page__question", ".question-block",
        ".survey-card", ".survey-row", ".q-container", "[data-question-id]", ".survey-question-item",
        ".mrQuestionTable", ".mrQuestion", ".mrQuestionTextContainer", ".mrGrid", ".mrMultiple", ".mrSingle",
        "form#mrForm", "form[name='mrForm']", ".mrlWeb", ".card-question", ".grid-question",
        ".answers-list", ".options-container", ".choice-group", ".choice-table", "[data-question-name]",
        "[class*='question-container' i]", "[class*='question_container' i]", "[class*='survey-question' i]"
      ].join(", ");

      const questionContainers = document.querySelectorAll(containerSelectors);
      questionContainers.forEach((container) => {
        if (!isElementVisible(container)) return;
        const titleEl = container.querySelector(
          "legend, .QuestionText, .question-text, .title, .q-title, h1, h2, h3, h4, h5, .control-label, [role='heading'], .mrQuestionText, .mrBannerText"
        );
        const qText = cleanText(titleEl ? titleEl.innerText : container.innerText.slice(0, 150)) || detectPageQuestionTitle() || `Question ${qIndex + 1}`;

        const rawElements = Array.from(container.querySelectorAll(
          "input, select, textarea, [role='radio'], [role='checkbox'], [role='option'], .choice, .option, .answer, .survey-option, .btn-choice, [data-choice], [data-value], .mrCard, [class*='option' i], [class*='choice' i], [class*='answer' i]"
        ));
        let validInputs = rawElements.filter((inp) => {
          const t = (inp.getAttribute("type") || inp.tagName.toLowerCase()).toLowerCase();
          return !["hidden", "submit"].includes(t) && !trackedElements.has(inp);
        });

        if (validInputs.length === 0) {
          const customChoices = Array.from(container.querySelectorAll("button, [role='button'], label.option-row, li, .card, .mrCard, td.mrGridCell")).filter(el => isElementVisible(el) && !trackedElements.has(el));
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

      // D. Dedicated Appinio & Modern SPA Parser (Handles Screenshot 1: Appinio custom option rows)
      if (questions.length === 0 || window.location.href.includes("appinio") || document.body.innerHTML.includes("appinio")) {
        const appinioQuestion = detectPageQuestionTitle();
        // Look for Appinio option rows: elements styled as choice boxes
        const appinioOptions = Array.from(document.querySelectorAll(
          '[class*="option" i], [class*="answer" i], [class*="choice" i], [class*="item" i], [role="radio"], [role="checkbox"], [data-testid*="option" i], [data-testid*="choice" i], [data-testid*="answer" i], div:has(> [class*="radio" i]), div:has(> [class*="circle" i])'
        )).filter(el => {
          if (!isElementVisible(el) || trackedElements.has(el)) return false;
          // Filter out header, footer, HUD elements
          if (el.closest("#jarvis-hud-container") || el.closest("header") || el.closest("nav") || el.closest("footer")) return false;
          const txt = cleanText(el.innerText || "");
          return txt.length > 0 && txt.length < 150 && !/jarvis|copilot|next|back|previous/i.test(txt);
        });

        if (appinioOptions.length >= 2) {
          // If elements are nested inside each other, keep the outer option card/row
          const topLevelOptions = appinioOptions.filter(el => !appinioOptions.some(parent => parent !== el && parent.contains(el)));
          if (topLevelOptions.length >= 2) {
            const isMulti = /select all|select any|multiple|choose all/i.test(appinioQuestion);
            const opts = [];
            topLevelOptions.forEach((optEl) => {
              trackedElements.add(optEl);
              const label = cleanText(optEl.innerText || "");
              opts.push({
                id: assignTemporaryId(optEl),
                name: "appinio_choice",
                type: isMulti ? "checkbox" : "radio",
                value: label,
                label: label,
                element: optEl
              });
            });

            if (opts.length > 0) {
              questions.push({
                index: qIndex++,
                type: isMulti ? "multiple_choice" : "single_choice",
                text: appinioQuestion || "Appinio Survey Question",
                options: opts
              });
            }
          }
        }
      }

      // E. Dedicated Brand / Image Choice Grid Parser (Handles Screenshot 2: Wine/Champagne brand cards)
      if (questions.length === 0) {
        // Find containers with multiple image/logo cards or tiles (common in brand association surveys)
        const candidateGridContainers = Array.from(document.querySelectorAll(
          '[class*="grid" i], [class*="matrix" i], [class*="cards" i], [class*="brands" i], [class*="tiles" i], [class*="list" i], [class*="container" i], table, tbody, div'
        ));

        for (const grid of candidateGridContainers) {
          if (!isElementVisible(grid) || grid.closest("#jarvis-hud-container")) continue;
          
          // Children that contain either an image/logo or text like "None of the above"
          const directTiles = Array.from(grid.children).filter(ch => {
            if (!isElementVisible(ch) || ch.closest("#jarvis-hud-container")) return false;
            const hasImgOrSvg = !!ch.querySelector("img, svg, picture, [class*='logo' i], [class*='icon' i]");
            const txt = cleanText(ch.innerText || ch.getAttribute("aria-label") || ch.querySelector("img")?.alt || "");
            return (hasImgOrSvg || /none of the above|not applicable|neither/i.test(txt)) && txt.length >= 1 && txt.length <= 80 && !/jarvis|copilot|next|back/i.test(txt);
          });

          if (directTiles.length >= 3 && directTiles.length <= 60) {
            const heading = detectPageQuestionTitle() || "Which of these brands do you associate with...? Select all that apply.";
            const isMulti = /select all|associate with|which of these|apply|multiple/i.test(heading);
            const opts = [];
            directTiles.forEach((tileEl) => {
              trackedElements.add(tileEl);
              const brandName = cleanText(tileEl.innerText || tileEl.getAttribute("aria-label") || tileEl.querySelector("img")?.alt || "Option");
              opts.push({
                id: assignTemporaryId(tileEl),
                name: "brand_choice",
                type: isMulti ? "checkbox" : "radio",
                value: brandName,
                label: brandName,
                element: tileEl
              });
            });

            if (opts.length >= 3) {
              questions.push({
                index: qIndex++,
                type: isMulti ? "multiple_choice" : "single_choice",
                text: heading,
                options: opts
              });
              break;
            }
          }
        }
      }

      // F. Universal Fallback: Scan any untracked native radios, checkboxes
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
          const heading = findPrecedingHeading(first) || detectPageQuestionTitle() || `Survey Question (${qIndex + 1})`;
          const isCheck = elements.some(el => el.type === "checkbox") || /select no more than|select all|which of the following|attributes/i.test(heading);
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
            type: isCheck ? "multiple_choice" : "single_choice",
            text: cleanText(heading),
            options: opts
          });
        }
      }

      // G. Generic Sibling Choice Groups Fallback (Any list of 2+ sibling clickable options)
      if (questions.length === 0) {
        const candidateContainers = document.querySelectorAll("ul, ol, div, form, section, main");
        for (const c of candidateContainers) {
          if (!isElementVisible(c) || c.closest("#jarvis-hud-container")) continue;
          const directChildren = Array.from(c.children).filter(ch => {
            if (!isElementVisible(ch)) return false;
            const t = cleanText(ch.innerText || "");
            return t.length >= 1 && t.length <= 100 && !/jarvis|copilot|next|back|previous/i.test(t);
          });

          const choiceLikeChildren = directChildren.filter(ch => {
            const hasInputOrBtn = ch.querySelector("input, button, [role='button'], [role='radio'], [role='checkbox'], svg");
            const tag = ch.tagName.toLowerCase();
            const cls = (ch.className || "").toString().toLowerCase();
            const isChoiceTag = ["li", "button", "label"].includes(tag);
            const isChoiceClass = /choice|option|answer|item|card|tile|brand|response|btn|row/i.test(cls);
            const shortText = (ch.innerText || "").trim().length >= 1 && (ch.innerText || "").trim().length <= 90;
            return (hasInputOrBtn || isChoiceTag || isChoiceClass || shortText);
          });

          if (choiceLikeChildren.length >= 2 && choiceLikeChildren.length <= 40) {
            const heading = detectPageQuestionTitle() || findPrecedingHeading(choiceLikeChildren[0]) || `Survey Question (${qIndex + 1})`;
            const isMulti = /select all|select any|apply|multiple/i.test(heading);
            const opts = choiceLikeChildren.map(el => {
              trackedElements.add(el);
              const label = cleanText(el.innerText || "");
              return {
                id: assignTemporaryId(el),
                name: "generic_choice",
                type: isMulti ? "checkbox" : "radio",
                value: label,
                label: label,
                element: el
              };
            });

            questions.push({
              index: qIndex++,
              type: isMulti ? "multiple_choice" : "single_choice",
              text: cleanText(heading),
              options: opts
            });
            break;
          }
        }
      }

      // H. Scan untracked text inputs & textareas (Open-ended survey questions)
      const untrackedTextInputs = Array.from(
        document.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="number"], input[type="tel"]')
      ).filter(el => !trackedElements.has(el) && isElementVisible(el));

      untrackedTextInputs.forEach((txtInput) => {
        trackedElements.add(txtInput);
        const heading = findPrecedingHeading(txtInput) || detectPageQuestionTitle() || `Please write your response (${qIndex + 1})`;
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

      // I. Ultimate Page Fallback: Guarantees questions array is never empty if page has text!
      if (questions.length === 0) {
        const pageTitle = detectPageQuestionTitle();
        if (pageTitle) {
          const allClickables = Array.from(document.querySelectorAll(
            'button, [role="button"], label, div[tabindex], div[role="radio"], div[role="checkbox"], li, div[class*="option" i], div[class*="choice" i]'
          )).filter(el => {
            if (!isElementVisible(el) || el.closest("#jarvis-hud-container")) return false;
            const t = cleanText(el.innerText || "");
            return t.length > 1 && t.length < 80 && !/next|back|previous|submit|continue/i.test(t);
          });

          if (allClickables.length >= 2) {
            const opts = allClickables.slice(0, 30).map(el => {
              trackedElements.add(el);
              const label = cleanText(el.innerText || "");
              return {
                id: assignTemporaryId(el),
                name: "fallback_choice",
                type: "radio",
                value: label,
                label: label,
                element: el
              };
            });
            questions.push({
              index: qIndex++,
              type: "single_choice",
              text: pageTitle,
              options: opts
            });
          }
        }
      }

      return questions;
    }

    function getElementVisualLabel(el) {
      if (!el) return "";
      // 1. Explicit label[for]
      if (el.id) {
        try {
          const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (explicitLabel && cleanText(explicitLabel.innerText)) {
            return cleanText(explicitLabel.innerText);
          }
        } catch (_) { }
      }
      // 2. Wrapped in label
      const parentLabel = el.closest("label");
      if (parentLabel && cleanText(parentLabel.innerText)) {
        return cleanText(parentLabel.innerText);
      }
      // 3. Confirmit / MrlWeb grid label in row or cell
      const mrRow = el.closest("tr, .mrRow");
      if (mrRow) {
        const rowLabel = mrRow.querySelector("td.mrGridLabel, th, label, .mrLabel, span.mrQuestionText, span.mrMultiple, span.mrSingle");
        if (rowLabel && cleanText(rowLabel.innerText)) {
          return cleanText(rowLabel.innerText);
        }
      }
      // 4. Parent choice container (e.g. .form-check, .custom-control, .option, .choice, .mrCard, div, li)
      const container = el.closest(".form-check, .custom-control, .option, .choice, .option-row, .radio, .checkbox, li, tr, .mrCard, td");
      if (container) {
        const lblInContainer = container.querySelector("label, .mrGridLabel, span.mrQuestionText, span.mrMultiple, span.mrSingle, .choice-text");
        if (lblInContainer && cleanText(lblInContainer.innerText)) {
          return cleanText(lblInContainer.innerText);
        }
        if (cleanText(container.innerText) && cleanText(container.innerText).length < 200) {
          return cleanText(container.innerText);
        }
      }
      // 5. Next sibling text / span / label
      let sib = el.nextElementSibling;
      if (sib && cleanText(sib.innerText)) {
        return cleanText(sib.innerText);
      }
      if (el.nextSibling && cleanText(el.nextSibling.textContent)) {
        return cleanText(el.nextSibling.textContent);
      }
      // 6. Value, aria-label, title, placeholder
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

      updateHUDStatus("analyzing", `🤖 AI ইঞ্জিন দিয়ে ${questions.length}টি প্রশ্ন মানুষের মতো বিশ্লেষণ হচ্ছে...`);

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
      renderProminentAnswersBox(response.data);
      attachInPageAnswerBadges(response.data);
      highlightAnswersOnPage(response.data);
      const modelTag = response.modelUsed || "AI";
      const providerTag = response.providerUsed ? ` [${response.providerUsed}]` : "";
      if (response.data?.is_from_cache) {
        updateHUDStatus("done", `⚡ ${response.providerUsed || "Memory"}: মানুষের মতো ${response.data.answers?.length || questions.length}টি উত্তর ইনস্ট্যান্ট প্রস্তুত! (API কল সাশ্রয়)`);
      } else {
        updateHUDStatus("done", `✅ ${modelTag}${providerTag}: মানুষের মতো ${response.data.answers?.length || questions.length}টি উত্তর প্রস্তুত!`);
      }

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
          ".question-block, .survey-question, .question, .QuestionOuter, fieldset, [role='radiogroup'], .form-group, .survey-card, .survey-row, tr, .mrQuestionTable, .mrQuestion, form#mrForm, .mrGrid"
        );
        for (const c of allContainers) {
          if (qText && c.innerText.toLowerCase().includes(qText)) {
            scopedElements = Array.from(c.querySelectorAll(
              'input, [role="radio"], [role="checkbox"], [role="option"], [role="button"], button, label, .choice, .option, .answer, .survey-option, .btn-choice, .custom-control, .form-check, select, textarea, li, td, .mrCard, .card, td.mrGridCell, td.mrGridLabel, tr.mrRow, span.mrMultiple, span.mrSingle'
            ));
            break;
          }
        }
      }

      // Global pool of interactive survey elements (Appinio, brand grids, tables, radios, cards)
      const globalElements = Array.from(document.querySelectorAll(
        'input, [role="radio"], [role="checkbox"], [role="option"], [role="button"], button, label, .choice, .option, .answer, .survey-option, .btn-choice, .custom-control, .form-check, select, textarea, li, td, .mrCard, .card, td.mrGridCell, td.mrGridLabel, tr.mrRow, span.mrMultiple, span.mrSingle, [class*="option" i], [class*="answer" i], [class*="choice" i], [class*="item" i], [class*="tile" i], [class*="brand" i], [data-choice], [data-value], [data-testid*="option" i], [data-testid*="choice" i], [data-testid*="answer" i], div[tabindex]'
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

        // Pass 4: Numeric token match (e.g. "50", "1976", "125000", "2", "4", "750-800", "7500")
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

      // Pass 6: Deep DOM Text Matcher (Fallback for Appinio, Brand Grids, React custom divs)
      const allShallowNodes = Array.from(document.querySelectorAll('div, span, p, label, button, a, li, td, b, strong, h1, h2, h3, h4')).filter(el => {
        if (!isElementVisible(el) || el.closest("#jarvis-hud-container")) return false;
        return el.children.length <= 4;
      });

      for (const node of allShallowNodes) {
        const nodeText = cleanText(node.innerText || node.textContent || "").toLowerCase().trim();
        if (nodeText === cleanTarget || isWordMatch(nodeText, cleanTarget)) {
          return resolveInteractiveTarget(node);
        }
      }

      return null;
    }

    /**
     * Given an option element (label, div, or container), finds the actual clickable element
     */
    function resolveInteractiveTarget(el) {
      if (!el) return null;
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

      // Check parent row or cell for input
      const siblingInput = el.closest("tr, td, .mrRow, .mrCard")?.querySelector('input[type="radio"], input[type="checkbox"]');
      if (siblingInput) return siblingInput;

      // Check if clickable parent card/box exists (e.g. Appinio option row or brand card)
      const clickableParent = el.closest('[class*="option" i], [class*="answer" i], [class*="choice" i], [class*="item" i], [class*="card" i], [class*="tile" i], [class*="brand" i], [role="radio"], [role="checkbox"], [role="button"], button, label');
      if (clickableParent && isElementVisible(clickableParent)) {
        return clickableParent;
      }

      return el;
    }

    function highlightAnswersOnPage(data) {
      clearAllHighlights();
      if (!data || !data.answers) return;

      data.answers.forEach((ans, idx) => {
        const targetIds = ans.target_element_ids || [];
        const labels = ans.selected_labels || [];

        let foundEl = false;
        if (targetIds.length > 0) {
          targetIds.forEach((targetId) => {
            let el = document.getElementById(targetId) || document.querySelector(`[data-jarvis-optid="${targetId}"]`);
            if (el) {
              applyHighlightStyle(el, ans, idx + 1);
              foundEl = true;
            }
          });
        }

        if (!foundEl && labels.length > 0) {
          labels.forEach((lbl) => {
            let el = findInputByLabelOrValue(lbl, ans);
            if (el) {
              applyHighlightStyle(el, ans, idx + 1);
              foundEl = true;
            }
          });
        }
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

      // Universal answer normalization (guarantees seamless matching for Gemini Web & all AI formats)
      const normalizedAnswers = (data.answers || []).map((ans, idx) => {
        let qIdx = (typeof ans.question_index === "number") ? ans.question_index : (typeof ans.question_number === "number" ? ans.question_number - 1 : idx);
        let labels = Array.isArray(ans.selected_labels) ? [...ans.selected_labels] : [];
        if (labels.length === 0) {
          if (ans.selected_label) labels.push(String(ans.selected_label));
          else if (ans.answer && typeof ans.answer === "string") labels.push(ans.answer);
          else if (ans.choice) labels.push(String(ans.choice));
          else if (ans.value) labels.push(String(ans.value));
        }
        let action = ans.recommended_action || "select_radio";
        if (ans.recommended_action === "type_text" || ans.text_input_value || ans.text) {
          action = "type_text";
        }
        return {
          ...ans,
          question_index: qIdx,
          selected_labels: labels,
          recommended_action: action,
          target_element_ids: Array.isArray(ans.target_element_ids) ? ans.target_element_ids : [],
          text_input_value: ans.text_input_value || ans.text || (action === "type_text" && labels[0] ? labels[0] : null)
        };
      });

      if (normalizedAnswers.length > 0 && normalizedAnswers[0].question_index === 1 && !normalizedAnswers.some(a => a.question_index === 0)) {
        normalizedAnswers.forEach(a => { a.question_index -= 1; });
      }
      data.answers = normalizedAnswers;

      const { autoFillDelay } = await chrome.storage.local.get(["autoFillDelay"]);
      const isAuto = isAutoPilotActive;
      // High-speed human simulation: 100-180ms per option (rapid full-page filling in < 1 second)
      const baseDelay = customGapMs !== null ? customGapMs : (autoFillDelay !== undefined ? Math.min(autoFillDelay, 180) : 120);

      let filledCount = 0;
      const startQuestionsSig = getQuestionsFingerprint();
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

        // 2.5 Emergency Direct DOM Text Finder (Handles custom Kantar buttons, Stop sign options, Champagne brand cards)
        if ((!filledThisAnswer || isMultiple) && labels.length > 0) {
          for (const label of labels) {
            const cleanLbl = cleanText(label).toLowerCase();
            if (!cleanLbl || cleanLbl.length < 2) continue;
            const candidates = Array.from(document.querySelectorAll("button, label, [role='button'], [role='radio'], [role='checkbox'], div, span, p, td, li, a"))
              .filter(el => isElementVisible(el) && !el.closest("#jarvis-hud-container") && el.children.length <= 4);

            for (const cand of candidates) {
              const cText = cleanText(cand.innerText || cand.textContent || "").toLowerCase();
              if (cText === cleanLbl || (cText.length >= 3 && cleanLbl.length >= 3 && (cText.includes(cleanLbl) || cleanLbl.includes(cText)))) {
                const target = cand.closest("button, label, [role='button'], [role='radio'], [role='checkbox'], div, tr, td") || cand;
                await simulateHumanAction(target, ans);
                filledCount++;
                filledThisAnswer = true;
                if (!isMultiple) break;
              }
            }
            if (filledThisAnswer && !isMultiple) break;
          }
        }

        // 3. If action is type_text, message box, or open-ended textarea
        if (!filledThisAnswer && (ans.recommended_action === "type_text" || ans.text_input_value || (labels.length > 0 && labels[0].length > 15))) {
          const qObj = questions[ans.question_index];
          let targetEl = null;

          // Check options with text/textarea/input types
          const textOpt = qObj?.options?.find(o => ["text_input", "textarea", "text", "email", "number", "search", "url"].includes(o.type)) ||
            questions.flatMap(q => q.options).find(o => ["text_input", "textarea", "text", "email", "number"].includes(o.type) && isElementVisible(o.element));
          if (textOpt && textOpt.element) {
            targetEl = textOpt.element;
          }

          // Search in question container or document
          if (!targetEl) {
            const allContainers = document.querySelectorAll(".QuestionOuter, .question, .survey-question, fieldset, .form-group, .survey-card, .survey-row, tr");
            const qContainer = allContainers[ans.question_index] || document;
            targetEl = qContainer.querySelector('textarea, input[type="text"], input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"]), [contenteditable="true"]');
          }

          if (targetEl && isElementVisible(targetEl)) {
            await simulateHumanAction(targetEl, ans);
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

        // Check if single-question survey auto-advanced upon click
        if (filledThisAnswer && questions.length === 1) {
          await sleep(300);
          const currentSig = getQuestionsFingerprint();
          if (startQuestionsSig && currentSig && currentSig !== startQuestionsSig) {
            console.log("[Jarvis] Instant single-question auto-advance detected right after option selection!");
            updateHUDStatus("analyzing", "⚡ উত্তর সিলেক্ট করা মাত্রই সার্ভে স্বয়ংক্রিয়ভাবে পরবর্তী প্রশ্নে চলে গেছে!");
            return { success: true, filledCount, autoAdvanced: true };
          }
        }

        // Fast, natural inter-question delay (100-200ms) to ensure rapid full-page completion
        if (filledThisAnswer && ansIdx < data.answers.length - 1) {
          const pauseMs = baseDelay + Math.floor(Math.random() * 80);
          await sleep(pauseMs);
        } else {
          await sleep(40);
        }
      }

      // Safety Verification: Ensure zero questions were skipped or left unfilled!
      const endQuestionsSig = getQuestionsFingerprint();
      const autoAdvanced = Boolean(startQuestionsSig && endQuestionsSig && startQuestionsSig !== endQuestionsSig);

      if (!autoAdvanced) {
        const verifiedAdded = await verifyAndFillAllQuestions(data);
        filledCount += verifiedAdded;
      }

      return { success: true, filledCount, autoAdvanced };
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
      if (/income|monthly|salary|earn|revenue|added up|taxes|groceries/i.test(qText)) {
        if (/monthly|month|per month|net|added up|groceries|rent/i.test(qText)) {
          const matchMonthly = opts.find(o => /more than \$?7,?500|> ?\$?7,?500|7,?500\+|over \$?7,?500|between \$?6,?501 and \$?7,?500/i.test(o.label)) ||
            opts.find(o => /between \$?5,?501|between \$?4,?501/i.test(o.label));
          if (matchMonthly) return matchMonthly;
        }
        const match = opts.find(o => /125,000|125000|100,000|over 5,000|> 5,000|5,000\+/i.test(o.label)) ||
          opts.find(o => /50,000|75,000/i.test(o.label));
        if (match) return match;
      }

      // Attention check: Stop sign (Image 2)
      if (/stop sign|traffic stop/i.test(qText)) {
        const match = opts.find(o => /^red\b|color red/i.test(o.label));
        if (match) return match;
      }

      // Champagne / Brands associated with dinner (Image 3)
      if (/brands do you associate|with dinner/i.test(qText)) {
        const match = opts.find(o => /moët|veuve|chandon|taittinger|perrier/i.test(o.label)) ||
          opts.find(o => /none of the above/i.test(o.label));
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
        const textToType = (answer.text_input_value && answer.text_input_value !== "null")
          ? answer.text_input_value.trim()
          : (answer.selected_labels && answer.selected_labels[0] && answer.selected_labels[0].length > 3
            ? answer.selected_labels[0].trim()
            : "Overall positive experience with reliable and responsive service.");
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
          : (answer.selected_labels && answer.selected_labels[0] && answer.selected_labels[0].length > 3
            ? answer.selected_labels[0].trim()
            : "Overall positive experience with reliable and responsive service.");

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
      const associatedInput = (tag === "input" && ["radio", "checkbox"].includes(type) ? element : null) ||
        element.querySelector('input[type="radio"], input[type="checkbox"]') ||
        (element.htmlFor ? document.getElementById(element.htmlFor) : null) ||
        (element.id ? document.querySelector(`input[id="${CSS.escape(element.id)}"]`) : null) ||
        element.closest("label")?.querySelector("input") ||
        element.parentElement?.querySelector('input[type="radio"], input[type="checkbox"]') ||
        element.closest("tr, .mrRow, .mrCard, .card, td")?.querySelector('input[type="radio"], input[type="checkbox"]');

      const associatedLabel = (tag === "label" ? element : null) ||
        (associatedInput?.id ? document.querySelector(`label[for="${CSS.escape(associatedInput.id)}"]`) : null) ||
        element.closest("label") ||
        element.querySelector("label");

      const cardContainer = element.closest('.mrCard, .card, .choice, .option, [class*="option" i], [class*="choice" i], [class*="answer" i], [class*="item" i], [class*="tile" i], [class*="brand" i], [role="radio"], [role="checkbox"], [role="button"], tr, td, li') || element;

      // 1. Select ONE best visible target to click (DO NOT click multiple nested targets, which inverts checkboxes and cancels selections)
      let clickTarget = null;
      if (associatedLabel && isElementVisible(associatedLabel)) {
        clickTarget = associatedLabel;
      } else if (element && isElementVisible(element) && element !== associatedInput) {
        clickTarget = element;
      } else if (cardContainer && isElementVisible(cardContainer)) {
        clickTarget = cardContainer;
      } else if (associatedInput) {
        clickTarget = associatedInput;
      } else {
        clickTarget = element;
      }

      // If it's a checkbox and already checked, do not click to avoid unchecking
      const isAlreadyChecked = associatedInput && associatedInput.type === "checkbox" && associatedInput.checked;

      if (!isAlreadyChecked && clickTarget) {
        const mouseOpts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
        try { clickTarget.focus(); } catch (_) { }
        clickTarget.dispatchEvent(new PointerEvent("pointerdown", mouseOpts));
        clickTarget.dispatchEvent(new MouseEvent("mousedown", mouseOpts));
        clickTarget.dispatchEvent(new PointerEvent("pointerup", mouseOpts));
        clickTarget.dispatchEvent(new MouseEvent("mouseup", mouseOpts));
        try { clickTarget.click(); } catch (_) { }
        clickTarget.dispatchEvent(new Event("change", { bubbles: true }));
        clickTarget.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // 2. Safeguard: Ensure native input has checked property set (via prototype descriptor for React/Vue)
      if (associatedInput && !associatedInput.checked) {
        try {
          const protoSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "checked")?.set;
          if (protoSetter) {
            protoSetter.call(associatedInput, true);
          } else {
            associatedInput.checked = true;
          }
        } catch (_) {
          associatedInput.checked = true;
        }
        if (associatedInput._valueTracker) {
          associatedInput._valueTracker.setValue(false);
        }
        associatedInput.dispatchEvent(new Event("change", { bubbles: true }));
        associatedInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // 3. Update ARIA and visual classes on the card / container so UI updates immediately
      if (cardContainer) {
        cardContainer.classList.add("selected", "checked", "active", "mrSelected", "mrCardSelected", "is-selected", "is-active", "active-choice");
        cardContainer.setAttribute("aria-checked", "true");
        cardContainer.setAttribute("aria-selected", "true");
      }
      if (element) {
        element.classList.add("selected", "checked", "active");
        element.setAttribute("aria-checked", "true");
      }
      if (associatedLabel) {
        associatedLabel.classList.add("selected", "checked", "active");
      }

      await sleep(35);
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

        <!-- Prominent Answers Solution Box (Always visible under Jarvis Pilot) -->
        <div id="jarvis-prominent-answers" class="jarvis-prominent-box jarvis-hidden">
          <div class="jarvis-prominent-header">
            <span class="jarvis-bulb-icon">💡</span>
            <span>জারভিস সঠিক উত্তরসমূহ (এইটা এইটা উত্তর হবে):</span>
          </div>
          <div id="jarvis-prominent-list" class="jarvis-prominent-items"></div>
          <button id="jarvis-btn-reapply" class="jarvis-btn jarvis-btn-reapply" title="Click to auto-fill these answers on this page">🎯 এই উত্তরগুলো পেজে পূরণ করুন (Auto-Select)</button>
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
      const reapplyBtn = document.getElementById("jarvis-btn-reapply");

      if (reapplyBtn) {
        reapplyBtn.addEventListener("click", async () => {
          reapplyBtn.disabled = true;
          reapplyBtn.innerText = "⏳ উত্তর সিলেক্ট হচ্ছে...";
          try {
            if (lastAnalysisResult && lastAnalysisResult.answers) {
              const res = await autoFillAnswers(lastAnalysisResult);
              updateHUDStatus("done", `✅ ${res.filledCount || 0}টি উত্তর পেজে সিলেক্ট সম্পন্ন!`);
            } else {
              await runOneClickAutoFillAndNext(false);
            }
          } finally {
            reapplyBtn.disabled = false;
            reapplyBtn.innerText = "🎯 এই উত্তরগুলো পেজে পূরণ করুন (Auto-Select)";
          }
        });
      }

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

      if (data.is_from_cache || data.source === "memory_cache") {
        const banner = document.createElement("div");
        banner.style.cssText = "background:rgba(0,255,136,0.12); border:1px solid #00ff88; border-radius:6px; padding:6px 10px; font-size:11px; margin-bottom:8px; color:#00ff88;";
        banner.innerHTML = "⚡ <strong>Answered from Memory Cache ⚡</strong><br><span style='color:#cbd5e1; font-size:10px;'>পূর্ববর্তী সার্ভে ইতিহাস থেকে 100% অফলাইনে উত্তর সম্পন্ন (0 API Calls / Zero Cost)।</span>";
        resultsContainer.appendChild(banner);
      } else if (data.source === "knowledge_base") {
        const banner = document.createElement("div");
        banner.style.cssText = "background:rgba(56,189,248,0.12); border:1px solid #38bdf8; border-radius:6px; padding:6px 10px; font-size:11px; margin-bottom:8px; color:#38bdf8;";
        banner.innerHTML = "📄 <strong>Answered from Knowledge Base 📄</strong><br><span style='color:#cbd5e1; font-size:10px;'>আপলোড করা সার্ভে ডাটাবেস থেকে সরাসরি সঠিক উত্তর নির্বাচন করা হয়েছে।</span>";
        resultsContainer.appendChild(banner);
      } else if (data.source === "mixed_api") {
        const banner = document.createElement("div");
        banner.style.cssText = "background:rgba(168,85,247,0.12); border:1px solid #a855f7; border-radius:6px; padding:6px 10px; font-size:11px; margin-bottom:8px; color:#c084fc;";
        banner.innerHTML = "⚡🤖 <strong>Answered via Hybrid (Memory Cache + API)</strong><br><span style='color:#cbd5e1; font-size:10px;'>কিছু উত্তর মেমরি ক্যাশ থেকে এবং নতুনগুলো AI API দিয়ে প্রস্তুত করা হয়েছে।</span>";
        resultsContainer.appendChild(banner);
      } else if (data.is_screenshot_analysis) {
        const banner = document.createElement("div");
        banner.style.cssText = "background:rgba(0,240,255,0.12); border:1px solid #00f0ff; border-radius:6px; padding:6px 10px; font-size:11px; margin-bottom:8px; color:#00f0ff;";
        banner.innerHTML = "📸 <strong>Answered via API 🤖 (Gemini Vision)</strong><br><span style='color:#cbd5e1; font-size:10px;'>পেজ সরাসরি বিশ্লেষণ না হওয়ায় সম্পূর্ণ স্ক্রিনশট নিয়ে সঠিক উত্তর নির্ণয় করা হয়েছে (এইটা এইটা উত্তর হবে):</span>";
        resultsContainer.appendChild(banner);
      }

      if (!data.answers || data.answers.length === 0) {
        resultsContainer.innerHTML = `<div class="jarvis-empty-result">No answers generated.</div>`;
        return;
      }

      data.answers.forEach((ans, idx) => {
        const card = document.createElement("div");
        card.className = "jarvis-answer-card";

        let badgeHtml = "";
        if (ans.source === "memory_cache") {
          badgeHtml = `<span class="jarvis-source-badge badge-cache" title="Instant match from Local Memory Cache">⚡ Memory Cache</span>`;
        } else if (ans.source === "knowledge_base") {
          const fn = ans.fileName ? ` (${ans.fileName})` : "";
          badgeHtml = `<span class="jarvis-source-badge badge-kb" title="Matched from Survey Knowledge Base Dataset">📄 Knowledge Base${fn}</span>`;
        } else {
          badgeHtml = `<span class="jarvis-source-badge badge-api" title="Generated by AI Model">🤖 API</span>`;
        }

        card.innerHTML = `
        <div class="jarvis-q-header">
          <span class="jarvis-q-number">Q${idx + 1}</span>
          <span class="jarvis-q-title">${ans.question_text || "Question"}</span>
          ${badgeHtml}
        </div>
        <div class="jarvis-a-recommendation">
          <span class="jarvis-rec-label">Selection:</span>
          <strong>${(ans.selected_labels || []).join(", ") || ans.text_input_value || "Option Chosen"}</strong>
        </div>
        ${ans.reasoning ? `<div class="jarvis-a-reasoning">💡 ${ans.reasoning}</div>` : ""}
      `;
        resultsContainer.appendChild(card);
      });

      // Always update and show prominent answers box inside the HUD
      renderProminentAnswersBox(data);
    }

    /**
     * Prominently displays all survey answers directly inside the Jarvis HUD
     * Ensures the user clearly sees: "👉 এটা হবে সঠিক উত্তর: [উত্তর]"
     */
    function renderProminentAnswersBox(data) {
      const box = document.getElementById("jarvis-prominent-answers");
      const list = document.getElementById("jarvis-prominent-list");
      if (!box || !list) return;

      if (!data || !data.answers || data.answers.length === 0) {
        box.classList.add("jarvis-hidden");
        return;
      }

      list.innerHTML = "";
      data.answers.forEach((ans, idx) => {
        const item = document.createElement("div");
        const isMsg = ans.recommended_action === "type_text" || Boolean(ans.text_input_value) || Boolean(ans.text);
        item.className = `jarvis-prominent-item ${isMsg ? "jarvis-p-msg-item" : ""}`;

        const answerText = isMsg
          ? (ans.text_input_value || ans.text || (ans.selected_labels && ans.selected_labels[0]) || "")
          : ((ans.selected_labels && ans.selected_labels.length > 0) ? ans.selected_labels.join(", ") : (ans.text_input_value || "সঠিক বিকল্প"));

        const qText = ans.question_text || `প্রশ্ন ${idx + 1}`;

        if (isMsg) {
          item.innerHTML = `
            <div class="jarvis-p-q-header">
              <strong class="jarvis-p-q">Q${idx + 1}: ${escapeHtml(qText)}</strong>
              <span class="jarvis-p-badge-msg">📝 মেসেজ বক্স / টাইপ ফিল্ড</span>
            </div>
            <div class="jarvis-p-ans-box">
              <span class="jarvis-p-ans-label">👉 <strong>এটা হবে সঠিক উত্তর:</strong></span>
              <div class="jarvis-p-bold-ans">${escapeHtml(answerText)}</div>
            </div>
            <div class="jarvis-p-action-bar">
              <button class="jarvis-p-copy-btn" type="button" title="ক্লিপবোর্ডে কপি করুন">📋 কপি করুন</button>
              <span class="jarvis-p-hint">দেখে দেখে টাইপ করুন বা পেস্ট করুন</span>
            </div>
          `;

          const copyBtn = item.querySelector(".jarvis-p-copy-btn");
          if (copyBtn) {
            copyBtn.addEventListener("click", () => {
              copyTextSafely(answerText, copyBtn);
            });
          }
        } else {
          item.innerHTML = `
            <strong class="jarvis-p-q">Q${idx + 1}: ${escapeHtml(qText)}</strong>
            <div class="jarvis-p-ans-box">
              <span class="jarvis-p-ans-label">👉 <strong>এটা হবে সঠিক উত্তর:</strong></span>
              <span class="jarvis-p-bold-ans">${escapeHtml(answerText)}</span>
            </div>
          `;
        }

        list.appendChild(item);
      });
      box.classList.remove("jarvis-hidden");
    }

    function copyTextSafely(text, btn) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          if (btn) {
            btn.innerText = "✅ কপি হয়েছে!";
            setTimeout(() => { btn.innerText = "📋 কপি করুন"; }, 2000);
          }
        }).catch(() => fallbackCopy(text, btn));
      } else {
        fallbackCopy(text, btn);
      }
    }

    function fallbackCopy(text, btn) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        if (btn) {
          btn.innerText = "✅ কপি হয়েছে!";
          setTimeout(() => { btn.innerText = "📋 কপি করুন"; }, 2000);
        }
      } catch (_) { }
    }

    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    /**
     * Attaches prominent in-page helper badges directly under survey questions
     * Even if elements cannot be clicked via script, user sees: "👉 এটা হবে সঠিক উত্তর: [Answer]"
     */
    function attachInPageAnswerBadges(data) {
      document.querySelectorAll(".jarvis-inline-question-callout").forEach(el => el.remove());
      if (!data || !data.answers || data.answers.length === 0) return;

      const questions = extractSurveyQuestions();

      data.answers.forEach((ans, idx) => {
        const isMsg = ans.recommended_action === "type_text" || Boolean(ans.text_input_value) || Boolean(ans.text);
        const answerText = isMsg
          ? (ans.text_input_value || ans.text || (ans.selected_labels && ans.selected_labels[0]) || "")
          : ((ans.selected_labels && ans.selected_labels.length > 0) ? ans.selected_labels.join(", ") : (ans.text_input_value || "সঠিক বিকল্প"));

        let targetContainer = null;
        if (typeof ans.question_index === "number" && questions[ans.question_index]?.options?.[0]?.element) {
          const firstOptEl = questions[ans.question_index].options[0].element;
          targetContainer = firstOptEl.closest(".question-block, .survey-question, .question, .QuestionOuter, fieldset, [role='radiogroup'], .form-group, .survey-card, .survey-row, tr, td, li, form") || firstOptEl.parentElement;
        }

        if (!targetContainer && ans.question_text) {
          const qSnippet = cleanText(ans.question_text).toLowerCase().slice(0, 40);
          const allElements = document.querySelectorAll(".QuestionText, .question-text, .title, .q-title, h1, h2, h3, h4, legend, strong, b, .survey-question");
          for (const el of allElements) {
            if (cleanText(el.innerText).toLowerCase().includes(qSnippet)) {
              targetContainer = el.closest(".question-block, .survey-question, .question, .QuestionOuter, fieldset, [role='radiogroup'], .form-group, .survey-card, .survey-row, tr, td, li") || el.parentElement;
              break;
            }
          }
        }

        if (!targetContainer && questions[idx]?.options?.[0]?.element) {
          const firstOptEl = questions[idx].options[0].element;
          targetContainer = firstOptEl.closest(".question-block, .survey-question, .question, .QuestionOuter, fieldset, [role='radiogroup'], .form-group, .survey-card, .survey-row, tr, td, li") || firstOptEl.parentElement;
        }

        if (targetContainer && !targetContainer.querySelector(`.jarvis-inline-question-callout[data-ans-idx="${idx}"]`)) {
          const callout = document.createElement("div");
          callout.className = `jarvis-inline-question-callout ${isMsg ? "jarvis-callout-msg-type" : ""}`;
          callout.setAttribute("data-ans-idx", String(idx));
          callout.innerHTML = `
            <div class="jarvis-callout-text">
              <span class="jarvis-callout-icon">${isMsg ? "📝" : "👉"}</span>
              <span><strong>এটা হবে সঠিক উত্তর:</strong> <strong>${escapeHtml(answerText)}</strong></span>
            </div>
            <div class="jarvis-callout-btn-group">
              ${isMsg ? `<button class="jarvis-callout-copy-btn" type="button" title="ক্লিপবোর্ডে কপি করুন">📋 কপি করুন</button>` : ""}
              <button class="jarvis-callout-pick-btn" type="button" title="${isMsg ? "মেসেজ বক্সে বসান" : "এই উত্তরটি পেজে অটো-সিলেক্ট করতে চাপুন"}">${isMsg ? "টাইপ করুন ✍️" : "সিলেক্ট করুন 🎯"}</button>
            </div>
          `;

          const copyBtn = callout.querySelector(".jarvis-callout-copy-btn");
          if (copyBtn) {
            copyBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              copyTextSafely(answerText, copyBtn);
              const ta = targetContainer.querySelector("textarea, input[type='text'], [contenteditable='true']");
              if (ta) {
                simulateHumanAction(ta, ans);
              }
            });
          }

          const pickBtn = callout.querySelector(".jarvis-callout-pick-btn");
          if (pickBtn) {
            pickBtn.addEventListener("click", async (e) => {
              e.preventDefault();
              e.stopPropagation();
              pickBtn.disabled = true;
              pickBtn.innerText = isMsg ? "টাইপ হচ্ছে..." : "সিলেক্ট হচ্ছে...";
              try {
                let el = null;
                if (isMsg) {
                  el = targetContainer.querySelector("textarea, input[type='text'], input:not([type]), [contenteditable='true']");
                }
                if (!el && ans.selected_labels && ans.selected_labels.length > 0) {
                  el = findInputByLabelOrValue(ans.selected_labels[0], ans);
                }
                if (!el && ans.target_element_ids && ans.target_element_ids.length > 0) {
                  el = document.getElementById(ans.target_element_ids[0]);
                }
                if (!el) {
                  el = targetContainer.querySelector("textarea, input[type='text'], input[type='radio'], input[type='checkbox'], select");
                }
                if (el) {
                  await simulateHumanAction(el, ans);
                  applyHighlightStyle(el, ans, idx + 1);
                  pickBtn.innerText = isMsg ? "✅ টাইপ সম্পন্ন" : "✅ সিলেক্টেড";
                } else {
                  copyTextSafely(answerText, pickBtn);
                }
              } finally {
                setTimeout(() => {
                  if (pickBtn) {
                    pickBtn.disabled = false;
                    pickBtn.innerText = isMsg ? "টাইপ করুন ✍️" : "সিলেক্ট করুন 🎯";
                  }
                }, 2000);
              }
            });
          }

          const titleEl = targetContainer.querySelector("legend, .QuestionText, .question-text, .title, .q-title, h1, h2, h3, h4, h5, .control-label, [role='heading']");
          if (titleEl && titleEl.nextSibling) {
            titleEl.parentNode.insertBefore(callout, titleEl.nextSibling);
          } else {
            targetContainer.insertBefore(callout, targetContainer.firstChild);
          }
        }
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


