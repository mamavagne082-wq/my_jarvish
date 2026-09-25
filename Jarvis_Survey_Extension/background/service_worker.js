/**
 * Jarvis AI Survey Copilot - Background Service Worker (Manifest V3)
 * Full Integration with Jarvis Desktop EXE, Voice Commands & Mobile APK.
 */

const DEFAULT_SETTINGS = {
  geminiApiKey: "AQ.Ab8RN6J5DqZWWMu_uYj3bqaIpPOupHTQPFrx8dhwCWcQ8Ikf6w",
  geminiModel: "gemini-3.8-flash",
  autoPilotActive: false,
  autoFillDelay: 450,
  pageTransitionDelay: 2000,
  humanSimulationEnabled: true,
  localBridgeEnabled: true,
  localBridgeUrl: "http://127.0.0.1:8765",
  useVisionScreenshot: true,
  highlightColor: "#00ffcc",
  soundEnabled: true
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const toSet = { ...DEFAULT_SETTINGS };

  for (const [key, val] of Object.entries(current)) {
    if (val !== undefined && val !== null && val !== "") {
      toSet[key] = val;
    }
  }

  if (!current.geminiModel || current.geminiModel === "gemini-2.5-flash") {
    toSet.geminiModel = "gemini-3.8-flash";
  }

  if (!toSet.surveyPersona) {
    try {
      const url = chrome.runtime.getURL("persona/survey_persona.json");
      const resp = await fetch(url);
      if (resp.ok) {
        toSet.surveyPersona = await resp.json();
      }
    } catch (e) {
      console.warn("Could not load bundled survey persona:", e);
    }
  }

  await chrome.storage.local.set(toSet);
  console.log("Jarvis Survey Copilot service worker initialized with Voice & Desktop Bridge.");
});

// Listener for messages from Popup and Content Scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ANALYZE_SURVEY_PAGE") {
    handleSurveyAnalysis(message.payload, sender.tab?.id)
      .then((res) => {
        // Notify Jarvis desktop of the page analysis event
        notifyJarvisDesktop("survey_page_analyzed", {
          title: message.payload?.title,
          qCount: message.payload?.questions?.length,
          summary: res?.data?.page_summary,
          trapDetected: res?.data?.trap_detected
        });
        sendResponse(res);
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message || String(err) });
      });
    return true;
  }

  if (message.action === "CAPTURE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 65 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, screenshot: dataUrl });
      }
    });
    return true;
  }

  if (message.action === "SET_AUTOPILOT_STATE") {
    chrome.storage.local.set({ autoPilotActive: !!message.active }).then(() => {
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "AUTOPILOT_STATE_CHANGED",
          active: !!message.active
        }).catch(() => {});
      }
      notifyJarvisDesktop("autopilot_state_changed", { active: !!message.active });
      sendResponse({ success: true, active: !!message.active });
    });
    return true;
  }

  if (message.action === "GET_AUTOPILOT_STATE") {
    chrome.storage.local.get(["autoPilotActive"]).then((res) => {
      sendResponse({ active: !!res.autoPilotActive });
    });
    return true;
  }

  if (message.action === "CHECK_LOCAL_JARVIS") {
    checkLocalJarvisBridge()
      .then(sendResponse)
      .catch((err) => sendResponse({ connected: false, error: err.message }));
    return true;
  }

  if (message.action === "NOTIFY_JARVIS_EVENT") {
    notifyJarvisDesktop(message.event, {
      message: message.message,
      url: sender.tab?.url,
      title: sender.tab?.title
    });
    sendResponse({ success: true });
    return true;
  }
});

/**
 * =========================================================================
 * 1. DESKTOP & VOICE COMMAND POLLING (EXE & MOBILE SYNC)
 * =========================================================================
 */
let isPollingBridge = false;

async function pollJarvisDesktopCommands() {
  if (isPollingBridge) return;
  isPollingBridge = true;

  try {
    const { localBridgeEnabled, localBridgeUrl } = await chrome.storage.local.get([
      "localBridgeEnabled",
      "localBridgeUrl"
    ]);

    if (localBridgeEnabled === false) {
      isPollingBridge = false;
      return;
    }

    const baseUrl = localBridgeUrl || "http://127.0.0.1:8765";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const resp = await fetch(`${baseUrl}/pending_command`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const data = await resp.json();
      if (data.has_command && data.command) {
        await executeJarvisVoiceCommand(data.command, baseUrl);
      }
    }
  } catch (e) {
    // Desktop server not running or silent network timeout
  } finally {
    isPollingBridge = false;
  }
}

// Start polling Jarvis desktop server every 1 second
setInterval(pollJarvisDesktopCommands, 1000);

