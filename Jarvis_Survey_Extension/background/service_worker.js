/**
 * Jarvis AI Survey Copilot - Background Service Worker (Manifest V3)
 * Gemini 2.5 Pro/Flash + OpenRouter All Models Support
 * Auto-Pilot: Full page scan → AI answers → click Next → repeat
 */

// === ALL REAL GEMINI MODELS (Latest First) ===
const GEMINI_MODEL_CHAIN = [
  "gemini-2.5-flash-latest",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash-preview-04-17",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-pro-exp-03-25",
  "gemini-2.5-pro",
  "gemini-1.5-pro-latest",
  "gemini-1.5-pro"
];

/**
 * Resolves user-friendly model names (e.g. Gemini 3.8 Flash, 3.7 Flash) to real Google API endpoints
 */
function resolveGeminiModelName(modelName) {
  if (!modelName) return "gemini-2.5-flash-latest";
  const map = {
    "gemini-3.8-flash": "gemini-2.5-flash-latest",
    "gemini-3.8": "gemini-2.5-flash-latest",
    "gemini-3.7-flash": "gemini-2.5-flash-preview-05-20",
    "gemini-3.7": "gemini-2.5-flash-preview-05-20",
    "gemini-3.6-flash": "gemini-2.0-flash",
    "gemini-3.6": "gemini-2.0-flash",
    "gemini-3.5-flash": "gemini-1.5-flash-latest",
    "gemini-3.5": "gemini-1.5-flash-latest",
    "gemini-flash-latest": "gemini-2.5-flash-latest",
    "gemini-pro-latest": "gemini-2.5-pro"
  };
  return map[modelName.toLowerCase().trim()] || modelName;
}

const DEFAULT_SETTINGS = {
  geminiApiKey: "",
  geminiModel: "gemini-3.8-flash",
  openRouterApiKey: "",
  openRouterModel: "google/gemini-2.5-flash",
  useOpenRouter: false,
  autoPilotActive: false,
  autoFillDelay: 300,
  pageTransitionDelay: 2000,
  humanSimulationEnabled: true,
  localBridgeEnabled: true,
  localBridgeUrl: "http://127.0.0.1:8765",
  highlightColor: "#00ffcc",
  soundEnabled: true
};

const DEFAULT_PERSONAL_INFO = {
  firstName: "Al Amin",
  lastName: "Miah",
  myAge: "50",
  birthdate: "08/03/1976",
  race: "White",
  ethnicity: "Not hispanic/latin",
  home: "Own single Home/ Condo",
  language: "English",
  animalPets: "Dog, Cat",
  jobType: "Full time",
  occupation: "Computer Software (Manager / Director)",
  companyEmployees: "2500-5000",
  decisionTakers: "Myself (all section)",
  wifeAge: "40",
  sonAge: "13",
  daughterAge: "12",
  educationDegree: "Master's or Professional Degree (or Bachelor)",
  postalZipCode: "10001",
  emailAddress: "alaminmiah1976@gmail.com",
  country: "United States"
};

