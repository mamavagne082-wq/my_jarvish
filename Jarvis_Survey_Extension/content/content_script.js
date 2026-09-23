/**
 * Jarvis AI Survey Copilot - Content Script (Gemini 3.8 Flash + Human Simulation + Auto-Pilot)
 * Scrapes survey DOM, auto-analyzes, fills answers with human-like typing & timing, and auto-navigates.
 */

(function () {
  if (window.__JARVIS_SURVEY_LOADED__) return;
  window.__JARVIS_SURVEY_LOADED__ = true;

  let lastAnalysisResult = null;
  let hudVisible = false;
  let isAutoPilotActive = false;
  let autoPilotRunningCycle = false;

  // Initialize in-page Jarvis HUD
  createFloatingHUD();

  // Check if Auto-Pilot was already active across page navigations
  chrome.runtime.sendMessage({ action: "GET_AUTOPILOT_STATE" }, (res) => {
    if (res && res.active) {
      isAutoPilotActive = true;
      updateAutoPilotUI(true);
      // Wait a realistic initial settling time for dynamic questions to render
      setTimeout(() => {
        if (isAutoPilotActive) {
          triggerAutoPilotCycle();
        }
      }, 1400);
    }
  });

  // Listen for messages from background or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SCAN_AND_ANALYZE") {
      performFullScan()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.action === "APPLY_AUTO_FILL") {
      autoFillAnswers(message.payload || lastAnalysisResult)
        .then((res) => sendResponse(res));
      return true;
    }

    if (message.action === "ONE_CLICK_AUTOFILL_NEXT") {
      runOneClickAutoFillAndNext()
        .then((res) => sendResponse(res));
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
      toggleHUD(message.show);
      sendResponse({ success: true, visible: hudVisible });
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
  });

  /**
   * =========================================================================
   * 1. AUTONOMOUS AUTO-PILOT ENGINE (HUMAN-PACED CYCLE)
   * =========================================================================
   */
  async function triggerAutoPilotCycle() {
    if (autoPilotRunningCycle || !isAutoPilotActive) return;
    autoPilotRunningCycle = true;

    try {
      updateHUDStatus("analyzing", "🤖 Auto-Pilot: Scanning page elements (Gemini 3.8)...");

      const scanRes = await performFullScan();
      if (!scanRes || !scanRes.success || !scanRes.data) {
        updateHUDStatus("idle", "🤖 Auto-Pilot: No questions found. (Survey may be complete)");
        autoPilotRunningCycle = false;
        return;
      }

      updateHUDStatus("analyzing", "🤖 Auto-Pilot: Filling answers with human behavior...");
      await autoFillAnswers(scanRes.data);

      // Human-like reading delay before proceeding (Prevents "speeders" bot detection)
      const qCount = scanRes.data.answers?.length || 1;
      const readingSeconds = scanRes.data.estimated_human_reading_seconds || Math.max(2, Math.min(6, qCount * 1.2));
      const naturalPauseMs = Math.round((readingSeconds * 1000) + (Math.random() * 800));

      updateHUDStatus("done", `🤖 Auto-Pilot: Simulating human reading pause (${(naturalPauseMs / 1000).toFixed(1)}s)...`);
      await sleep(naturalPauseMs);

      if (!isAutoPilotActive) return;

      const nextBtn = findNextButton();
      if (nextBtn) {
        updateHUDStatus("done", "🤖 Auto-Pilot: Clicking Next button...");
        await sleep(350 + Math.random() * 250);
        clickElementLikeHuman(nextBtn);
      } else {
        updateHUDStatus("done", "🤖 Auto-Pilot: Page completed. Waiting for next step.");
      }
    } catch (e) {
      console.error("Auto-pilot cycle error:", e);
      updateHUDStatus("error", `Auto-Pilot error: ${e.message}`);
    } finally {
      autoPilotRunningCycle = false;
    }
  }

  /**
   * 1-Click Auto-Fill current page with human simulation
   */
  async function runOneClickAutoFillAndNext(autoProceed = false) {
    updateHUDStatus("analyzing", "⚡ 1-Click: Analyzing with Gemini 3.8...");
    const scanRes = await performFullScan();
    if (!scanRes || !scanRes.success) {
      return { success: false, message: scanRes?.error || "Analysis failed." };
    }

    updateHUDStatus("analyzing", "⚡ 1-Click: Selecting answers naturally...");
    const fillRes = await autoFillAnswers(scanRes.data);

    if (autoProceed) {
      await sleep(1000 + Math.random() * 500);
      const nextBtn = findNextButton();
      if (nextBtn) {
        clickElementLikeHuman(nextBtn);
        return { success: true, filledCount: fillRes.filledCount, proceeded: true };
      }
    }

    updateHUDStatus("done", `⚡ Complete: Naturally selected ${fillRes.filledCount} answers.`);
    return { success: true, filledCount: fillRes.filledCount };
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
      "next", "continue", "submit", "proceed", "forward", "next page", "পরবর্তী", "চালিয়ে যান", "জমা দিন"
    ];

    const submits = document.querySelectorAll(
      'input[type="submit"], button[type="submit"], .next-btn, .btn-next, #next-button, #btnNext, .NextButton, #NextButton'
    );
    for (const btn of submits) {
      if (isElementVisible(btn) && !btn.disabled) return btn;
    }

    const allButtons = document.querySelectorAll("button, input[type='button'], a.btn, a.button, [role='button'], div.button");
    for (const btn of allButtons) {
      const txt = (btn.innerText || btn.value || "").trim().toLowerCase();
      if (nextKeywords.some((kw) => txt.includes(kw)) && isElementVisible(btn) && !btn.disabled) {
        return btn;
      }
    }

    const platformNext = document.querySelector(
      "#NextButton, .NextButton, .survey-page__next-button, [aria-label='Next'], .submit-btn, .button-submit"
    );
    if (platformNext && isElementVisible(platformNext) && !platformNext.disabled) {
      return platformNext;
    }

    return null;
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  function clickElementLikeHuman(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    // Full natural mouse event sequence
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent("pointerover", opts));
    el.dispatchEvent(new MouseEvent("mouseenter", opts));
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.focus();
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  /**
   * =========================================================================
   * 3. DOM SCRAPER: Extracts survey questions and options
   * =========================================================================
   */
  function extractSurveyQuestions() {
    const questions = [];
    let qIndex = 0;

    // A. Matrix / table questions
    const tables = document.querySelectorAll("table, .matrix-table, .grid-table");
    tables.forEach((table) => {
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
              const colLabel = headers[cIdx + 1] || headers[cIdx] || `Column ${cIdx + 1}`;
              opts.push({
                id: assignTemporaryId(input),
                name: input.name,
                type: input.type,
                value: input.value,
                label: colLabel
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

    // B. Question containers (Qualtrics, SurveyMonkey, Forms, etc.)
    const questionContainers = document.querySelectorAll(
      ".QuestionOuter, .question, .survey-question, fieldset, [role='radiogroup'], .form-group, .ss-form-question, .survey-page__question, .question-block"
    );

    if (questionContainers.length > 0) {
      questionContainers.forEach((container) => {
        const titleEl = container.querySelector(
          "legend, .QuestionText, .question-text, .title, .q-title, h1, h2, h3, h4, .control-label, [role='heading']"
        );
        const qText = cleanText(titleEl ? titleEl.innerText : container.innerText.slice(0, 150));

        if (!qText || questions.some((q) => q.text.includes(qText.slice(0, 50)))) {
          return;
        }

        const inputs = Array.from(container.querySelectorAll("input, select, textarea"));
        if (inputs.length === 0) return;

        const options = [];
        let qType = "single_choice";

        inputs.forEach((input) => {
          const type = (input.getAttribute("type") || input.tagName.toLowerCase()).toLowerCase();
          if (["hidden", "submit", "button"].includes(type)) return;

          let label = "";
          if (input.id) {
            const lbl = container.querySelector(`label[for="${input.id}"]`);
            if (lbl) label = cleanText(lbl.innerText);
          }
          if (!label) {
            const parentLabel = input.closest("label");
            if (parentLabel) label = cleanText(parentLabel.innerText);
          }
          if (!label && input.nextElementSibling?.tagName === "LABEL") {
            label = cleanText(input.nextElementSibling.innerText);
          }
          if (!label && input.nextSibling?.textContent) {
            label = cleanText(input.nextSibling.textContent);
          }

          if (type === "radio") {
            qType = "single_choice";
          } else if (type === "checkbox") {
            qType = "multiple_choice";
          } else if (input.tagName.toLowerCase() === "select") {
            qType = "dropdown";
            Array.from(input.options).forEach((opt) => {
              if (opt.value) {
                options.push({
                  id: assignTemporaryId(input),
                  selectId: input.id,
                  type: "select_option",
                  value: opt.value,
                  label: cleanText(opt.text)
                });
              }
            });
            return;
          } else if (type === "text" || input.tagName.toLowerCase() === "textarea") {
            qType = "text_input";
          }

          options.push({
            id: assignTemporaryId(input),
            name: input.name,
            type: type,
            value: input.value,
            label: label || input.value || `Option ${options.length + 1}`
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
    }

    // C. Fallback for ungrouped options
    const orphanRadios = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    const groupedByName = {};
    orphanRadios.forEach((r) => {
      if (!r.getAttribute("data-jarvis-tracked")) {
        const name = r.name || "unnamed";
        if (!groupedByName[name]) groupedByName[name] = [];
        groupedByName[name].push(r);
      }
    });

    for (const [name, elements] of Object.entries(groupedByName)) {
      if (elements.length > 1) {
        const first = elements[0];
        const heading = findPrecedingHeading(first) || `Question (${name})`;
        const opts = elements.map((el) => {
          let lbl = el.closest("label")?.innerText || el.nextElementSibling?.innerText || el.value;
          return {
            id: assignTemporaryId(el),
            name: el.name,
            type: el.type,
            value: el.value,
            label: cleanText(lbl)
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

    return questions;
  }

  function assignTemporaryId(element) {
    element.setAttribute("data-jarvis-tracked", "true");
    if (!element.id) {
      element.id = `jarvis_auto_${Math.random().toString(36).substring(2, 9)}`;
    }
    return element.id;
  }

  function cleanText(txt) {
    if (!txt) return "";
    return txt.replace(/\s+/g, " ").replace(/[\r\n\t]+/g, " ").trim();
  }

  function findPrecedingHeading(element) {
    let curr = element;
    while (curr && curr !== document.body) {
      const heading = curr.querySelector("h1, h2, h3, h4, h5, legend, strong, b, .q-title");
      if (heading) return heading.innerText;
      if (curr.previousElementSibling) {
        const prevHeading = curr.previousElementSibling.querySelector("h1, h2, h3, h4, h5, legend, .q-title") || curr.previousElementSibling;
        if (prevHeading && ["H1", "H2", "H3", "H4", "H5", "LEGEND", "P", "DIV"].includes(prevHeading.tagName)) {
          return prevHeading.innerText;
        }
      }
      curr = curr.parentElement;
    }
    return "";
  }

  /**
   * =========================================================================
   * 4. SCAN & ANALYZE (GEMINI 3.8 FLASH ENGINE)
   * =========================================================================
   */
  async function performFullScan() {
    updateHUDStatus("scanning", "Scanning page questions...");

    const questions = extractSurveyQuestions();
    if (questions.length === 0) {
      updateHUDStatus("idle", "No active survey questions detected on this page.");
      return { success: false, error: "No survey questions found on this page." };
    }

    const pageData = {
      title: document.title,
      url: window.location.href,
      questions: questions
    };

    updateHUDStatus("analyzing", `Analyzing ${questions.length} questions with Gemini 3.8 Flash...`);

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
    updateHUDStatus("done", `Analyzed naturally with ${response.modelUsed || "Gemini 3.8"}!`);

    return { success: true, data: response.data };
  }

  /**
   * =========================================================================
   * 5. HUMAN-LIKE INTERACTION ENGINE (Natural Clicks, Keystrokes & Delays)
   * =========================================================================
   */
  function highlightAnswersOnPage(data) {
    clearAllHighlights();
    if (!data || !data.answers) return;

    data.answers.forEach((ans, idx) => {
      const targetIds = ans.target_element_ids || [];
      const labels = ans.selected_labels || [];

      targetIds.forEach((targetId) => {
        let el = document.getElementById(targetId);

        if (!el && labels.length > 0) {
          el = findInputByLabelOrValue(labels[0]);
        }

        if (el) {
          applyHighlightStyle(el, ans, idx + 1);
        }
      });
    });
  }

  function findInputByLabelOrValue(text) {
    const clean = cleanText(text).toLowerCase();
    const inputs = document.querySelectorAll("input, select, textarea");
    for (const input of inputs) {
      if (input.value && cleanText(input.value).toLowerCase() === clean) return input;
      const parentLabel = input.closest("label");
      if (parentLabel && cleanText(parentLabel.innerText).toLowerCase().includes(clean)) return input;
      if (input.id) {
        const lbl = document.querySelector(`label[for="${input.id}"]`);
        if (lbl && cleanText(lbl.innerText).toLowerCase().includes(clean)) return input;
      }
    }
    return null;
  }

  function applyHighlightStyle(element, answer, index) {
    const parentContainer = element.closest("label") || element.parentElement || element;
    parentContainer.classList.add("jarvis-highlighted-container");

    const badge = document.createElement("span");
    badge.className = "jarvis-pick-badge";
    badge.innerHTML = `<span class="jarvis-pulse-dot"></span> JARVIS CHOICE #${index}`;
    parentContainer.appendChild(badge);

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

  async function autoFillAnswers(data) {
    if (!data || !data.answers || data.answers.length === 0) {
      return { success: false, message: "No analyzed answers available to fill." };
    }

    const { autoFillDelay } = await chrome.storage.local.get(["autoFillDelay"]);
    const baseDelay = autoFillDelay || 450;

    let filledCount = 0;

    for (const ans of data.answers) {
      const targetIds = ans.target_element_ids || [];
      const labels = ans.selected_labels || [];

      for (let i = 0; i < targetIds.length; i++) {
        let el = document.getElementById(targetIds[i]);
        if (!el && labels[i]) {
          el = findInputByLabelOrValue(labels[i]);
        }

        if (el) {
          await simulateHumanAction(el, ans);
          filledCount++;
          // Natural human pause between question interactions
          await sleep(baseDelay + Math.random() * 250);
        }
      }
    }

    return { success: true, filledCount };
  }

  /**
   * Simulates full natural human interaction (typing keystrokes, event sequences)
   */
  async function simulateHumanAction(element, answer) {
    // Scroll element smoothly into view as human eyes move
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(80 + Math.random() * 100);

    const opts = { bubbles: true, cancelable: true, view: window };

    if (element.type === "radio" || element.type === "checkbox") {
      if (!element.checked) {
        element.dispatchEvent(new MouseEvent("pointerover", opts));
        element.dispatchEvent(new MouseEvent("mouseenter", opts));
        element.dispatchEvent(new MouseEvent("mouseover", opts));
        element.dispatchEvent(new MouseEvent("mousedown", opts));
        element.focus();
        element.checked = true;
        element.dispatchEvent(new MouseEvent("mouseup", opts));
        element.dispatchEvent(new MouseEvent("click", opts));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (element.tagName.toLowerCase() === "select") {
      element.focus();
      if (answer.selected_labels && answer.selected_labels.length > 0) {
        const targetLabel = cleanText(answer.selected_labels[0]).toLowerCase();
        for (let i = 0; i < element.options.length; i++) {
          if (cleanText(element.options[i].text).toLowerCase().includes(targetLabel)) {
            element.selectedIndex = i;
            element.dispatchEvent(new Event("change", { bubbles: true }));
            break;
          }
        }
      }
    } else if (element.type === "text" || element.tagName.toLowerCase() === "textarea") {
      // Natural human typing character by character
      element.focus();
      const textToType = answer.text_input_value || "Great experience and reliability overall.";
      element.value = "";

      for (let i = 0; i < textToType.length; i++) {
        const char = textToType[i];
        element.value += char;

        element.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));

        // Typing jitter: 30ms - 75ms per character with occasional 120ms pause
        const jitter = Math.random() < 0.1 ? 120 : (30 + Math.random() * 45);
        await sleep(jitter);
      }
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await sleep(60 + Math.random() * 80);
    element.blur();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Global Hotkey: Alt + S for Instant Manual Page Selection
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      runOneClickAutoFillAndNext(false); // Manual mode: fills answers without auto-proceeding
    }
  });

  /**
   * =========================================================================
   * 6. IN-PAGE FLOATING HUD (Futuristic Glassmorphic Interface)
   * =========================================================================
   */
  function createFloatingHUD() {
    if (document.getElementById("jarvis-hud-container")) return;

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
    hudVisible = show !== undefined ? show : !hudVisible;
    if (hudVisible) {
      panel.classList.remove("jarvis-panel-hidden");
    } else {
      panel.classList.add("jarvis-panel-hidden");
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
})();
