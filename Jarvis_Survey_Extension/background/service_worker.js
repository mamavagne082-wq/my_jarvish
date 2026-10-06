/**
 * Jarvis AI Survey Copilot - Background Service Worker (Manifest V3)
 * Gemini 3.8 Flash + OpenRouter + Local Memory Cache & Knowledge Base Matcher
 * Auto-Pilot: Full page scan → AI answers → click Next → repeat
 */

// Import Local Memory Cache & Knowledge Base Matcher
if (typeof importScripts !== "undefined") {
  try {
    importScripts("memory_manager.js");
  } catch (e) {
    console.error("[Jarvis ServiceWorker] Error importing memory_manager.js:", e);
  }
}

// Import Hermes AI Local Agent (Zero-Cost Offline AI)
if (typeof importScripts !== "undefined") {
  try {
    importScripts("hermes_agent.js");
    console.log("[Jarvis] ✅ Hermes AI Local Agent loaded — Zero API cost mode active!");
  } catch (e) {
    console.error("[Jarvis ServiceWorker] Error importing hermes_agent.js:", e);
  }
}

// === ALL REAL, VERIFIED GEMINI MODELS (Latest & Fastest First) ===
const GEMINI_MODEL_CHAIN = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-pro-latest"
];

/**
 * Resolves user-friendly model names directly to valid Google API endpoints
 */
function resolveGeminiModelName(modelName) {
  if (!modelName) return "gemini-3.8-flash";
  const m = modelName.toLowerCase().trim();
  if (m.includes("3.8") || m.includes("flash")) return "gemini-3.8-flash";
  if (m.includes("lite")) return "gemini-2.5-flash-lite";
  if (m.includes("pro")) return "gemini-pro-latest";
  if (m.includes("latest")) return "gemini-flash-latest";
  return "gemini-3.8-flash";
}