// Initialize settings on install or update
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const toSet = { ...DEFAULT_SETTINGS };

  for (const [key, val] of Object.entries(current)) {
    if (val !== undefined && val !== null && val !== "") {
      toSet[key] = val;
    }
  }

  if (!toSet.geminiModel) {
    toSet.geminiModel = "gemini-3.8-flash";
  }

  if (!toSet.personalInfo) {
    toSet.personalInfo = { ...DEFAULT_PERSONAL_INFO };
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
  console.log("[Jarvis v2.0] Service worker ready. Gemini 3.8 Flash + OpenRouter loaded.");
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
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, (dataUrl) => {
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

  // Handle Survey Outcome (Screen-Out or Completion) for Hands-Free Multi-Survey Progression
  if (message.action === "SURVEY_OUTCOME") {
    const outcome = message.outcome; // "screen_out" | "completed"
    notifyJarvisDesktop(outcome === "screen_out" ? "survey_screen_out" : "survey_completed", {
      message: message.message,
      url: sender.tab?.url,
      title: sender.tab?.title
    });

    chrome.storage.local.get(["autoPilotActive"]).then(async (storage) => {
      if (storage.autoPilotActive && sender.tab?.id) {
        setTimeout(async () => {
          try {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            // Identify dashboard tab
            const dashboardTab = tabs.find(t =>
              t.id !== sender.tab.id &&
              /dashboard|surveys|earn|rewards|home|portal|cpx|freecash|swagbucks|primeopinion|ysense|attapoll|qmee/i.test(t.url || "")
            );

            if (dashboardTab) {
              // Focus dashboard and close finished survey tab
              await chrome.tabs.update(dashboardTab.id, { active: true });
              await chrome.tabs.remove(sender.tab.id);
              // Trigger dashboard to pick next survey
              setTimeout(() => {
                chrome.tabs.sendMessage(dashboardTab.id, { action: "AUTOPILOT_TRIGGER_CYCLE" }).catch(() => {});
              }, 1200);
            }
          } catch (e) {
            console.debug("Auto multi-survey loop tab transition:", e);
          }
        }, 2200);
      }
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
    // Special Handler: API Limit Warning & Notifications (does not require active survey tab)
    if (command === "API_LIMIT_WARNING" || command === "API_ALERT") {
      const p = payload || {};
      const apiName = p.api_name || "API Provider";
      const usagePercent = p.usage_percent !== undefined ? p.usage_percent : "?";
      const msg = p.warning_message || `⚠️ Warning: ${apiName} is near its usage limit (${usagePercent}% used)!`;
      const currentUsage = p.current_usage !== undefined ? p.current_usage : "N/A";
      const limit = p.limit !== undefined ? p.limit : "N/A";
      const unit = p.unit || "calls";

      console.warn(`[Jarvis API Monitor] Alert received: ${apiName} -> ${msg}`);

      // 1. Trigger Chrome Desktop Toast Notification
      try {
        if (chrome.notifications && chrome.notifications.create) {
          chrome.notifications.create(`jarvis_api_alert_${Date.now()}`, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/icon128.png"),
            title: `⚠️ Jarvis API Limit Alert: ${apiName}`,
            message: msg,
            contextMessage: `Usage: ${currentUsage} / ${limit} ${unit} (${usagePercent}%)`,
            priority: 2,
            requireInteraction: true
          }, (notifId) => {
            if (chrome.runtime.lastError) {
              console.warn("Chrome notification error:", chrome.runtime.lastError.message);
            }
          });
        }
      } catch (ne) {
        console.warn("Could not dispatch Chrome notification:", ne);
      }

      // 2. Persist in chrome.storage.local for popup UI
      try {
        const stored = await chrome.storage.local.get(["activeApiAlerts"]);
        const existing = stored.activeApiAlerts || [];
        const alertObj = {
          id: id || `alert_${Date.now()}`,
          api_name: apiName,
          usage_percent: usagePercent,
          current_usage: currentUsage,
          limit: limit,
          unit: unit,
          warning_message: msg,
          timestamp: Date.now()
        };
        // Keep list updated (replace old alert for same API or append)
        const filtered = existing.filter(a => a.api_name !== apiName);
        const updatedList = [alertObj, ...filtered].slice(0, 10);
        await chrome.storage.local.set({ activeApiAlerts: updatedList });
      } catch (se) {
        console.warn("Could not save alert to storage:", se);
      }

      // 3. If there is an active tab, broadcast alert to on-page HUD
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: "SHOW_API_ALERT",
            alert: {
              api_name: apiName,
              usage_percent: usagePercent,
              message: msg,
              current_usage: currentUsage,
              limit: limit,
              unit: unit
            }
          }).catch(() => {});
        }
      } catch (te) {
        // Tab not accessible
      }

      result.success = true;
      result.message = `Notification triggered for ${apiName}`;
      await reportCommandResult(result, baseUrl);
      return;
    }

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
    } else if (command === "SHOW_SUGGESTION" || command === "SCAN_ONLY") {
      const scanRes = await chrome.tabs.sendMessage(activeTab.id, { action: "SCAN_AND_ANALYZE", show_hud: true });
      result.success = scanRes?.success || false;
      result.message = "AI Suggestion Box displayed on screen.";
      result.data = scanRes?.data || null;
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
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:") || tab.url.startsWith("devtools://")) {
      return false;
    }
    const pingRes = await chrome.tabs.sendMessage(tabId, { action: "PING" });
    if (pingRes && pingRes.pong) return true;
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content/content_script.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["content/overlay.css"]
      });
      return true;
    } catch (err) {
      console.warn("Could not inject content script:", err);
      return false;
    }
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
 * Analyzes the entire survey webpage DOM data and text via Gemini 3.8 Flash API
 * Analyzes complete page top-to-bottom without screenshot cropping
 */
