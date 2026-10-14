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

  // Trigger one-time purge of any bogus cached entries from prior corrupted scans
  try {
    chrome.runtime.sendMessage({ action: "PURGE_CORRUPTED_CACHE" }).catch(() => { });
  } catch (_) { }

  /**
   * =========================================================================
   * GLOBAL HIGH-PRECISION WORD & TOKEN MATCHER
   * Available everywhere in content_script without any scoping issues
   * =========================================================================
   */
  function isWordMatch(textToCheck, target) {
    if (!textToCheck || !target) return false;
    const t = cleanText(textToCheck).toLowerCase().replace(/^[•\-\*\d\.\)\s…]+/, "").trim();
    const tgt = cleanText(target).toLowerCase().replace(/^[•\-\*\d\.\)\s…]+/, "").trim();
    if (t === tgt) return true;
    if (t.length === 0 || tgt.length === 0) return false;

    // Strict Anti-traps
    if (tgt === "male" && /\bfemale\b/i.test(t)) return false;
    if (tgt === "female" && /\bmale\b/i.test(t) && !/\bfemale\b/i.test(t)) return false;
    if (tgt === "no" && !/\bno\b/i.test(t)) return false;
    if (tgt === "yes" && !/\byes\b/i.test(t)) return false;

    // Word boundary regex check
    const escaped = tgt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(^|[^a-zA-Z0-9])" + escaped + "([^a-zA-Z0-9]|$)", "i");
    if (re.test(t)) return true;

    // Inverse check: candidate keyword inside target (only if candidate is substantial and not a generic word)
    if (t.length >= 3 && !/^(continue|next|back|previous|submit|select|choice|button)$/i.test(t)) {
      const escapedT = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const reT = new RegExp("(^|[^a-zA-Z0-9])" + escapedT + "([^a-zA-Z0-9]|$)", "i");
      if (reT.test(tgt)) return true;
    }

    return false;
  }

  /**
   * =========================================================================
   * ⚔️ LIVE BATTLE LOG / ACTION LOG SYSTEM
   * Logs every scan, AI query, analysis decision, and auto-click action live
   * =========================================================================
   */
  const MAX_BATTLE_LOGS = 50;
  let battleLogs = [];

  function addBattleLog(type, message, details = "") {
    let timeStr = "";
    try {
      timeStr = new Date().toLocaleTimeString("en-US", { hour12: false });
    } catch (_) {
      timeStr = new Date().toTimeString().split(" ")[0];
    }

    const logItem = {
      id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      time: timeStr,
      type: type || "info",
      message: message,
      details: details
    };

    battleLogs.unshift(logItem);
    if (battleLogs.length > MAX_BATTLE_LOGS) battleLogs.pop();

    renderBattleLogEntry(logItem);

    try {
      chrome.storage.local.get(["jarvis_battle_logs"], (res) => {
        const stored = res.jarvis_battle_logs || [];
        stored.unshift(logItem);
        if (stored.length > MAX_BATTLE_LOGS) stored.pop();
        chrome.storage.local.set({ jarvis_battle_logs: stored });
      });
    } catch (_) { }

    try {
      chrome.runtime.sendMessage({ action: "BATTLE_LOG_ENTRY", log: logItem }).catch(() => { });
    } catch (_) { }
  }

  function renderBattleLogEntry(item) {
    const container = document.getElementById("jarvis-battle-log-body");
    if (!container) return;

    const el = document.createElement("div");
    el.className = `jarvis-battle-log-entry log-type-${item.type}`;

    let icon = "ℹ️";
    let badgeClass = "badge-info";
    let badgeText = "তথ্য";

    switch (item.type) {
      case "scan":
        icon = "📸"; badgeClass = "badge-scan"; badgeText = "স্ক্যান"; break;
      case "ai":
        icon = "👑"; badgeClass = "badge-ai"; badgeText = "জেমিনি"; break;
      case "match":
        icon = "🎯"; badgeClass = "badge-match"; badgeText = "উত্তর"; break;
      case "action":
        icon = "⚡"; badgeClass = "badge-action"; badgeText = "সিলেক্ট"; break;
      case "success":
        icon = "✅"; badgeClass = "badge-success"; badgeText = "সফল"; break;
      case "error":
        icon = "⚠️"; badgeClass = "badge-error"; badgeText = "ত্রুটি"; break;
      case "cache":
        icon = "⚡"; badgeClass = "badge-cache"; badgeText = "মেমরি"; break;
    }

    el.innerHTML = `
      <div class="jarvis-log-row">
        <span class="jarvis-log-time">${escapeHtml(item.time)}</span>
        <span class="jarvis-log-tag ${badgeClass}">${icon} ${badgeText}</span>
        <span class="jarvis-log-msg">${escapeHtml(item.message)}</span>
      </div>
      ${item.details ? `<div class="jarvis-log-sub">${escapeHtml(item.details)}</div>` : ""}
    `;

    container.insertBefore(el, container.firstChild);
    while (container.children.length > MAX_BATTLE_LOGS) {
      container.removeChild(container.lastChild);
    }
  }

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
      const autoProceed = message.autoProceed !== false;
      runOneClickAutoFillAndNext(autoProceed)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => {
          console.error("[Jarvis] Auto-fill error:", err);
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true;
    }

    if (message.action === "CLICK_NEXT_BUTTON") {
      findAndClickNextButton(4000)
        .then((clicked) => {
          if (clicked) {
            sendResponse({ success: true, message: "Next button clicked successfully" });
          } else {
            sendResponse({ success: false, message: "Next button not found" });
          }
        })
        .catch((err) => {
          sendResponse({ success: false, message: err.message || String(err) });
        });
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

    if (message.action === "SHOW_ACCOUNT_LIMIT_ALERT") {
      showAccountLimitToast(message.title, message.message, message.accountLabel);
      updateHUDStatus("error", message.message || "⚠️ জিমিনি অ্যাকাউন্ট লিমিট শেষ!");
      addBattleLog("error", message.message || "জিমিনি অ্যাকাউন্ট লিমিট শেষ", message.accountLabel || "");
      sendResponse({ success: true });
      return true;
    }

    if (message.action === "SHOW_API_ALERT") {
      showAccountLimitToast("API কোটা নোটিফিকেশন", message.alert?.message || "API কোটা সতর্কবার্তা", message.alert?.apiName);
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

  /**
   * Prominent In-Page Toast for Gemini Account Limit Exhaustion
   */
  function showAccountLimitToast(title, msg, accountLabel) {
    let toast = document.getElementById("jarvis-account-limit-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "jarvis-account-limit-toast";
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        background: #1e1026;
        border: 2px solid #ff3366;
        border-radius: 10px;
        padding: 16px 24px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 8px 30px rgba(255, 51, 102, 0.4);
        max-width: 550px;
        width: 90%;
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:bold;font-size:15px;color:#ff3366;">⚠️ ${title || 'জিমিনি অ্যাকাউন্ট লিমিট শেষ!'}</span>
        <button id="jarvis-toast-close" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:18px;">✕</button>
      </div>
      <div style="font-size:13px;line-height:1.5;color:#e2e8f0;">
        ${msg || 'বর্তমান জিমিনি অ্যাকাউন্টের লিমিট শেষ হয়ে গেছে। অনুগ্রহ করে পরবর্তী জিমিনি অ্যাকাউন্ট সংযুক্ত করুন।'}
      </div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
        💡 এক্সটেনশন পপআপ ওপেন করে পরবর্তী জিমিনি অ্যাকাউন্ট যুক্ত বা সিলেক্ট করুন।
      </div>
    `;
    const closeBtn = toast.querySelector("#jarvis-toast-close");
    if (closeBtn) closeBtn.onclick = () => toast.remove();
  }

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
  /**
   * Performs full-page visual screenshot analysis via Gemini Vision API / Polymer AI
   * Auto-retries on operational failure or selection error
   * Directly selects answers on the page WITHOUT extra labels/badges like 'JARVIS CHOICE'
   */
  async function performScreenshotAnalysis(retryAttempt = 0) {
    const maxRetries = 3;
    const attemptDisplay = retryAttempt > 0 ? ` (চেষ্টা ${retryAttempt + 1}/${maxRetries})` : "";
    updateHUDStatus("analyzing", `📸 সার্ভে পেজের স্ক্রিনশট এনালাইসিস হচ্ছে${attemptDisplay}...`);
    addBattleLog("scan", `সার্ভে পেজের স্ক্রিনশট নেওয়া হচ্ছে${attemptDisplay}...`, window.location.hostname);

    const hudContainer = document.getElementById("jarvis-hud-container");
    if (hudContainer) hudContainer.style.visibility = "hidden";

    // Clean any prior badges from the page so they don't appear in screenshot
    document.querySelectorAll(".jarvis-pick-badge, .jarvis-inpage-ans-banner, .jarvis-inline-question-callout").forEach(el => el.remove());

    await sleep(120);
    const screenshotDataUrl = await captureFullPageScreenshot();

    if (hudContainer) hudContainer.style.visibility = "visible";

    if (!screenshotDataUrl) {
      if (retryAttempt < maxRetries - 1) {
        updateHUDStatus("analyzing", `⚠️ স্ক্রিনশট ব্যর্থ, স্বয়ংক্রিয়ভাবে পুনরায় চেষ্টা করা হচ্ছে (${retryAttempt + 1}/${maxRetries})...`);
        await sleep(600);
        return await performScreenshotAnalysis(retryAttempt + 1);
      }
      updateHUDStatus("error", "❌ স্ক্রিনশট নিতে ব্যর্থ হয়েছে!");
      addBattleLog("error", "স্ক্রিনশট ক্যাপচার ব্যর্থ হয়েছে");
      return { success: false, error: "Screenshot capture failed" };
    }

    addBattleLog("scan", "স্ক্রিনশট সফলভাবে ক্যাপচার হয়েছে, AI ইঞ্জিনে পাঠানো হচ্ছে...");
    updateHUDStatus("analyzing", "🤖 স্ক্রিনশট এনালাইসিস করে প্রশ্ন ও অপশনগুলো শনাক্ত করা হচ্ছে...");

    const fullBodyText = document.body ? cleanText(document.body.innerText).slice(0, 6000) : "";
    let scannedQuestions = [];
    try {
      if (typeof extractSurveyQuestions === "function") {
        scannedQuestions = extractSurveyQuestions() || [];
      } else if (typeof scanSurveyPage === "function") {
        scannedQuestions = scanSurveyPage() || [];
      }
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

    addBattleLog("ai", "জিমিনি ও পলিমার এআই দিয়ে স্ক্রিনশট ও প্রশ্ন বিশ্লেষণ হচ্ছে...");

    let response = null;
    try {
      response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "ANALYZE_SURVEY_PAGE", payload: payload },
          (res) => resolve(res)
        );
      });
    } catch (e) {
      console.warn("[Jarvis] Survey analysis send error:", e);
    }

    if (!response || !response.success || !response.data || !response.data.answers || response.data.answers.length === 0) {
      if (retryAttempt < maxRetries - 1) {
        const errDetail = response?.error || "অপারেশনাল ত্রুটি";
        updateHUDStatus("analyzing", `⚠️ অপারেশনাল ত্রুটি (${errDetail}), স্বয়ংক্রিয়ভাবে পুনরায় চেষ্টা হচ্ছে (${retryAttempt + 1}/${maxRetries})...`);
        addBattleLog("warn", `অপারেশনাল ত্রুটি, স্বয়ংক্রিয় পুনরায় চেষ্টা ${retryAttempt + 1}/${maxRetries}`);
        await sleep(1000);
        return await performScreenshotAnalysis(retryAttempt + 1);
      }
      const err = response?.error || "Vision analysis failed";
      updateHUDStatus("error", err);
      addBattleLog("error", `স্ক্রিনশট বিশ্লেষণ ব্যর্থ: ${err}`);
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

    const modelTag = response.modelUsed || "Gemini AI";
    const providerTag = response.providerUsed ? ` (${response.providerUsed})` : "";
    addBattleLog("ai", `${modelTag}${providerTag}: স্ক্রিনশট বিশ্লেষণ সম্পন্ন! (${data.answers?.length || 0}টি উত্তর প্রাপ্ত)`);

    if (data.answers) {
      data.answers.forEach((ans, idx) => {
        const ansText = (ans.selected_labels && ans.selected_labels.join(", ")) || ans.text_input_value || "সিলেক্টেড";
        addBattleLog("match", `Q${idx + 1}: ${ansText}`, ans.question_text?.slice(0, 60));
      });
    }

    // Notify popup if open
    try {
      chrome.runtime.sendMessage({
        action: "SURVEY_ANALYSIS_UPDATED",
        data: data
      }).catch(() => { });
    } catch (e) { }

    // Directly select matching elements on the webpage without extra labels
    updateHUDStatus("analyzing", "🎯 প্রশ্ন এবং অপশন শনাক্ত করে সরাসরি পেজে সিলেক্ট করা হচ্ছে...");
    let selectCount = await autoSelectFromVisionResults(data);

    // Auto-retry selection if initial select did not capture all answers
    if (selectCount === 0 && data.answers.length > 0) {
      console.log("[Jarvis] Initial selection pass yielded 0, waiting for DOM stabilization and retrying...");
      await sleep(400);
      selectCount = await autoSelectFromVisionResults(data);
      if (selectCount === 0 && typeof autoFillAnswers === "function") {
        const fillFallback = await autoFillAnswers(data);
        selectCount = fillFallback?.filledCount || 0;
      }
    }

    if (selectCount > 0) {
      updateHUDStatus("done", `✅ স্ক্রিনশট এনালাইসিস সম্পন্ন! ${selectCount}টি উত্তর সরাসরি পেজে সিলেক্ট করা হয়েছে।`);
    } else {
      updateHUDStatus("done", `✅ স্ক্রিনশট এনালাইসিস সম্পন্ন! উত্তর পেজে সংরক্ষিত হয়েছে।`);
    }

    return { success: true, data: data, filledCount: selectCount, isScreenshot: true };
  }

  /**
   * Attempts to select on-page options matching vision analysis output
   * Retries each selection up to 3 times on selection error
   * Never injects extra labels or badges like 'JARVIS CHOICE' onto the page
   */
  async function autoSelectFromVisionResults(data) {
    if (!data || !data.answers || data.answers.length === 0) return 0;
    let selectedCount = 0;
    const isAuto = isAutoPilotActive;
    const gapDelay = isAuto ? 1500 : 80;

    // Clean any badges/banners from page
    document.querySelectorAll(".jarvis-pick-badge, .jarvis-inpage-ans-banner, .jarvis-inline-question-callout").forEach(el => el.remove());

    for (let i = 0; i < data.answers.length; i++) {
      const ans = data.answers[i];
      const labels = ans.selected_labels || [];
      let filled = false;

      // Selection retry: attempt up to 3 tries per answer
      for (let attempt = 0; attempt < 3; attempt++) {
        // 1. Text input / Textarea / Message Box typing
        if (ans.recommended_action === "type_text" || Boolean(ans.text_input_value) || Boolean(ans.text)) {
          const textVal = ans.text_input_value || ans.text || (labels.length > 0 ? labels[0] : "");
          const visibleTextInputs = Array.from(document.querySelectorAll('textarea, input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"]'))
            .filter(isElementVisible)
            .filter(el => !el.closest("#jarvis-hud-container"));

          if (visibleTextInputs.length > 0) {
            const targetInput = visibleTextInputs[Math.min(selectedCount, visibleTextInputs.length - 1)];
            if (targetInput) {
              ans.text_input_value = textVal;
              await simulateHumanAction(targetInput, ans);
              selectedCount++;
              filled = true;
              break;
            }
          }
        }

        // 2. Choice selection (radio, checkbox, cards, ratings, buttons)
        if (!filled && labels.length > 0) {
          for (const label of labels) {
            if (!label) continue;
            let el = findInputByLabelOrValue(label, ans);

            if (!el) {
              // Universal direct DOM match for custom buttons, divs, cards, chips
              const cleanLbl = cleanText(label).toLowerCase();
              if (cleanLbl && cleanLbl.length >= 2) {
                const candidates = Array.from(document.querySelectorAll("button, label, [role='button'], [role='radio'], [role='checkbox'], div, span, p, td, li, a"))
                  .filter(e => isElementVisible(e) && !e.closest("#jarvis-hud-container") && e.children.length <= 4);
                for (const cand of candidates) {
                  const cText = cleanText(cand.innerText || cand.textContent || "").toLowerCase();
                  if (cText === cleanLbl || (cText.length >= 3 && cleanLbl.length >= 3 && (cText.includes(cleanLbl) || cleanLbl.includes(cText)))) {
                    el = cand.closest("button, label, [role='button'], [role='radio'], [role='checkbox'], div, tr, td") || cand;
                    break;
                  }
                }
              }
            }

            if (el) {
              await simulateHumanAction(el, ans);
              selectedCount++;
              filled = true;
              break;
            }
          }
        }

        if (filled) break;
        // Wait briefly for dynamic DOM re-rendering before retrying
        if (attempt < 2) await sleep(180);
      }

      if (filled) {
        if (isAuto && i < data.answers.length - 1) {
          await sleep(gapDelay + Math.random() * 300);
        } else {
          await sleep(50);
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
            const clicked = await findAndClickNextButton(2500);
            if (clicked) {
              updateHUDStatus("done", "🤖 পেজের নেক্সট বাটনে ক্লিক করে অগ্রসর হওয়া হচ্ছে...");
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
        // উত্তর সিলেক্ট করার পর ৩ সেকেন্ড সময় নিয়ে দেখবে স্বয়ংক্রিয়ভাবে নেক্সট পেজ আসে কিনা।
        // যদি স্বয়ংক্রিয়ভাবে নেক্সট পেজ আসে, তবে নতুন পেজ এনালাইসিস করে উত্তর দিবে (Next চাপবে না)।
        // আর যদি ৩ সেকেন্ডের মধ্যে নেক্সট পেজ না আসে, তবে স্বয়ংক্রিয়ভাবে Next বাটনে ক্লিক করবে।
        const isFinalPage = isLastSurveyPage(analysisData) || isLastPageInitial;
        const advanced = await smartAutoAdvance({
          maxWaitMs: 3000,
          triggerNextCycle: !isFinalPage,
          isFinalPage
        });

        if (advanced) {
          autoPilotRunningCycle = false;
          return;
        }

        // If after smartAutoAdvance the page has not advanced, monitor dynamic SPA in-place questions
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
    async function runOneClickAutoFillAndNext(autoProceed = true) {
      try {
        toggleHUD(true);
        updateHUDStatus("analyzing", "⚡ ১-ক্লিক মোড: সম্পূর্ণ পেজ বিশ্লেষণ করা হচ্ছে...");

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
          await sleep(1000 + Math.random() * 400);
          updateHUDStatus("analyzing", "⚡ উত্তর পূরণ সম্পন্ন! স্বয়ংক্রিয়ভাবে Next পেজে যাওয়া হচ্ছে...");
          const advanced = await smartAutoAdvance({ maxWaitMs: 2500, triggerNextCycle: false, manualMode: true });
          if (advanced) {
            return { success: true, filledCount, proceeded: true, data: analysisData, isScreenshot };
          }
        }

        if (filledCount > 0) {
          updateHUDStatus("done", isScreenshot
            ? `✅ স্ক্রিনশট থেকে ${filledCount}টি উত্তর সিলেক্ট করা হয়েছে! নিচে সঠিক উত্তরসমূহ বোল্ড করে দেখানো হলো, দেখে Next চাপুন।`
            : `✅ ১-ক্লিক মোড: ${filledCount}টি উত্তর মানুষের মতো পূরণ সম্পন্ন! আপনি দেখে নিয়ে Next চাপুন।`);
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
     * 2. NEXT / SUBMIT BUTTON DETECTION & ADVANCED MULTI-PLATFORM ENGINE
     * Supports Qualtrics, Decipher, Kantar/Lightspeed (sa.ktrmr.com), Confirmit/MrlWeb,
     * SurveyMonkey, Google Forms, Typeform, Cint/Lucid/PureSpectrum, Toluna,
     * Dynata, QuestionPro, Alchemer, InnovateMR, and custom SPA icon buttons.
     * =========================================================================
     */
    function isElementVisible(el) {
      if (!el) return false;
      // CRITICAL: NEVER interact with or scrape Jarvis's own UI elements
      try {
        if (el.closest && el.closest("#jarvis-hud-container, .jarvis-inpage-ans-banner, .jarvis-inline-question-callout, [data-jarvis-ui], .jarvis-pick-badge, [class*='jarvis-']")) {
          return false;
        }
      } catch (_) { }
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

    function findNextButton(rootDoc = document, depth = 0) {
      if (!rootDoc) return null;

      const nextKeywords = [
        "next", "continue", "submit", "proceed", "forward", "next page", "next question",
        "suivant", "suivante", "continuer", "valider", "avancer", "terminer", "soumettre",
        "siguiente", "continuar", "avanzar", "terminar", "enviar",
        "weiter", "fortfahren", "weitergehen", "fertig", "absenden",
        "avançar", "prosseguir", "finalizar", "volgende", "dalej",
        "পরবর্তী", "চালিয়ে যান", "জমা দিন", "এগিয়ে যান", "সামনে", "পরের পেজ", "পরবর্তী প্রশ্ন", "শুরু করুন", "শেষ করুন",
        "ok", "got it", "i agree", "agree", "accept", "start", "begin", "finish", "done", "complete",
        ">", "»", "→", ">>", "›", "▶", "►", "➜", "➔", "chevron_right", "arrow_forward", "forward_arrow", "navigate_next"
      ];
      const excludeKeywords = ["back", "previous", "prev", "পূর্ববর্তী", "আগের", "পেছনে", "retour", "zurück", "atrás", "<", "«", "←", "◀", "cancel", "বাতিল", "exit", "প্রস্থান"];

      // Helper: check if element or its children contains right-arrow SVG, icon, or icon text
      function hasRightArrowIcon(el) {
        if (!el) return false;
        const txt = (el.innerText || el.textContent || "").trim().toLowerCase();
        if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || txt === "▶" || txt === "►" || txt === "➜" || txt === "➔") return true;
        if (txt === "chevron_right" || txt === "arrow_forward" || txt === "navigate_next" || txt === "keyboard_arrow_right") return true;

        const svgs = el.querySelectorAll("svg, i, span[class*='icon' i], [class*='chevron' i], [class*='arrow' i], [class*='next' i], [class*='forward' i]");
        for (const icon of svgs) {
          const cls = (icon.getAttribute("class") || icon.className || "").toString().toLowerCase();
          if (cls.includes("right") || cls.includes("forward") || cls.includes("next") || cls.includes("chevron") || cls.includes("arrow") || cls.includes("angle")) {
            return true;
          }
          const iconTxt = (icon.innerText || icon.textContent || "").trim().toLowerCase();
          if (iconTxt === "chevron_right" || iconTxt === "arrow_forward" || iconTxt === "navigate_next" || iconTxt === ">" || iconTxt === "→") {
            return true;
          }
          const paths = icon.querySelectorAll("path, polygon, polyline");
          if (paths.length > 0) return true;
        }
        const aria = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
        if (aria.includes("next") || aria.includes("forward") || aria.includes("continue") || aria.includes("proceed") || aria.includes("submit") || aria.includes("পরবর্তী")) return true;
        const svgAria = el.querySelector("svg[aria-label*='next' i], svg[title*='next' i], svg[aria-label*='forward' i], svg[aria-label*='continue' i]");
        if (svgAria) return true;
        return false;
      }

      let disabledCandidate = null;

      function checkCandidate(btn) {
        if (!btn || !isElementVisible(btn)) return null;
        const txt = (btn.innerText || btn.value || btn.getAttribute("aria-label") || "").trim().toLowerCase();
        if (excludeKeywords.some(kw => txt === kw || (txt.startsWith(kw) && txt.length < 12))) return null;

        const isDisabled = btn.disabled || btn.getAttribute("aria-disabled") === "true" || btn.classList.contains("disabled");
        if (isDisabled) {
          if (!disabledCandidate) disabledCandidate = btn;
          return null;
        }
        return btn;
      }

      // 1. High-Priority: Known Platform Selectors
      const explicitSelectors = [
        // Confirmit, MrlWeb, Kantar, Lightspeed (sa.ktrmr.com)
        'input[name="_NNext"]', 'button[name="_NNext"]', 'input[name="_NSubmit"]', 'button[name="_NSubmit"]',
        '#mrNext', '.mrNext', '#mrNextText', '.mrNextText', 'input[name*="Next" i]', 'button[name*="Next" i]',
        '#mrForm input[type="submit"]', '#mrForm button[type="submit"]', '#mrForm button',
        '.navigation-button-next', '.btn-forward', '.forward-btn', 'input[id*="Next" i]', 'button[id*="Next" i]',
        // Qualtrics
        '#NextButton', '.NextButton', 'input#NextButton', 'input[name="NextButton"]', '#Buttons #NextButton',
        'input[value="→"]', 'input[value=">>"]', 'input[value="Next"]',
        // Decipher / Beacon
        '.survey-navigation .btn-next', 'button.btn-next', 'input.btn-next', 'input.next-btn', '.forward-btn',
        'button.forward-btn', '.btn-forward', 'input[name="submit_next"]', 'button[name="submit_next"]',
        'input[name="forward"]', 'button[name="forward"]', '#nav-forward', '#btn_next', '#btnNext',
        '.nav-button.next', '.nav-button.forward',
        // SurveyMonkey
        'button[data-action="next"]', '.user-generated-button-next', '.next-button', 'button.btn.next-button',
        'button.done-button', 'button[data-action="done"]',
        // Typeform
        '[data-qa="ok-button-visible"]', '[data-qa*="ok" i]', '[data-qa*="submit" i]', '[data-qa*="next" i]',
        'button[data-qa="submit-button"]', 'button[data-qa="button"]',
        // Toluna & Cint & PureSpectrum & Dynata
        '.survey-action-next', '.btn-next', '#btnNext', '.next-container button',
        'button.next', 'button.submit', '.nextBtn', '[data-testid*="next" i]', '[data-testid*="submit" i]',
        '[data-testid*="continue" i]', 'button[data-direction="next"]', '[data-action="next"]',
        '[data-automation*="next" i]', '[data-cy*="next" i]',
        // QuestionPro & Alchemer & InnovateMR
        '#btn_next', '.btn-next', '#sg_NextButton', '.sg-button-next', 'input[value="Continue"]',
        '.btn-survey-next', '#next-button', '.survey-nav-next',
        // Generic submit / action attributes
        'input[type="submit"]', 'button[type="submit"]',
        '.next-btn', '.btn-next', '#next-button', '#btn_next',
        '.submit-btn', '.btn-submit', '.survey-page__next-button', '.survey-next', '.survey-submit',
        '[data-action="next"]', '[data-action="submit"]', '[data-direction="next"]',
        '[aria-label*="next" i]', '[title*="next" i]', '[aria-label*="continue" i]', '[aria-label*="পরবর্তী" i]',
        'button[class*="next" i]', 'a[class*="next" i]', 'div[class*="next" i][role="button"]'
      ];

      for (const sel of explicitSelectors) {
        try {
          const matched = rootDoc.querySelectorAll(sel);
          for (const btn of matched) {
            const valid = checkCandidate(btn);
            if (valid) return valid;
          }
        } catch (_) {}
      }

      // 2. Bottom navigation / footer bars for arrow or next buttons
      try {
        const bottomContainers = rootDoc.querySelectorAll(
          "#mrForm, .survey-footer, .footer, .nav-buttons, .navigation, .bottom-bar, .survey-bottom, .buttonBar, .bottom-nav, .nav-bar, .survey-navigation, [class*='bottom-nav' i], [class*='footer' i], [class*='navigation' i], [class*='nav' i], [class*='action' i]"
        );
        for (const container of bottomContainers) {
          const btns = Array.from(container.querySelectorAll("button, input[type='button'], input[type='submit'], a, div[role='button'], div[class*='btn' i], div[class*='button' i], div[class*='next' i], div[class*='nav' i], span[role='button'], div, span"))
            .filter(b => isElementVisible(b) && !b.closest("#jarvis-hud-container"));

          // If container has 2 interactive elements (typical: [Back <] on left and [Next >] on right)
          if (btns.length === 2) {
            const firstTxt = (btns[0].innerText || btns[0].value || "").trim().toLowerCase();
            const secondTxt = (btns[1].innerText || btns[1].value || "").trim().toLowerCase();
            if (excludeKeywords.some(kw => firstTxt === kw || firstTxt.includes(kw)) || firstTxt.includes("<")) {
              const valid = checkCandidate(btns[1]);
              if (valid) return valid;
            }
            if (secondTxt === ">" || hasRightArrowIcon(btns[1]) || nextKeywords.some(kw => secondTxt.includes(kw))) {
              const valid = checkCandidate(btns[1]);
              if (valid) return valid;
            }
            const r0 = btns[0].getBoundingClientRect();
            const r1 = btns[1].getBoundingClientRect();
            if (r1.left > r0.left) {
              const valid = checkCandidate(btns[1]);
              if (valid) return valid;
            }
          }

          for (const btn of btns) {
            const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
            if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || hasRightArrowIcon(btn) || nextKeywords.some(kw => txt === kw || txt.includes(kw))) {
              const valid = checkCandidate(btn);
              if (valid) return valid;
            }
          }
        }
      } catch (_) {}

      // 3. Rightmost or Centered Colored Block in bottom navigation area (Kantar, Decipher, Appinio)
      try {
        const bottomElements = Array.from(rootDoc.querySelectorAll("div, button, a, footer, [class*='footer' i], [class*='bottom' i], [class*='nav' i]")).filter(el => {
          if (!isElementVisible(el) || el.closest("#jarvis-hud-container")) return false;
          const rect = el.getBoundingClientRect();
          if (rect.bottom >= window.innerHeight * 0.60 && rect.height >= 26) {
            const txt = (el.innerText || el.textContent || "").trim().toLowerCase();
            if (excludeKeywords.some(kw => txt === kw || (txt.startsWith(kw) && txt.length < 8))) return false;
            if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || hasRightArrowIcon(el)) {
              return true;
            }
            const bg = window.getComputedStyle(el).backgroundColor;
            if (bg && /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.test(bg)) {
              const [_, r, g, b] = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/).map(Number);
              if (b > 110 && b > r + 15) {
                if (hasRightArrowIcon(el) || el.querySelector("svg, [class*='arrow' i], [class*='chevron' i], path") || rect.left > window.innerWidth * 0.25) {
                  return true;
                }
              }
            }
          }
          return false;
        });

        if (bottomElements.length > 0) {
          const withArrow = bottomElements.find(el => hasRightArrowIcon(el) || (el.innerText || "").trim() === ">");
          if (withArrow) {
            const innerClickable = withArrow.querySelector("button, [role='button'], a, svg") || withArrow;
            const valid = checkCandidate(innerClickable);
            if (valid) return valid;
          }
          const sorted = bottomElements.sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return rb.left - ra.left;
          });
          const valid = checkCandidate(sorted[0]);
          if (valid) return valid;
        }
      } catch (_) {}

      // 4. All clickable buttons and anchors matching next keywords or right arrow
      try {
        const allButtons = rootDoc.querySelectorAll("button, input[type='button'], a.btn, a.button, [role='button'], div.button, input[type='submit']");
        for (const btn of allButtons) {
          const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
          if (txt === ">" || txt === "»" || txt === "→" || txt === ">>" || txt === "›" || hasRightArrowIcon(btn) || nextKeywords.some((kw) => txt === kw || txt.includes(kw))) {
            const valid = checkCandidate(btn);
            if (valid) return valid;
          }
        }
      } catch (_) {}

      // 5. Primary / blue styled action button on bottom half of page
      try {
        const primaryButtons = Array.from(rootDoc.querySelectorAll('.btn-primary, button.primary, [class*="primary" i], .survey-button-next, .c-button--primary, button.submit, button.next')).filter(isElementVisible);
        for (const pb of primaryButtons) {
          const rect = pb.getBoundingClientRect();
          if (rect.top > window.innerHeight * 0.35) {
            const valid = checkCandidate(pb);
            if (valid) return valid;
          }
        }
      } catch (_) {}

      // 6. Any form submit button on page
      try {
        if (rootDoc.forms && rootDoc.forms.length > 0) {
          for (let f = 0; f < rootDoc.forms.length; f++) {
            const form = rootDoc.forms[f];
            const submitBtn = form.querySelector('input[type="submit"], button[type="submit"], button.btn, button');
            if (submitBtn) {
              const valid = checkCandidate(submitBtn);
              if (valid) return valid;
            }
          }
        }
      } catch (_) {}

      // 7. Recursive Iframe Search (Top-down)
      if (depth < 2) {
        try {
          const iframes = rootDoc.querySelectorAll("iframe, frame");
          for (const ifr of iframes) {
            try {
              const ifrDoc = ifr.contentDocument || ifr.contentWindow?.document;
              if (ifrDoc) {
                const ifrBtn = findNextButton(ifrDoc, depth + 1);
                if (ifrBtn) return ifrBtn;
              }
            } catch (_) {
              // Cross-origin iframe restricted
            }
          }
        } catch (_) {}
      }

      // 8. Parent Frame Search (Bottom-up if inside iframe)
      if (depth === 0 && window !== window.top) {
        try {
          const parentDoc = window.parent?.document;
          if (parentDoc) {
            const parentBtn = findNextButton(parentDoc, 1);
            if (parentBtn) return parentBtn;
          }
        } catch (_) {}
      }

      // 9. If disabled candidate was found and no active button found, return it so caller can unlock/poll it!
      if (disabledCandidate) {
        return disabledCandidate;
      }

      return null;
    }

    function clickElementLikeHuman(el) {
      if (!el) return;

      // 1. If element is disabled, forcefully clear disabled attributes to allow click to fire
      try {
        if (el.disabled) el.disabled = false;
        el.removeAttribute("disabled");
        el.removeAttribute("aria-disabled");
        el.classList.remove("disabled", "btn-disabled", "is-disabled");
      } catch (_) {}

      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (_) {}

      // 2. Comprehensive Event Dispatch Sequence (Pointer, Mouse, Focus, Click)
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

      // 3. Form submission trigger
      try {
        const form = el.form || el.closest("form");
        if (form) {
          if (typeof form.requestSubmit === "function") {
            try { form.requestSubmit(el); } catch (_) {}
          } else {
            try { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); } catch (_) {}
          }
        }
      } catch (_) {}

      // 4. Enter Key fallback (Conversational / Typeform / SPA navigation)
      try {
        const enterOpts = { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 };
        el.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
        el.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
        el.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
      } catch (_) {}
    }

    /**
     * Polls and guarantees Next button is found and clicked like a human
     * Automatically handles transient disabling and secondary retries
     */
    async function findAndClickNextButton(timeoutMs = 4000) {
      const startTime = Date.now();
      let btn = null;

      while (Date.now() - startTime < timeoutMs) {
        btn = findNextButton();
        if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
          break;
        }
        await sleep(200);
      }

      if (!btn) {
        // Last attempt: check for any candidate even if still marked disabled
        btn = findNextButton();
      }

      if (!btn) {
        console.warn("[Jarvis] Next button not detected on page after " + timeoutMs + "ms");
        return false;
      }

      // If button was disabled, remove disabled flags
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") {
        try {
          btn.disabled = false;
          btn.removeAttribute("disabled");
          btn.removeAttribute("aria-disabled");
          btn.classList.remove("disabled");
        } catch (_) {}
      }

      addBattleLog("action", "Next বাটনে ক্লিক করা হচ্ছে...", (btn.innerText || btn.value || "").trim().slice(0, 30));
      clickElementLikeHuman(btn);

      // Verify that navigation or page change actually occurred
      const initialSig = getQuestionsFingerprint();
      const initialUrl = window.location.href;

      await sleep(1800);

      // If still stuck on same page after 1.8s, dispatch backup second click
      if (window.location.href === initialUrl) {
        const afterSig = getQuestionsFingerprint();
        if (afterSig && afterSig === initialSig) {
          const retryBtn = findNextButton();
          if (retryBtn && isElementVisible(retryBtn)) {
            console.log("[Jarvis] Page did not advance after first click; dispatching secondary backup click...");
            addBattleLog("action", "পেজ অগ্রসর হয়নি; দ্বিতীয়বার ব্যাকআপ ক্লিক করা হচ্ছে...");
            clickElementLikeHuman(retryBtn);
          }
        }
      }

      return true;
    }

    /**
     * Universal Smart Auto-Advance:
     * Observes if survey automatically proceeds after option selection.
     * If not, detects and clicks Next button with retry resilience.
     */
    async function smartAutoAdvance(options = {}) {
      const maxWaitMs = options.maxWaitMs || 3000;
      const triggerNext = options.triggerNextCycle !== false;
      const isManual = !!options.manualMode;
      const initialSig = getQuestionsFingerprint();

      // Step 1: Wait up to maxWaitMs to observe if page advances automatically
      if (!isManual) {
        updateHUDStatus("analyzing", "👀 উত্তর নির্বাচন সম্পন্ন! পর্যবেক্ষণ চলছে স্বয়ংক্রিয়ভাবে নেক্সট পেজ আসে কিনা...");
      }
      const watchStart = Date.now();
      let didAutoAdvance = false;

      while (Date.now() - watchStart < maxWaitMs) {
        await sleep(200);
        if (!isAutoPilotActive && !isManual) return false;
        const currentSig = getQuestionsFingerprint();
        if (currentSig && currentSig !== initialSig) {
          didAutoAdvance = true;
          break;
        }
      }

      if (didAutoAdvance) {
        lastHandledQuestionFingerprint = initialSig;
        updateHUDStatus("analyzing", "⚡ সার্ভে নিজে থেকেই পরবর্তী প্রশ্নে চলে গেছে!");
        addBattleLog("success", "সার্ভে নিজে থেকেই পরবর্তী প্রশ্নে চলে গেছে");
        if (triggerNext && isAutoPilotActive) {
          setTimeout(() => {
            if (isAutoPilotActive && !autoPilotRunningCycle) triggerAutoPilotCycle();
          }, 400);
        }
        return true;
      }

      // Step 2: Survey did not auto-advance, click Next button
      updateHUDStatus("analyzing", "🤖 স্বয়ংক্রিয়ভাবে Next বাটনে ক্লিক করা হচ্ছে...");
      const clicked = await findAndClickNextButton(4000);
      if (clicked) {
        lastHandledQuestionFingerprint = initialSig;
        updateHUDStatus("done", options.isFinalPage
          ? "🛑 লাস্ট পেজ: সাবমিট বাটনে ক্লিক সম্পন্ন!"
          : "⏭️ Next বাটনে সফলভাবে ক্লিক করা হয়েছে! পরবর্তী পেজে যাওয়া হচ্ছে...");
        addBattleLog("success", "Next বাটনে সফলভাবে ক্লিক করা হয়েছে!");
        if (triggerNext && isAutoPilotActive && !options.isFinalPage) {
          setTimeout(() => {
            if (isAutoPilotActive && !autoPilotRunningCycle) triggerAutoPilotCycle();
          }, 1500);
        }
        return true;
      } else {
        updateHUDStatus("error", "⚠️ Next বাটন খুঁজে পাওয়া যায়নি। আপনি দেখে Next চাপুন।");
        return false;
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
          if (!isElementVisible(t) || t.closest("#jarvis-hud-container, .jarvis-inpage-ans-banner, .jarvis-inline-question-callout, [data-jarvis-ui], .jarvis-pick-badge, [class*='jarvis-']")) continue;
          const txt = cleanText(t.innerText);
          if (txt && txt.length > 5 && !/jarvis|copilot|👉|এটা হবে সঠিক উত্তর|সিলেক্ট করুন|কপি করুন/i.test(txt) && !/terms|privacy|cookie/i.test(txt)) {
            if (/^(continue|next|back|previous|submit|cancel)$/i.test(txt.trim())) continue;
            if (!mainQuestion) mainQuestion = txt;
            else if (!contextPrompt && txt !== mainQuestion && txt.length < 80) contextPrompt = txt;
          }
        }

        // Check for strong, heading, or paragraph ending with question mark or asking survey question
        if (!mainQuestion) {
          const pTags = document.querySelectorAll("p, strong, b, div, span");
          for (const p of pTags) {
            if (!isElementVisible(p) || p.children.length > 3 || p.closest("#jarvis-hud-container, .jarvis-inpage-ans-banner, .jarvis-inline-question-callout, [data-jarvis-ui], .jarvis-pick-badge, [class*='jarvis-']")) continue;
            const txt = cleanText(p.innerText);
            if (txt && txt.length > 10 && txt.length < 350 && (txt.includes("?") || /select|which of|how much|when added|what color|associate with/i.test(txt)) && !/jarvis|copilot|👉|এটা হবে সঠিক উত্তর/i.test(txt)) {
              if (/^(continue|next|back|previous|submit|cancel)$/i.test(txt.trim())) continue;
              mainQuestion = txt;
              break;
            }
          }
        }

        // Check for intermediate context banner card (e.g. "With dinner", "For breakfast")
        const contextCards = document.querySelectorAll('[class*="banner" i], [class*="context" i], [class*="prompt" i], [class*="card" i] strong, [class*="header" i] h2, [class*="header" i] h3');
        for (const cc of contextCards) {
          if (!isElementVisible(cc) || cc.closest("#jarvis-hud-container, .jarvis-inpage-ans-banner, .jarvis-inline-question-callout, [data-jarvis-ui], .jarvis-pick-badge, [class*='jarvis-']")) continue;
          const cTxt = cleanText(cc.innerText);
          if (cTxt && cTxt.length >= 3 && cTxt.length <= 60 && cTxt !== mainQuestion && !/next|back|jarvis|continue|submit/i.test(cTxt)) {
            if (/with|for|at|during|about|category|brand/i.test(cTxt)) {
              contextPrompt = cTxt;
              break;
            }
          }
        }

        if (mainQuestion && /^(continue|next|back|previous|submit|cancel)$/i.test(mainQuestion.trim())) {
          mainQuestion = "";
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

      // B. Matrix / table questions (Handles Qualtrics, Toluna, Decipher, Confirmit, SurveyMonkey, and modern grid cards)
      const matrixCandidates = Array.from(document.querySelectorAll(
        "table, .matrix-table, .grid-table, .matrix, [class*='matrix' i], [class*='grid-question' i], [class*='gridTable' i], [role='grid'], [role='table']"
      )).filter(t => isElementVisible(t) && !t.closest(".mrQuestionTable") && !t.closest("#jarvis-hud-container"));

      matrixCandidates.forEach((table) => {
        const isHtmlTable = table.tagName.toLowerCase() === "table";
        const rawRows = isHtmlTable
          ? Array.from(table.querySelectorAll("tr"))
          : Array.from(table.querySelectorAll("[class*='row' i], [role='row']"));

        if (rawRows.length < 2) return;

        // Overarching question heading
        const mainHeading = findPrecedingHeading(table) || detectPageQuestionTitle() || "";

        // Collect header row and column titles
        const headerRow = isHtmlTable
          ? (table.querySelector("thead tr") || rawRows[0])
          : (table.querySelector("[class*='header' i], [class*='head' i]") || rawRows[0]);

        const headerCells = Array.from(headerRow.querySelectorAll("th, td, [class*='col' i], [class*='header' i]"))
          .map(cell => cleanText(cell.innerText || cell.textContent || ""));

        const validHeaders = headerCells.filter(h => h.length > 0 && !/jarvis|copilot/i.test(h));

        // Data rows (exclude the header row)
        const dataRows = rawRows.filter(r => r !== headerRow && isElementVisible(r));

        dataRows.forEach((row, rIdx) => {
          let rowLabelEl = isHtmlTable
            ? (row.querySelector("th, td:first-child, .row-label, [class*='statement' i], [class*='row-header' i]") || row.firstElementChild)
            : (row.querySelector("[class*='label' i], [class*='statement' i], [class*='title' i], [class*='text' i]") || row.firstElementChild);

          let rowLabel = cleanText(rowLabelEl?.innerText || `Row ${rIdx + 1}`);

          // Find radios/checkboxes in this row
          const inputs = Array.from(row.querySelectorAll(
            'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], .radio, .custom-control-input, label:has(input), td.clickable'
          )).filter(el => {
            if (el.tagName.toLowerCase() === "label" && el.querySelector("input")) return false;
            return isElementVisible(el);
          });

          if (inputs.length === 0) return;

          const isCheck = inputs.some(i => i.type === "checkbox" || i.getAttribute("role") === "checkbox");
          const opts = [];

          inputs.forEach((input, cIdx) => {
            trackedElements.add(input);
            const nativeInput = input.tagName.toLowerCase() === "input" ? input : (input.querySelector("input") || input);
            if (nativeInput !== input) trackedElements.add(nativeInput);

            // Determine accurate column label
            let colLabel = "";
            const cell = input.closest("td, th, [role='gridcell'], [role='cell']");
            if (cell && cell.cellIndex !== undefined && headerCells[cell.cellIndex]) {
              colLabel = headerCells[cell.cellIndex];
            }
            if (!colLabel) {
              const offset = (headerCells.length > inputs.length) ? (headerCells.length - inputs.length) : 0;
              colLabel = headerCells[cIdx + offset] || validHeaders[cIdx] || `Column ${cIdx + 1}`;
            }

            opts.push({
              id: assignTemporaryId(nativeInput),
              name: nativeInput.name || `matrix_${rIdx}`,
              type: isCheck ? "checkbox" : "radio",
              value: nativeInput.value || colLabel,
              label: cleanText(colLabel),
              element: nativeInput,
              rowElement: row
            });
          });

          if (opts.length > 0) {
            const fullQText = mainHeading ? `${mainHeading} — ${rowLabel}` : rowLabel;
            questions.push({
              index: qIndex++,
              type: isCheck ? "matrix_checkbox" : "matrix_row",
              text: fullQText,
              row_label: rowLabel,
              main_question: mainHeading,
              row_element: row,
              options: opts
            });
          }
        });
      });

      // C. Explicit Question Containers (Qualtrics, Toluna Wix, Decipher, Kantar, SurveyMonkey, etc.)
      const containerSelectors = [
        ".QuestionOuter", ".survey-question", "fieldset", "[role='radiogroup']",
        ".question-block", ".card-question", ".grid-question",
        "[data-question-id]", "[data-question-name]", ".survey-page__question",
        ".mrQuestionTable", ".mrQuestion", ".mrQuestionTextContainer",
        "[class*='question-container' i]", "[class*='question_container' i]",
        "form#mrForm", ".mrlWeb", ".q-container"
      ].join(", ");

      const rawContainers = Array.from(document.querySelectorAll(containerSelectors)).filter(c => {
        if (!isElementVisible(c) || c.closest("#jarvis-hud-container")) return false;
        // Skip if inside an already processed table/matrix from Section B
        if (c.closest("table, .matrix-table, .grid-table, .matrix, [role='grid'], [role='table']")) return false;
        return true;
      });

      // Filter to TOP-LEVEL question containers only (discard any container nested inside another question container)
      const topLevelContainers = rawContainers.filter(c => !rawContainers.some(parent => parent !== c && parent.contains(c)));

      topLevelContainers.forEach((container) => {
        const titleEl = container.querySelector(
          "legend, .QuestionText, .question-text, .title, .q-title, h1, h2, h3, h4, h5, .control-label, [role='heading'], .mrQuestionText, .mrBannerText"
        );
        const qText = cleanText(titleEl ? titleEl.innerText : "") || detectPageQuestionTitle() || `Question ${qIndex + 1}`;

        const rawElements = Array.from(container.querySelectorAll(
          "input, select, textarea, [role='radio'], [role='checkbox'], [role='option'], .choice, .option, .answer, .survey-option, .btn-choice, [data-choice], [data-value]"
        ));
        let validInputs = rawElements.filter((inp) => {
          const t = (inp.getAttribute("type") || inp.tagName.toLowerCase()).toLowerCase();
          return !["hidden", "submit", "button"].includes(t) && !trackedElements.has(inp) && isElementVisible(inp);
        });

        // If actual form controls exist, prioritize them and ignore outer wrapper divs
        const realFormControls = validInputs.filter(el => ["input", "select", "textarea"].includes(el.tagName.toLowerCase()) || el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox");
        if (realFormControls.length > 0) {
          validInputs = realFormControls;
        }

        // Only use custom button/div choices if at least 2 exist and no real form controls were found
        if (validInputs.length === 0) {
          const customChoices = Array.from(container.querySelectorAll("button, [role='button'], label.option-row, li, .card, .mrCard, td.mrGridCell")).filter(el => isElementVisible(el) && !trackedElements.has(el) && !/next|back|previous|submit|continue/i.test(el.innerText || ""));
          if (customChoices.length >= 2) {
            validInputs = customChoices;
          } else {
            return;
          }
        }

        const options = [];
        let hasRadio = false;
        let hasCheckbox = false;
        let hasText = false;
        let hasSelect = false;

        validInputs.forEach((input) => {
          trackedElements.add(input);
          const tag = input.tagName.toLowerCase();
          const type = (input.getAttribute("type") || tag).toLowerCase();
          const label = getElementVisualLabel(input) || input.innerText || "";

          if (type === "radio" || input.getAttribute("role") === "radio") {
            hasRadio = true;
          } else if (type === "checkbox" || input.getAttribute("role") === "checkbox") {
            hasCheckbox = true;
          } else if (tag === "select") {
            hasSelect = true;
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
          } else if (tag === "textarea" || (tag === "input" && ["text", "email", "number", "tel", "search"].includes(type))) {
            hasText = true;
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
          let qType = "single_choice";
          if (hasCheckbox) qType = "multiple_choice";
          else if (hasRadio) qType = "single_choice";
          else if (hasSelect) qType = "dropdown";
          else if (hasText && options.length === 1) qType = "text_input";
          else if (options.length >= 2) qType = "single_choice";

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
            if (!isElementVisible(ch) || ch.closest("#jarvis-hud-container, [data-jarvis-ui], [class*='jarvis-']")) return false;
            const t = cleanText(ch.innerText || "");
            return t.length >= 1 && t.length <= 100 && !/jarvis|copilot|👉|এটা হবে|next|back|previous|continue|submit|cancel/i.test(t);
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
      function sanitizeLabelText(raw) {
        if (!raw) return "";
        return cleanText(raw)
          .replace(/👉\s*এটা হবে সঠিক উত্তর:[^]*?কপি/gi, "")
          .replace(/JARVIS CHOICE #\d+/gi, "")
          .replace(/সিলেক্ট করুন 🎯/gi, "")
          .replace(/📋 কপি/gi, "")
          .trim();
      }

      if (el.id) {
        try {
          const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (explicitLabel && sanitizeLabelText(explicitLabel.innerText)) {
            return sanitizeLabelText(explicitLabel.innerText);
          }
        } catch (_) { }
      }
      // 2. Wrapped in label
      const parentLabel = el.closest("label");
      if (parentLabel && sanitizeLabelText(parentLabel.innerText)) {
        return sanitizeLabelText(parentLabel.innerText);
      }
      // 3. Confirmit / MrlWeb grid label in row or cell
      const mrRow = el.closest("tr, .mrRow");
      if (mrRow) {
        const rowLabel = mrRow.querySelector("td.mrGridLabel, th, label, .mrLabel, span.mrQuestionText, span.mrMultiple, span.mrSingle");
        if (rowLabel && sanitizeLabelText(rowLabel.innerText)) {
          return sanitizeLabelText(rowLabel.innerText);
        }
      }
      // 4. Parent choice container (e.g. .form-check, .custom-control, .option, .choice, .mrCard, div, li)
      const container = el.closest(".form-check, .custom-control, .option, .choice, .option-row, .radio, .checkbox, li, tr, .mrCard, td");
      if (container) {
        const lblInContainer = container.querySelector("label, .mrGridLabel, span.mrQuestionText, span.mrMultiple, span.mrSingle, .choice-text");
        if (lblInContainer && sanitizeLabelText(lblInContainer.innerText)) {
          return sanitizeLabelText(lblInContainer.innerText);
        }
        const cText = sanitizeLabelText(container.innerText);
        if (cText && cText.length < 200) {
          return cText;
        }
      }
      // 5. Next sibling text / span / label
      let sib = el.nextElementSibling;
      if (sib && sanitizeLabelText(sib.innerText)) {
        return sanitizeLabelText(sib.innerText);
      }
      if (el.nextSibling && sanitizeLabelText(el.nextSibling.textContent)) {
        return sanitizeLabelText(el.nextSibling.textContent);
      }
      // 6. Value, aria-label, title, placeholder
      return sanitizeLabelText(el.getAttribute("aria-label") || el.title || el.placeholder || el.value || "");
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
      let s = txt.replace(/\s+/g, " ").replace(/[\r\n\t]+/g, " ").trim();
      if (s.includes("👉") || s.includes("এটা হবে সঠিক উত্তর") || s.includes("jarvis choice")) {
        s = s.replace(/^👉\s*এটা হবে সঠিক উত্তর:\s*/i, "")
             .replace(/^👉\s*jarvis choice:\s*/i, "")
             .replace(/👉\s*এটা হবে সঠিক উত্তর:[^•\n]+/gi, "")
             .replace(/\s*\(auto-selected\)/i, "")
             .trim();
      }
      return s;
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
      addBattleLog("scan", "সার্ভে পেজ স্ক্যান শুরু হয়েছে...", window.location.hostname);

      const questions = extractSurveyQuestions();
      if (questions.length === 0) {
        updateHUDStatus("analyzing", "📸 পেজে সরাসরি টেক্সট/ফর্ম প্রশ্ন পাওয়া যায়নি! সম্পূর্ণ পেজের স্ক্রিনশট নিয়ে সঠিক উত্তর নির্ণয় করা হচ্ছে...");
        addBattleLog("scan", "কোনো সাধারণ ফর্ম প্রশ্ন পাওয়া যায়নি, স্বয়ংক্রিয়ভাবে স্ক্রিনশট ভিশনে পাঠানো হচ্ছে...");
        return await performScreenshotAnalysis();
      }

      addBattleLog("scan", `${questions.length}টি প্রশ্ন শনাক্ত করা হয়েছে`, questions[0]?.text?.slice(0, 70) || "");

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
      addBattleLog("ai", `Gemini ইঞ্জিন দিয়ে ${questions.length}টি প্রশ্ন বিশ্লেষণ হচ্ছে...`);

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "ANALYZE_SURVEY_PAGE", payload: pageData },
          (res) => resolve(res)
        );
      });

      if (!response || !response.success) {
        const err = response?.error || "Analysis failed";
        updateHUDStatus("error", err);
        addBattleLog("error", `বিশ্লেষণ ব্যর্থ হয়েছে: ${err}`);
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
        addBattleLog("cache", `মেমরি ক্যাশ থেকে উত্তর প্রস্তুত (${response.data.answers?.length || questions.length}টি)`);
      } else {
        updateHUDStatus("done", `✅ ${modelTag}${providerTag}: মানুষের মতো ${response.data.answers?.length || questions.length}টি উত্তর প্রস্তুত!`);
        addBattleLog("ai", `${modelTag}${providerTag}: ${response.data.answers?.length || questions.length}টি সঠিক উত্তর নির্ণীত হয়েছে`);
      }

      if (response.data?.answers) {
        response.data.answers.forEach((ans, i) => {
          const ansText = (ans.selected_labels && ans.selected_labels.join(", ")) || ans.text_input_value || "সিলেক্টেড";
          addBattleLog("match", `Q${i + 1}: ${ansText}`, ans.question_text?.slice(0, 60));
        });
      }

      return { success: true, data: response.data, providerUsed: response.providerUsed, modelUsed: response.modelUsed };
    }

    // Screenshot analysis is handled by unified performScreenshotAnalysis() at root level

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
        .replace(/^[•\-\*\d\.\)\s…]+/, "") // Remove bullet points, numbers, ellipses
        .trim();
      if (!cleanTarget) return null;

      // (Global isWordMatch is used for whole-word / token boundary matching)

      // Check if answerContext points to a known question with options
      if (answerContext && (answerContext.question_index !== undefined || answerContext.question_text)) {
        const questionsList = extractSurveyQuestions();
        const matchedQ = (typeof answerContext.question_index === "number" && questionsList[answerContext.question_index])
          ? questionsList[answerContext.question_index]
          : questionsList.find(q => q.text === answerContext.question_text || (q.row_label && answerContext.question_text && answerContext.question_text.includes(q.row_label)));

        if (matchedQ && matchedQ.options && matchedQ.options.length > 0) {
          const directOpt = matchedQ.options.find(o => 
            isWordMatch(o.label, cleanTarget) ||
            cleanText(o.label).toLowerCase() === cleanTarget ||
            (cleanText(o.label).length >= 4 && cleanTarget.includes(cleanText(o.label).toLowerCase())) ||
            (cleanTarget.length >= 4 && cleanText(o.label).toLowerCase().includes(cleanTarget))
          );
          if (directOpt && directOpt.element) {
            return resolveInteractiveTarget(directOpt.element);
          }
        }
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
      const siblingInput = el.closest("tr, td, [role='gridcell'], [role='cell'], .mrRow, .mrCard")?.querySelector('input[type="radio"], input[type="checkbox"]');
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

      const questions = extractSurveyQuestions();
      data.answers = normalizeAndSanitizeAnswers(data.answers, questions);

      data.answers.forEach((ans, idx) => {
        const isMsg = ans.recommended_action === "type_text" || Boolean(ans.text_input_value) || Boolean(ans.text);
        if (isMsg) return; // Never highlight text inputs with choice badges

        const targetIds = ans.target_element_ids || [];
        const labels = ans.selected_labels || [];
        const qObj = questions[ans.question_index];

        let foundEl = false;
        // Check qObj.options first
        if (qObj && qObj.options && qObj.options.length > 0 && labels.length > 0) {
          for (const lbl of labels) {
            const matchedOpt = qObj.options.find(o => 
              isWordMatch(o.label, lbl) ||
              cleanText(o.label).toLowerCase() === cleanText(lbl).toLowerCase() ||
              (cleanText(o.label).length >= 4 && cleanText(lbl).toLowerCase().includes(cleanText(o.label).toLowerCase())) ||
              (cleanText(lbl).length >= 4 && cleanText(o.label).toLowerCase().includes(cleanText(lbl).toLowerCase()))
            );
            if (matchedOpt && matchedOpt.element) {
              applyHighlightStyle(matchedOpt.element, ans, idx + 1);
              foundEl = true;
              break;
            }
          }
        }

        if (!foundEl && targetIds.length > 0) {
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
      if (!element) return;
      if (element.tagName.toLowerCase() === "tr" || element.tagName.toLowerCase() === "table") {
        const inner = element.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');
        if (inner) element = inner;
      }
      const parentContainer = element.closest("label, td, [role='gridcell'], div.form-check, .choice, .option") || element.parentElement || element;
      parentContainer.classList.add("jarvis-highlighted-container");

      // CRITICAL: NO extra text badges like 'JARVIS CHOICE' or labels added to options!
      // Direct selection on the live page without clutter.

      if (index === 1 && !isAutoPilotActive) {
        try { parentContainer.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
      }
    }

    function clearAllHighlights() {
      document.querySelectorAll(".jarvis-highlighted-container").forEach((el) => {
        el.classList.remove("jarvis-highlighted-container");
      });
      document.querySelectorAll(".jarvis-pick-badge, .jarvis-inpage-ans-banner, .jarvis-inline-question-callout").forEach((el) => el.remove());
    }

    /**
     * Sanitizes AI answers to guarantee matrix rows have column labels (never row names)
     * and text inputs are flagged properly for auto-typing.
     */
    function normalizeAndSanitizeAnswers(answers, questions = null) {
      if (!answers || !Array.isArray(answers)) return [];
      const qs = questions || extractSurveyQuestions();

      return answers.map((ans, idx) => {
        let qIdx = (typeof ans.question_index === "number") ? ans.question_index : (typeof ans.question_number === "number" ? ans.question_number - 1 : idx);
        const qObj = (qs && qs[qIdx]) ? qs[qIdx] : null;
        let labels = Array.isArray(ans.selected_labels) ? [...ans.selected_labels] : [];
        if (labels.length === 0) {
          if (ans.selected_label) labels.push(String(ans.selected_label));
          else if (ans.answer && typeof ans.answer === "string") labels.push(ans.answer);
          else if (ans.choice) labels.push(String(ans.choice));
          else if (ans.value) labels.push(String(ans.value));
        }

        // Clean corrupted prefixes and filter out page navigation buttons (Continue, Next, Back, Submit)
        const navKeywords = ["continue", "next", "back", "previous", "submit", "skip", "forward", "পরবর্তী", "এগিয়ে যান", "চালিয়ে যান"];
        labels = labels.map(l => {
          if (typeof l !== "string") return l;
          return l.replace(/^👉\s*এটা হবে সঠিক উত্তর:\s*/i, "")
                  .replace(/^👉\s*jarvis choice:\s*/i, "")
                  .replace(/\s*\(auto-selected\)/i, "")
                  .trim();
        }).filter(l => {
          if (!l || l.length < 1) return false;
          const lower = l.toLowerCase();
          if (navKeywords.includes(lower)) return false;
          if (lower.includes("এটা হবে সঠিক উত্তর")) return false;
          return true;
        });

        // If labels became empty because it was only "Continue" or corrupted, select genuine option
        if (labels.length === 0 && qObj && qObj.options && qObj.options.length > 0) {
          const validOpts = qObj.options.filter(o => {
            const oText = (o.label || "").toLowerCase();
            return !navKeywords.includes(oText) && !oText.includes("continue") && !oText.includes("next");
          });
          if (validOpts.length > 0) {
            const personaOpt = matchOptionToPersona(qObj) || validOpts[0];
            labels = [personaOpt.label];
            console.log(`[Jarvis Sanitizer] 🛡️ Filtered navigation word from answer, replaced with: "${labels[0]}"`);
          }
        }

        // MATRIX ROW VALIDATION: Guarantee chosen option is a COLUMN label, never row name!
        if (qObj && qObj.options && qObj.options.length > 0 && (qObj.type === "matrix_row" || qObj.type === "matrix_checkbox" || qObj.row_label)) {
          const rowName = cleanText(qObj.row_label || qObj.text || "").toLowerCase();
          const isAccidentalRowName = labels.some(lbl => {
            const cLbl = cleanText(lbl).toLowerCase();
            const matchesRow = rowName && (cLbl === rowName || (cLbl.length >= 4 && rowName.includes(cLbl)) || (rowName.length >= 4 && cLbl.includes(rowName)));
            const matchesAnyCol = qObj.options.some(opt => isWordMatch(opt.label, lbl));
            return matchesRow && !matchesAnyCol;
          });

          if (isAccidentalRowName || labels.length === 0) {
            const bestCol = findBestMatrixOption(qObj.options);
            if (bestCol) {
              console.log(`[Jarvis Sanitizer] 🔄 Fixed matrix row "${rowName}": replaced row name with column option "${bestCol.label}"`);
              labels = [bestCol.label];
            }
          }
        }

        let action = ans.recommended_action || "select_radio";
        if (action === "type_text" || ans.text_input_value || ans.text) {
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
    }

    function findBestMatrixOption(options) {
      if (!options || options.length === 0) return null;
      const targets = [
        "Yes, I have heard of", "I've used this to treat", "I've heard of as treatment",
        "Yes", "Agree", "Somewhat Agree", "Satisfied", "Often", "Frequently", "Regularly",
        "Important", "Likely", "4", "5"
      ];
      for (const target of targets) {
        for (const opt of options) {
          if (isWordMatch(opt.label, target)) return opt;
        }
      }
      const nonNegative = options.find(o => !/prefer not|don't know|not sure|none of|never/i.test(o.label));
      return nonNegative || options[0];
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

      const questions = extractSurveyQuestions();
      data.answers = normalizeAndSanitizeAnswers(data.answers, questions);
      addBattleLog("action", `উত্তর পূরণ শুরু হচ্ছে (${data.answers.length}টি প্রশ্ন)...`);

      const { autoFillDelay } = await chrome.storage.local.get(["autoFillDelay"]);
      const isAuto = isAutoPilotActive;
      const baseDelay = customGapMs !== null ? customGapMs : (autoFillDelay !== undefined ? Math.min(autoFillDelay, 180) : 120);

      let filledCount = 0;
      const startQuestionsSig = getQuestionsFingerprint();

      for (let ansIdx = 0; ansIdx < data.answers.length; ansIdx++) {
        const ans = data.answers[ansIdx];
        let filledThisAnswer = false;
        const targetIds = ans.target_element_ids || [];
        const labels = ans.selected_labels || [];
        const isMultiple = ans.recommended_action === "select_checkbox" || ans.recommended_action === "matrix_checkbox";
        const qObj = (typeof ans.question_index === "number" && questions[ans.question_index])
          ? questions[ans.question_index]
          : questions.find(q => q.text === ans.question_text || (q.row_label && ans.question_text && ans.question_text.includes(q.row_label)));

        // 0. High-Precision Scoped Option Matcher: Check this question's known options first!
        if (qObj && qObj.options && qObj.options.length > 0 && labels.length > 0) {
          for (const label of labels) {
            const matchedOpt = qObj.options.find(o => 
              isWordMatch(o.label, label) ||
              cleanText(o.label).toLowerCase() === cleanText(label).toLowerCase() ||
              (cleanText(o.label).length >= 4 && cleanText(label).toLowerCase().includes(cleanText(o.label).toLowerCase())) ||
              (cleanText(label).length >= 4 && cleanText(o.label).toLowerCase().includes(cleanText(label).toLowerCase()))
            );
            if (matchedOpt && matchedOpt.element) {
              await simulateHumanAction(matchedOpt.element, ans);
              applyHighlightStyle(matchedOpt.element, ans, ansIdx + 1);
              addBattleLog("action", `সিলেক্ট করা হয়েছে: ${matchedOpt.label}`, qObj.text?.slice(0, 50));
              filledCount++;
              filledThisAnswer = true;
              if (!isMultiple) break;
            }
          }
        }

        // If matrix row but no column matched yet, use best matrix column option
        if (!filledThisAnswer && qObj && (qObj.type === "matrix_row" || qObj.row_label) && qObj.options && qObj.options.length > 0) {
          const bestOpt = findBestMatrixOption(qObj.options);
          if (bestOpt && bestOpt.element) {
            await simulateHumanAction(bestOpt.element, ans);
            applyHighlightStyle(bestOpt.element, ans, ansIdx + 1);
            addBattleLog("action", `ম্যাট্রিক্স কলাম সিলেক্ট: ${bestOpt.label}`, qObj.row_label || qObj.text?.slice(0, 50));
            filledCount++;
            filledThisAnswer = true;
          }
        }

        // 1. Try target_element_ids
        if (!filledThisAnswer || isMultiple) {
          for (const targetId of targetIds) {
            if (!targetId) continue;
            const el = document.getElementById(targetId) || document.querySelector(`[data-jarvis-optid="${targetId}"]`);
            if (el) {
              await simulateHumanAction(el, ans);
              applyHighlightStyle(el, ans, ansIdx + 1);
              addBattleLog("action", `ID দ্বারা সিলেক্ট: ${targetId}`);
              filledCount++;
              filledThisAnswer = true;
              if (!isMultiple) break;
            }
          }
        }

        // 2. Search by selected_labels globally
        if ((!filledThisAnswer || isMultiple) && labels.length > 0) {
          for (const label of labels) {
            const el = findInputByLabelOrValue(label, ans);
            if (el) {
              await simulateHumanAction(el, ans);
              applyHighlightStyle(el, ans, ansIdx + 1);
              addBattleLog("action", `লেবেল দ্বারা সিলেক্ট: ${label}`);
              filledCount++;
              filledThisAnswer = true;
              if (!isMultiple) break;
            }
          }
        }

        // 2.5 Emergency Direct DOM Text Finder (Never clicks bare table rows)
        if ((!filledThisAnswer || isMultiple) && labels.length > 0) {
          for (const label of labels) {
            const cleanLbl = cleanText(label).toLowerCase();
            if (!cleanLbl || cleanLbl.length < 2) continue;
            const candidates = Array.from(document.querySelectorAll("button, label, [role='button'], [role='radio'], [role='checkbox'], div, span, p, td, li, a"))
              .filter(el => isElementVisible(el) && !el.closest("#jarvis-hud-container") && el.children.length <= 4);

            for (const cand of candidates) {
              const cText = cleanText(cand.innerText || cand.textContent || "").toLowerCase();
              if (cText === cleanLbl || (cText.length >= 3 && cleanLbl.length >= 3 && (cText.includes(cleanLbl) || cleanLbl.includes(cText)))) {
                let target = cand.closest("button, label, [role='button'], [role='radio'], [role='checkbox'], div, tr, td") || cand;
                if (target.tagName.toLowerCase() === "tr" || target.tagName.toLowerCase() === "table") {
                  const innerInput = target.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');
                  if (innerInput) {
                    target = innerInput;
                  } else {
                    continue; // Skip bare table row
                  }
                }
                await simulateHumanAction(target, ans);
                applyHighlightStyle(target, ans, ansIdx + 1);
                addBattleLog("action", `ডম টেক্সট দ্বারা সিলেক্ট: ${label}`);
                filledCount++;
                filledThisAnswer = true;
                if (!isMultiple) break;
              }
            }
            if (filledThisAnswer && !isMultiple) break;
          }
        }

        // 3. Direct Message Box / Textarea Typing
        if (!filledThisAnswer && (ans.recommended_action === "type_text" || ans.text_input_value || (labels.length > 0 && labels[0].length > 15))) {
          let targetEl = null;

          if (qObj?.options) {
            const textOpt = qObj.options.find(o => ["text_input", "textarea", "text", "email", "number", "search", "url"].includes(o.type)) ||
              questions.flatMap(q => q.options).find(o => ["text_input", "textarea", "text", "email", "number"].includes(o.type) && isElementVisible(o.element));
            if (textOpt && textOpt.element) {
              targetEl = textOpt.element;
            }
          }

          if (!targetEl) {
            const allContainers = document.querySelectorAll(".QuestionOuter, .question, .survey-question, fieldset, .form-group, .survey-card, .survey-row, tr");
            const qContainer = allContainers[ans.question_index] || document;
            targetEl = qContainer.querySelector('textarea, input[type="text"], input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="submit"]):not([type="button"]), [contenteditable="true"]');
          }

          if (!targetEl) {
            targetEl = Array.from(document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]')).filter(isElementVisible)[0];
          }

          if (targetEl && isElementVisible(targetEl)) {
            await simulateHumanAction(targetEl, ans);
            addBattleLog("action", "টেক্সটবক্সে মতামত টাইপ করা হয়েছে", ans.text_input_value?.slice(0, 40) || "");
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
            applyHighlightStyle(targetOpt.element, ans, ansIdx + 1);
            addBattleLog("action", `পারসোনা ম্যাচ দ্বারা সিলেক্ট: ${targetOpt.label}`);
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
            addBattleLog("success", "উত্তর সিলেক্ট করার পর সার্ভে স্বয়ংক্রিয়ভাবে এগিয়ে গেছে!");
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

      addBattleLog("success", `মোট ${filledCount}টি অপশন পেজে সফলভাবে পূরণ ও সিলেক্ট সম্পন্ন!`);
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

      // Everyday Banking / Financial Institutions (Large National Bank e.g. Chase, Bank of America, Wells Fargo)
      if (/bank|everyday banking|checking|savings|financial institution/i.test(qText)) {
        const match = opts.find(o => /large national bank|bank of america|chase|national bank/i.test(o.label)) ||
          opts.find(o => /regional|online|credit union/i.test(o.label));
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

    // Global Hotkey: Alt + S for Instant 1-Click Auto-Fill & Next
    window.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "s" || e.key === "S" || e.code === "KeyS")) {
        e.preventDefault();
        runOneClickAutoFillAndNext(true); // Auto-fills and automatically proceeds to Next!
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
          }, 2400);
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
            }, 2600);
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

    // Persistent Autopilot Watchdog Timer (runs every 2s to guarantee 100% hands-free progress across all pages)
    let pageStuckCounter = 0;
    let lastSeenQuestionFingerprint = "";

    setInterval(async () => {
      if (!isAutoPilotActive || autoPilotRunningCycle || userManuallyInteracting) return;

      const currentSig = getQuestionsFingerprint();
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
          pageStuckCounter = 0;
          console.log("[Jarvis Watchdog] Unanswered survey questions detected. Triggering auto cycle...");
          triggerAutoPilotCycle();
          return;
        }

        // All questions on page ARE answered! If we are still on this page:
        if (currentSig && currentSig === lastSeenQuestionFingerprint) {
          pageStuckCounter++;
        } else {
          lastSeenQuestionFingerprint = currentSig;
          pageStuckCounter = 1;
        }

        // If answered page has been idling for 2 ticks (approx 3.5s - 4.5s) without auto-advancing, AUTO-CLICK NEXT!
        if (pageStuckCounter >= 2) {
          console.log("[Jarvis Watchdog] All questions answered but page hasn't advanced! Auto-clicking Next...");
          addBattleLog("action", "ওয়াচডগ: সব উত্তর সম্পন্ন, স্বয়ংক্রিয়ভাবে Next বাটনে ক্লিক করা হচ্ছে...");
          pageStuckCounter = 0;
          await findAndClickNextButton(3500);
          setTimeout(() => {
            if (isAutoPilotActive && !autoPilotRunningCycle) {
              triggerAutoPilotCycle();
            }
          }, 1500);
        }
      } else {
        // Zero questions detected on page: might be an intro, disclosure, completion, or interstitial transition
        const introNextBtn = findNextButton();
        if (introNextBtn) {
          console.log("[Jarvis Watchdog] Transition/Intro page Next button detected. Auto-clicking Next...");
          addBattleLog("action", "ওয়াচডগ: ইন্ট্রো/ট্রানজিশন পেজের Next বাটনে ক্লিক করা হচ্ছে...");
          clickElementLikeHuman(introNextBtn);
          setTimeout(() => {
            if (isAutoPilotActive && !autoPilotRunningCycle) {
              triggerAutoPilotCycle();
            }
          }, 1600);
        }
      }
    }, 2000);

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
          <button id="jarvis-btn-manual-select" class="jarvis-btn jarvis-btn-manual" title="১-ক্লিক অটো-ফিল ও নেক্সট: পেজের উত্তর সিলেক্ট হয়ে স্বয়ংক্রিয়ভাবে Next পেজে চলে যাবে">
            ⚡ ১-ক্লিক অটো-ফিল ও নেক্সট <span class="hotkey-badge">Alt+S</span>
          </button>
          <div class="jarvis-manual-subtext">
            পেজের সঠিক উত্তরগুলো সিলেক্ট হয়ে স্বয়ংক্রিয়ভাবে Next পেজে অগ্রসর হবে।
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

        <!-- ⚔️ লাইভ ব্যাটল লগ (Live Battle Log) -->
        <div id="jarvis-battle-log-card" class="jarvis-battle-log-card">
          <div class="jarvis-battle-log-header">
            <div class="jarvis-battle-log-title">
              <span class="jarvis-log-dot"></span>
              <span>⚔️ লাইভ ব্যাটল লগ (Battle Log)</span>
            </div>
            <div class="jarvis-battle-log-actions">
              <button id="jarvis-btn-clear-log" class="jarvis-log-btn" type="button" title="ক্লিয়ার লগ">🧹 ক্লিয়ার</button>
            </div>
          </div>
          <div id="jarvis-battle-log-body" class="jarvis-battle-log-body">
            <div class="jarvis-battle-log-entry log-type-info">
              <div class="jarvis-log-row">
                <span class="jarvis-log-time">--:--:--</span>
                <span class="jarvis-log-tag badge-info">ℹ️ রেডি</span>
                <span class="jarvis-log-msg">জারভিস ৩.৮ ব্যাটল লগ সক্রিয়। স্ক্রিনশট ও এআই সিদ্ধান্ত লাইভ দেখানো হবে।</span>
              </div>
            </div>
          </div>
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

      const clearLogBtn = document.getElementById("jarvis-btn-clear-log");
      if (clearLogBtn) {
        clearLogBtn.addEventListener("click", () => {
          battleLogs = [];
          const logBody = document.getElementById("jarvis-battle-log-body");
          if (logBody) {
            logBody.innerHTML = `
              <div class="jarvis-battle-log-entry log-type-info">
                <div class="jarvis-log-row">
                  <span class="jarvis-log-time">--:--:--</span>
                  <span class="jarvis-log-tag badge-info">ℹ️ ক্লিয়ার্ড</span>
                  <span class="jarvis-log-msg">ব্যাটল লগ রিসেট করা হয়েছে।</span>
                </div>
              </div>
            `;
          }
          try { chrome.storage.local.set({ jarvis_battle_logs: [] }); } catch (_) { }
        });
      }

      // Restore recent logs into HUD if present
      try {
        chrome.storage.local.get(["jarvis_battle_logs"], (res) => {
          const stored = res.jarvis_battle_logs || [];
          if (stored.length > 0) {
            const logBody = document.getElementById("jarvis-battle-log-body");
            if (logBody) {
              logBody.innerHTML = "";
              stored.slice(0, 25).reverse().forEach(item => renderBattleLogEntry(item));
            }
          }
        });
      } catch (_) { }

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

      // 1-Click Page Auto-Fill & Next
      manualSelectBtn.addEventListener("click", async () => {
        manualSelectBtn.disabled = true;
        manualSelectBtn.innerHTML = `<span>⏳</span> উত্তর সিলেক্ট ও Next হচ্ছে...`;
        try {
          const res = await runOneClickAutoFillAndNext(true);
          if (res && res.success) {
            updateHUDStatus("done", `✅ ${res.filledCount}টি উত্তর পূরণ সম্পন্ন এবং Next বাটনে ক্লিক করা হয়েছে!`);
          }
        } finally {
          manualSelectBtn.disabled = false;
          manualSelectBtn.innerHTML = `⚡ ১-ক্লিক অটো-ফিল ও নেক্সট <span class="hotkey-badge">Alt+S</span>`;
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
      nextBtn.addEventListener("click", async () => {
        nextBtn.disabled = true;
        updateHUDStatus("analyzing", "Next বাটন খোঁজা ও ক্লিক করা হচ্ছে...");
        try {
          const success = await findAndClickNextButton(3500);
          if (success) {
            updateHUDStatus("done", "⏭️ Next বাটনে সফলভাবে ক্লিক করা হয়েছে!");
          } else {
            updateHUDStatus("error", "Next বাটন পেজে খুঁজে পাওয়া যায়নি।");
          }
        } finally {
          nextBtn.disabled = false;
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
      if (!data) return;
      if (data.answers && Array.isArray(data.answers)) {
        data.answers = normalizeAndSanitizeAnswers(data.answers);
      }

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

      data.answers = normalizeAndSanitizeAnswers(data.answers);

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
            <div class="jarvis-p-q-header">
              <strong class="jarvis-p-q">Q${idx + 1}: ${escapeHtml(qText)}</strong>
              <span class="jarvis-p-badge-opt">🔘 নৈর্ব্যক্তিক / অপশন</span>
            </div>
            <div class="jarvis-p-ans-box">
              <span class="jarvis-p-ans-label">👉 <strong>এটা হবে সঠিক উত্তর:</strong></span>
              <span class="jarvis-p-bold-ans">${escapeHtml(answerText)}</span>
            </div>
            <div class="jarvis-p-action-bar">
              <button class="jarvis-p-copy-btn" type="button" title="ক্লিপবোর্ডে কপি করুন">📋 কপি করুন</button>
              <span class="jarvis-p-hint">ক্লিক করে কপি করুন এবং পেজে সিলেক্ট/পেস্ট করুন</span>
            </div>
          `;

          const copyBtn = item.querySelector(".jarvis-p-copy-btn");
          if (copyBtn) {
            copyBtn.addEventListener("click", () => {
              copyTextSafely(answerText, copyBtn);
            });
          }
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
     * Attaches answers directly via native page selection without injecting
     * extra text labels, banners, or badges like 'JARVIS CHOICE' onto the survey questions.
     */
    function attachInPageAnswerBadges(data) {
      document.querySelectorAll(".jarvis-inpage-ans-banner, .jarvis-inline-question-callout, [data-jarvis-banner], .jarvis-pick-badge").forEach(el => {
        if (!el.closest("#jarvis-hud-container")) el.remove();
      });
      // CRITICAL: Do NOT create or append any visible banners or text callouts to the survey page!
      // All options are selected directly and silently into the live DOM elements.
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


