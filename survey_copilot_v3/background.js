/**
 * ==============================================================================
 * JARVIS GEMINI SURVEY COPILOT - BACKGROUND SERVICE WORKER (Manifest V3)
 * ==============================================================================
 * Handles:
 * 1. Extension activation & Side Panel behavior.
 * 2. High-resolution visible tab screenshot capture (chrome.tabs.captureVisibleTab).
 * 3. Bidirectional messaging between Side Panel, Content Script & Gemini API.
 * 4. Dual-mode AI routing: Gemini REST API & Logged-in Web Session bridge.
 * ==============================================================================
 */

// Configure default Side Panel behavior on install/startup
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Jarvis Background] Extension installed/updated.');
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      console.log('[Jarvis Background] Side panel configured to open on action click.');
    }
  } catch (err) {
    console.warn('[Jarvis Background] Could not set panel behavior:', err);
  }
});

// Fallback action click listener in case setPanelBehavior is not supported in older Chrome versions
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (err) {
    console.error('[Jarvis Background] Error opening side panel:', err);
  }
});

/**
 * Ensures the content script is active on the target tab before messaging.
 * Injects content.js dynamically if needed.
 */
async function ensureContentScriptInjected(tabId) {
  try {
    const pingResponse = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (pingResponse && pingResponse.status === 'PONG') {
      return true;
    }
  } catch (_) {
    // Content script not yet present, inject dynamically
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    // Brief settle period for initialization
    await new Promise((res) => setTimeout(res, 120));
    return true;
  } catch (err) {
    console.error(`[Jarvis Background] Failed to inject content script into tab ${tabId}:`, err);
    throw new Error(`Cannot inspect this page (e.g. chrome:// or restricted URL): ${err.message}`);
  }
}

/**
 * Captures the current visible area of the target tab as a Base64 data URL.
 */
async function captureTabScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      windowId,
      { format: 'png', quality: 95 },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!dataUrl) {
          return reject(new Error('Failed to capture visible tab screenshot.'));
        }
        resolve(dataUrl);
      }
    );
  });
}

/**
 * Communicates with Gemini REST API (Multimodal Vision + Contextual DOM analysis)
 */
async function callGeminiApi({ apiKey, model, systemPrompt, userPrompt, domData, screenshotBase64 }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please set it in Side Panel settings.');
  }

  const modelEndpoint = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelEndpoint)}:generateContent?key=${apiKey}`;

  // Strip Base64 data prefix if present (e.g., "data:image/png;base64,")
  let cleanBase64 = screenshotBase64 || '';
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }

  // Construct comprehensive textual prompt incorporating DOM questions & metadata
  const promptPayload = `
${systemPrompt || 'You are an expert autonomous survey reasoning copilot.'}

=== USER INSTRUCTION ===
${userPrompt || 'Analyze the visible survey screenshot and DOM form elements. Select the most accurate, realistic, and contextually appropriate answers.'}

=== LIVE PAGE DOM STRUCTURE & CANDIDATE QUESTIONS ===
${JSON.stringify(domData, null, 2)}

=== OUTPUT INSTRUCTION ===
Return ONLY a valid JSON object matching the requested schema. No markdown formatting outside of JSON.
`.trim();

  const parts = [];

  // Add screenshot image as inline data part if provided
  if (cleanBase64) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: cleanBase64
      }
    });
  }

  // Add the contextual text prompt part
  parts.push({
    text: promptPayload
  });

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.15,
      topP: 0.95,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      const errJson = JSON.parse(errorText);
      parsedErr = errJson.error?.message || errorText;
    } catch (_) {}
    throw new Error(`Gemini API Error (${response.status}): ${parsedErr}`);
  }

  const result = await response.json();
  const textOutput = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textOutput) {
    throw new Error('Gemini returned an empty response.');
  }

  // Sanitize JSON response (remove potential ```json ... ``` wrappers)
  let cleanJsonString = textOutput.trim();
  if (cleanJsonString.startsWith('```')) {
    cleanJsonString = cleanJsonString.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  try {
    return JSON.parse(cleanJsonString);
  } catch (parseError) {
    console.error('[Jarvis Background] Raw Gemini text output:', textOutput);
    throw new Error(`Failed to parse Gemini response as JSON: ${parseError.message}`);
  }
}