async function handleSurveyAnalysis(payload, tabId) {
  const storage = await chrome.storage.local.get([
    "geminiApiKey",
    "geminiModel",
    "openRouterApiKey",
    "openRouterModel",
    "useOpenRouter",
    "surveyPersona",
    "personalInfo"
  ]);

  const useOpenRouter = !!storage.useOpenRouter;
  const openRouterKey = (storage.openRouterApiKey || "").trim();
  const geminiKey = (storage.geminiApiKey || "").trim();

  if (!geminiKey && !openRouterKey) {
    throw new Error("❌ কোনো API Key পাওয়া যায়নি! Settings থেকে Gemini API Key অথবা OpenRouter API Key দিন।");
  }

  const persona = storage.surveyPersona || {};
  const personalInfo = storage.personalInfo || null;

  // Determine if this is a visual screenshot analysis or DOM text analysis
  const isScreenshot = !!(payload && (payload.screenshot || payload.isScreenshot));
  let base64Image = null;
  let fullDataUrl = null;

  if (isScreenshot && payload.screenshot) {
    fullDataUrl = payload.screenshot;
    // Strip header prefix for direct Gemini inlineData
    base64Image = payload.screenshot.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  }

  const prompt = isScreenshot
    ? buildVisionSurveyPrompt(payload, persona, personalInfo)
    : buildHumanLikeSurveyPrompt(payload, persona, personalInfo);

  let result = null;

  // Strategy 1: User explicitly checked OpenRouter
  if (useOpenRouter && openRouterKey) {
    const orModel = storage.openRouterModel || "google/gemini-2.5-flash";
    try {
      result = await callOpenRouterAPI(openRouterKey, orModel, prompt, fullDataUrl);
    } catch (orErr) {
      console.warn("[Jarvis] OpenRouter failed, attempting fallback to Gemini direct API...", orErr);
      if (geminiKey) {
        const model = resolveGeminiModelName(storage.geminiModel);
        result = await callGeminiAPI(geminiKey, model, prompt, base64Image);
      } else {
        throw orErr;
      }
    }
  } else if (geminiKey) {
    // Strategy 2: Gemini direct API is primary
    const model = resolveGeminiModelName(storage.geminiModel);
    try {
      result = await callGeminiAPI(geminiKey, model, prompt, base64Image);
    } catch (geminiErr) {
      console.warn("[Jarvis] Gemini direct API failed:", geminiErr);
      // Seamless auto-fallback to OpenRouter if configured!
      if (openRouterKey) {
        console.warn("[Jarvis] Auto-falling back to OpenRouter API...");
        const orModel = storage.openRouterModel || "google/gemini-2.5-flash";
        result = await callOpenRouterAPI(openRouterKey, orModel, prompt, fullDataUrl);
      } else {
        throw geminiErr;
      }
    }
  } else if (openRouterKey) {
    // Only OpenRouter key is available
    const orModel = storage.openRouterModel || "google/gemini-2.5-flash";
    result = await callOpenRouterAPI(openRouterKey, orModel, prompt, fullDataUrl);
  }

  if (result && result.data) {
    result.data.is_screenshot_analysis = isScreenshot;
    result.data.analyzed_at = Date.now();
    result.data.page_title = payload.title || "";
    result.data.page_url = payload.url || "";

    // Save into chrome.storage.local so popup & HUD immediately reflect latest answers
    await chrome.storage.local.set({ lastAnalysisResult: result.data });

    // Broadcast update to all tabs/popup
    try {
      chrome.runtime.sendMessage({
        action: "SURVEY_ANALYSIS_UPDATED",
        data: result.data
      }).catch(() => {});
    } catch (e) {}
  }

  return result;
}

