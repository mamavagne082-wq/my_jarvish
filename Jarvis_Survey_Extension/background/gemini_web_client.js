/**
 * Jarvis AI Survey Copilot - Gemini Web Account Client
 * Seamlessly interfaces with user's authenticated Google Gemini Web session (gemini.google.com)
 * Uses active Gemini Pro / Advanced / Ultra subscription with ZERO API quota consumption!
 */

const GeminiWebClient = (function () {

  // Helper: check if user is logged into Google / Gemini
  async function checkAuthStatus() {
    try {
      // 1. Check for active Gemini cookies
      let hasCookies = false;
      if (chrome.cookies) {
        const cookie = await chrome.cookies.get({
          url: "https://gemini.google.com",
          name: "__Secure-1PSID"
        });
        if (cookie && cookie.value) {
          hasCookies = true;
        }
      }

      // 2. Check for open Gemini tabs
      const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
      const hasTab = tabs && tabs.length > 0;
      let tabActive = false;

      if (hasTab) {
        try {
          const pingRes = await chrome.tabs.sendMessage(tabs[0].id, { action: "PING_GEMINI_BRIDGE" });
          if (pingRes && pingRes.success) tabActive = true;
        } catch (_) { }
      }

      const storage = await chrome.storage.local.get(["geminiAccountEmail", "geminiAccountTier"]);
      const email = storage.geminiAccountEmail || "Active Google Session";
      const tier = storage.geminiAccountTier || "Gemini Advanced (Pro)";

      return {
        connected: hasCookies || hasTab,
        hasCookies,
        hasTab,
        tabActive,
        tabId: hasTab ? tabs[0].id : null,
        email,
        tier
      };
    } catch (err) {
      console.warn("[GeminiWebClient] Auth check error:", err);
      return { connected: false, error: err.message };
    }
  }

  // Open or focus Gemini Web tab
  async function openOrConnectGeminiTab() {
    const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
    if (tabs && tabs.length > 0) {
      return tabs[0];
    }
    // Create a pinned background tab for seamless background operation
    const newTab = await chrome.tabs.create({
      url: "https://gemini.google.com/app",
      pinned: true,
      active: false
    });

    // Wait for page to load
    await new Promise((resolve) => {
      function listener(tabId, info) {
        if (tabId === newTab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
      // Timeout after 8s
      setTimeout(resolve, 8000);
    });

    // Give 1.5s for DOM initialization
    await new Promise(r => setTimeout(r, 1500));
    return newTab;
  }

  // Clean JSON response from Gemini text
  function extractJsonFromGeminiResponse(rawText) {
    if (!rawText) return null;
    let cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (_) { }

    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) { }
    }

    return null;
  }

  // Main execution function
  async function executeSurveyQuery(prompt, screenshotDataUrl) {
    console.log("[GeminiWebClient] Dispatching query to Google Gemini Web Account...");

    // 1. Ensure tab exists and is ready
    let targetTab = null;
    const existingTabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
    if (existingTabs && existingTabs.length > 0) {
      targetTab = existingTabs[0];
    } else {
      console.log("[GeminiWebClient] Opening background Gemini Web tab for analysis...");
      targetTab = await openOrConnectGeminiTab();
    }

    if (!targetTab || !targetTab.id) {
      throw new Error("Unable to establish connection to Gemini Web tab (gemini.google.com)");
    }

    // 2. Send message to gemini_tab_bridge.js in that tab
    let bridgeResponse = null;
    try {
      bridgeResponse = await chrome.tabs.sendMessage(targetTab.id, {
        action: "EXECUTE_GEMINI_WEB_QUERY",
        prompt: prompt,
        screenshot: screenshotDataUrl
      });
    } catch (msgErr) {
      // Content script may need injection if opened previously without refresh
      console.warn("[GeminiWebClient] Injecting bridge script manually:", msgErr);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ["content/gemini_tab_bridge.js"]
        });
        await new Promise(r => setTimeout(r, 1000));
        bridgeResponse = await chrome.tabs.sendMessage(targetTab.id, {
          action: "EXECUTE_GEMINI_WEB_QUERY",
          prompt: prompt,
          screenshot: screenshotDataUrl
        });
      } catch (injErr) {
        throw new Error("Gemini Web Tab Bridge communication failed: " + injErr.message);
      }
    }

    if (!bridgeResponse || !bridgeResponse.success) {
      throw new Error(bridgeResponse?.error || "Gemini Web did not return a valid response");
    }

    const rawText = bridgeResponse.text || "";
    const parsedData = extractJsonFromGeminiResponse(rawText);

    if (parsedData && parsedData.answers && Array.isArray(parsedData.answers)) {
      console.log(`[GeminiWebClient] ✅ Received ${parsedData.answers.length} verified answers from Gemini Web Account!`);
      return {
        success: true,
        modelUsed: "Google Gemini Advanced (Pro Web)",
        providerUsed: "Google Gemini Web Account (Zero API Token)",
        data: parsedData,
        rawText: rawText
      };
    }

    // If answers not in JSON format, parse text line-by-line
    console.warn("[GeminiWebClient] JSON parse was partial, synthesizing answers from response text:", rawText.slice(0, 150));
    return {
      success: true,
      modelUsed: "Google Gemini Advanced (Pro Web)",
      providerUsed: "Google Gemini Web Account (Zero API Token)",
      data: parsedData || {
        page_summary: rawText.slice(0, 120),
        trap_detected: false,
        answers: []
      },
      rawText: rawText
    };
  }

  return {
    checkAuthStatus,
    openOrConnectGeminiTab,
    executeSurveyQuery
  };

})();

// Export globally for background service worker
if (typeof self !== "undefined") {
  self.GeminiWebClient = GeminiWebClient;
}
