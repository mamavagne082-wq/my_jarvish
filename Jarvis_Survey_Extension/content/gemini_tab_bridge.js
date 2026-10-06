/**
 * Jarvis AI Survey Copilot - Gemini Web Bridge Content Script
 * Directly automates user's logged-in Gemini Web session (gemini.google.com)
 * Enables 100% Zero-API-Cost survey solving with Gemini Pro / Advanced / Ultra!
 */

(function () {
  console.log("[Jarvis Gemini Bridge] Initializing Gemini Web Tab Bridge...");

  // Create subtle floating badge on gemini.google.com
  function injectStatusBadge() {
    if (document.getElementById("jarvis-gemini-bridge-badge")) return;
    const badge = document.createElement("div");
    badge.id = "jarvis-gemini-bridge-badge";
    badge.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 18px;
      z-index: 999999;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
      border: 1px solid #00f0ff;
      border-radius: 20px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 15px rgba(0, 240, 255, 0.25);
      font-family: system-ui, sans-serif;
      font-size: 11px;
      font-weight: 600;
      color: #e2e8f0;
      pointer-events: none;
      transition: all 0.3s ease;
    `;
    badge.innerHTML = `
      <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
      <span>Jarvis Survey Copilot • Connected (Zero API Key Active)</span>
    `;
    document.body.appendChild(badge);
  }

  // Detect active Google Account details and notify extension background
  function detectGoogleSession() {
    try {
      let detectedEmail = "";
      const profileEls = document.querySelectorAll('a[aria-label*="@"], button[aria-label*="@"], img[alt*="@"], div[aria-label*="@"]');
      for (const el of profileEls) {
        const txt = el.getAttribute("aria-label") || el.getAttribute("alt") || el.innerText || "";
        const m = txt.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (m) {
          detectedEmail = m[1];
          break;
        }
      }

      let detectedTier = "Gemini Standard";
      if (document.body.innerText.includes("Gemini Advanced") || document.querySelector('[aria-label*="Advanced" i]')) {
        detectedTier = "Gemini Advanced (Pro)";
      } else if (document.body.innerText.includes("Gemini Pro") || document.querySelector('[aria-label*="Pro" i]')) {
        detectedTier = "Gemini Pro";
      }

      if (detectedEmail) {
        console.log(`[Jarvis Gemini Bridge] Detected active Google session: ${detectedEmail} (${detectedTier})`);
        chrome.runtime.sendMessage({
          action: "GEMINI_SESSION_DETECTED",
          email: detectedEmail,
          tier: detectedTier
        }).catch(() => { });
      }
    } catch (_) { }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectStatusBadge();
      setTimeout(detectGoogleSession, 2500);
    });
  } else {
    injectStatusBadge();
    setTimeout(detectGoogleSession, 2500);
  }


  // Find input field on Gemini web
  function findGeminiInput() {
    const selectors = [
      'rich-textarea div[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'rich-textarea [contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea[aria-label*="prompt" i]',
      'textarea[aria-label*="message" i]',
      'textarea'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return document.querySelector('rich-textarea [contenteditable="true"]') || document.querySelector('div[contenteditable="true"]');
  }

  // Find send button on Gemini web
  function findSendButton() {
    const selectors = [
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Send prompt" i]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="পাঠান" i]',
      'button.send-button',
      'button[data-test-id="send-button"]',
      'button:has(mat-icon[fonticon="send"])',
      'mat-icon[fonticon="send"]',
      'button:has(svg)'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        return el.tagName === "BUTTON" ? el : el.closest("button");
      }
    }
    // Search by SVG or icon within buttons
    const allButtons = Array.from(document.querySelectorAll("button"));
    return allButtons.find(b => {
      const label = (b.getAttribute("aria-label") || "") + (b.innerText || "");
      return /send|submit|পাঠান/i.test(label);
    });
  }

  // Paste image into Gemini editor
  async function pasteImage(dataUrl, editor) {
    try {
      const base64Data = dataUrl.split(",")[1];
      const mime = dataUrl.split(",")[0].split(":")[1].split(";")[0];
      const binary = atob(base64Data);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
      const blob = new Blob([array], { type: mime });
      const file = new File([blob], "survey_page_screenshot.jpg", { type: mime });

      const dt = new DataTransfer();
      dt.items.add(file);

      // 1. Try file input if present
      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      const imgInput = fileInputs.find(i => i.accept && i.accept.includes("image"));
      if (imgInput) {
        imgInput.files = dt.files;
        imgInput.dispatchEvent(new Event("change", { bubbles: true }));
        console.log("[Jarvis Gemini Bridge] Dispatched file input upload");
        await new Promise(r => setTimeout(r, 1200));
        return true;
      }

      // 2. Dispatch paste event on editor
      editor.focus();
      const pasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      editor.dispatchEvent(pasteEvent);
      console.log("[Jarvis Gemini Bridge] Dispatched clipboard paste event");
      await new Promise(r => setTimeout(r, 1200));
      return true;
    } catch (err) {
      console.warn("[Jarvis Gemini Bridge] Image paste error:", err);
      return false;
    }
  }

  // Execute Gemini Web Query
  async function executeGeminiQuery(promptText, screenshotDataUrl) {
    const editor = findGeminiInput();
    if (!editor) {
      throw new Error("Gemini input area not found on page. Please make sure gemini.google.com is loaded.");
    }

    editor.focus();

    // 1. If screenshot provided, paste it first
    if (screenshotDataUrl) {
      await pasteImage(screenshotDataUrl, editor);
      await new Promise(r => setTimeout(r, 1000));
    }

    // 2. Set text content into editor with full Quill / Angular event simulation
    if (editor.isContentEditable) {
      editor.focus();
      try {
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);
      } catch (_) { }

      let inserted = false;
      try {
        inserted = document.execCommand("insertText", false, promptText);
      } catch (_) { }

      if (!inserted || !editor.innerText.includes(promptText.slice(0, 30))) {
        editor.innerText = promptText;
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: promptText }));
      }
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      editor.value = promptText;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await new Promise(r => setTimeout(r, 500));

    // 3. Find and click send button or trigger Enter
    const sendBtn = findSendButton();
    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
      sendBtn.click();
      console.log("[Jarvis Gemini Bridge] Clicked send button");
    } else {
      const enterDown = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
      const enterPress = new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
      const enterUp = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 });
      editor.dispatchEvent(enterDown);
      editor.dispatchEvent(enterPress);
      editor.dispatchEvent(enterUp);
      console.log("[Jarvis Gemini Bridge] Sent Enter keypress sequence");
      if (sendBtn) {
        setTimeout(() => { try { sendBtn.click(); } catch (_) { } }, 300);
      }
    }

    // Count existing model responses before sending
    const modelSelectors = 'model-response, [data-message-author="model"], .response-container';
    const initialResponseCount = document.querySelectorAll(modelSelectors).length;

    // 4. Wait for response generation to complete
    return await waitForGeminiResponse(45000, initialResponseCount, promptText);
  }

  // Observe and extract Gemini's response (Exclusively targets model output, never user query)
  function waitForGeminiResponse(timeoutMs = 45000, initialResponseCount = 0, sentPromptText = "") {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastText = "";
      let stableCount = 0;

      const checkInterval = setInterval(() => {
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          if (lastText.trim().length > 10 && (!sentPromptText || !lastText.includes(sentPromptText.slice(0, 50)))) {
            resolve({ success: true, text: lastText });
          } else {
            reject(new Error("Gemini response timed out after " + Math.round(timeoutMs / 1000) + "s"));
          }
          return;
        }

        // Check for rate limit or quota messages on page
        const bodySnippet = document.body ? document.body.innerText.slice(-2000) : "";
        if (/You've reached your limit|usage limit|try again later|too many requests|hourly limit|capacity reached/i.test(bodySnippet)) {
          clearInterval(checkInterval);
          reject(new Error("RATE_LIMIT_EXCEEDED: Gemini account message limit reached."));
          return;
        }

        // Check if Stop Generating button or streaming progress is visible
        const stopButtons = Array.from(document.querySelectorAll(
          'button[aria-label*="Stop" i], button[aria-label*="থামান" i], button.stop-button, mat-progress-bar, .streaming-indicator'
        ));
        const isStillGenerating = stopButtons.some(b => b.offsetParent !== null);

        // Find candidate response elements specifically from the model (NEVER user query)
        const candidateSelectors = [
          'model-response .markdown',
          'model-response message-content',
          'model-response',
          '[data-message-author="model"] .markdown',
          '[data-message-author="model"] message-content',
          '[data-message-author="model"]',
          '.model-response-text',
          '.response-container .markdown',
          '.response-container'
        ];

        let modelElements = [];
        for (const sel of candidateSelectors) {
          const list = Array.from(document.querySelectorAll(sel));
          const filtered = list.filter(el => {
            // Must not be inside user query
            if (el.closest('user-query') || el.closest('[data-message-author="user"]')) return false;
            return true;
          });
          if (filtered.length > 0) {
            modelElements = filtered;
            break;
          }
        }

        if (modelElements.length > 0) {
          const latestElement = modelElements[modelElements.length - 1];
          const currentText = (latestElement.innerText || latestElement.textContent || "").trim();

          // Ensure this text is not the user's prompt
          const isUserPrompt = sentPromptText && currentText.length > 0 &&
            (sentPromptText.includes(currentText) || currentText.includes(sentPromptText.slice(0, 60)));

          if (!isUserPrompt && currentText.length > 15) {
            if (currentText === lastText) {
              stableCount++;
            } else {
              stableCount = 0;
              lastText = currentText;
            }

            // If not actively generating and text was stable for >= 3 checks (1.5 sec)
            if (!isStillGenerating && stableCount >= 3 && lastText.length > 25) {
              clearInterval(checkInterval);
              console.log("[Jarvis Gemini Bridge] ✅ Response captured successfully (" + lastText.length + " chars)!");
              resolve({ success: true, text: lastText });
              return;
            }
          }
        }
      }, 500);
    });
  }

  // Runtime message listener
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "PING_GEMINI_BRIDGE") {
      const hasInput = !!findGeminiInput();
      sendResponse({
        success: true,
        active: true,
        hasInput,
        title: document.title,
        url: location.href
      });
      return true;
    }

    if (msg.action === "EXECUTE_GEMINI_WEB_QUERY") {
      console.log("[Jarvis Gemini Bridge] Received query request:", msg.prompt?.slice(0, 80));
      executeGeminiQuery(msg.prompt, msg.screenshot)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }
  });

})();