/**
 * Constructs prompt instructing Gemini 3.8 to generate natural, human-like survey answers
 */
function buildHumanLikeSurveyPrompt(pageData, persona, personalInfo) {
  const p = personalInfo || DEFAULT_PERSONAL_INFO;
  const infoSection = `
==================================================
EXACT VERIFIED PERSONAL INFO (CRITICAL: ALWAYS MATCH THESE VALUES):
==================================================
- Full Name: ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}
- First Name: ${p.firstName || "Al Amin"}
- Last Name: ${p.lastName || "Miah"}
- My Age: ${p.myAge || "50"}
- Birthdate: ${p.birthdate || "08/03/1976"} (Born March 8, 1976)
- Gender: Male (Heterosexual)
- Marital Status: Married
- Wife Age: ${p.wifeAge || "40"}
- Children Count: 2 (Son Age: ${p.sonAge || "13"}, Daughter Age: ${p.daughterAge || "12"})
- Household Size: 4 people (Myself, wife, son, daughter)
- Race / Ethnicity: White, Non-Hispanic / Not Latino
- Home Ownership: Own Single Family Home / Detached house / Condo
- Spoken Language at Home: English
- Animals / Pets: Dog, Cat
- Employment / Job Type: Employed Full-time (35+ hours)
- Occupation / Role: Computer Software / Information Technology (Manager / Director)
- Company Size / Employees: 2500-5000 (or 1000-5000)
- Decision Making / Purchasing Authority: Primary decision maker or equal joint decision maker (Myself - all sections)
- Annual Income: $125,000 - $149,999 (Monthly: Over $5,000 / $5,000+)
- Personal Vehicle: Yes (Owns personal vehicle / SUV)
- Education / Degree: Master's or Professional Degree (or Bachelor Degree)
- Postal / Zip Code: ${p.postalZipCode || "10001"} (New York, NY)
- Email: ${p.emailAddress || "alaminmiah1976@gmail.com"}
- Country: ${p.country || "United States"}
`;

  return `You are answering an online survey as a real human respondent named ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}.
Your answers MUST sound completely natural, authentic, thoughtful, and human-like. Survey quality algorithms actively check for bot-like patterns, so follow the human guidelines below strictly.

${infoSection}

==================================================
HUMAN BEHAVIOR & ANTI-BOT GUIDELINES:
==================================================
1. ATTENTION-CHECK / TRAP QUESTIONS:
   - Identify instructions like "Please select 'Disagree' to demonstrate you are reading" or "Select the color blue".
   - Identify impossible trap questions (e.g. "Have you bought a submarine in the past 30 days?").
   - If an attention check is detected, obey its exact instruction! Set "trap_detected": true.

2. ANSWER EVERY SINGLE QUESTION:
   - You MUST output an answer object in "answers" for EVERY question present in the scanned list. Do not skip any question!
   - If a question has radio options, choose the single most appropriate option matching persona.
   - If a question has checkboxes, choose 1 to 3 realistic options matching persona.

3. NO STRAIGHT-LINING (Vary Ratings in Grid/Matrix Tables):
   - Never pick the exact same score for every row in a rating grid (e.g. do NOT pick all 5s, all 10s, or all "Strongly Agree").
   - Real humans have varied, realistic opinions: rate some aspects high (e.g. 4 or 5), some average (e.g. 3 or 4), and occasionally lower if reasonable.

4. AUTHENTIC, HUMAN OPEN-ENDED TEXT RESPONSES:
   - When asked to type an answer (e.g. "Why did you choose this brand?", "What could be improved?", opinion boxes):
     * "recommended_action": "type_text"
     * Provide "text_input_value" written naturally in first person ("In our team...", "I feel that...", "We've been using...").
     * Keep it concise: 1 to 2 realistic sentences.
     * NEVER write like an AI (never say "As an AI", never use bullet points, never write textbook essays).
     * Example: "The service has been quite dependable for our daily workflow, though I think the reporting interface could load a bit faster."

5. DEMOGRAPHIC & SCREENER INTEGRITY:
   - Always match the exact age (50), birthdate (1976-03-08), children (13 and 12), wife (40), household size (4 people), location (10001), occupation (IT / Computer Software Manager/Director), and company size from the verified personal info above!
   - Purchasing Authority: Always indicate primary decision maker or equal joint decision maker (NEVER "I have no influence" or "None of the above").
   - Industry Screener: If asked if you work in Market Research, Advertising, PR, Journalism, or Media, ALWAYS select "None of the above" or "IT / Computer Software".

6. REALISTIC CONSUMER CHOICES:
   - When asked about brands you recognize or buy, select prominent, popular brands (Apple, Microsoft, Audi, Samsung, Sony, Nike, Amazon, Google, etc.).

7. UNKNOWN FIELD FALLBACK & LOGICAL PERSONA STANDARD:
   - Follow the verified persona (IT Director living in 10001 with wife & 2 kids, pet dog & cat, Audi SUV):
     * Airlines: Delta, United (frequent business/family traveler).
     * Hotels: Marriott Bonvoy, Hilton.
     * Grocery / Retail: Whole Foods, Costco, Trader Joe's, Target, Amazon Prime.
     * Beverages: Starbucks coffee, mineral water, craft beer / red wine.
     * Maintain strict internal consistency across all questions.

==================================================
COMPLETE SURVEY WEBPAGE CONTEXT (Scanned Full Browser Page Top-to-Bottom):
==================================================
URL: ${pageData.url || "N/A"}
Page Title: ${pageData.title || "N/A"}

Full Page Text Content (All instructions, context & questions on the page):
${pageData.fullPageText || "N/A"}

Structured Survey Questions & Interactive Form Elements:
${JSON.stringify(pageData.questions, null, 2)}

==================================================
OUTPUT FORMAT:
==================================================
Return ONLY a valid JSON object matching this exact structure:
{
  "page_summary": "Short 1-sentence summary of what this survey page is asking",
  "trap_detected": true/false,
  "trap_alert_message": "Explanation if trap/attention check detected, otherwise empty string",
  "is_last_page": true/false,
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
Return JSON only. Do not wrap in markdown or commentary.`;
}