/**
 * Executes command triggered from Jarvis Desktop EXE / Voice / Mobile APK
 */
async function executeJarvisVoiceCommand(cmdObj, baseUrl) {
  const { id, command, payload } = cmdObj;
  console.log(`[Jarvis Voice Bridge] Received voice command: ${command}`);

  let result = { id: id, success: false, command: command };

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      result.error = "No active browser tab found.";
      await reportCommandResult(result, baseUrl);
      return;
    }

    await ensureContentScript(activeTab.id);

    if (command === "START_AUTOPILOT" || command === "START_AUTO_LOOP") {
      await chrome.storage.local.set({ autoPilotActive: true });
      await chrome.tabs.sendMessage(activeTab.id, { action: "AUTOPILOT_STATE_CHANGED", active: true });
      result.success = true;
      result.message = "Full Auto-Loop Auto-Pilot activated successfully.";
    } else if (command === "STOP_AUTOPILOT") {
      await chrome.storage.local.set({ autoPilotActive: false });
      await chrome.tabs.sendMessage(activeTab.id, { action: "AUTOPILOT_STATE_CHANGED", active: false });
      result.success = true;
      result.message = "Auto-pilot stopped.";
    } else if (command === "ONE_CLICK_AUTOFILL") {
      const fillRes = await chrome.tabs.sendMessage(activeTab.id, { action: "ONE_CLICK_AUTOFILL_NEXT" });
      result.success = fillRes?.success || false;
      result.filledCount = fillRes?.filledCount || 0;
      result.message = `Selected ${result.filledCount} answers.`;
    } else if (command === "CLICK_NEXT") {
      const nextRes = await chrome.tabs.sendMessage(activeTab.id, { action: "CLICK_NEXT_BUTTON" });
      result.success = nextRes?.success || false;
      result.message = nextRes?.message || "Next button clicked.";
    }
  } catch (err) {
    result.error = err.message || "Failed executing command in browser.";
  }

  await reportCommandResult(result, baseUrl);
}

async function reportCommandResult(result, baseUrl) {
  try {
    await fetch(`${baseUrl}/command_result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    });
  } catch (e) {
    console.warn("Could not post command result to Jarvis Desktop:", e);
  }
}

async function notifyJarvisDesktop(eventType, payload) {
  try {
    const { localBridgeUrl } = await chrome.storage.local.get(["localBridgeUrl"]);
    const baseUrl = localBridgeUrl || "http://127.0.0.1:8765";
    await fetch(`${baseUrl}/notify_event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: eventType, data: payload, timestamp: Date.now() })
    });
  } catch (e) {
    // Silent
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "PING" });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content/content_script.js"]
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ["content/overlay.css"]
    });
  }
}

/**
 * Checks if local desktop Jarvis server is reachable
 */
async function checkLocalJarvisBridge() {
  const { localBridgeUrl } = await chrome.storage.local.get(["localBridgeUrl"]);
  const url = (localBridgeUrl || "http://127.0.0.1:8765") + "/status";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return { connected: res.ok };
  } catch (e) {
    clearTimeout(timeoutId);
    return { connected: false };
  }
}

/**
 * Analyzes the survey DOM data and optional screenshot via Gemini 3.8 Flash API
 */
async function handleSurveyAnalysis(payload, tabId) {
  const storage = await chrome.storage.local.get([
    "geminiApiKey",
    "geminiModel",
    "surveyPersona",
    "useVisionScreenshot"
  ]);

  const apiKey = storage.geminiApiKey || DEFAULT_SETTINGS.geminiApiKey;
  const model = storage.geminiModel || "gemini-3.8-flash";
  const persona = storage.surveyPersona || {};

  if (!apiKey) {
    throw new Error("Gemini API Key missing. Please set your API key in the extension settings.");
  }

  let screenshotBase64 = null;
  if (storage.useVisionScreenshot !== false) {
    try {
      screenshotBase64 = await new Promise((resolve) => {
        chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 60 }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            resolve(null);
          } else {
            resolve(dataUrl.split(",")[1]);
          }
        });
      });
    } catch (e) {
      console.warn("Screenshot capture skipped or failed:", e);
    }
  }

  const prompt = buildHumanLikeSurveyPrompt(payload, persona);
  const geminiResponse = await callGeminiAPI(apiKey, model, prompt, screenshotBase64);

  return geminiResponse;
}

/**
 * Constructs prompt instructing Gemini 3.8 to generate natural, human-like survey answers
 */