/**
 * Message Dispatcher & Router
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  // Handle messages asynchronously
  (async () => {
    try {
      switch (action) {
        // -------------------------------------------------------------
        // SCAN ACTIVE TAB: Captures screenshot + extracts DOM layout
        // -------------------------------------------------------------
        case 'SCAN_ACTIVE_TAB': {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!activeTab || !activeTab.id) {
            return sendResponse({ success: false, error: 'No active tab detected in current window.' });
          }

          // Ensure content script is ready
          await ensureContentScriptInjected(activeTab.id);

          // 1. Capture live full-resolution visible tab screenshot
          const screenshotBase64 = await captureTabScreenshot(activeTab.windowId);

          // 2. Request DOM layout & input scan from content script
          const domResponse = await chrome.tabs.sendMessage(activeTab.id, { action: 'SCAN_DOM_ELEMENTS' });

          if (!domResponse || !domResponse.success) {
            return sendResponse({
              success: false,
              error: domResponse?.error || 'Content script failed to extract DOM structure.'
            });
          }

          return sendResponse({
            success: true,
            tabId: activeTab.id,
            pageUrl: activeTab.url,
            pageTitle: activeTab.title,
            domData: domResponse.data,
            screenshotBase64: screenshotBase64
          });
        }

        // -------------------------------------------------------------
        // EXECUTE GEMINI MULTIMODAL INFERENCE
        // -------------------------------------------------------------
        case 'ANALYZE_WITH_GEMINI': {
          const { apiKey, model, systemPrompt, userPrompt, domData, screenshotBase64 } = payload;
          const analysisResult = await callGeminiApi({
            apiKey,
            model,
            systemPrompt,
            userPrompt,
            domData,
            screenshotBase64
          });

          return sendResponse({
            success: true,
            data: analysisResult
          });
        }

        // -------------------------------------------------------------
        // EXECUTE AUTO-FILL ON THE WEB PAGE
        // -------------------------------------------------------------
        case 'EXECUTE_AUTO_FILL': {
          const { tabId, answers } = payload;
          let targetTabId = tabId;

          if (!targetTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            targetTabId = activeTab?.id;
          }

          if (!targetTabId) {
            return sendResponse({ success: false, error: 'Target tab not found for auto-fill.' });
          }

          await ensureContentScriptInjected(targetTabId);

          // Forward answer payload to content script's Selector Engine
          const fillResult = await chrome.tabs.sendMessage(targetTabId, {
            action: 'AUTO_FILL_ANSWERS',
            payload: { answers }
          });

          return sendResponse(fillResult || { success: true });
        }

        // -------------------------------------------------------------
        // CAPTURE SCREENSHOT ONLY (Quick visual check)
        // -------------------------------------------------------------
        case 'CAPTURE_SCREENSHOT': {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!activeTab) return sendResponse({ success: false, error: 'No active tab found.' });

          const screenshot = await captureTabScreenshot(activeTab.windowId);
          return sendResponse({ success: true, screenshotBase64: screenshot });
        }

        // -------------------------------------------------------------
        // OPEN OR FOCUS GEMINI WEB SESSION TAB
        // -------------------------------------------------------------
        case 'OPEN_GEMINI_WEB_SESSION': {
          const geminiTabs = await chrome.tabs.query({ url: '*://gemini.google.com/*' });
          if (geminiTabs.length > 0) {
            await chrome.tabs.update(geminiTabs[0].id, { active: true });
            return sendResponse({ success: true, tabId: geminiTabs[0].id, reused: true });
          } else {
            const newTab = await chrome.tabs.create({ url: 'https://gemini.google.com/app', active: true });
            return sendResponse({ success: true, tabId: newTab.id, reused: false });
          }
        }

        default:
          return sendResponse({ success: false, error: `Unknown background action: ${action}` });
      }
    } catch (err) {
      console.error(`[Jarvis Background] Error handling action '${action}':`, err);
      return sendResponse({ success: false, error: err.message || String(err) });
    }
  })();

  // Return true to indicate asynchronous response handling
  return true;
});