/**
 * Constructs vision prompt for Gemini Vision / OpenRouter Vision when DOM analysis cannot find elements
 */
function buildVisionSurveyPrompt(pageData, persona, personalInfo) {
  const p = personalInfo || DEFAULT_PERSONAL_INFO;
  const infoSection = `
==================================================
EXACT VERIFIED PERSONAL INFO (CRITICAL: ALWAYS MATCH THESE VALUES):
==================================================
- Full Name: ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}
- First Name: ${p.firstName || "Al Amin"}
- Last Name: ${p.lastName || "Miah"}
- My Age: ${p.myAge || "50"}
- Birthdate: ${p.birthdate || "08/03/1976"} (Born March 8, 1976)
- Gender: Male (Heterosexual)
- Marital Status: Married
- Wife Age: ${p.wifeAge || "40"}
- Children Count: 2 (Son Age: ${p.sonAge || "13"}, Daughter Age: ${p.daughterAge || "12"})
- Household Size: 4 people (Myself, wife, son, daughter)
- Race / Ethnicity: White, Non-Hispanic / Not Latino
- Home Ownership: Own Single Family Home / Detached house / Condo
- Spoken Language at Home: English
- Animals / Pets: Dog, Cat
- Employment / Job Type: Employed Full-time (35+ hours)
- Occupation / Role: Computer Software / Information Technology (Manager / Director)
- Company Size / Employees: 2500-5000 (or 1000-5000)
- Decision Making / Purchasing Authority: Primary decision maker or equal joint decision maker (Myself - all sections)
- Annual Income: $125,000 - $149,999 (Monthly: Over $5,000 / $5,000+)
- Personal Vehicle: Yes (Owns personal vehicle / SUV)
- Education / Degree: Master's or Professional Degree (or Bachelor Degree)
- Postal / Zip Code: ${p.postalZipCode || "10001"} (New York, NY)
- Email: ${p.emailAddress || "alaminmiah1976@gmail.com"}
- Country: ${p.country || "United States"}
`;

  return `You are analyzing a complete full-page survey screenshot image as a human survey respondent named ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}.
This page could not be parsed via simple HTML DOM, so your vision analysis is the source of truth.

${infoSection}

==================================================
VISION ANALYSIS INSTRUCTIONS:
==================================================
1. Read ALL visual text, survey questions, matrix grids, radio buttons, checkboxes, dropdowns, and text fields shown on the screenshot from top to bottom.
2. Check for attention-check / trap questions (e.g., "Select somewhat agree", "Choose the color blue"). If detected, obey the instruction strictly and set "trap_detected": true.
3. For EVERY visible question, choose the exact option text shown in the screenshot that fits the respondent profile above.
4. Detect if this is the FINAL / LAST PAGE of the survey (look for Submit button, Finish button, Complete button, or 100% progress indicator). Set "is_last_page": true if final page, false otherwise.
5. In "selected_labels", provide the exact wording of the option as printed on screen so it can be located and highlighted.

Webpage Info:
URL: ${pageData.url || "N/A"}
Page Title: ${pageData.title || "N/A"}
Visible Text Context:
${(pageData.fullPageText || "").slice(0, 2500)}

==================================================
OUTPUT FORMAT:
==================================================
Return ONLY a valid JSON object matching this exact structure:
{
  "page_summary": "Short 1-sentence summary of what this survey screenshot is asking",
  "trap_detected": false,
  "trap_alert_message": "",
  "is_last_page": false,
  "estimated_human_reading_seconds": 4,
  "answers": [
    {
      "question_index": 0,
      "question_text": "Exact text of the question as seen in the image",
      "recommended_action": "select_radio" | "select_checkbox" | "select_dropdown" | "type_text" | "matrix_choice",
      "selected_labels": ["Exact text or label of the chosen option visible on screen"],
      "text_input_value": "Short natural human text if text input required, otherwise null",
      "reasoning": "Brief natural explanation of why this answer fits human persona"
    }
  ]
}
Return JSON only. Do not wrap in markdown or commentary.`;
}