function buildHumanLikeSurveyPrompt(pageData, persona) {
  return `You are answering an online survey as a real human respondent named Alamin Miah.
Your answers MUST sound completely natural, authentic, thoughtful, and human-like. Survey quality algorithms actively check for bot-like patterns, so follow the human guidelines below strictly.

==================================================
YOUR HUMAN PERSONA PROFILE (Stay 100% consistent!):
==================================================
${JSON.stringify(persona, null, 2)}

==================================================
HUMAN BEHAVIOR & ANTI-BOT GUIDELINES:
==================================================
1. ATTENTION-CHECK / TRAP QUESTIONS:
   - Identify instructions like "Please select 'Disagree' to demonstrate you are reading" or "Select the color blue".
   - Identify impossible trap questions (e.g. "Have you bought a submarine in the past 30 days?").
   - If an attention check is detected, obey its exact instruction!

2. NO STRAIGHT-LINING (Vary Ratings in Grid/Matrix Tables):
   - Never pick the exact same score for every row in a rating grid (e.g. do NOT pick all 5s, all 10s, or all "Strongly Agree").
   - Real humans have varied, realistic opinions: rate some aspects high (e.g. 4 or 5), some average (e.g. 3 or 4), and occasionally lower if reasonable.

3. AUTHENTIC, HUMAN OPEN-ENDED TEXT RESPONSES:
   - When asked to type an answer (e.g. "Why did you choose this brand?", "What could be improved?"):
     * Write naturally in the first person ("I think...", "In my experience...", "We've been using...").
     * Keep it concise: 1 to 2 realistic sentences.
     * NEVER write like an AI (NEVER say "As an AI language model", never write bullet points, never use academic essays).
     * Example: "The software has been very reliable for our team, though I think the dashboard loading speed could be a bit faster."

4. DEMOGRAPHIC & SCREENER INTEGRITY:
   - Age: 50 (Born 1976), Male, White, Married with 2 children (13 boy, 12 girl).
   - Household income: $125,000 - $149,999.
   - Residence: New York, NY 10001 (Owns single family home).
   - Job: Senior Manager / Director in Information Technology / Computer Software (Full-time).
   - Purchasing Authority: IT Hardware, Enterprise Software, Marketing, Sales.
   - Industry Screener: If asked if you work in Market Research, Advertising, PR, or Media, ALWAYS select "None of the above" or "IT / Computer Software".

5. REALISTIC CONSUMER CHOICES:
   - When asked about brands you recognize or buy, select prominent, popular brands (Apple, Microsoft, Audi, Samsung, Sony, Nike, Amazon, Google, etc.).

==================================================
EXTRACTED SURVEY PAGE DOM DATA:
==================================================
URL: ${pageData.url || "N/A"}
Page Title: ${pageData.title || "N/A"}

Scanned Questions & Interactive Elements:
${JSON.stringify(pageData.questions, null, 2)}

==================================================
OUTPUT FORMAT:
==================================================
Return ONLY a valid JSON object matching this exact structure:
{
  "page_summary": "Short 1-sentence summary of what this survey page is asking",
  "trap_detected": true/false,
  "trap_alert_message": "Explanation if trap/attention check detected, otherwise empty string",
  "estimated_human_reading_seconds": 3,
  "answers": [
    {
      "question_index": 0,
      "question_id": "element-or-name-id",
      "question_text": "Text of the question",
      "recommended_action": "select_radio" | "select_checkbox" | "select_dropdown" | "type_text" | "matrix_choice",
      "target_element_ids": ["id-or-selector-of-element-to-click"],
      "selected_labels": ["Exact text or label of the chosen option"],
      "text_input_value": "Short natural human text if text input required, otherwise null",
      "reasoning": "Brief natural explanation of why this answer fits human persona"
    }
  ]
}
Return JSON only. Do not wrap in commentary.`;
}

/**
 * Calls Gemini REST API with prompt and optional vision screenshot
 */
async function callGeminiAPI(apiKey, model, promptText, base64Image) {
  const modelsToTry = [
    model,
    "gemini-3.8-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastError = null;

  for (const targetModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

    const parts = [{ text: promptText }];
    if (base64Image) {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image
        }
      });
    }

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: parts
        }
      ],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json"
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Model ${targetModel} call failed (${response.status}):`, errorText);
        lastError = new Error(`Gemini API Error (${targetModel}): ${response.status} - ${errorText.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error("No response text returned by Gemini");
      }

      let parsed;
      try {
        const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch (pe) {
        console.error("JSON parse failed, returning raw content:", pe);
        parsed = {
          page_summary: "Survey analysis completed",
          trap_detected: false,
          answers: [],
          raw: content
        };
      }

      return {
        success: true,
        modelUsed: targetModel,
        data: parsed
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to contact Gemini API after trying candidate models.");
}
