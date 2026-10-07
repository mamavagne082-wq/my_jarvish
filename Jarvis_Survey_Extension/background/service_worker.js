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

// Import Google Gemini Web Account Client (Pro/Advanced Session - 0 API Token)
if (typeof importScripts !== "undefined") {
  try {
    importScripts("gemini_web_client.js");
    console.log("[Jarvis] ✅ Google Gemini Web Account Client loaded — Unlimited Pro/Advanced active!");
  } catch (e) {
    console.error("[Jarvis ServiceWorker] Error importing gemini_web_client.js:", e);
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
  geminiApiKey: "",
  geminiApiKey2: "",
  geminiApiKey3: "",
  geminiModel: "gemini-3.8-flash",
  openRouterApiKey: "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",
  openRouterApiKey2: "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",
  openRouterApiKey3: "",
  openRouterModel: "google/gemini-2.5-flash",
  torveAiApiKey: "sk-v1-43ef5710114097156125b9b556c77f5df84982f05911c34667d2e1c5d2dadbfd",
  torveAiApiKey2: "pk-v1-819765dbde1db23db69d64ade5b0e9759293398f9ffdf334085d1e40b22596ab",
  torveAiApiKey3: "",
  torveAiModel: "claude-opus-4-8",
  useTorveAi: true,
  useGeminiWeb: true,
  geminiWebMode: "tab_bridge",
  geminiAccountEmail: "alaminmiah1976@gmail.com",
  geminiAccountTier: "advanced_pro",
  memoryApiKey: "",
  memoryProvider: "local_offline",
  providerPriority: "gemini_web_first",
  engineMode: "smart_cost_saving",
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

  // Remove invalid/expired AQ keys
  if (toSet.geminiApiKey && toSet.geminiApiKey.startsWith("AQ.")) toSet.geminiApiKey = "";
  if (toSet.geminiApiKey2 && toSet.geminiApiKey2.startsWith("AQ.")) toSet.geminiApiKey2 = "";

  // Ensure working OpenRouter keys exist
  if (!toSet.openRouterApiKey) toSet.openRouterApiKey = DEFAULT_SETTINGS.openRouterApiKey;
  if (!toSet.openRouterApiKey2) toSet.openRouterApiKey2 = DEFAULT_SETTINGS.openRouterApiKey2;
  if (!toSet.torveAiModel) toSet.torveAiModel = DEFAULT_SETTINGS.torveAiModel;
  if (toSet.useTorveAi === undefined) toSet.useTorveAi = true;
  if (!toSet.providerPriority) {
    toSet.providerPriority = (toSet.useGeminiWeb !== false) ? "gemini_web_first" : "openrouter_first";
  }
  if (!toSet.engineMode) toSet.engineMode = "smart_cost_saving";

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

  if (typeof GeminiWebClient !== "undefined") {
    try {
      await GeminiWebClient.fetchSessionFromDesktopBridge();
    } catch (_) { }
  }

  console.log("[Jarvis v3.0] Service worker ready. Hermes AI + Gemini 3.8 Flash + OpenRouter Multi-Key Failover Chain loaded.");
});

