/**
 * Jarvis AI Survey Copilot - Gemini Web Account Client
 * Seamlessly interfaces with user's authenticated Google Gemini Web session (gemini.google.com)
 * Supports Direct Google Sign-In, Session Export & Import, and Multi-Account Switching (Plus, Pro, Advanced/Ultra).
 */

const GeminiWebClient = (function () {

  const AUTH_COOKIE_NAMES = [
    "__Secure-1PSID", "__Secure-3PSID", "__Secure-1PAPISID", "__Secure-3PAPISID",
    "__Secure-1PSIDTS", "__Secure-3PSIDTS", "__Secure-1PSIDCC", "__Secure-3PSIDCC",
    "SAPISID", "APISID", "SSID", "HSID", "SID", "OSID", "__Secure-OSID", "SIDCC", "NID"
  ];

  // Helper: check if user is logged into Google / Gemini
  async function checkAuthStatus() {
    try {
      let hasCookies = false;
      let foundCookiesCount = 0;

      if (chrome.cookies) {
        try {
          const geminiCookies = await chrome.cookies.getAll({ domain: "gemini.google.com" });
          const googleCookies = await chrome.cookies.getAll({ domain: "google.com" });
          const combined = [...geminiCookies, ...googleCookies];
          const matched = combined.filter(c => AUTH_COOKIE_NAMES.includes(c.name) || c.name.startsWith("__Secure-"));
          if (matched.length > 0) {
            hasCookies = true;
            foundCookiesCount = matched.length;
          }
        } catch (cErr) {
          console.warn("[GeminiWebClient] Cookie check error:", cErr);
        }
      }

      // Check for open Gemini tabs
      const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
      const hasTab = tabs && tabs.length > 0;
      let tabActive = false;

      if (hasTab) {
        try {
          const pingRes = await chrome.tabs.sendMessage(tabs[0].id, { action: "PING_GEMINI_BRIDGE" });
          if (pingRes && pingRes.success) tabActive = true;
        } catch (_) { }
      }

      // If no cookies found, attempt auto-import from local PC bridge (gemini_session.json)
      if (!hasCookies && !hasTab) {
        try {
          const bridgeRes = await fetchSessionFromDesktopBridge();
          if (bridgeRes && bridgeRes.success) {
            console.log(`[GeminiWebClient] Auto-restored ${bridgeRes.count} cookies from desktop bridge!`);
            hasCookies = true;
            foundCookiesCount = bridgeRes.count;
          }
        } catch (_) { }
      }

      const storage = await chrome.storage.local.get([
        "geminiAccountEmail", "geminiAccountTier",
        "geminiAcc1Email", "geminiAcc2Email", "geminiAcc3Email",
        "geminiActiveAccountIndex"
      ]);

      const email = storage.geminiAccountEmail || storage.geminiAcc1Email || "Active Google Session";
      const tier = storage.geminiAccountTier || "Gemini Advanced (Pro)";

      return {
        connected: hasCookies || hasTab,
        hasCookies,
        cookieCount: foundCookiesCount,
        hasTab,
        tabActive,
        tabId: hasTab ? tabs[0].id : null,
        email,
        tier,
        accounts: {
          acc1: storage.geminiAcc1Email || "plus.alamin@gmail.com",
          acc2: storage.geminiAcc2Email || "pro.alamin@gmail.com",
          acc3: storage.geminiAcc3Email || "alaminmiah1976@gmail.com"
        },
        activeAccountIndex: storage.geminiActiveAccountIndex || 1
      };
    } catch (err) {
      console.warn("[GeminiWebClient] Auth check error:", err);
      return { connected: false, error: err.message };
    }
  }

  // Direct Google Sign-In & Tab Connect Handler
  async function loginOrConnectGoogleGemini(options = {}) {
    const accIdx = parseInt(options.accountIndex || 1, 10);
    const storage = await chrome.storage.local.get([
      `geminiAcc${accIdx}Email`,
      `geminiAcc${accIdx}Pwd`,
      "geminiAcc1Email", "geminiAcc2Email", "geminiAcc3Email"
    ]);

    const targetEmail = (options.email || storage[`geminiAcc${accIdx}Email`] || "").trim();
    const targetPwd = (options.password || storage[`geminiAcc${accIdx}Pwd`] || "").trim();
    const authUserIdx = Math.max(0, accIdx - 1);

    // Build the official Google Direct Login / Account Chooser URL
    let loginUrl;
    if (options.directGoogleLogin || options.forceLogin) {
      if (targetEmail) {
        // Direct prefill of email into Google's authentic Account Chooser / ServiceLogin
        loginUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(targetEmail)}&continue=${encodeURIComponent(`https://gemini.google.com/app?authuser=${authUserIdx}`)}`;
      } else {
        loginUrl = `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(`https://gemini.google.com/app?authuser=${authUserIdx}`)}`;
      }
    } else {
      // Normal direct connect to Gemini web
      loginUrl = `https://gemini.google.com/app?authuser=${authUserIdx}`;
    }

    console.log(`[GeminiWebClient] Opening Google Login for Account ${accIdx} (${targetEmail || 'Select Account'}):`, loginUrl);

    // Create or reuse tab in foreground (active) so user can see and complete Google Login / 2FA
    let targetTab = null;
    const existingTabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
    if (!options.forceLogin && existingTabs && existingTabs.length > 0 && !options.directGoogleLogin) {
      targetTab = existingTabs[0];
      await chrome.tabs.update(targetTab.id, { active: true });
    } else {
      targetTab = await chrome.tabs.create({
        url: loginUrl,
        active: true
      });
    }

    // Monitor the tab to detect when Google authentication completes
    if (targetTab && targetTab.id) {
      const tabId = targetTab.id;

      const monitorListener = function (updatedTabId, changeInfo, tabObj) {
        if (updatedTabId !== tabId) return;

        // If on Google Login page and password was saved, assist typing if input is ready
        if (targetPwd && tabObj.url && tabObj.url.includes("accounts.google.com") && changeInfo.status === "complete") {
          try {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              func: (pwd) => {
                const pwdInput = document.querySelector('input[type="password"]');
                if (pwdInput && !pwdInput.value) {
                  pwdInput.value = pwd;
                  pwdInput.dispatchEvent(new Event("input", { bubbles: true }));
                  pwdInput.dispatchEvent(new Event("change", { bubbles: true }));
                  pwdInput.focus();
                }
              },
              args: [targetPwd]
            }).catch(() => { });
          } catch (_) { }
        }

        // When user finishes login and is redirected to gemini.google.com/app
        if (tabObj.url && tabObj.url.includes("gemini.google.com/app") && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(monitorListener);
          console.log("[GeminiWebClient] ✅ Google Gemini Login Successfully Detected!");

          chrome.storage.local.set({
            geminiWebConnected: true,
            geminiActiveAccountIndex: accIdx,
            geminiAccountEmail: targetEmail || "Google Account"
          });

          if (chrome.notifications) {
            chrome.notifications.create({
              type: "basic",
              iconUrl: "icons/icon128.png",
              title: "Jarvis Survey Copilot",
              message: `✅ Google Gemini (${targetEmail || 'অ্যাকাউন্ট ' + accIdx}) সফলভাবে লগইন সম্পন্ন হয়েছে!`,
              priority: 2
            });
          }

          // Automatically sync session with desktop server if bridge active
          setTimeout(() => {
            syncSessionToDesktopBridge().catch(() => { });
          }, 1500);
        }
      };

      chrome.tabs.onUpdated.addListener(monitorListener);

      // Auto-remove listener after 5 minutes to avoid memory leak
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(monitorListener);
      }, 300000);
    }

    return targetTab;
  }

  // Open or focus Gemini Web tab for query processing
  async function openOrConnectGeminiTab(accountIndex = 1) {
    const authUserIdx = Math.max(0, parseInt(accountIndex, 10) - 1);
    const targetUrl = `https://gemini.google.com/app?authuser=${authUserIdx}`;
    const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });

    if (tabs && tabs.length > 0) {
      const exactTab = tabs.find(t => t.url && (
        t.url.includes(`authuser=${authUserIdx}`) ||
        (authUserIdx === 0 && !t.url.includes("authuser="))
      ));
      if (exactTab) return exactTab;

      // Update first tab to target authuser
      await chrome.tabs.update(tabs[0].id, { url: targetUrl });
      await waitForTabLoadComplete(tabs[0].id);
      await new Promise(r => setTimeout(r, 1500));
      return tabs[0];
    }

    const newTab = await chrome.tabs.create({
      url: targetUrl,
      pinned: true,
      active: false
    });

    await waitForTabLoadComplete(newTab.id);
    await new Promise(r => setTimeout(r, 2000));
    return newTab;
  }

  // -------------------------------------------------------------------------
  // Session Export & Import (Cross-Browser / Multi-Extension Session Portability)
  // -------------------------------------------------------------------------

  // Export all authenticated Google & Gemini session cookies to a JSON object
  async function exportSession() {
    if (!chrome.cookies) {
      throw new Error("Cookies API is not permitted or available in this context.");
    }

    const domains = [".google.com", "google.com", "gemini.google.com", ".gemini.google.com", "accounts.google.com"];
    const allCookies = [];

    for (const domain of domains) {
      try {
        const list = await chrome.cookies.getAll({ domain });
        for (const c of list) {
          if (AUTH_COOKIE_NAMES.includes(c.name) || c.name.startsWith("__Secure-")) {
            if (!allCookies.some(ex => ex.name === c.name && ex.domain === c.domain && ex.path === c.path)) {
              allCookies.push({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
                sameSite: c.sameSite,
                expirationDate: c.expirationDate
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[GeminiWebClient] Error reading cookies for ${domain}:`, err);
      }
    }

    const storage = await chrome.storage.local.get([
      "geminiAcc1Email", "geminiAcc2Email", "geminiAcc3Email",
      "geminiAccountEmail", "geminiAccountTier"
    ]);

    const sessionPayload = {
      format: "jarvis_gemini_session_v1",
      exportedAt: new Date().toISOString(),
      accountEmails: {
        acc1: storage.geminiAcc1Email || "plus.alamin@gmail.com",
        acc2: storage.geminiAcc2Email || "pro.alamin@gmail.com",
        acc3: storage.geminiAcc3Email || "alaminmiah1976@gmail.com"
      },
      activeEmail: storage.geminiAccountEmail || storage.geminiAcc1Email || "",
      tier: storage.geminiAccountTier || "Gemini Advanced",
      cookiesCount: allCookies.length,
      cookies: allCookies
    };

    console.log(`[GeminiWebClient] Exported ${allCookies.length} session cookies for Gemini accounts.`);
    return sessionPayload;
  }

  // Import session cookies from JSON data into browser
  async function importSession(sessionData) {
    if (!chrome.cookies) {
      throw new Error("Cookies API is not available.");
    }

    let parsed = sessionData;
    if (typeof sessionData === "string") {
      try {
        parsed = JSON.parse(sessionData);
      } catch (e) {
        throw new Error("Invalid session file format: Could not parse JSON.");
      }
    }

    if (!parsed || !parsed.cookies || !Array.isArray(parsed.cookies)) {
      throw new Error("Invalid session file: Missing cookies array.");
    }

    let successCount = 0;
    let failCount = 0;

    for (const c of parsed.cookies) {
      try {
        const domainClean = (c.domain || "google.com").replace(/^\./, "");
        const cookieUrl = (c.secure !== false ? "https://" : "http://") + domainClean + (c.path || "/");

        const setParams = {
          url: cookieUrl,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || "/",
          secure: c.secure !== false,
          httpOnly: !!c.httpOnly,
          expirationDate: c.expirationDate || (Math.floor(Date.now() / 1000) + (365 * 24 * 3600))
        };

        if (c.sameSite && c.sameSite !== "unspecified") {
          setParams.sameSite = c.sameSite;
        }

        await chrome.cookies.set(setParams);
        successCount++;
      } catch (cookieErr) {
        failCount++;
        console.warn(`[GeminiWebClient] Failed to set cookie ${c.name}:`, cookieErr);
      }
    }

    // Save restored account info
    const updateObj = { geminiWebConnected: true };
    if (parsed.accountEmails) {
      if (parsed.accountEmails.acc1) updateObj.geminiAcc1Email = parsed.accountEmails.acc1;
      if (parsed.accountEmails.acc2) updateObj.geminiAcc2Email = parsed.accountEmails.acc2;
      if (parsed.accountEmails.acc3) updateObj.geminiAcc3Email = parsed.accountEmails.acc3;
    }
    if (parsed.activeEmail) updateObj.geminiAccountEmail = parsed.activeEmail;
    if (parsed.tier) updateObj.geminiAccountTier = parsed.tier;

    await chrome.storage.local.set(updateObj);

    console.log(`[GeminiWebClient] ✅ Session Imported! (${successCount} cookies applied, ${failCount} skipped)`);
    return {
      success: true,
      importedCount: successCount,
      failedCount: failCount,
      activeEmail: parsed.activeEmail || "Google Account"
    };
  }

  // Sync session with local PC desktop bridge server (http://127.0.0.1:8765)
  async function syncSessionToDesktopBridge() {
    try {
      const sessionData = await exportSession();
      if (!sessionData.cookies || sessionData.cookies.length === 0) return;

      const res = await fetch("http://127.0.0.1:8765/api/gemini_session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData)
      });
      if (res.ok) {
        console.log("[GeminiWebClient] Session automatically synced to Jarvis Desktop Bridge.");
      }
    } catch (_) { }
  }

  // Fetch session from local PC desktop bridge server
  async function fetchSessionFromDesktopBridge() {
    try {
      const res = await fetch("http://127.0.0.1:8765/api/gemini_session");
      if (res.ok) {
        const data = await res.json();
        if (data && data.cookies && data.cookies.length > 0) {
          const importRes = await importSession(data);
          return { success: true, count: importRes.importedCount };
        }
      }
    } catch (_) { }
    return { success: false };
  }

  // Helper: Wait for tab to reach complete status
  function waitForTabLoadComplete(tabId, timeoutMs = 8000) {
    return new Promise((resolve) => {
      function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);
    });
  }

  // Clean & Normalize JSON response from Gemini text (supports objects, arrays, and text-based line answers)
  function extractJsonFromGeminiResponse(rawText) {
    if (!rawText) return null;

    let result = null;

    // 1. Try markdown code block extraction
    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        if (parsed && (Array.isArray(parsed.answers) || Array.isArray(parsed))) {
          result = Array.isArray(parsed) ? { answers: parsed } : parsed;
        }
      } catch (_) { }
    }

    // 2. Direct JSON Parse
    if (!result) {
      let cleaned = rawText
        .replace(/^```json\s*/im, "")
        .replace(/^```\s*/im, "")
        .replace(/```\s*$/im, "")
        .trim();
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && Array.isArray(parsed.answers)) result = parsed;
        else if (Array.isArray(parsed)) result = { answers: parsed };
      } catch (_) { }
    }

    // 3. Balanced Object Extractor { ... "answers": [ ... ] ... }
    if (!result) {
      const answersIdx = rawText.indexOf('"answers"');
      if (answersIdx !== -1) {
        const openBrace = rawText.lastIndexOf('{', answersIdx);
        if (openBrace !== -1) {
          let depth = 0;
          let closeBrace = -1;
          for (let i = openBrace; i < rawText.length; i++) {
            if (rawText[i] === '{') depth++;
            else if (rawText[i] === '}') {
              depth--;
              if (depth === 0) {
                closeBrace = i;
                break;
              }
            }
          }
          if (closeBrace !== -1) {
            try {
              const snippet = rawText.slice(openBrace, closeBrace + 1);
              const parsed = JSON.parse(snippet);
              if (parsed && Array.isArray(parsed.answers)) result = parsed;
            } catch (_) { }
          }
        }
      }
    }

    // 4. Array Extractor [ { ... }, { ... } ]
    if (!result) {
      const openBracket = rawText.indexOf('[');
      if (openBracket !== -1) {
        let depth = 0;
        let closeBracket = -1;
        for (let i = openBracket; i < rawText.length; i++) {
          if (rawText[i] === '[') depth++;
          else if (rawText[i] === ']') {
            depth--;
            if (depth === 0) {
              closeBracket = i;
              break;
            }
          }
        }
        if (closeBracket !== -1) {
          try {
            const snippet = rawText.slice(openBracket, closeBracket + 1);
            const parsed = JSON.parse(snippet);
            if (Array.isArray(parsed)) result = { answers: parsed };
          } catch (_) { }
        }
      }
    }

    // 5. Fallback: Parse line-by-line answers like "1. Male", "Q2: Yes", etc.
    if (!result) {
      const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
      const answers = [];
      let currentIdx = 0;

      for (const line of lines) {
        const qMatch = line.match(/(?:Q(?:uestion)?\s*(\d+)[:.-]?\s*|^\s*(\d+)[.)]\s*)(.+)/i);
        if (qMatch) {
          const qNum = parseInt(qMatch[1] || qMatch[2], 10) - 1;
          const answerSnippet = (qMatch[3] || "").replace(/^answer[:.-]?\s*/i, "").replace(/^selection[:.-]?\s*/i, "").trim();
          if (answerSnippet) {
            answers.push({
              question_index: isNaN(qNum) ? currentIdx : qNum,
              question_text: `Question ${(isNaN(qNum) ? currentIdx : qNum) + 1}`,
              recommended_action: "select_radio",
              target_element_ids: [],
              selected_labels: [answerSnippet],
              text_input_value: answerSnippet
            });
            currentIdx++;
          }
        }
      }

      if (answers.length > 0) {
        result = {
          page_summary: "Extracted answers from Gemini response",
          trap_detected: false,
          answers: answers
        };
      }
    }

    if (!result || !Array.isArray(result.answers) || result.answers.length === 0) {
      return null;
    }

    // Normalize all answer items for 100% reliable DOM matching
    const normalized = result.answers.map((ans, idx) => {
      let qIdx = (typeof ans.question_index === "number") ? ans.question_index : (typeof ans.question_number === "number" ? ans.question_number - 1 : idx);
      let labels = Array.isArray(ans.selected_labels) ? [...ans.selected_labels] : [];
      if (labels.length === 0) {
        if (ans.selected_label) labels.push(String(ans.selected_label));
        else if (ans.answer && typeof ans.answer === "string") labels.push(ans.answer);
        else if (ans.choice) labels.push(String(ans.choice));
        else if (ans.value) labels.push(String(ans.value));
      }
      let action = ans.recommended_action || "select_radio";
      if (ans.recommended_action === "type_text" || ans.text_input_value || ans.text) {
        action = "type_text";
      }
      return {
        question_index: qIdx,
        question_text: ans.question_text || `Question ${qIdx + 1}`,
        recommended_action: action,
        target_element_ids: Array.isArray(ans.target_element_ids) ? ans.target_element_ids : [],
        selected_labels: labels,
        text_input_value: ans.text_input_value || ans.text || (action === "type_text" && labels[0] ? labels[0] : null),
        reasoning: ans.reasoning || "Answered by Google Gemini Web Account"
      };
    });

    // Correct 1-based indexing offsets if model returned 1..N
    if (normalized.length > 0 && normalized[0].question_index === 1 && !normalized.some(a => a.question_index === 0)) {
      normalized.forEach(a => { a.question_index -= 1; });
    }

    return {
      page_summary: result.page_summary || "Answered by Google Gemini Web Account",
      trap_detected: !!result.trap_detected,
      trap_alert_message: result.trap_alert_message || "",
      is_last_page: !!result.is_last_page,
      estimated_human_reading_seconds: result.estimated_human_reading_seconds || 3,
      answers: normalized
    };
  }

  // Helper: locate or switch to the appropriate Gemini Account tab (authuser=0, 1, or 2)
  async function getOrSwitchGeminiAccountTab(accountIndex = 1) {
    const authUserIdx = Math.max(0, parseInt(accountIndex, 10) - 1);
    const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });

    const exactTab = tabs.find(t => t.url && (
      t.url.includes(`authuser=${authUserIdx}`) ||
      (authUserIdx === 0 && !t.url.includes("authuser="))
    ));
    if (exactTab) {
      return exactTab;
    }

    const targetUrl = `https://gemini.google.com/app?authuser=${authUserIdx}`;
    if (tabs && tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { url: targetUrl });
      await waitForTabLoadComplete(tabs[0].id);
      await new Promise(r => setTimeout(r, 1500));
      return tabs[0];
    }

    return await openOrConnectGeminiTab(accountIndex);
  }

  // Main execution function with Multi-Account Failover (Plus -> Pro -> Ultra/Advanced)
  async function executeSurveyQuery(prompt, screenshotDataUrl) {
    console.log("[GeminiWebClient] Dispatching query to Google Gemini Web Accounts (Plus, Pro, Ultra)...");

    const storage = await chrome.storage.local.get([
      "geminiActiveAccountIndex", "geminiAcc1Email", "geminiAcc2Email", "geminiAcc3Email"
    ]);

    const activeIdx = storage.geminiActiveAccountIndex || 1;
    const accountOrder = [activeIdx, 1, 2, 3].filter((v, i, a) => a.indexOf(v) === i);
    let lastError = null;

    for (const accIdx of accountOrder) {
      try {
        console.log(`[GeminiWebClient] Sending survey query to Gemini Account ${accIdx}...`);
        const targetTab = await getOrSwitchGeminiAccountTab(accIdx);
        if (!targetTab || !targetTab.id) {
          throw new Error(`Unable to connect to Gemini Account ${accIdx} tab`);
        }

        let bridgeResponse = null;
        try {
          bridgeResponse = await chrome.tabs.sendMessage(targetTab.id, {
            action: "EXECUTE_GEMINI_WEB_QUERY",
            prompt: prompt,
            screenshot: screenshotDataUrl
          });
        } catch (msgErr) {
          console.warn(`[GeminiWebClient] Injecting bridge script into tab ${targetTab.id}:`, msgErr);
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ["content/gemini_tab_bridge.js"]
          });
          await new Promise(r => setTimeout(r, 1200));
          bridgeResponse = await chrome.tabs.sendMessage(targetTab.id, {
            action: "EXECUTE_GEMINI_WEB_QUERY",
            prompt: prompt,
            screenshot: screenshotDataUrl
          });
        }

        if (!bridgeResponse || !bridgeResponse.success) {
          throw new Error(bridgeResponse?.error || "Gemini Web did not return a valid response");
        }

        const rawText = bridgeResponse.text || "";
        const parsedData = extractJsonFromGeminiResponse(rawText);

        if (parsedData && parsedData.answers && Array.isArray(parsedData.answers) && parsedData.answers.length > 0) {
          console.log(`[GeminiWebClient] ✅ Received ${parsedData.answers.length} verified answers from Account ${accIdx}!`);
          chrome.storage.local.set({ geminiActiveAccountIndex: accIdx });
          const accLabels = { 1: "Gemini Plus", 2: "Gemini Pro", 3: "Gemini Ultra Pro" };
          return {
            success: true,
            modelUsed: `${accLabels[accIdx] || "Gemini Advanced"} (Web)`,
            providerUsed: `Google Gemini Web Account (${accLabels[accIdx] || "Pro"})`,
            data: parsedData,
            rawText: rawText
          };
        } else {
          throw new Error("Could not extract valid answers from Gemini output");
        }
      } catch (accErr) {
        console.warn(`[GeminiWebClient] Account ${accIdx} error (${accErr.message}). Switching to backup account...`);
        lastError = accErr;
      }
    }

    throw lastError || new Error("All Gemini Web accounts failed to generate survey answers.");
  }


  return {
    checkAuthStatus,
    openOrConnectGeminiTab,
    loginOrConnectGoogleGemini,
    exportSession,
    importSession,
    syncSessionToDesktopBridge,
    fetchSessionFromDesktopBridge,
    executeSurveyQuery
  };

})();

// Export globally for background service worker
if (typeof self !== "undefined") {
  self.GeminiWebClient = GeminiWebClient;
}