const DEFAULT_SETTINGS = {
  geminiApiKey: "AQ.Ab8RN6LtcM7pevIID9jpLXKQ_030T06c0A2UhJDnYOBQPb7O5w",
  geminiApiKey2: "AQ.Ab8RN6J1FBmr5Rfi34mDhIDv1nmmVqt9WLcpUZrGS30lX761ng",
  geminiApiKey3: "",
  geminiModel: "gemini-3.8-flash",
  openRouterApiKey: "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",
  openRouterApiKey2: "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",
  openRouterApiKey3: "",
  openRouterModel: "google/gemini-2.5-flash",
  torveAiApiKey: "",
  torveAiApiKey2: "",
  torveAiApiKey3: "",
  torveAiModel: "claude-opus-4-8",
  useTorveAi: true,
  memoryApiKey: "",
  memoryProvider: "local_offline",
  providerPriority: "gemini_first",
  useOpenRouter: true,
  autoPilotActive: false,
  autoFillDelay: 350,
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

  // Upgrade legacy or 404-prone models to Gemini 3.8 Flash
  if (!toSet.geminiModel || toSet.geminiModel.includes("2.5") || toSet.geminiModel.includes("1.5") || toSet.geminiModel.includes("latest")) {
    toSet.geminiModel = "gemini-3.8-flash";
  }

  // Ensure multi-key defaults exist
  if (!toSet.geminiApiKey) toSet.geminiApiKey = DEFAULT_SETTINGS.geminiApiKey;
  if (!toSet.geminiApiKey2) toSet.geminiApiKey2 = DEFAULT_SETTINGS.geminiApiKey2;
  if (!toSet.openRouterApiKey) toSet.openRouterApiKey = DEFAULT_SETTINGS.openRouterApiKey;
  if (!toSet.openRouterApiKey2) toSet.openRouterApiKey2 = DEFAULT_SETTINGS.openRouterApiKey2;
  if (!toSet.torveAiModel) toSet.torveAiModel = DEFAULT_SETTINGS.torveAiModel;
  if (toSet.useTorveAi === undefined) toSet.useTorveAi = true;
  if (!toSet.providerPriority) toSet.providerPriority = "gemini_first";

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

  if (typeof JarvisMemoryManager !== "undefined" && JarvisMemoryManager.ensureMasterDatasetLoaded) {
    try {
      await JarvisMemoryManager.ensureMasterDatasetLoaded();
    } catch (e) {
      console.warn("[Jarvis ServiceWorker] Note on master dataset seeding:", e);
    }
  }

  console.log("[Jarvis v3.0] Service worker ready. Hermes AI + Gemini 3.8 Flash + OpenRouter Multi-Key Failover Chain loaded.");
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
    const targetWinId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(targetWinId, { format: "jpeg", quality: 80 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, (fallbackUrl) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true, screenshot: fallbackUrl });
          }
        });
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

  // =========================================================================
  // MEMORY CACHE & KNOWLEDGE BASE MESSAGE ACTIONS
  // =========================================================================
  if (message.action === "MEMORY_GET_STATS") {
    if (typeof JarvisMemoryManager !== "undefined") {
      JarvisMemoryManager.ensureMasterDatasetLoaded()
        .then(() => JarvisMemoryManager.getMemoryStats())
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: "Memory manager module not loaded" });
    }
    return true;
  }

  if (message.action === "MEMORY_CLEAR_CACHE") {
    if (typeof JarvisMemoryManager !== "undefined") {
      JarvisMemoryManager.clearMemoryCache()
        .then(() => JarvisMemoryManager.getMemoryStats())
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: "Memory manager module not loaded" });
    }
    return true;
  }

  if (message.action === "MEMORY_UPLOAD_FILE") {
    (async () => {
      try {
        if (typeof JarvisMemoryManager === "undefined") {
          throw new Error("Memory manager module not loaded");
        }
        const { fileName, fileType, fileSize, content } = message;
        const fileId = "file_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
        let entries = [];

        const lowerName = (fileName || "").toLowerCase();
        if (fileType === "json" || lowerName.endsWith(".json")) {
          entries = JarvisMemoryManager.parseSurveyJson(content, fileName, fileId);
        } else if (fileType === "csv" || lowerName.endsWith(".csv")) {
          entries = JarvisMemoryManager.parseSurveyCsv(content, fileName, fileId);
        } else if (fileType === "pdf" || lowerName.endsWith(".pdf")) {
          let buffer = content;
          if (typeof content === "string") {
            const base64Data = content.replace(/^data:application\/pdf;base64,/, "");
            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            buffer = bytes.buffer;
          }
          entries = await JarvisMemoryManager.parseSurveyPdf(buffer, fileName, fileId);
        } else {
          entries = JarvisMemoryManager.parseSurveyTxt(content, fileName, fileId);
        }

        if (!entries || entries.length === 0) {
          throw new Error("ফাইলটিতে কোনো উপযুক্ত প্রশ্ন ও উত্তরের ডাটা শনাক্ত করা যায়নি।");
        }

        await JarvisMemoryManager.saveKnowledgeFile(fileId, fileName, fileType || "txt", fileSize || 0, entries);
        const stats = await JarvisMemoryManager.getMemoryStats();
        sendResponse({ success: true, fileId, fileName, count: entries.length, stats });
      } catch (err) {
        sendResponse({ success: false, error: err.message || String(err) });
      }
    })();
    return true;
  }

  if (message.action === "MEMORY_GET_FILES") {
    if (typeof JarvisMemoryManager !== "undefined") {
      JarvisMemoryManager.getKnowledgeFiles()
        .then((files) => sendResponse({ success: true, files }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: "Memory manager module not loaded" });
    }
    return true;
  }

  if (message.action === "MEMORY_REMOVE_FILE") {
    if (typeof JarvisMemoryManager !== "undefined") {
      JarvisMemoryManager.removeKnowledgeFile(message.fileId)
        .then(() => JarvisMemoryManager.getMemoryStats())
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: "Memory manager module not loaded" });
    }
    return true;
  }

  if (message.action === "MEMORY_CLEAR_ALL_FILES") {
    if (typeof JarvisMemoryManager !== "undefined") {
      JarvisMemoryManager.clearAllKnowledgeFiles()
        .then(() => JarvisMemoryManager.getMemoryStats())
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: "Memory manager module not loaded" });
    }
    return true;
  }

  if (message.action === "SAVE_MEMORY_SETTINGS") {
    const toSet = {};
    if (message.memoryApiKey !== undefined) toSet.memoryApiKey = message.memoryApiKey.trim();
    if (message.memoryProvider !== undefined) toSet.memoryProvider = message.memoryProvider;
    chrome.storage.local.set(toSet).then(() => {
      sendResponse({ success: true });
    });
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
  } catch (e) {
    // Ping failed, inject below
  }

  // 1. Inject main frame first (guaranteed to succeed on all accessible pages)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content/content_script.js"]
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ["content/overlay.css"]
    });
  } catch (err) {
    console.warn("Main frame injection note:", err);
  }

  // 2. Also try nested survey frames safely
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["content/content_script.js"]
    });
  } catch (e) {}

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 120));
    try {
      const pingRes = await chrome.tabs.sendMessage(tabId, { action: "PING" });
      if (pingRes && pingRes.pong) return true;
    } catch (err) {}
  }
  return true;
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
  const isScreenshot = !!(payload && (payload.screenshot || payload.isScreenshot));
  const questions = payload?.questions || [];

  // =========================================================================
  // STEP 1A: CHECK KNOWLEDGE BASE & LOCAL MEMORY CACHE BEFORE ANY API CALL
  // =========================================================================
  let memoryResolution = null;
  if (!isScreenshot && questions.length > 0 && typeof JarvisMemoryManager !== "undefined") {
    try {
      memoryResolution = await JarvisMemoryManager.resolveSurveyQuestions(questions);
      console.log(`[Jarvis Memory] Checked ${questions.length} questions: ${memoryResolution.resolvedAnswers.length} hits, ${memoryResolution.missingQuestions.length} misses`);
    } catch (e) {
      console.warn("[Jarvis ServiceWorker] Memory resolution error:", e);
    }
  }

  // =========================================================================
  // STEP 1B: HERMES AI LOCAL AGENT — Zero-cost offline rule-based answering
  //          Runs on questions NOT already resolved by Memory Cache / KB
  //          Priority: Memory/KB → Hermes → Gemini/OpenRouter API
  // =========================================================================
  let hermesResolution = null;
  const questionsAfterMemory = (!isScreenshot && memoryResolution)
    ? memoryResolution.missingQuestions
    : (!isScreenshot ? questions : []);

  if (!isScreenshot && questionsAfterMemory.length > 0 && typeof HermesAgent !== "undefined") {
    try {
      hermesResolution = HermesAgent.resolveQuestions(questionsAfterMemory);
      console.log(`[Hermes AI] Resolved ${hermesResolution.hitCount}/${questionsAfterMemory.length} questions offline (${hermesResolution.missCount} need API)`);
    } catch (e) {
      console.warn("[Jarvis ServiceWorker] Hermes resolution error:", e);
    }
  }

  // =========================================================================
  // CHECK FULL OFFLINE HIT: Memory + Hermes covered everything → 0 API calls
  // =========================================================================
  const memAnswers = (memoryResolution && memoryResolution.resolvedAnswers) ? memoryResolution.resolvedAnswers : [];
  const hermesAnswers = (hermesResolution && hermesResolution.resolvedAnswers) ? hermesResolution.resolvedAnswers : [];
  const allOfflineAnswers = [...memAnswers, ...hermesAnswers];

  // Sort by original question index
  allOfflineAnswers.sort((a, b) => (a.question_index || 0) - (b.question_index || 0));

  const hermesFullCover = hermesResolution && hermesResolution.allHit;
  const memFullCover = memoryResolution && memoryResolution.allHit;

  // 1C. COMPLETE OFFLINE HIT: All questions answered without any API call!
  if (!isScreenshot && allOfflineAnswers.length === questions.length && questions.length > 0) {
    // Record cache/KB hits
    if (memoryResolution && memoryResolution.cacheHitCount > 0) {
      for (let c = 0; c < memoryResolution.cacheHitCount; c++) await JarvisMemoryManager.recordHit("cache");
    }
    if (memoryResolution && memoryResolution.kbHitCount > 0) {
      for (let k = 0; k < memoryResolution.kbHitCount; k++) await JarvisMemoryManager.recordHit("kb");
    }
    if (hermesAnswers.length > 0 && typeof JarvisMemoryManager !== "undefined") {
      for (let h = 0; h < hermesAnswers.length; h++) await JarvisMemoryManager.recordHit("hermes");
    }

    // Determine label
    let providerLabel, summaryText;
    if (hermesAnswers.length > 0 && memAnswers.length > 0) {
      providerLabel = "Hermes AI + Memory Cache ⚡🤖";
      summaryText = "Answered by Hermes AI + Memory Cache ⚡🤖";
    } else if (hermesAnswers.length > 0) {
      providerLabel = "Hermes AI Local Agent 🤖";
      summaryText = "Answered by Hermes AI Local Agent 🤖";
    } else {
      const dominantSource = memoryResolution.dominantSource;
      if (dominantSource === "knowledge_base") {
        providerLabel = "Knowledge Base 📄";
        summaryText = "Answered from Knowledge Base 📄";
      } else if (dominantSource === "mixed_cache") {
        providerLabel = "Memory & KB ⚡📄";
        summaryText = "Answered from Memory Cache & Knowledge Base ⚡📄";
      } else {
        providerLabel = "Memory Cache ⚡";
        summaryText = "Answered from Memory Cache ⚡";
      }
    }

    const synthesizedData = {
      page_summary: `${summaryText} (0 API Calls, 100% Offline Instant)`,
      trap_detected: false,
      trap_alert_message: "",
      is_last_page: false,
      estimated_human_reading_seconds: 1,
      answers: allOfflineAnswers,
      is_screenshot_analysis: false,
      analyzed_at: Date.now(),
      page_title: payload.title || "",
      page_url: payload.url || "",
      model_used: hermesAnswers.length > 0 ? "Hermes Local Agent" : "Offline Local Matcher",
      provider_used: providerLabel,
      source: hermesAnswers.length > 0 ? "hermes" : (memoryResolution ? memoryResolution.dominantSource : "cache"),
      is_from_cache: true,
      hermes_hit_count: hermesAnswers.length,
      memory_hit_count: memAnswers.length
    };

    await chrome.storage.local.set({ lastAnalysisResult: synthesizedData });

    try {
      chrome.runtime.sendMessage({
        action: "SURVEY_ANALYSIS_UPDATED",
        data: synthesizedData
      }).catch(() => {});
    } catch (e) {}

    return {
      success: true,
      providerUsed: providerLabel,
      modelUsed: synthesizedData.model_used,
      source: synthesizedData.source,
      savedApiCall: true,
      data: synthesizedData
    };
  }

  // 1A (legacy). COMPLETE CACHE / KB HIT (no Hermes needed)
  if (memoryResolution && memoryResolution.allHit && memoryResolution.resolvedAnswers.length > 0 && hermesAnswers.length === 0) {
    const dominantSource = memoryResolution.dominantSource;
    let providerLabel = "Memory Cache ⚡";
    let summaryText = "Answered from Memory Cache ⚡";

    if (dominantSource === "knowledge_base") {
      providerLabel = "Knowledge Base 📄";
      summaryText = "Answered from Knowledge Base 📄";
    } else if (dominantSource === "mixed_cache") {
      providerLabel = "Memory & KB ⚡📄";
      summaryText = "Answered from Memory Cache & Knowledge Base ⚡📄";
    }

    if (memoryResolution.cacheHitCount > 0) {
      for (let c = 0; c < memoryResolution.cacheHitCount; c++) await JarvisMemoryManager.recordHit("cache");
    }
    if (memoryResolution.kbHitCount > 0) {
      for (let k = 0; k < memoryResolution.kbHitCount; k++) await JarvisMemoryManager.recordHit("kb");
    }

    const synthesizedData = {
      page_summary: `${summaryText} (0 API Calls, 100% Offline Instant)`,
      trap_detected: false,
      trap_alert_message: "",
      is_last_page: false,
      estimated_human_reading_seconds: 1,
      answers: memoryResolution.resolvedAnswers,
      is_screenshot_analysis: false,
      analyzed_at: Date.now(),
      page_title: payload.title || "",
      page_url: payload.url || "",
      model_used: "Offline Local Matcher",
      provider_used: providerLabel,
      source: dominantSource,
      is_from_cache: true
    };

    await chrome.storage.local.set({ lastAnalysisResult: synthesizedData });

    try {
      chrome.runtime.sendMessage({
        action: "SURVEY_ANALYSIS_UPDATED",
        data: synthesizedData
      }).catch(() => {});
    } catch (e) {}

    return {
      success: true,
      providerUsed: providerLabel,
      modelUsed: "Offline Local Matcher",
      source: dominantSource,
      savedApiCall: true,
      data: synthesizedData
    };
  }

  // =========================================================================
  // STEP 2: CACHE MISS OR PARTIAL HIT -> CALL GEMINI / OPENROUTER API
  // =========================================================================
  const storage = await chrome.storage.local.get([
    "geminiApiKey",
    "geminiApiKey2",
    "geminiApiKey3",
    "geminiModel",
    "openRouterApiKey",
    "openRouterApiKey2",
    "openRouterApiKey3",
    "openRouterModel",
    "torveAiApiKey",
    "torveAiApiKey2",
    "torveAiApiKey3",
    "torveAiModel",
    "providerPriority",
    "useOpenRouter",
    "useTorveAi",
    "surveyPersona",
    "personalInfo"
  ]);

  // Extract all Gemini keys
  const geminiKeys = [
    { key: (storage.geminiApiKey || "").trim(), label: "Gemini Key 1" },
    { key: (storage.geminiApiKey2 || "").trim(), label: "Gemini Key 2" },
    { key: (storage.geminiApiKey3 || "").trim(), label: "Gemini Key 3" }
  ].filter(k => k.key.length > 0);

  // Extract all OpenRouter keys
  const openRouterKeys = [
    { key: (storage.openRouterApiKey || "").trim(), label: "OpenRouter Key 1" },
    { key: (storage.openRouterApiKey2 || "").trim(), label: "OpenRouter Key 2" },
    { key: (storage.openRouterApiKey3 || "").trim(), label: "OpenRouter Key 3" }
  ].filter(k => k.key.length > 0);

  // Extract all Torve AI keys
  const torveAiKeys = [
    { key: (storage.torveAiApiKey || "").trim(), label: "Torve AI Key 1" },
    { key: (storage.torveAiApiKey2 || "").trim(), label: "Torve AI Key 2" },
    { key: (storage.torveAiApiKey3 || "").trim(), label: "Torve AI Key 3" }
  ].filter(k => k.key.length > 0);

  if (geminiKeys.length === 0 && openRouterKeys.length === 0 && torveAiKeys.length === 0) {
    throw new Error("❌ কোনো API Key পাওয়া যায়নি! Settings থেকে Gemini, OpenRouter অথবা Torve AI API Key দিন, অথবা Knowledge Base ফাইল যোগ করুন।");
  }

  const priority = storage.providerPriority || "gemini_first";
  const selectedGeminiModel = resolveGeminiModelName(storage.geminiModel || "gemini-3.8-flash");
  const selectedOrModel = storage.openRouterModel || "google/gemini-2.5-flash";
  const selectedTorveModel = storage.torveAiModel || "claude-opus-4-8";

  let attemptPipeline = [];

  const geminiAttempts = geminiKeys.map(k => ({
    provider: "gemini",
    key: k.key,
    label: k.label,
    model: selectedGeminiModel
  }));

  const openRouterAttempts = (storage.useOpenRouter !== false) ? openRouterKeys.map(k => ({
    provider: "openrouter",
    key: k.key,
    label: k.label,
    model: selectedOrModel
  })) : [];

  const torveAiAttempts = (storage.useTorveAi !== false) ? torveAiKeys.map(k => ({
    provider: "torveai",
    key: k.key,
    label: k.label,
    model: selectedTorveModel
  })) : [];

  if (priority === "torveai_first") {
    attemptPipeline = [...torveAiAttempts, ...geminiAttempts, ...openRouterAttempts];
  } else if (priority === "openrouter_first") {
    attemptPipeline = [...openRouterAttempts, ...geminiAttempts, ...torveAiAttempts];
  } else if (priority === "torveai_only") {
    attemptPipeline = [...torveAiAttempts];
  } else if (priority === "openrouter_only") {
    attemptPipeline = [...openRouterAttempts];
  } else if (priority === "gemini_only") {
    attemptPipeline = [...geminiAttempts];
  } else {
    // gemini_first (default)
    attemptPipeline = [...geminiAttempts, ...openRouterAttempts, ...torveAiAttempts];
  }

  const persona = storage.surveyPersona || {};
  const personalInfo = storage.personalInfo || null;

  let base64Image = null;
  let fullDataUrl = null;

  if (isScreenshot && payload.screenshot) {
    fullDataUrl = payload.screenshot;
    base64Image = payload.screenshot.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  }

  // If partial offline hit: send ONLY remaining missing questions to AI API
  // This dramatically reduces API usage — only truly unknown questions go to API
  const originalQuestions = payload.questions || [];
  let apiPayload = payload;

  // Determine remaining questions after Memory + Hermes
  const remainingAfterHermes = hermesResolution ? hermesResolution.missingQuestions : questionsAfterMemory;
  const allOfflineResolvedSoFar = [...memAnswers, ...hermesAnswers];

  if (!isScreenshot && remainingAfterHermes.length > 0 && allOfflineResolvedSoFar.length > 0) {
    apiPayload = Object.assign({}, payload, {
      questions: remainingAfterHermes
    });
    console.log(`[Jarvis API] Sending only ${remainingAfterHermes.length}/${originalQuestions.length} questions to API (${allOfflineResolvedSoFar.length} answered offline by Hermes/Memory)`);
  } else if (!isScreenshot && hermesResolution && hermesResolution.missingQuestions.length > 0 && memAnswers.length === 0) {
    // Hermes missed some and no memory hits either
    apiPayload = Object.assign({}, payload, {
      questions: hermesResolution.missingQuestions
    });
  }

  const prompt = isScreenshot
    ? buildVisionSurveyPrompt(apiPayload, persona, personalInfo)
    : buildHumanLikeSurveyPrompt(apiPayload, persona, personalInfo);

  let result = null;
  let lastError = null;

  for (let i = 0; i < attemptPipeline.length; i++) {
    const attempt = attemptPipeline[i];
    try {
      console.log(`[Jarvis AI] Attempting analysis with [${attempt.label}] model: ${attempt.model}...`);

      if (attempt.provider === "gemini") {
        result = await callGeminiAPI(attempt.key, attempt.model, prompt, base64Image);
      } else if (attempt.provider === "torveai") {
        result = await callTorveAiAPI(attempt.key, attempt.model, prompt, fullDataUrl);
      } else {
        result = await callOpenRouterAPI(attempt.key, attempt.model, prompt, fullDataUrl);
      }

      if (result && result.data) {
        result.providerUsed = attempt.label;
        result.modelUsed = result.modelUsed || attempt.model;
        break; // Success!
      }
    } catch (err) {
      lastError = err;
      console.warn(`[Jarvis AI] ⚠️ ${attempt.label} (${attempt.model}) failed: ${err.message}`);

      if (i < attemptPipeline.length - 1) {
        const nextAttempt = attemptPipeline[i + 1];
        const failoverMsg = `⚠️ ${attempt.label} লিমিট/ত্রুটি (${err.message.slice(0, 50)}...)। স্বয়ংক্রিয়ভাবে ${nextAttempt.label} এ সুইচ করা হচ্ছে...`;
        console.warn(`[Jarvis AI Failover] ${failoverMsg}`);

        try {
          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              action: "API_FAILOVER_NOTIFICATION",
              failedLabel: attempt.label,
              nextLabel: nextAttempt.label,
              message: failoverMsg
            }).catch(() => {});
          }
        } catch (e) {}
      }
    }
  }

  if (!result || !result.data) {
    throw lastError || new Error("❌ সব Gemini ও OpenRouter API Key এর প্রচেষ্টা ব্যর্থ হয়েছে। Settings থেকে সঠিক Key দিন।");
  }

  // =========================================================================
  // STEP 3: CACHE NEWLY GENERATED QA PAIRS & MERGE RESOLVED ANSWERS
  // =========================================================================
  const rawApiAnswers = result.data.answers || [];

  // Tag newly generated answers as API
  for (const ans of rawApiAnswers) {
    ans.source = "api";
    ans.model_used = result.modelUsed;
  }

  // Save new answers to Local Memory Cache immediately
  if (typeof JarvisMemoryManager !== "undefined") {
    for (const ans of rawApiAnswers) {
      try {
        const matchingQ = (apiPayload.questions || []).find((q) => q.index === ans.question_index || q.text === ans.question_text);
        const qText = ans.question_text || matchingQ?.text || "";
        const qOpts = matchingQ?.options || [];
        if (qText) {
          await JarvisMemoryManager.saveToCache(qText, qOpts, ans, "api");
        }
      } catch (e) {
        console.warn("[Jarvis ServiceWorker] Error saving QA to cache:", e);
      }
    }
    await JarvisMemoryManager.recordHit("api");
  }

  // Merge with offline answers (Memory + Hermes) if partial offline hit occurred
  if (!isScreenshot && allOfflineResolvedSoFar.length > 0) {
    if (typeof JarvisMemoryManager !== "undefined") {
      if (hermesAnswers.length > 0) {
        for (let h = 0; h < hermesAnswers.length; h++) await JarvisMemoryManager.recordHit("hermes");
      }
      if (memoryResolution && memoryResolution.cacheHitCount > 0) {
        for (let c = 0; c < memoryResolution.cacheHitCount; c++) await JarvisMemoryManager.recordHit("cache");
      }
      if (memoryResolution && memoryResolution.kbHitCount > 0) {
        for (let k = 0; k < memoryResolution.kbHitCount; k++) await JarvisMemoryManager.recordHit("kb");
      }
    }
    const combinedAnswers = [...allOfflineResolvedSoFar, ...rawApiAnswers];
    // Re-sort by original question index
    combinedAnswers.sort((a, b) => (a.question_index !== undefined ? a.question_index : 0) - (b.question_index !== undefined ? b.question_index : 0));
    result.data.answers = combinedAnswers;
    result.data.source = "mixed_api";
    const offlineLabel = hermesAnswers.length > 0 ? "Hermes AI 🤖 + Memory ⚡" : "Memory Cache ⚡";
    result.providerUsed = `${result.providerUsed} + ${offlineLabel}`;
    result.data.hermes_hit_count = hermesAnswers.length;
    result.data.memory_hit_count = memAnswers.length;
    result.data.api_question_count = rawApiAnswers.length;
  } else if (!isScreenshot && memoryResolution && memoryResolution.resolvedAnswers.length > 0) {
    const combinedAnswers = [...memoryResolution.resolvedAnswers, ...rawApiAnswers];
    combinedAnswers.sort((a, b) => (a.question_index !== undefined ? a.question_index : 0) - (b.question_index !== undefined ? b.question_index : 0));
    result.data.answers = combinedAnswers;
    result.data.source = "mixed_api";
    result.providerUsed = `${result.providerUsed} + Memory Cache ⚡`;
  } else {
    result.data.source = "api";
  }

  result.data.is_screenshot_analysis = isScreenshot;
  result.data.analyzed_at = Date.now();
  result.data.page_title = payload.title || "";
  result.data.page_url = payload.url || "";
  result.data.model_used = result.modelUsed;
  result.data.provider_used = result.providerUsed;

  await chrome.storage.local.set({ lastAnalysisResult: result.data });

  try {
    chrome.runtime.sendMessage({
      action: "SURVEY_ANALYSIS_UPDATED",
      data: result.data
    }).catch(() => {});
  } catch (e) {}

  return result;
}