/**
 * Calls Gemini REST API with FULL fallback chain across ALL real Gemini models.
 * Tries the selected model first, then falls back through the complete chain.
 * Skips 404 (model not found) and 429 (quota) to try next model.
 * Stops on 403 (bad API key) - no point trying other models with same key.
 */
async function callGeminiAPI(apiKey, model, promptText, base64Image) {
  const primaryModel = resolveGeminiModelName(model);

  // Build full candidate list: resolved model first, then full chain
  const candidateModels = [
    primaryModel,
    ...GEMINI_MODEL_CHAIN
  ].filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

  let lastError = null;

  for (const targetModel of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey.trim()}`;

    const parts = [{ text: promptText }];
    if (base64Image) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
    }

    const requestBody = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.15,
        topP: 0.9,
        responseMimeType: "application/json"
      }
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[Jarvis] ${targetModel} (attempt ${attempt + 1}) → HTTP ${response.status}:`, errorText);

          if (response.status === 503 && attempt === 0) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }

          if (response.status === 403) {
            const isDenied = errorText.includes("denied access") || errorText.includes("PERMISSION_DENIED");
            const msg = isDenied
              ? "❌ Google Gemini 403: আপনার Google Cloud প্রজেক্টে অ্যাক্সেস বন্ধ হয়েছে (Your project has been denied access)। দয়া করে aistudio.google.com থেকে নতুন API Key তৈরি করুন, অথবা Settings থেকে OpenRouter API Key ব্যবহার করুন।"
              : `❌ Gemini API Key Error (403): API Key সঠিক নয় বা পারমিশন নেই। Settings এ সঠিক Key দিন।`;
            throw new Error(msg);
          }

          if (response.status === 404) {
            console.warn(`[Jarvis] Model ${targetModel} not found (404), trying next model in chain...`);
            lastError = new Error(`Model ${targetModel} not found (404)`);
            break; // next candidate model
          }

          if (response.status === 429) {
            console.warn(`[Jarvis] Quota exceeded for ${targetModel}, trying next model in chain...`);
            lastError = new Error(`Quota exceeded for ${targetModel} (429)`);
            break;
          }

          lastError = new Error(`Gemini API Error (${targetModel}): ${response.status} - ${errorText.slice(0, 180)}`);
          break;
        }

        const data = await response.json();
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
          lastError = new Error(`Empty response from ${targetModel}`);
          break;
        }

        let parsed;
        try {
          const cleaned = content
            .replace(/^```json\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();
          parsed = JSON.parse(cleaned);
        } catch {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              parsed = { page_summary: "Analysis done", trap_detected: false, answers: [] };
            }
          } else {
            parsed = { page_summary: "Analysis done", trap_detected: false, answers: [] };
          }
        }

        console.log(`[Jarvis] ✅ Gemini Success with model: ${targetModel}`);
        return { success: true, modelUsed: targetModel, data: parsed };

      } catch (err) {
        if (err.name === "AbortError") {
          lastError = new Error(`Timeout (25s) on ${targetModel}`);
          break;
        }
        if (err.message && err.message.includes("403")) throw err;
        lastError = err;
        if (attempt === 0) await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  throw lastError || new Error("❌ All Gemini models failed. Please check your API key or use OpenRouter.");
}

/**
 * Calls OpenRouter API with full model fallback support
 * Supports 100s of AI models via a single API key: https://openrouter.ai/models
 */
async function callOpenRouterAPI(apiKey, model, promptText, base64Image = null) {
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const primaryModel = model || "google/gemini-2.5-flash";

  const candidateModels = [
    primaryModel,
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001",
    "deepseek/deepseek-chat",
    "openai/gpt-4o-mini"
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError = null;

  for (const orModel of candidateModels) {
    let userContent;
    if (base64Image) {
      const imgUrl = base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`;
      userContent = [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: imgUrl } }
      ];
    } else {
      userContent = promptText;
    }

    const requestBody = {
      model: orModel,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.15,
      response_format: { type: "json_object" }
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 28000);

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey.trim()}`,
            "HTTP-Referer": "https://jarvis-survey-copilot.extension",
            "X-Title": "Jarvis Survey Copilot"
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[Jarvis OpenRouter] ${orModel} attempt ${attempt + 1} failed (${response.status}):`, errorText);

          if (response.status === 401 || response.status === 403) {
            throw new Error(`❌ OpenRouter API Key ভুল বা ইনভ্যালিড! (${response.status}) Settings থেকে সঠিক Key দিন।`);
          }

          if (response.status === 404 || response.status === 429) {
            lastError = new Error(`OpenRouter (${orModel}) status ${response.status}`);
            break; // try next candidate model
          }

          if (response.status === 503 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 1200));
            continue;
          }

          lastError = new Error(`OpenRouter API Error (${orModel}): ${response.status} - ${errorText.slice(0, 180)}`);
          break;
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
          lastError = new Error(`Empty response from OpenRouter: ${orModel}`);
          break;
        }

        let parsed;
        try {
          const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
          parsed = JSON.parse(cleaned);
        } catch {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              parsed = { page_summary: "Survey analysis completed via OpenRouter", trap_detected: false, answers: [] };
            }
          } else {
            parsed = { page_summary: "Survey analysis completed via OpenRouter", trap_detected: false, answers: [] };
          }
        }

        console.log(`[Jarvis] ✅ OpenRouter Success with model: ${orModel}`);
        return {
          success: true,
          modelUsed: `OpenRouter:${orModel}`,
          data: parsed
        };
      } catch (err) {
        if (err.name === "AbortError") {
          lastError = new Error(`OpenRouter timeout (28s) on ${orModel}`);
          break;
        }
        if (err.message && (err.message.includes("401") || err.message.includes("403"))) throw err;
        lastError = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  throw lastError || new Error("❌ OpenRouter এর সব মডেল ব্যর্থ হয়েছে। দয়া করে API Key ও ব্যালেন্স চেক করুন।");
}