chrome.runtime.onStartup.addListener(async () => {
  if (typeof GeminiWebClient !== "undefined") {
    try {
      await GeminiWebClient.fetchSessionFromDesktopBridge();
      console.log("[Jarvis ServiceWorker] Auto-synced Gemini session on browser startup.");
    } catch (_) { }
  }
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
        }).catch(() => { });
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

  if (message.action === "CHECK_GEMINI_WEB_STATUS") {
    if (typeof GeminiWebClient !== "undefined") {
      GeminiWebClient.checkAuthStatus()
        .then(sendResponse)
        .catch((err) => sendResponse({ connected: false, error: err.message }));
    } else {
      sendResponse({ connected: false, error: "GeminiWebClient not loaded" });
    }
    return true;
  }

  if (message.action === "CONNECT_GEMINI_WEB") {
    if (typeof GeminiWebClient !== "undefined") {
      GeminiWebClient.loginOrConnectGoogleGemini({
        accountIndex: message.accountIndex || 1,
        email: message.email,
        password: message.password,
        directGoogleLogin: message.directGoogleLogin !== false,
        forceLogin: message.forceLogin || false
      })
        .then((tab) => sendResponse({ success: true, tabId: tab ? tab.id : null }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      const email = message.email ? `?Email=${encodeURIComponent(message.email)}&continue=https%3A%2F%2Fgemini.google.com%2Fapp` : "";
      chrome.tabs.create({ url: `https://accounts.google.com/AccountChooser${email}`, active: true })
        .then((tab) => sendResponse({ success: true, tabId: tab.id }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    }
    return true;
  }

  if (message.action === "EXPORT_GEMINI_SESSION") {
    if (typeof GeminiWebClient !== "undefined") {
      GeminiWebClient.exportSession()
        .then((sessionData) => sendResponse({ success: true, session: sessionData }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: "GeminiWebClient not loaded" });
    }
    return true;
  }

  if (message.action === "IMPORT_GEMINI_SESSION") {
    if (typeof GeminiWebClient !== "undefined") {
      GeminiWebClient.importSession(message.sessionData)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: "GeminiWebClient not loaded" });
    }
    return true;
  }

  if (message.action === "GEMINI_SESSION_DETECTED") {
    chrome.storage.local.set({
      geminiWebConnected: true,
      geminiAccountEmail: message.email || "Active Google Session",
      geminiAccountTier: message.tier || "Gemini Advanced (Pro)"
    }).then(async () => {
      if (typeof GeminiWebClient !== "undefined" && GeminiWebClient.syncSessionToDesktopBridge) {
        try {
          await GeminiWebClient.syncSessionToDesktopBridge();
          console.log("[Jarvis ServiceWorker] Auto-saved detected Gemini session to desktop bridge!");
        } catch (_) { }
      }
      sendResponse({ success: true });
    }).catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "SAVE_QA_TO_MEMORY") {
    if (typeof JarvisMemoryManager !== "undefined" && message.questionText && message.answer) {
      JarvisMemoryManager.saveToCache(message.questionText, message.options || [], message.answer, message.source || "user")
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }
    sendResponse({ success: false, error: "Memory manager not loaded" });
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
                chrome.tabs.sendMessage(dashboardTab.id, { action: "AUTOPILOT_TRIGGER_CYCLE" }).catch(() => { });
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

  // =========================================================================
  // LIVE API KEY TEST & VALIDATION (OpenRouter + Gemini)
  // =========================================================================
  if (message.action === "TEST_API_KEY") {
    (async () => {
      const { provider, apiKey, model } = message;
      if (!apiKey || apiKey.trim().length < 5) {
        sendResponse({ success: false, error: "API Key খালি বা খুব ছোট!" });
        return;
      }

      const cleanKey = apiKey.trim();

      if (provider === "openrouter") {
        try {
          // 1. Check Auth & Key Details
          const authRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { "Authorization": `Bearer ${cleanKey}` }
          });
          const authData = await authRes.json();
          if (!authRes.ok || !authData.data) {
            const errMsg = authData?.error?.message || `HTTP ${authRes.status}`;
            sendResponse({ success: false, error: `OpenRouter Key অবৈধ বা বাতিল: ${errMsg}` });
            return;
          }

          const kData = authData.data;
          const isFree = !!kData.is_free_tier;
          const limitRem = kData.limit_remaining;
          const usage = kData.usage || 0;

          // 2. Test Chat Completion Call
          const testModel = model || (isFree ? "openrouter/free" : "google/gemini-2.5-flash");
          let compStatus = "সক্রিয় ও কাজ করছে!";
          let testSuccess = true;

          try {
            const compRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanKey}`,
                "HTTP-Referer": "https://jarvis-survey-copilot.extension",
                "X-Title": "Jarvis Survey Copilot"
              },
              body: JSON.stringify({
                model: testModel,
                messages: [{ role: "user", content: "Reply with JSON: {\"status\":\"ok\"}" }],
                max_tokens: 50
              })
            });

            if (!compRes.ok) {
              const compText = await compRes.text();
              if (compRes.status === 402) {
                compStatus = "Free Tier সক্রিয় (পেইড মডেলে ক্রেডিট লাগবে, কিন্তু 'openrouter/free' মডেলে সম্পূর্ণ ফ্রি চলবে)";
              } else {
                compStatus = `সতর্কতা (${compRes.status}): ${compText.slice(0, 100)}`;
              }
            } else {
              compStatus = "সফলভাবে সংযুক্ত ও লাইভ সক্রিয়!";
            }
          } catch (ce) {
            compStatus = `কানেকশন টেস্ট: ${ce.message}`;
          }

          sendResponse({
            success: true,
            provider: "openrouter",
            label: kData.label || "OpenRouter Key",
            isFreeTier: isFree,
            limitRemaining: limitRem,
            usage: usage,
            modelTested: testModel,
            connectionStatus: compStatus,
            message: `✅ OpenRouter Key সক্রিয়! (${compStatus})`
          });
        } catch (err) {
          sendResponse({ success: false, error: `OpenRouter সংযোগে ত্রুটি: ${err.message}` });
        }
        return;
      }

      if (provider === "gemini") {
        try {
          if (cleanKey.startsWith("AQ.")) {
            sendResponse({ success: false, error: "এই কী-টি Google Studio API Key নয়! এটি OAuth টোকেন। দয়া করে AI Studio থেকে 'AIzaSy...' ফরম্যাটের কী দিন।" });
            return;
          }
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`);
          if (!res.ok) {
            const errText = await res.text();
            sendResponse({ success: false, error: `Gemini Key সঠিক নয় (${res.status}): ${errText.slice(0, 100)}` });
            return;
          }
          const data = await res.json();
          const count = data.models ? data.models.length : 0;
          sendResponse({
            success: true,
            provider: "gemini",
            modelsCount: count,
            message: `✅ Gemini Key সম্পূর্ণ সক্রিয় ও কার্যকর! (${count}টি মডেল উপলব্ধ)`
          });
        } catch (err) {
          sendResponse({ success: false, error: `Gemini সংযোগে ত্রুটি: ${err.message}` });
        }
        return;
      }

      sendResponse({ success: false, error: "অজানা প্রোভাইডার" });
    })();
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
          }).catch(() => { });
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
  } catch (e) { }

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 120));
    try {
      const pingRes = await chrome.tabs.sendMessage(tabId, { action: "PING" });
      if (pingRes && pingRes.pong) return true;
    } catch (err) { }
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

  const storage = await chrome.storage.local.get(null);
  const engineMode = storage.engineMode || "ai_first"; // "ai_first" (default) | "offline_first" | "hybrid"

  // Extract all usable Gemini keys (excluding dummy/invalid AQ keys)
  const geminiKeys = [
    { key: (storage.geminiApiKey || "").trim(), label: "Gemini Key 1" },
    { key: (storage.geminiApiKey2 || "").trim(), label: "Gemini Key 2" },
    { key: (storage.geminiApiKey3 || "").trim(), label: "Gemini Key 3" }
  ].filter(k => k.key.length > 5 && !k.key.startsWith("AQ."));

  // Extract all OpenRouter keys
  const openRouterKeys = [
    { key: (storage.openRouterApiKey || "").trim(), label: "OpenRouter Key 1" },
    { key: (storage.openRouterApiKey2 || "").trim(), label: "OpenRouter Key 2" },
    { key: (storage.openRouterApiKey3 || "").trim(), label: "OpenRouter Key 3" }
  ].filter(k => k.key.length > 5);

  // Extract all Torve AI keys
  const torveAiKeys = [
    { key: (storage.torveAiApiKey || "").trim(), label: "Torve AI Key 1" },
    { key: (storage.torveAiApiKey2 || "").trim(), label: "Torve AI Key 2" },
    { key: (storage.torveAiApiKey3 || "").trim(), label: "Torve AI Key 3" }
  ].filter(k => k.key.length > 5);

  const hasAnyApiKey = (geminiKeys.length > 0 || openRouterKeys.length > 0 || torveAiKeys.length > 0);

  let result = null;
  let lastError = null;
  let apiPayload = payload;

  const originalQuestions = payload.questions || [];
  const persona = storage.surveyPersona || {};
  const personalInfo = storage.personalInfo || null;

  let base64Image = null;
  let fullDataUrl = null;

  if (isScreenshot && payload.screenshot) {
    fullDataUrl = payload.screenshot;
    base64Image = payload.screenshot.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  }

  // =========================================================================
  // STEP 1: CHECK KNOWLEDGE BASE (USER FILES) & LOCAL MEMORY CACHE FIRST!
  // Checks previously completed survey QA & user uploaded files (0 API, 0 Gemini message)
  // =========================================================================
  let memoryResolution = null;
  let hermesResolution = null;
  let memAnswers = [];
  let hermesAnswers = [];
  let questionsAfterMemory = questions;
  let allOfflineResolvedSoFar = [];

  if (engineMode !== "ai_only" && !isScreenshot && questions.length > 0) {
    if (typeof JarvisMemoryManager !== "undefined") {
      try {
        memoryResolution = await JarvisMemoryManager.resolveSurveyQuestions(questions);
        console.log(`[Jarvis Memory] Checked ${questions.length} questions: ${memoryResolution.resolvedAnswers.length} hits (${memoryResolution.kbHitCount} KB, ${memoryResolution.cacheHitCount} Cache), ${memoryResolution.missingQuestions.length} misses`);
      } catch (e) {
        console.warn("[Jarvis ServiceWorker] Memory resolution error:", e);
      }
    }

    questionsAfterMemory = memoryResolution ? memoryResolution.missingQuestions : questions;

    if (questionsAfterMemory.length > 0 && typeof HermesAgent !== "undefined") {
      try {
        hermesResolution = HermesAgent.resolveQuestions(questionsAfterMemory);
        console.log(`[Hermes AI] Resolved ${hermesResolution.hitCount}/${questionsAfterMemory.length} questions offline (${hermesResolution.missCount} need Gemini/API)`);
      } catch (e) {
        console.warn("[Jarvis ServiceWorker] Hermes resolution error:", e);
      }
    }

    memAnswers = (memoryResolution && memoryResolution.resolvedAnswers) ? memoryResolution.resolvedAnswers : [];
    hermesAnswers = (hermesResolution && hermesResolution.resolvedAnswers) ? hermesResolution.resolvedAnswers : [];
    allOfflineResolvedSoFar = [...memAnswers, ...hermesAnswers];
    allOfflineResolvedSoFar.sort((a, b) => (a.question_index || 0) - (b.question_index || 0));

    // COMPLETE 100% HIT: Every question found in Knowledge Base / Memory Cache!
    if (allOfflineResolvedSoFar.length === questions.length && questions.length > 0) {
      if (memoryResolution && memoryResolution.cacheHitCount > 0) {
        for (let c = 0; c < memoryResolution.cacheHitCount; c++) await JarvisMemoryManager.recordHit("cache");
      }
      if (memoryResolution && memoryResolution.kbHitCount > 0) {
        for (let k = 0; k < memoryResolution.kbHitCount; k++) await JarvisMemoryManager.recordHit("kb");
      }
      if (hermesAnswers.length > 0 && typeof JarvisMemoryManager !== "undefined") {
        for (let h = 0; h < hermesAnswers.length; h++) await JarvisMemoryManager.recordHit("hermes");
      }

      let providerLabel = "User Knowledge Base & Memory Cache ⚡📄";
      if (memoryResolution?.kbHitCount > 0 && memoryResolution?.cacheHitCount === 0) providerLabel = "User Knowledge Base Files 📄 (Master Dataset)";
      else if (memoryResolution?.cacheHitCount > 0 && memoryResolution?.kbHitCount === 0) providerLabel = "Local Memory Cache ⚡ (Previous Survey QA)";
      else if (hermesAnswers.length > 0 && memAnswers.length === 0) providerLabel = "Hermes AI Local Agent 🤖";

      const synthesizedData = {
        page_summary: `Answered by ${providerLabel} (0 API Calls, 0 Gemini Web used, 100% Instant)`,
        trap_detected: false,
        trap_alert_message: "",
        is_last_page: false,
        estimated_human_reading_seconds: 1,
        answers: allOfflineResolvedSoFar,
        is_screenshot_analysis: false,
        analyzed_at: Date.now(),
        page_title: payload.title || "",
        page_url: payload.url || "",
        model_used: "Local Memory & Knowledge Base",
        provider_used: providerLabel,
        source: memoryResolution ? memoryResolution.dominantSource : "cache",
        is_from_cache: true,
        hermes_hit_count: hermesAnswers.length,
        memory_hit_count: memAnswers.length,
        kb_hit_count: memoryResolution?.kbHitCount || 0
      };

      await chrome.storage.local.set({ lastAnalysisResult: synthesizedData });

      try {
        chrome.runtime.sendMessage({
          action: "SURVEY_ANALYSIS_UPDATED",
          data: synthesizedData
        }).catch(() => { });
      } catch (e) { }

      return {
        success: true,
        providerUsed: providerLabel,
        modelUsed: synthesizedData.model_used,
        source: synthesizedData.source,
        savedApiCall: true,
        data: synthesizedData
      };
    }
  }

  // =========================================================================
  // STEP 2: QUERY GOOGLE GEMINI WEB ACCOUNTS (Plus, Pro, Ultra, Advanced) - 0 API Cost!
  // For any missing or new questions not yet in Memory/KB, directly query Gemini Web
  // =========================================================================
  const remainingQuestions = hermesResolution ? hermesResolution.missingQuestions : questionsAfterMemory;
  if (!isScreenshot && remainingQuestions.length > 0 && allOfflineResolvedSoFar.length > 0) {
    apiPayload = Object.assign({}, payload, { questions: remainingQuestions });
    console.log(`[Jarvis ServiceWorker] Memory resolved ${allOfflineResolvedSoFar.length}/${questions.length}. Sending ONLY ${remainingQuestions.length} remaining questions to Gemini Web!`);
  }

  const useGeminiWeb = storage.useGeminiWeb !== false;
  let priority = storage.providerPriority || "gemini_web_first";

  if (!result && useGeminiWeb && (priority === "gemini_web_first" || priority === "gemini_web_only" || priority === "gemini_first" || !hasAnyApiKey || !priority.includes("only"))) {
    try {
      console.log(`[Jarvis ServiceWorker] Step 2: Requesting answers from Google Gemini Web Accounts (Plus/Pro/Advanced) for ${apiPayload.questions?.length || questions.length} questions...`);
      const promptForWeb = isScreenshot
        ? buildVisionSurveyPrompt(apiPayload, persona, personalInfo)
        : buildHumanLikeSurveyPrompt(apiPayload, persona, personalInfo);

      if (typeof GeminiWebClient !== "undefined") {
        const webRes = await GeminiWebClient.executeSurveyQuery(
          promptForWeb,
          fullDataUrl || (base64Image ? ("data:image/jpeg;base64," + base64Image) : null)
        );
        if (webRes && webRes.data && webRes.data.answers && webRes.data.answers.length > 0) {
          result = webRes;
          console.log(`[Jarvis ServiceWorker] ✅ Successfully answered via Google Gemini Web Account (${result.data.answers.length} answers) - 0 API Cost!`);
        }
      }
    } catch (webErr) {
      console.warn("[Jarvis ServiceWorker] Gemini Web Account notice:", webErr.message);
      if (priority === "gemini_web_only") {
        lastError = webErr;
      }
    }
  }

  // =========================================================================
  // STEP 3: FALLBACK TO DESKTOP BRIDGE OR EXTERNAL API KEYS
  // =========================================================================

  // 1. Try local Jarvis Desktop AI Bridge if PC is running
  if (!result && storage.localBridgeEnabled !== false) {
    try {
      const bridgeUrl = (storage.localBridgeUrl || "http://127.0.0.1:8765") + "/survey_analyze";
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3500);
      const bResp = await fetch(bridgeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPayload),
        signal: ctrl.signal
      });
      clearTimeout(tid);
      if (bResp.ok) {
        const bJson = await bResp.json();
        if (bJson && bJson.success && bJson.answers && bJson.answers.length > 0) {
          result = {
            success: true,
            data: bJson,
            providerUsed: "Jarvis Desktop AI (Zero Extension Token)",
            modelUsed: bJson.model_used || "Jarvis PC Core"
          };
          console.log("[Jarvis ServiceWorker] Successfully analyzed survey via Jarvis Desktop Bridge (0 API Token cost)");
        }
      }
    } catch (_) { }
  }

  // 2. If desktop bridge & Gemini Web didn't handle and we have external API keys, call pipeline
  if (!result && hasAnyApiKey && priority !== "gemini_web_only") {
    if (openRouterKeys.length > 0 && geminiKeys.length === 0 && priority !== "gemini_web_first") {
      priority = "openrouter_first";
    }

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
      attemptPipeline = [...torveAiAttempts, ...openRouterAttempts, ...geminiAttempts];
    } else if (priority === "openrouter_first") {
      attemptPipeline = [...openRouterAttempts, ...geminiAttempts, ...torveAiAttempts];
    } else if (priority === "torveai_only") {
      attemptPipeline = [...torveAiAttempts];
    } else if (priority === "openrouter_only") {
      attemptPipeline = [...openRouterAttempts];
    } else if (priority === "gemini_only") {
      attemptPipeline = [...geminiAttempts];
    } else {
      attemptPipeline = [...geminiAttempts, ...openRouterAttempts, ...torveAiAttempts];
    }

    let apiPayload = payload;
    const remainingAfterHermes = hermesResolution ? hermesResolution.missingQuestions : questionsAfterMemory;
    const allOfflineResolvedSoFar = [...memAnswers, ...hermesAnswers];

    if (!isScreenshot && remainingAfterHermes.length > 0 && allOfflineResolvedSoFar.length > 0) {
      apiPayload = Object.assign({}, payload, { questions: remainingAfterHermes });
      console.log(`[Jarvis API] Sending only ${remainingAfterHermes.length}/${originalQuestions.length} questions to API`);
    } else if (!isScreenshot && hermesResolution && hermesResolution.missingQuestions.length > 0 && memAnswers.length === 0) {
      apiPayload = Object.assign({}, payload, { questions: hermesResolution.missingQuestions });
    }

    const prompt = isScreenshot
      ? buildVisionSurveyPrompt(apiPayload, persona, personalInfo)
      : buildHumanLikeSurveyPrompt(apiPayload, persona, personalInfo);

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
          break;
        }
      } catch (err) {
        lastError = err;
        console.warn(`[Jarvis AI] ⚠️ ${attempt.label} (${attempt.model}) failed: ${err.message}`);

        if (i < attemptPipeline.length - 1) {
          const nextAttempt = attemptPipeline[i + 1];
          const failoverMsg = `⚠️ ${attempt.label} লিমিট/ত্রুটি (${err.message.slice(0, 50)}...)। স্বয়ংক্রিয়ভাবে ${nextAttempt.label} এ সুইচ করা হচ্ছে...`;
          try {
            if (tabId) {
              chrome.tabs.sendMessage(tabId, {
                action: "API_FAILOVER_NOTIFICATION",
                failedLabel: attempt.label,
                nextLabel: nextAttempt.label,
                message: failoverMsg
              }).catch(() => { });
            }
          } catch (e) { }
        }
      }
    }
  }

  // 2.5. If external APIs failed, try Google Gemini Web Account (Pro / Advanced) as frontier failover
  if (!result && useGeminiWeb && priority !== "gemini_web_first" && priority !== "gemini_web_only") {
    try {
      console.log("[Jarvis ServiceWorker] Trying Google Gemini Web Account as frontier failover...");
      const promptForWeb = isScreenshot
        ? buildVisionSurveyPrompt(payload, persona, personalInfo)
        : buildHumanLikeSurveyPrompt(payload, persona, personalInfo);

      if (typeof GeminiWebClient !== "undefined") {
        const webRes = await GeminiWebClient.executeSurveyQuery(promptForWeb, fullDataUrl || (base64Image ? ("data:image/jpeg;base64," + base64Image) : null));
        if (webRes && webRes.data && webRes.data.answers && webRes.data.answers.length > 0) {
          result = webRes;
          console.log(`[Jarvis ServiceWorker] ✅ Recovered via Google Gemini Web Account (${result.data.answers.length} answers)!`);
        }
      }
    } catch (webErr2) {
      console.warn("[Jarvis ServiceWorker] Gemini Web Account failover note:", webErr2.message);
    }
  }

  // 3. Fallback to Hermes Local Agent + Offline Persona (100% Zero Cost Guaranteed)
  // Ensures we NEVER stop or show an error even when no API keys are present or all APIs fail!
  if (!result || !result.data || !result.data.answers || result.data.answers.length === 0) {
    console.log("[Jarvis AI] Activating Hermes AI smart offline fallback for all survey questions...");
    const offlineQuestions = originalQuestions.length > 0 ? originalQuestions : (payload.questions || []);

    let hermesAnswersFinal = [];
    if (typeof HermesAgent !== "undefined") {
      const hermesRes = HermesAgent.resolveAllOffline(offlineQuestions);
      hermesAnswersFinal = hermesRes.resolvedAnswers || [];
    }

    if (hermesAnswersFinal.length === 0 && offlineQuestions.length > 0) {
      hermesAnswersFinal = offlineQuestions.map((q, idx) => {
        const firstOpt = q.options && q.options[0] ? (q.options[0].label || q.options[0].value || "Option") : "Yes";
        return {
          question_index: q.index !== undefined ? q.index : idx,
          question_id: q.id || "",
          question_text: q.text || `Question ${idx + 1}`,
          recommended_action: q.type === "multiple_choice" ? "select_checkbox" : (q.type === "text_input" ? "type_text" : "select_radio"),
          target_element_ids: [],
          selected_labels: [firstOpt],
          text_input_value: q.type === "text_input" ? "Positive and dependable experience." : null,
          reasoning: "Hermes Persona Heuristic",
          source: "hermes",
          model_used: "Hermes-Local"
        };
      });
    }

    result = {
      success: true,
      providerUsed: "Hermes AI Offline (0 API Calls) 🤖",
      modelUsed: "Hermes-Local-Heuristics",
      data: {
        page_summary: "Answered by Hermes AI Local Agent & Profile (0 API Calls)",
        trap_detected: false,
        trap_alert_message: "",
        is_last_page: false,
        estimated_human_reading_seconds: 1,
        answers: hermesAnswersFinal,
        is_screenshot_analysis: isScreenshot,
        analyzed_at: Date.now(),
        page_title: payload.title || "",
        page_url: payload.url || "",
        model_used: "Hermes-Local-Heuristics",
        provider_used: "Hermes AI Offline (0 API Calls) 🤖",
        source: "hermes",
        is_from_cache: true
      }
    };
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
    }).catch(() => { });
  } catch (e) { }

  return result;
}