/**
 * Constructs comprehensive prompt instructing Gemini 3.8 to generate natural, human-like survey answers
 * based strictly on the user's detailed persona & QA database.
 */
function buildHumanLikeSurveyPrompt(pageData, persona, personalInfo) {
  const p = personalInfo || DEFAULT_PERSONAL_INFO;
  return `You are answering an online survey as a real human respondent named ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}.
Your answers MUST sound completely natural, authentic, thoughtful, and human-like ("ans as a human"). Survey quality algorithms actively check for bot-like patterns, so follow the human guidelines below strictly.

=============================================================================
EXACT VERIFIED PERSONAL PROFILE & COMPREHENSIVE QA RULES (CRITICAL):
=============================================================================
--- PERSONAL & DEMOGRAPHICS ---
- Full Name: ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}
- First Name: ${p.firstName || "Al Amin"}
- Last Name: ${p.lastName || "Miah"}
- Gender: Male (Heterosexual / straight)
- Age: 50 (50 years old / Born 1976)
- Date of Birth: March 8, 1976 (08/03/1976 or 03/08/1976)
- Birth Year: 1976
- Address: 123 W 31st St, New York, NY 10001, United States
- Street: 123 W 31st St
- City: New York
- State / Region: New York / NY
- Zip / Postal Code: 10001
- Phone: 959-582-8149
- Email: ${p.emailAddress || "alaminmiah1976@gmail.com"}
- Marital Status: Married
- Wife Age: 40
- Children: Two (2) children under 18 (Boy: 13 years old, Girl: 12 years old)
- Household Size: 4 persons (Self, Wife, Son, Daughter)
- Household Type: Own house / single family house / detached house
- Language Spoken at Home: English all the time
- Race: White
- Hispanic / Latino Heritage: No Hispanic / Not Hispanic
- Education Level: Master's or Professional Degree / graduate / post-graduate (or Bachelor Degree)
- Voter Registration: Yes, registered to vote
- Politics: Republican / strong Republican
- Religion: Christian / Protestant / Roman Catholic

--- EMPLOYMENT & INDUSTRY ---
- Employment Status: Employed full-time (35/40+ hours per week)
- Job Title / Role / Responsibility: Information technology, computer software (Manager, Senior Management, Director, Chief Technology Officer)
- Department: Information technology, computer software
- Primary Industry: Information technology, computer software (Manager / Director / Senior Management / CTO)
- IT Function / Role: Computer software
- Spending & Purchasing Decision Authority: Marketing, Sales, Advertising, Financial Services, IT Hardware, IT Software (sole decision maker or primary influencer)
- Organization Annual Revenue: $50 - $99 Million (50-99 million)
- Organization Employee Count: 2,500 - 5,000 employees (all locations / worldwide)
- Household Members Industries: Information technology, computer software
- Screener Trap on Industry: If asked if anyone in household works in Market Research, Advertising, PR, Journalism, Construction, Education, or Healthcare -> ALWAYS select "None of the above" (IT only for Samplicio).
- Career Activities (past year): Asked for/provided career advice, used an online social network to advance career
- COVID-19 Employment Impact: No, my employment has not been affected by those policies.

--- HOUSEHOLD & FINANCES ---
- Annual Household Income Before Taxes: $125,000 - $149,999 (125000-149999) (Monthly: $5,000+ / Over $5,000)
- Household Investable Assets (excluding home): $500,000 - $999,999
- Credit Score (FICO Score): 750-800
- Mortgage: Obtained 3 to 6 months ago
- Financial Products Owned: Personal loan, Mortgage, Credit Card, Checking account, Savings account
- Lending Products Obtained in Past 24 Months: Personal Loan, Home Equity loan, Student Loan
- Bank Relationships: Bank of America, American Express
- Credit Cards Used: American Express, Discover, Master Card, Visa
- Credit Card Used Mostly: American Express
- Household Decisions Responsible For: Internet, Television, Banking, Automobile, Finance, Mortgage

--- AUTOMOTIVE ---
- Drives Regularly: Yes, I have a car
- Possess Driver's License: Yes
- Primary Decision Maker for Automotive: Yes
- Car Brands Owned or Leased: Audi, Nissan (Select Only 2)
- Car Model: Audi A 8 Sedan
- Vehicle Description / Type: Full Size, Mid-Size
- Year Purchased / Leased Main Vehicle: 2023
- Year Main Vehicle Manufactured: 2022
- Primary Vehicle Purchased Condition: New
- Own Motorcycle: Yes
- Estimate for Next Car Purchase / Lease: Two years from now / within 3-6 months (pick whichever is in options)

--- HEALTH & MEDICAL ---
- Smoker: Yes, I smoke (4 to 7 cigarettes a day)
- Quit Smoking Products Tried: Cold Turkey, Veep
- Diagnosed Illnesses / Conditions: Allergies (not associated with Hay Fever), Back Pain, Dental Problem, Depression, Diabetes (type 1), Smoking Addiction (If female, no smoking addiction)
- Diabetes Type: Diabetes 1 (Type 1)
- Cancer: I don't have cancer
- Hearing Aid: No
- Glasses or Contact Lenses: Yes
- Health Insurance: Self-insured
- Healthcare Activities (past 3 months): Video call, phone call, or text with a doctor
- Exercise / Sports Hours per Week: 05 to 07 hours (5 to 7 hours)

--- TECHNOLOGY & TELECOM ---
- Uses Smartphone: Yes
- Primary Smartphone Type: Samsung
- Primary Mobile Carrier: Verizon Wireless / AT&T
- Mobile Phone Plan: Pre-paid
- Primary Home Internet Service Provider: Verizon
- Home Internet Connection Type: Satellite, Wireless
- TV Provider at Primary Residence: AT&T U-verse / Cable (Xfinity)
- Early Adopter of New Technology: Yes (First to buy new gadgets)
- Webcam Available: Yes, I have a webcam (willing to use for online research)
- Online on Computer: Several times a day
- Devices Owned / Used: Blu-ray/DVD player, Portable game console (Sony PSP GO), Digital Camera, PC/Mac laptop or portable, Cell Phone, Cable TV/Satellite TV, Printer, 3D TV, Home Internet, Digital Media, Tablet (iPad), Desktop PC, Apple TV, Smart Phone, Speaker
- Subscriptions Owned: Connected Device for TV (Chromecast), Premium channels (HBO), Tablet (iPad), Smartphone (iPhone, Android), Video Streaming (Netflix), Video Games, Paid music (Spotify, Apple Music), Smart home system (Google Home, Alexa), Cable (Xfinity)
- Social Media Actively Used: Facebook, Instagram, Pinterest, YouTube, Snapchat, WhatsApp
- Social Media Frequency: Several times a day

--- SHOPPING, FOOD & BEVERAGES ---
- Purchasing Decision Maker: Yes / Sole decision maker (Daily purchases, Groceries, Electronics, Travel)
- Main Grocery Shopping: Walmart, Target, Aldi, Costco
- Online Retailers (past 30 days): Amazon, Best Buy, eBay, Target.com, Walmart.com
- Discount / Outlet Chains (past 12 months): Walmart, Target, Aldi
- Jeans Brands Bought (past 6 months): Levi's, Old Navy, American Eagle
- Services Utilized Regularly: Lyft, Grubhub, Airbnb, UberEATS, Uber, DoorDash
- Fast Food Frequency: 1 to 3 times in any given week
- Fast Casual Restaurants Visited (at least once every 3 months): Boston Market, Chipotle Mexican Grill, Five Guys Burgers & Fries, Firebirds, Friendly's, Jerry's Subs & Pizza, Jason's Deli, Panda Express, Skyline Chili, Smashburger, Wingstop, Zaxby's, Tim Hortons
- Fast Food Ever Visited: A&W Restaurants, Arby's, Burger King, Charley's Grilled Subs, Hungry Jacks, KFC, McDonald's, Panda Express, Pizza Hut, Subway, Taco Bell, Wendy's
- Beverages Consumed (past 4 weeks / regularly): Beer, Wine, Energy drinks, Coffee, Tea, Carbonated soft drinks, Fruit drinks/Juices, Bottled Water, Pre-mixed packaged spirits, Imported beer, Red Wine, White Wine, Champagne, Vodka, Flavoured liquor
- Alcoholic Drinks Consumed in a Week: 1 to 2 drinks
- Insurance Products Shopped (past 12 months): Health insurance, Homeowners insurance

--- GAMING, ENTERTAINMENT & TRAVEL ---
- Hobbies & Interests: Cooking, Fishing, Playing music, Playing video/computer games, Travel, Watch Sports on TV, Swimming, Hunting, Motorcycling, Biking
- Sports Regularly Participated In: Cricket, Basketball
- Video Games Hours per Week: 7 to 13 / or more hours
- Devices to Play Games: Played offline video games on Mobile, Gaming console
- How Video Games Played: With others in the same room, with others through an internet connection
- Video Game Genres: 1st Person Shooter/Action Call of Duty, 3rd Person Adventure, Point & Click Adventure, Sports/FIFA, Role playing Game, Massively Multiplayer online/Warcraft, Fighting/Street Fighter, Party Games/Casual Facebook Games
- Games Purchased per Month: 1 game
- DVDs / Blu-rays Purchased Monthly: 4 to 6
- Movie Theatre Frequency: Four or more times per month
- Movie Genres: Action, Animated, Children's films, Comedy, Drama, Horror, Musicals, Mystery, Science Fiction, Thriller
- Home Movies Rented/Downloaded: Three times per month
- TV Watched per Week: More than 10 hours
- Radio Listened per Week: 6 to 7 hours
- Current TV Shows Watched: The Dr Oz Show, Crossing Swords (Hulu), Cobra Kai, The Chi (Showtime S3), The Boys (Prime Video), Coyote (S1), S.W.A.T, The Crown on Netflix
- Publications Read: Computers & Electronics magazines, Cooking & food magazines, Entertainments, Fashion, Health & Fitness, Music, Science, Technology, Travel
- Magazines Read (every 1-2 months): Time, Vogue, Men's health, Food & wine, ESPN the Magazine, Entertainment weekly, Allure, Bloomberg BusinessWeek
- Podcasts Frequency: Every day or most days
- Podcast Genres: Society & Culture, Music, Education, Government & Organizations, TV & Film, Health, Science & Medicine, Technology, Sports & recreation, Kids & Family
- Vacation / Holidays Usually: Visiting Friends & Family, Boating/Fishing
- Activities in Past Month: Rented a car, Stayed in a hotel
- Accommodation Past Year: 4-star Hotel, 5-star hotel
- Travel Purpose: Both, Leisure and Business
- Fly for Business: Once every 2-4 months
- Flights Booked Online (past year): 7 to 9
- Flight Types: Both domestic and international
- Domestic Airlines (past 12 months): United Airlines, Delta Air Lines, JetBlue, Virgin Atlantic
- International Airlines (past 12 months): Singapore Airlines, EgyptAir, Emirates, Air Canada
- Countries Travelled (past 12 months): Australia, Japan, North America

--- CRITICAL SCREENER & TRAP RULES ---
- "Have you participated in a market research study within past 2 weeks": Always "No".
- "Have you done any online research in last week / last month": Always "No".
- "Are you and your partner expecting a baby": Always "No".
- "Do you work in Market Research / Advertising / PR / Journalism": Always "None of the above" or "IT / Computer Software".
- "Attention Check / Trap": If the question says "Select option 2", "Choose strongly agree to confirm you are reading", or "Select the color blue", STRICTLY OBEY THAT INSTRUCTION!

=============================================================================
SURVEY PAGE CONTEXT (Top-to-Bottom Scanned DOM):
=============================================================================
URL: ${pageData.url || "N/A"}
Page Title: ${pageData.title || "N/A"}

Scanned Page Text:
${(pageData.fullPageText || "").slice(0, 6000)}

Structured Survey Questions & Interactive Form Elements:
${JSON.stringify(pageData.questions, null, 2)}

=============================================================================
OUTPUT INSTRUCTIONS:
=============================================================================
1. You MUST generate an answer for EVERY SINGLE question listed. Do not skip any!
2. In "selected_labels", provide the EXACT string of the choice option as written in the question's options list or visible on page so it can be clicked.
3. In "target_element_ids", provide the exact element ID from options if available.
4. For text inputs, provide natural, realistic 1-2 sentences in first-person human voice ("ans as a human").
5. Return ONLY a valid JSON object matching this exact structure:
{
  "page_summary": "1-sentence summary of survey topic",
  "trap_detected": false,
  "trap_alert_message": "",
  "is_last_page": false,
  "estimated_human_reading_seconds": 3,
  "answers": [
    {
      "question_index": 0,
      "question_id": "element-id-if-known",
      "question_text": "Exact text of the question",
      "recommended_action": "select_radio" | "select_checkbox" | "select_dropdown" | "type_text" | "matrix_choice",
      "target_element_ids": ["opt-id-1"],
      "selected_labels": ["Exact Label Text As Displayed On Page"],
      "text_input_value": null,
      "reasoning": "Fits verified human persona profile"
    }
  ]
}
Return valid JSON only. Do not wrap in markdown or commentary.`;
}

