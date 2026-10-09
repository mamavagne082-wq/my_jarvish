/**
 * ==============================================================================
 * GEMINI WEB BRIDGE CONTENT SCRIPT (gemini_bridge.js)
 * Runs directly inside https://gemini.google.com/ (including embedded iframes)
 * ==============================================================================
 * 1. Automates prompt typing & submission into Gemini's Web UI.
 * 2. Monitors real-time streaming response until completion.
 * 3. Extracts clean structured JSON and relays back to Extension Side Panel.
 * 4. Can trigger "New Chat" or locate existing threads.
 * ==============================================================================
 */

(() => {
  console.log('[Jarvis Gemini Bridge] Active inside Gemini Web frame/tab.');

  /**
   * Discovers the rich-text contenteditable input box in Gemini
   */
  function findEditor() {
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
    return document.querySelector('[contenteditable="true"]');
  }

  /**
   * Discovers the Send button in Gemini UI
   */
  function findSendButton() {
    const selectors = [
      'button[aria-label*="Send message" i]',
      'button[aria-label*="Send prompt" i]',
      'button[aria-label*="Send" i]',
      'button.send-button',
      'button[data-test-id="send-button"]',
      'button:has(mat-icon[fonticon="send"])',
      'button:has(svg)'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el.tagName === 'BUTTON' ? el : el.closest('button');
    }
    const allBtns = Array.from(document.querySelectorAll('button'));
    return allBtns.find((b) => /send|submit/i.test(b.getAttribute('aria-label') || b.innerText || ''));
  }

  /**
   * Clicks 'New chat' button inside Gemini
   */
  function triggerNewChat() {
    const newChatBtn = document.querySelector(
      'a[aria-label*="New chat" i], button[aria-label*="New chat" i], [data-test-id="new-chat-button"]'
    );
    if (newChatBtn) {
      newChatBtn.click();
      return true;
    }
    return false;
  }

  /**
   * Inputs text into Gemini's editor simulating natural input events
   */
  async function insertPromptText(editor, text) {
    editor.focus();

    // Clear existing text
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    } catch (_) {}

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch (_) {}

    if (!inserted || !editor.innerText.includes(text.slice(0, 30))) {
      editor.innerText = text;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  }

  /**
   * Submits prompt to Gemini
   */
  async function submitPrompt() {
    const sendBtn = findSendButton();
    if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
      sendBtn.click();
      return true;
    }

    // Keyboard Enter fallback
    const editor = findEditor();
    if (editor) {
      const enterOpts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
      editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
      editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
      editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
      if (sendBtn) {
        setTimeout(() => { try { sendBtn.click(); } catch (_) {} }, 250);
      }
      return true;
    }
    return false;
  }

  /**
   * Waits for Gemini response generation to finish and extracts final text
   */
  function waitForResponse(initialResponseCount, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastText = '';
      let stableCount = 0;

      const timer = setInterval(() => {
        // Find latest model response
        const modelResponses = document.querySelectorAll(
          'model-response, [data-message-author="model"], .response-container, .model-response-text'
        );

        if (modelResponses.length > initialResponseCount) {
          const latestResponse = modelResponses[modelResponses.length - 1];
          const currentText = (latestResponse.innerText || '').trim();

          // Check if text has finished streaming (stable for 3 intervals)
          if (currentText.length > 0 && currentText === lastText) {
            stableCount++;
            // Check if stop generating button has disappeared
            const isGenerating = !!document.querySelector(
              'button[aria-label*="Stop" i], mat-progress-bar, .typing-indicator'
            );

            if (!isGenerating && stableCount >= 2) {
              clearInterval(timer);
              return resolve(currentText);
            }
          } else {
            stableCount = 0;
            lastText = currentText;
          }
        }

        // Timeout check
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(timer);
          if (lastText.length > 5) {
            resolve(lastText);
          } else {
            reject(new Error(`Timed out waiting for Gemini response after ${timeoutMs / 1000}s.`));
          }
        }
      }, 500);
    });
  }

  /**
   * Sanitizes and extracts raw JSON from Gemini's response
   */
  function extractJsonFromText(rawText) {
    let clean = rawText.trim();

    // Remove markdown code fences ```json ... ```
    if (clean.includes('```')) {
      const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match && match[1]) {
        clean = match[1].trim();
      } else {
        clean = clean.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      }
    }

    // Try finding JSON object braces { ... }
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(clean);
    } catch (e) {
      throw new Error(`Failed to parse response as JSON. Raw output: ${rawText.slice(0, 150)}...`);
    }
  }

  /**
   * Message Listener from Extension Side Panel
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, payload } = message;

    if (action === 'CHECK_GEMINI_BRIDGE_STATUS') {
      const editor = findEditor();
      const isReady = !!editor;
      return sendResponse({
        success: true,
        ready: isReady,
        isIframe: window.self !== window.top
      });
    }

    if (action === 'GEMINI_NEW_CHAT') {
      const triggered = triggerNewChat();
      return sendResponse({ success: triggered });
    }

    if (action === 'QUERY_EMBEDDED_GEMINI') {
      (async () => {
        try {
          const editor = findEditor();
          if (!editor) {
            throw new Error('Gemini editor not found. Make sure Gemini is loaded and you are signed in.');
          }

          // Count existing model messages before sending
          const existingCount = document.querySelectorAll(
            'model-response, [data-message-author="model"], .response-container'
          ).length;

          // Type prompt
          await insertPromptText(editor, payload.prompt);

          // Submit
          await submitPrompt();

          // Wait for response
          const responseText = await waitForResponse(existingCount, 22000);

          // Parse JSON
          const parsedAnswers = extractJsonFromText(responseText);

          sendResponse({
            success: true,
            rawText: responseText,
            answers: parsedAnswers
          });
        } catch (err) {
          console.error('[Jarvis Gemini Bridge] Query failed:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();

      return true; // Asynchronous response
    }

    return false;
  });
})();