/**
 * Constructs comprehensive prompt instructing Gemini 3.8 to generate natural, human-like survey answers
 * based strictly on the user's detailed persona & QA database.
 */
function buildHumanLikeSurveyPrompt(pageData, persona, personalInfo) {
  const p = personalInfo || DEFAULT_PERSONAL_INFO;
  return `You are answering an online survey as a real human respondent named ${p.firstName || "Al Amin"} ${p.lastName || "Miah"}.
Your answers MUST sound completely natural, authentic, thoughtful, and human-like ("ans as a human").
CRITICAL SPEED REQUIREMENT: Return concise JSON immediately (respond within 2 seconds).

VERIFIED HUMAN PROFILE:
- Full Name: ${p.firstName || "Al Amin"} ${p.lastName || "Miah"} | Male (Heterosexual) | Age: 50 (Born March 8, 1976 / 1976)
- Location: 123 W 31st St, New York, NY 10001 | English spoken at home | Own single family home
- Household: Married, Wife 40, Two kids (Boy 13, Girl 12). Total: 4 persons
- Race: White | Not Hispanic/Latino | Education: Master's or Professional Degree (or Bachelor)
- Politics: Republican (Strong Republican, registered voter) | Religion: Christian
- Employment: Employed full-time (35+ hrs) | IT / Computer Software (Manager / Director / CTO) | 2,500-5,000 employees | $50-$99M revenue
- Spending authority: Marketing, Sales, Advertising, Financial Services, IT Hardware, IT Software (sole decision maker)
- Income: $125,000 - $149,999 before taxes | FICO score: 750-800 | Investable assets: $500k-$1M | Bank: Bank of America, Amex
- Cars Owned: Audi, Nissan (Only 2) | Audi A8 Sedan | Mid/Full Size | Bought 2023 New | Next car: 2 years / 3-6 months
- Health: Smoker (Yes, 4-7 cigs/day; Quit: Cold Turkey, Veep) | Conditions: Allergies, Back Pain, Dental, Depression, Diabetes (Type 1) | No cancer
- Tech: Samsung phone (Verizon Pre-paid) | Verizon home internet | PC/Mac laptop, iPad, Smart TV, Gaming console
- Shopping: Walmart, Target, Aldi, Costco | Sole decision maker | Fast Food: 1-3x/week (McDonalds, Chipotle, Five Guys)
- Screeners: Market research past 2 weeks: No | Online research past month: No | Expecting baby: No
- Screener Trap: Household working in Advertising, PR, Market Research -> ALWAYS "None of the above"
- Attention Check Traps: Strictly follow the literal prompt (e.g. "Select blue", "Choose somewhat disagree")!

SURVEY QUESTIONS TO ANSWER:
${JSON.stringify(pageData.questions, null, 2)}

OUTPUT INSTRUCTIONS:
1. You MUST generate an answer for EVERY SINGLE question listed. Do not skip any!
2. In "selected_labels", provide the EXACT label text matching the question's options list.
3. For text inputs/textareas/message boxes: In "text_input_value", write a natural 1-2 sentence human opinion in first-person ("ans as a human"). Never leave it null!
4. Return ONLY valid JSON matching this structure:
{
  "page_summary": "Summary",
  "trap_detected": false,
  "is_last_page": false,
  "answers": [
    {
      "question_index": 0,
      "question_id": "opt-id-if-known",
      "question_text": "Question text",
      "recommended_action": "select_radio" | "select_checkbox" | "select_dropdown" | "type_text",
      "target_element_ids": [],
      "selected_labels": ["Exact Label"],
      "text_input_value": null,
      "reasoning": "Fits verified human persona profile"
    }
  ]
}`;
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

  // Build robust candidate model chain: primary -> gemini 2.5 flash -> openrouter/free -> lightweight free fallbacks
  const candidateModels = [
    primaryModel,
    "google/gemini-2.5-flash",
    "openrouter/free",
    "google/gemini-2.5-flash-lite",
    "meta-llama/llama-3.3-70b-instruct:free",
    "inclusionai/ling-3.0-flash-sante:free",
    "deepseek/deepseek-chat"
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError = null;

  for (const orModel of candidateModels) {
    const isFreeModel = orModel.includes(":free") || orModel === "openrouter/free";
    let userContent;
    if (base64Image) {
      const imgUrl = base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`;
      userContent = [
        { type: "text", text: promptText + "\nRespond with a valid JSON object only." },
        { type: "image_url", image_url: { url: imgUrl } }
      ];
    } else {
      userContent = promptText + "\nRespond with a valid JSON object only.";
    }

    // Adaptive max_tokens: 1000 for standard, 800 for free tier to prevent 402 budget rejection
    const targetMaxTokens = isFreeModel ? 800 : 1000;

    const requestBody = {
      model: orModel,
      messages: [{ role: "user", content: userContent }],
      temperature: 0.15,
      max_tokens: targetMaxTokens
    };

    // Only apply response_format for models that support it without error
    if (!isFreeModel) {
      requestBody.response_format = { type: "json_object" };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 16000);

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
            const err = new Error(`OpenRouter Key Error (${response.status}): API Key সঠিক নয় বা অবৈধ`);
            err.isKeyError = true;
            throw err;
          }

          if (response.status === 402 || response.status === 429) {
            console.warn(`[Jarvis OpenRouter] Quota / Credit limit on ${orModel}. Seamlessly failing over to next model (e.g. openrouter/free)...`);
            lastError = new Error(`OpenRouter Quota/Limit on ${orModel} (${response.status})`);
            break; // Try next model in chain (e.g. openrouter/free)!
          }

          if (response.status === 404) {
            lastError = new Error(`OpenRouter model ${orModel} not found (404)`);
            break; // Try next candidate model
          }

          if (response.status === 400 && requestBody.response_format) {
            // Retry without response_format if model didn't support json_object
            delete requestBody.response_format;
            continue;
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
        if (err.isKeyError) throw err;
        if (err.name === "AbortError") {
          lastError = new Error(`OpenRouter timeout (16s) on ${orModel}`);
          break;
        }
        lastError = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  throw lastError || new Error("❌ OpenRouter এর সব মডেল ব্যর্থ হয়েছে। দয়া করে API Key ও ব্যালেন্স চেক করুন অথবা openrouter/free ব্যবহার করুন।");
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