/**
 * Constructs vision prompt for Gemini Vision / OpenRouter Vision when DOM analysis cannot find elements
 */
function buildVisionSurveyPrompt(pageData, persona, personalInfo) {
  const p = personalInfo || DEFAULT_PERSONAL_INFO;
  return `You are analyzing a complete full-page survey screenshot as a real human respondent named ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}.
Answer strictly according to the verified human profile below ("ans as a human").

=============================================================================
VERIFIED RESPONDENT PROFILE & KEY ANSWERS:
=============================================================================
- Full Name: ${p.firstName || "Al Amin"} ${p.lastName || "Miah"} | Male (Heterosexual / straight) | Age: 50 (Born March 8, 1976 / 1976)
- Location: 123 W 31st St, New York, NY 10001 | English spoken at home | Own single family home
- Household: Married, Wife 40, Two kids under 18 (Boy 13, Girl 12). Total: 4 persons
- Race: White | Not Hispanic/Latino | Education: Master's or Professional Degree (or Bachelor)
- Politics: Republican / strong Republican | Registered voter: Yes | Religion: Christian / Protestant / Roman Catholic
- Employment: Employed full-time (35+ hrs) | IT / Computer Software (Manager / Director / CTO) | 2500-5000 employees | $50-$99M revenue
- Spending authority: Marketing, Sales, Advertising, Financial Services, IT Hardware, IT Software
- Screener Trap: If asked about household working in Advertising, PR, Market Research -> select "None of the above"
- Income: $125,000 - $149,999 before taxes (125000-149999) | FICO score: 750-800 | Investable assets: $500,000 - $999,999
- Cars: Audi, Nissan (Select Only 2) | Audi A 8 Sedan | Full Size / Mid-Size | Purchased 2023 (New), manufactured 2022 | Motorcycle: Yes | Next car: Two years from now / within 3-6 months
- Health: Smoker (Yes, 4-7 cigarettes/day; Quit: Cold Turkey, Veep) | Conditions: Allergies, Back Pain, Dental, Depression, Diabetes (Type 1), Smoking Addiction | Cancer: I don't have cancer | Hearing aid: No | Glasses: Yes | Health insurance: Self-insured
- Technology: Samsung phone (Verizon Wireless/AT&T, Pre-paid) | Verizon home internet | AT&T U-verse TV | Early adopter: Yes | Webcam: Yes | Devices: PC/Mac laptop, Tablet (iPad), Smartphone, Smart TV, Gaming console
- Groceries: Walmart, Target, Aldi, Costco | Purchasing authority: Yes (Sole decision maker)
- Fast Food: 1-3 times/week | Visited: McDonald's, Burger King, KFC, Subway, Wendy's, Panda Express, Taco Bell, Chipotle, Five Guys
- Drinks: Beer, Wine, Energy drinks, Coffee, Tea, Bottled water, Pre-mixed spirits, Soft drinks | 1-2 alcohol drinks/week
- Gaming & Movies: 7-13+ hrs/week video games (Call of Duty, FIFA, Warcraft) | Movies: 4+ times/month (Action, Comedy, Sci-Fi)
- Travel: Sole decision maker | Leisure & Business | Domestic: Delta, United, JetBlue | International: Singapore Airlines, Emirates | Hotels: 4-star, 5-star
- Screeners: Market research in past 2 weeks: No | Online research: No | Expecting baby: No
- Attention Check Traps: Obey the exact instructions (e.g., "Select blue", "Choose somewhat disagree")!

=============================================================================
VISION ANALYSIS INSTRUCTIONS:
=============================================================================
1. Read all visual text, questions, options, radio buttons, checkboxes, dropdowns, and input boxes visible in the screenshot.
2. For EVERY question visible in the image, pick the exact option matching the respondent profile above.
3. In "selected_labels", write the EXACT text of the option as printed on screen so the extension can find and click it on the page.
4. Detect if this is the last page (Submit/Finish/Complete button, or 100% progress).
5. Return ONLY a valid JSON object matching this exact structure:
{
  "page_summary": "1-sentence summary of survey topic",
  "trap_detected": false,
  "trap_alert_message": "",
  "is_last_page": false,
  "estimated_human_reading_seconds": 3,
  "answers": [
    {
      "question_index": 0,
      "question_text": "Exact text of the question as seen in image",
      "recommended_action": "select_radio" | "select_checkbox" | "select_dropdown" | "type_text" | "matrix_choice",
      "selected_labels": ["Exact Visible Text of Chosen Option"],
      "text_input_value": null,
      "reasoning": "Fits verified human persona profile"
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
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s fast timeout for instant answers

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

          if (response.status === 400) {
            const isInvalidKey = errorText.includes("API_KEY_INVALID") || errorText.includes("keyInvalid");
            if (isInvalidKey) {
              const err = new Error("Gemini API Key Error (400): API Key সঠিক নয় বা অবৈধ");
              err.isKeyError = true;
              throw err;
            }
          }

          if (response.status === 403) {
            const isDenied = errorText.includes("denied access") || errorText.includes("PERMISSION_DENIED");
            const msg = isDenied
              ? "Google Gemini 403: প্রজেক্টে অ্যাক্সেস বন্ধ বা অনুমতি নেই"
              : "Gemini API Key Error (403): সঠিক নয় বা পারমিশন নেই";
            const err = new Error(msg);
            err.isKeyError = true;
            throw err;
          }

          if (response.status === 429) {
            console.warn(`[Jarvis] Quota/Rate limit (429) on ${targetModel}, seamlessly trying next model in chain...`);
            lastError = new Error(`Quota/Rate limit (429) on ${targetModel}`);
            break; // Seamlessly try next candidate model (e.g. gemini-3.7-flash)!
          }

          if (response.status === 404) {
            console.warn(`[Jarvis] Model ${targetModel} not found (404), trying next model in chain...`);
            lastError = new Error(`Model ${targetModel} not found (404)`);
            break; // next candidate model
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
        if (err.isQuota || err.isKeyError) throw err;
        if (err.name === "AbortError") {
          console.warn(`[Jarvis] ⏱️ Timeout (12s) on ${targetModel}, switching to next candidate model...`);
          lastError = new Error(`Timeout (12s) on ${targetModel}`);
          break;
        }
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
      max_tokens: 2048,
      response_format: { type: "json_object" }
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);

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
            const err = new Error(`OpenRouter Key Error (${response.status})`);
            err.isKeyError = true;
            throw err;
          }

          if (response.status === 429 || response.status === 402) {
            const err = new Error(`OpenRouter Quota/Limit Reached (${response.status})`);
            err.isQuota = true;
            throw err;
          }

          if (response.status === 404) {
            lastError = new Error(`OpenRouter model ${orModel} not found (404)`);
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
        if (err.isQuota || err.isKeyError) throw err;
        if (err.name === "AbortError") {
          lastError = new Error(`OpenRouter timeout (28s) on ${orModel}`);
          break;
        }
        lastError = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  throw lastError || new Error("❌ OpenRouter এর সব মডেল ব্যর্থ হয়েছে। দয়া করে API Key ও ব্যালেন্স চেক করুন।");
}

/**
 * Calls Torve AI API (OpenAI-compatible gateway: https://api.torveai.com/v1)
 * Supports claude-opus-4-8 (Free monthly frontier model), claude-opus-5, gpt-5.2, deepseek-v4, etc.
 */
async function callTorveAiAPI(apiKey, model, promptText, base64Image = null) {
  const endpoint = "https://api.torveai.com/v1/chat/completions";
  const primaryModel = model || "claude-opus-4-8";

  const candidateModels = [
    primaryModel,
    "claude-opus-4-8",
    "gpt-5.2-mini",
    "deepseek-v4",
    "claude-opus-5"
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError = null;

  for (const torveModel of candidateModels) {
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

    // Try first with response_format json_object, fallback if not supported
    const formatConfigs = [
      { response_format: { type: "json_object" } },
      {}
    ];

    for (let fIdx = 0; fIdx < formatConfigs.length; fIdx++) {
      const requestBody = {
        model: torveModel,
        messages: [{ role: "user", content: userContent }],
        temperature: 0.15,
        max_tokens: 2048,
        ...formatConfigs[fIdx]
      };

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 18000);

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
            console.warn(`[Jarvis TorveAI] ${torveModel} attempt ${attempt + 1} failed (${response.status}):`, errorText);

            if (response.status === 401 || response.status === 403) {
              const err = new Error(`Torve AI Key Error (${response.status})`);
              err.isKeyError = true;
              throw err;
            }

            if (response.status === 429 || response.status === 402) {
              const err = new Error(`Torve AI Quota/Limit Reached (${response.status})`);
              err.isQuota = true;
              throw err;
            }

            if (response.status === 400 && fIdx === 0) {
              // response_format might be rejected by model, break attempt and try standard without response_format
              break;
            }

            if (response.status === 404) {
              lastError = new Error(`Torve AI model ${torveModel} not found (404)`);
              break; // try next candidate model
            }

            if (response.status === 503 && attempt === 0) {
              await new Promise((r) => setTimeout(r, 1200));
              continue;
            }

            lastError = new Error(`Torve AI API Error (${torveModel}): ${response.status} - ${errorText.slice(0, 180)}`);
            break;
          }

          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (!content) {
            lastError = new Error(`Empty response from Torve AI: ${torveModel}`);
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
                parsed = { page_summary: "Survey analysis completed via Torve AI", trap_detected: false, answers: [] };
              }
            } else {
              parsed = { page_summary: "Survey analysis completed via Torve AI", trap_detected: false, answers: [] };
            }
          }

          console.log(`[Jarvis] ✅ Torve AI Success with model: ${torveModel}`);
          return {
            success: true,
            modelUsed: `TorveAI:${torveModel}`,
            data: parsed
          };
        } catch (err) {
          if (err.isQuota || err.isKeyError) throw err;
          if (err.name === "AbortError") {
            lastError = new Error(`Torve AI timeout (18s) on ${torveModel}`);
            break;
          }
          lastError = err;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
        }
      }

      // If we got success, we already returned. If it wasn't a 400, don't repeat formatConfigs.
      if (lastError && !lastError.message.includes("400")) {
        break;
      }
    }
  }

  throw lastError || new Error("❌ Torve AI এর সব মডেল ব্যর্থ হয়েছে। দয়া করে API Key ও একাউন্ট চেক করুন।");
}
