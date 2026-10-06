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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStatusBadge);
  } else {
    injectStatusBadge();
  }

  // Find input field on Gemini web
  function findGeminiInput() {
    const selectors = [
      'rich-textarea div[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[role="textbox"]',
      'textarea[aria-label*="prompt" i]',
      'textarea'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return document.querySelector('div[contenteditable="true"]');
  }

  // Find send button on Gemini web
  function findSendButton() {
    const selectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="পাঠান" i]',
      'button.send-button',
      'button[data-test-id="send-button"]',
      'mat-icon[fonticon="send"]',
      'button:has(svg[data-icon="send"])'
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
      await new Promise(r => setTimeout(r, 800));
    }

    // 2. Set text content into editor
    if (editor.isContentEditable) {
      editor.innerText = promptText;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      // Also try inserting text via execCommand if needed
      document.execCommand("insertText", false, " ");
    } else {
      editor.value = promptText;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await new Promise(r => setTimeout(r, 500));

    // 3. Find and click send button
    const sendBtn = findSendButton();
    if (sendBtn) {
      sendBtn.click();
      console.log("[Jarvis Gemini Bridge] Clicked send button");
    } else {
      // Fallback: send Enter keydown
      const enterEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13
      });
      editor.dispatchEvent(enterEvent);
      console.log("[Jarvis Gemini Bridge] Sent Enter keypress");
    }

    // 4. Wait for response generation to complete
    return await waitForGeminiResponse();
  }

  // Observe and extract Gemini's response
  function waitForGeminiResponse(timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastText = "";
      let stableCount = 0;

      const checkInterval = setInterval(() => {
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          if (lastText.trim().length > 10) {
            resolve({ success: true, text: lastText });
          } else {
            reject(new Error("Gemini response timed out after " + Math.round(timeoutMs / 1000) + "s"));
          }
          return;
        }

        // Check if Stop Generating button is still visible
        const stopButtons = Array.from(document.querySelectorAll('button[aria-label*="Stop" i], button[aria-label*="থামান" i], button.stop-button'));
        const isStillGenerating = stopButtons.some(b => b.offsetParent !== null);

        // Find candidate response elements
        const candidateSelectors = [
          'message-content',
          'model-response',
          '.response-container',
          '.markdown',
          'div[class*="response"]'
        ];
        let latestElement = null;
        for (const sel of candidateSelectors) {
          const list = document.querySelectorAll(sel);
          if (list && list.length > 0) {
            latestElement = list[list.length - 1];
            break;
          }
        }

        if (latestElement) {
          const currentText = latestElement.innerText || latestElement.textContent || "";
          if (currentText.trim().length > 0) {
            if (currentText === lastText) {
              stableCount++;
            } else {
              stableCount = 0;
              lastText = currentText;
            }

            // If not actively generating and text was stable for >= 2 checks (1 sec)
            if (!isStillGenerating && stableCount >= 2 && lastText.length > 20) {
              clearInterval(checkInterval);
              console.log("[Jarvis Gemini Bridge] Response captured successfully!");
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
