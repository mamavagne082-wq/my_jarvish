/**
 * Jarvis AI Survey Copilot - Popup Controller (Gemini 3.8 Flash + Auto-Pilot)
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  const activeTabTitle = document.getElementById("active-tab-title");
  const btnToggleAutopilot = document.getElementById("btn-toggle-autopilot");
  const btnOneclickFill = document.getElementById("btn-oneclick-fill");
  const btnClickNext = document.getElementById("btn-click-next");
  const btnAnalyze = document.getElementById("btn-analyze-now");
  const btnClear = document.getElementById("btn-clear-now");
  const btnToggleHud = document.getElementById("btn-toggle-hud");
  const btnEditPersonalInfo = document.getElementById("btn-edit-personal-info");
  const personaSummaryBadge = document.getElementById("persona-summary-badge");

  const liveStatusText = document.getElementById("live-status-text");
  const trapAlertCard = document.getElementById("trap-alert-card");
  const trapDesc = document.getElementById("trap-desc");
  const apiAlertCard = document.getElementById("api-limit-alert-card");
  const apiAlertTitle = document.getElementById("api-alert-title");
  const apiAlertDesc = document.getElementById("api-alert-desc");
  const apiAlertMeta = document.getElementById("api-alert-meta");
  const btnDismissApiAlert = document.getElementById("btn-dismiss-api-alert");
  const resultsList = document.getElementById("results-list");
  const resultsCount = document.getElementById("results-count");

  // Personal Info Form elements
  const btnSavePersonalInfo = document.getElementById("btn-save-personal-info");
  const btnSyncFromJarvis = document.getElementById("btn-sync-from-jarvis");
  const personalInfoStatus = document.getElementById("personal-info-status");

  // Settings elements
  const inputApiKey = document.getElementById("input-api-key");
  const inputApiKey2 = document.getElementById("input-api-key-2");
  const inputApiKey3 = document.getElementById("input-api-key-3");
  const btnToggleKey = document.getElementById("btn-toggle-key");
  const btnToggleKey2 = document.getElementById("btn-toggle-key-2");
  const btnToggleKey3 = document.getElementById("btn-toggle-key-3");
  const selectModel = document.getElementById("select-model");
  const selectProviderPriority = document.getElementById("select-provider-priority");
  const inputFillDelay = document.getElementById("input-fill-delay");
  const checkUseVision = document.getElementById("check-use-vision");
  const checkLocalBridge = document.getElementById("check-local-bridge");
  const bridgeStatusText = document.getElementById("bridge-status-text");
  const btnSaveSettings = document.getElementById("btn-save-settings");
  const modelNameBadge = document.getElementById("model-name-badge");

  // OpenRouter settings elements
  const inputOrApiKey = document.getElementById("input-or-api-key");
  const inputOrApiKey2 = document.getElementById("input-or-api-key-2");
  const inputOrApiKey3 = document.getElementById("input-or-api-key-3");
  const btnToggleOrKey = document.getElementById("btn-toggle-or-key");
  const btnToggleOrKey2 = document.getElementById("btn-toggle-or-key-2");
  const btnToggleOrKey3 = document.getElementById("btn-toggle-or-key-3");
  const selectOrModel = document.getElementById("select-or-model");
  const checkUseOpenRouter = document.getElementById("check-use-openrouter");
  const openRouterSettings = document.getElementById("openrouter-settings");
  const openRouterModelSettings = document.getElementById("openrouter-model-settings");

  // Torve AI settings elements
  const inputTorveApiKey = document.getElementById("input-torve-api-key");
  const inputTorveApiKey2 = document.getElementById("input-torve-api-key-2");
  const inputTorveApiKey3 = document.getElementById("input-torve-api-key-3");
  const btnToggleTorveKey = document.getElementById("btn-toggle-torve-key");
  const btnToggleTorveKey2 = document.getElementById("btn-toggle-torve-key-2");
  const btnToggleTorveKey3 = document.getElementById("btn-toggle-torve-key-3");
  const selectTorveModel = document.getElementById("select-torve-model");
  const checkUseTorveAi = document.getElementById("check-use-torveai");
  const torveAiSettings = document.getElementById("torveai-settings");
  const torveAiSettings2 = document.getElementById("torveai-settings-2");
  const torveAiSettings3 = document.getElementById("torveai-settings-3");
  const torveAiModelSettings = document.getElementById("torveai-model-settings");

  const settingsSaveMsg = document.getElementById("settings-save-msg");

  // Memory Cache & Knowledge Base Hub elements
  const copilotCacheCount = document.getElementById("copilot-cache-count");
  const copilotKbCount = document.getElementById("copilot-kb-count");
  const badgeSavedCalls = document.getElementById("badge-saved-calls");
  const btnQuickUploadFile = document.getElementById("btn-quick-upload-file");
  const quickFileInput = document.getElementById("quick-file-input");
  const btnQuickClearCache = document.getElementById("btn-quick-clear-cache");

  // Memory Tab elements
  const memQaCount = document.getElementById("mem-qa-count");
  const memHitCount = document.getElementById("mem-hit-count");
  const btnClearMemoryCache = document.getElementById("btn-clear-memory-cache");
  const cacheClearMsg = document.getElementById("cache-clear-msg");

  const kbDropZone = document.getElementById("kb-drop-zone");
  const kbFileInput = document.getElementById("kb-file-input");
  const kbUploadStatus = document.getElementById("kb-upload-status");
  const kbFilesCount = document.getElementById("kb-files-count");
  const kbFilesList = document.getElementById("kb-files-list");
  const btnClearAllFiles = document.getElementById("btn-clear-all-files");

  const inputMemoryApiKey = document.getElementById("input-memory-api-key");
  const btnToggleMemoryKey = document.getElementById("btn-toggle-memory-key");
  const selectMemoryProvider = document.getElementById("select-memory-provider");
  const btnSaveMemorySettings = document.getElementById("btn-save-memory-settings");
  const memorySettingsMsg = document.getElementById("memory-settings-msg");

  // Settings Tab Memory elements
  const inputSettingsMemKey = document.getElementById("input-settings-mem-key");
  const btnToggleSettingsMemKey = document.getElementById("btn-toggle-settings-mem-key");

  let isAutoPilotActive = false;

  function switchToTab(tabId) {
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add("active");
    const targetContent = document.getElementById(tabId);
    if (targetContent) targetContent.classList.add("active");
  }

  // 1. Tab Navigation
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");
      switchToTab(targetId);
    });
  });

  if (btnEditPersonalInfo) {
    btnEditPersonalInfo.addEventListener("click", () => {
      switchToTab("tab-persona");
    });
  }

  // Helper to dynamically get the active tab (handles tab switching or reload)
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) return tab;
    const [lastTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return lastTab || null;
  }

  // 2. Load Active Tab Info
  const activeTab = await getCurrentTab();
  if (activeTab) {
    activeTabTitle.innerText = activeTab.title || activeTab.url || "Active Tab";
    activeTabTitle.title = activeTab.url || "";
  }

  // 3. Load Storage Settings & Auto-Pilot State
  const storage = await chrome.storage.local.get(null);

  // Load Gemini Keys (up to 3)
  if (inputApiKey) inputApiKey.value = storage.geminiApiKey || "AQ.Ab8RN6LtcM7pevIID9jpLXKQ_030T06c0A2UhJDnYOBQPb7O5w";
  if (inputApiKey2) inputApiKey2.value = storage.geminiApiKey2 || "AQ.Ab8RN6J1FBmr5Rfi34mDhIDv1nmmVqt9WLcpUZrGS30lX761ng";
  if (inputApiKey3) inputApiKey3.value = storage.geminiApiKey3 || "";

  // Gemini model: auto-upgrade any 2.5 / 1.5 / outdated model to working gemini-3.8-flash
  let savedModel = storage.geminiModel;
  if (!savedModel || savedModel.includes("2.5") || savedModel.includes("1.5") || savedModel.includes("latest") || savedModel.includes("preview")) {
    savedModel = "gemini-3.8-flash";
    await chrome.storage.local.set({ geminiModel: "gemini-3.8-flash" });
  }
  if (selectModel) selectModel.value = savedModel;
  if (modelNameBadge) {
    modelNameBadge.innerText = "3.8-FLASH";
  }

  // Priority
  if (selectProviderPriority && storage.providerPriority) {
    selectProviderPriority.value = storage.providerPriority;
  }

  if (storage.autoFillDelay && inputFillDelay) {
    inputFillDelay.value = storage.autoFillDelay;
  }
  if (checkLocalBridge && storage.localBridgeEnabled !== undefined) {
    checkLocalBridge.checked = storage.localBridgeEnabled;
  }

  // Load OpenRouter settings (up to 3 keys)
  if (inputOrApiKey) inputOrApiKey.value = storage.openRouterApiKey || "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";
  if (inputOrApiKey2) inputOrApiKey2.value = storage.openRouterApiKey2 || "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";
  if (inputOrApiKey3) inputOrApiKey3.value = storage.openRouterApiKey3 || "";

  if (selectOrModel && storage.openRouterModel) {
    selectOrModel.value = storage.openRouterModel;
  }
  if (checkUseOpenRouter) {
    checkUseOpenRouter.checked = storage.useOpenRouter !== undefined ? !!storage.useOpenRouter : true;
    toggleOpenRouterSectionVisibility(checkUseOpenRouter.checked);
  }

  // Load Torve AI settings (up to 3 keys)
  if (inputTorveApiKey) inputTorveApiKey.value = storage.torveAiApiKey || "";
  if (inputTorveApiKey2) inputTorveApiKey2.value = storage.torveAiApiKey2 || "";
  if (inputTorveApiKey3) inputTorveApiKey3.value = storage.torveAiApiKey3 || "";

  if (selectTorveModel && storage.torveAiModel) {
    selectTorveModel.value = storage.torveAiModel;
  }
  if (checkUseTorveAi) {
    checkUseTorveAi.checked = storage.useTorveAi !== undefined ? !!storage.useTorveAi : true;
    toggleTorveAiSectionVisibility(checkUseTorveAi.checked);
  }

  // Auto-Pilot state
  isAutoPilotActive = !!storage.autoPilotActive;
  updateAutopilotButtonUI(isAutoPilotActive);

  // Render previous or active analysis results if available
  if (storage.lastAnalysisResult) {
    renderResults(storage.lastAnalysisResult);
    updateStatus("idle", storage.lastAnalysisResult.is_screenshot_analysis
      ? "📸 স্ক্রিনশট এনালাইসিস থেকে পাওয়া সঠিক উত্তর নিচে প্রদর্শিত।"
      : "পেজ এনালাইসিস ফলাফল নিচে প্রদর্শিত।");
  }

  // Real-time listener for background / content script updates
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastAnalysisResult && changes.lastAnalysisResult.newValue) {
      renderResults(changes.lastAnalysisResult.newValue);
    }
    if (changes.autoPilotActive !== undefined) {
      isAutoPilotActive = !!changes.autoPilotActive.newValue;
      updateAutopilotButtonUI(isAutoPilotActive);
    }
    if (changes.jarvis_memory_stats || changes.memoryApiKey || changes.memoryProvider) {
      loadMemoryStatsAndFiles();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "SURVEY_ANALYSIS_UPDATED" && message.data) {
      renderResults(message.data);
    }
  });

  // Initial load of Memory Cache & Knowledge Base datasets
  loadMemoryStatsAndFiles();

  // Populate Personal Info form from storage or desktop bridge
  if (storage.personalInfo) {
    populatePersonalInfoForm(storage.personalInfo);
  } else {
    // Try fetching from local desktop server
    fetchProfileFromJarvisBackend();
  }

  // If user hasn't verified personal info yet, show the form immediately
  if (!storage.personalInfoVerified) {
    switchToTab("tab-persona");
    if (personalInfoStatus) {
      personalInfoStatus.innerText = "👋 সার্ভে শুরু করার আগে আপনার প্রোফাইল তথ্য নিশ্চিত করে 'Save' বাটনে ক্লিক করুন।";
      personalInfoStatus.className = "personal-info-msg info";
    }
  }

  // Check and display active API limit alerts
  if (storage.activeApiAlerts && storage.activeApiAlerts.length > 0 && apiAlertCard) {
    const alert = storage.activeApiAlerts[0];
    apiAlertCard.classList.remove("hidden");
    if (apiAlertTitle) apiAlertTitle.innerText = `⚠️ API Limit Alert: ${alert.api_name}`;
    if (apiAlertDesc) apiAlertDesc.innerText = alert.warning_message;
    if (apiAlertMeta) {
      apiAlertMeta.innerText = `Usage: ${alert.current_usage} / ${alert.limit} ${alert.unit || "calls"} (${alert.usage_percent}%)`;
    }
  }

  if (btnDismissApiAlert && apiAlertCard) {
    btnDismissApiAlert.addEventListener("click", async () => {
      apiAlertCard.classList.add("hidden");
      await chrome.storage.local.remove(["activeApiAlerts"]);
    });
  }

  // Check Local Bridge
  checkJarvisBridgeStatus();

  // 4. Toggle API Key Visibility helper
  function setupPasswordToggle(btn, input) {
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      if (input.type === "password") {
        input.type = "text";
        btn.innerText = "🔒";
      } else {
        input.type = "password";
        btn.innerText = "👁️";
      }
    });
  }

  setupPasswordToggle(btnToggleKey, inputApiKey);
  setupPasswordToggle(btnToggleKey2, inputApiKey2);
  setupPasswordToggle(btnToggleKey3, inputApiKey3);

  setupPasswordToggle(btnToggleOrKey, inputOrApiKey);
  setupPasswordToggle(btnToggleOrKey2, inputOrApiKey2);
  setupPasswordToggle(btnToggleOrKey3, inputOrApiKey3);

  setupPasswordToggle(btnToggleTorveKey, inputTorveApiKey);
  setupPasswordToggle(btnToggleTorveKey2, inputTorveApiKey2);
  setupPasswordToggle(btnToggleTorveKey3, inputTorveApiKey3);

  setupPasswordToggle(btnToggleMemoryKey, inputMemoryApiKey);
  setupPasswordToggle(btnToggleSettingsMemKey, inputSettingsMemKey);

  // Sync memory key input fields when typed into either one
  if (inputMemoryApiKey && inputSettingsMemKey) {
    inputMemoryApiKey.addEventListener("input", () => {
      inputSettingsMemKey.value = inputMemoryApiKey.value;
    });
    inputSettingsMemKey.addEventListener("input", () => {
      inputMemoryApiKey.value = inputSettingsMemKey.value;
    });
  }

  // Toggle OpenRouter section visibility when checkbox changes
  if (checkUseOpenRouter) {
    checkUseOpenRouter.addEventListener("change", () => {
      toggleOpenRouterSectionVisibility(checkUseOpenRouter.checked);
    });
  }

  // Toggle Torve AI section visibility when checkbox changes
  if (checkUseTorveAi) {
    checkUseTorveAi.addEventListener("change", () => {
      toggleTorveAiSectionVisibility(checkUseTorveAi.checked);
    });
  }

  // 5. Save Settings
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", async () => {
      const updated = {
        geminiApiKey: inputApiKey ? inputApiKey.value.trim() : "",
        geminiApiKey2: inputApiKey2 ? inputApiKey2.value.trim() : "",
        geminiApiKey3: inputApiKey3 ? inputApiKey3.value.trim() : "",
        geminiModel: selectModel ? selectModel.value : "gemini-3.8-flash",
        providerPriority: selectProviderPriority ? selectProviderPriority.value : "gemini_first",
        autoFillDelay: inputFillDelay ? parseInt(inputFillDelay.value, 10) || 350 : 350,
        useVisionScreenshot: false,
        localBridgeEnabled: checkLocalBridge ? checkLocalBridge.checked : true,
        // OpenRouter settings
        openRouterApiKey: inputOrApiKey ? inputOrApiKey.value.trim() : "",
        openRouterApiKey2: inputOrApiKey2 ? inputOrApiKey2.value.trim() : "",
        openRouterApiKey3: inputOrApiKey3 ? inputOrApiKey3.value.trim() : "",
        openRouterModel: selectOrModel ? selectOrModel.value : "google/gemini-2.5-flash",
        useOpenRouter: checkUseOpenRouter ? checkUseOpenRouter.checked : true,
        // Torve AI settings
        torveAiApiKey: inputTorveApiKey ? inputTorveApiKey.value.trim() : "",
        torveAiApiKey2: inputTorveApiKey2 ? inputTorveApiKey2.value.trim() : "",
        torveAiApiKey3: inputTorveApiKey3 ? inputTorveApiKey3.value.trim() : "",
        torveAiModel: selectTorveModel ? selectTorveModel.value : "claude-opus-4-8",
        useTorveAi: checkUseTorveAi ? checkUseTorveAi.checked : true,
        // Memory settings
        memoryApiKey: inputSettingsMemKey ? inputSettingsMemKey.value.trim() : (inputMemoryApiKey ? inputMemoryApiKey.value.trim() : ""),
        memoryProvider: selectMemoryProvider ? selectMemoryProvider.value : "local_offline"
      };

      await chrome.storage.local.set(updated);

      if (modelNameBadge && updated.geminiModel) {
        modelNameBadge.innerText = updated.geminiModel.replace("gemini-", "").toUpperCase();
      }

      if (settingsSaveMsg) {
        const geminiCount = [updated.geminiApiKey, updated.geminiApiKey2, updated.geminiApiKey3].filter(Boolean).length;
        const orCount = [updated.openRouterApiKey, updated.openRouterApiKey2, updated.openRouterApiKey3].filter(Boolean).length;
        const torveCount = [updated.torveAiApiKey, updated.torveAiApiKey2, updated.torveAiApiKey3].filter(Boolean).length;

        let statusText = `✅ সেটিংস সেভ হয়েছে! Gemini: ${geminiCount}টি | OpenRouter: ${orCount}টি | Torve AI: ${torveCount}টি فعال`;
        if (geminiCount === 0 && orCount === 0 && torveCount === 0) {
          statusText = "⚠️ কোনো API Key দেওয়া নেই! লোকাল নলেজ বেস ফাইল বা মেমরি ক্যাশ ছাড়া সার্ভে কাজ করবে না।";
        }
        settingsSaveMsg.innerText = statusText;
        settingsSaveMsg.className = (geminiCount > 0 || orCount > 0 || torveCount > 0)
          ? "personal-info-msg success" : "personal-info-msg error";
        setTimeout(() => {
          if (settingsSaveMsg) settingsSaveMsg.innerText = "";
        }, 3500);
      }

      if (btnSaveSettings) {
        btnSaveSettings.innerText = "✅ Saved!";
        setTimeout(() => {
          btnSaveSettings.innerText = "💾 Save Settings";
        }, 1800);
      }
    });
  }

  // Auto-save settings on input/change/blur so pasted keys are never lost
  const autoSaveInputs = [
    inputApiKey, inputApiKey2, inputApiKey3, selectModel, selectProviderPriority,
    inputFillDelay, inputOrApiKey, inputOrApiKey2, inputOrApiKey3, selectOrModel,
    inputTorveApiKey, inputTorveApiKey2, inputTorveApiKey3, selectTorveModel,
    inputMemoryApiKey, inputSettingsMemKey, selectMemoryProvider
  ];
  let autoSaveTimer = null;
  function triggerAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(async () => {
      const updated = {
        geminiApiKey: inputApiKey ? inputApiKey.value.trim() : "",
        geminiApiKey2: inputApiKey2 ? inputApiKey2.value.trim() : "",
        geminiApiKey3: inputApiKey3 ? inputApiKey3.value.trim() : "",
        geminiModel: selectModel ? selectModel.value : "gemini-3.8-flash",
        providerPriority: selectProviderPriority ? selectProviderPriority.value : "gemini_first",
        autoFillDelay: inputFillDelay ? parseInt(inputFillDelay.value, 10) || 350 : 350,
        localBridgeEnabled: checkLocalBridge ? checkLocalBridge.checked : true,
        openRouterApiKey: inputOrApiKey ? inputOrApiKey.value.trim() : "",
        openRouterApiKey2: inputOrApiKey2 ? inputOrApiKey2.value.trim() : "",
        openRouterApiKey3: inputOrApiKey3 ? inputOrApiKey3.value.trim() : "",
        openRouterModel: selectOrModel ? selectOrModel.value : "google/gemini-2.5-flash",
        useOpenRouter: checkUseOpenRouter ? checkUseOpenRouter.checked : true,
        torveAiApiKey: inputTorveApiKey ? inputTorveApiKey.value.trim() : "",
        torveAiApiKey2: inputTorveApiKey2 ? inputTorveApiKey2.value.trim() : "",
        torveAiApiKey3: inputTorveApiKey3 ? inputTorveApiKey3.value.trim() : "",
        torveAiModel: selectTorveModel ? selectTorveModel.value : "claude-opus-4-8",
        useTorveAi: checkUseTorveAi ? checkUseTorveAi.checked : true,
        memoryApiKey: inputSettingsMemKey ? inputSettingsMemKey.value.trim() : (inputMemoryApiKey ? inputMemoryApiKey.value.trim() : ""),
        memoryProvider: selectMemoryProvider ? selectMemoryProvider.value : "local_offline"
      };
      await chrome.storage.local.set(updated);
      console.log("[Jarvis Popup] Settings auto-saved.");
    }, 300);
  }
  autoSaveInputs.forEach(el => {
    if (el) {
      el.addEventListener("input", triggerAutoSave);
      el.addEventListener("change", triggerAutoSave);
      el.addEventListener("blur", triggerAutoSave);
    }
  });

  // 6. Action: Toggle Autonomous Auto-Pilot
  if (btnToggleAutopilot) {
    btnToggleAutopilot.addEventListener("click", async () => {
      isAutoPilotActive = !isAutoPilotActive;
      await chrome.storage.local.set({ autoPilotActive: isAutoPilotActive });
      updateAutopilotButtonUI(isAutoPilotActive);

      const targetTab = await getCurrentTab();
      if (targetTab?.id) {
        try {
          await sendTabAction(targetTab.id, {
            action: "AUTOPILOT_STATE_CHANGED",
            active: isAutoPilotActive
          });
        } catch (e) {
          updateStatus("error", e.message || "Could not reach tab.");
        }
      }

      if (isAutoPilotActive) {
        updateStatus("success", "🤖 Auto-Pilot Started: Hands-free loop is active!");
      } else {
        updateStatus("idle", "Auto-Pilot stopped.");
      }
    });
  }

  // 7. Action: Manual Mode 1-Click Page Auto-Fill
  if (btnOneclickFill) {
    btnOneclickFill.addEventListener("click", async () => {
      const targetTab = await getCurrentTab();
      if (!targetTab?.id) {
        updateStatus("error", "কোনো সক্রিয় ব্রাউজার ট্যাব পাওয়া যায়নি।");
        return;
      }

      btnOneclickFill.disabled = true;
      btnOneclickFill.innerHTML = `<span>⏳</span> উত্তর সিলেক্ট হচ্ছে...`;
      updateStatus("loading", "ম্যানুয়াল মোড: জেমিনি ৩.৮ দিয়ে পেজ এনালাইসিস ও উত্তর নির্বাচন হচ্ছে...");

      try {
        const response = await sendTabAction(targetTab.id, {
          action: "ONE_CLICK_AUTOFILL_NEXT"
        });

        if (response && response.success) {
          if (response.data) {
            renderResults(response.data);
          }
          if (response.isScreenshot) {
            updateStatus("success", `📸 স্ক্রিনশট এনালাইসিস সম্পন্ন! নিচে সঠিক উত্তরগুলো দেখানো হলো।`);
          } else if (response.data?.is_from_cache || response.data?.source === "memory_cache") {
            updateStatus("success", `⚡ Answered from Memory Cache ⚡ (${response.filledCount || response.data?.answers?.length || 0}টি উত্তর সিলেক্ট সম্পন্ন, 0 API Calls)`);
          } else if (response.data?.source === "knowledge_base") {
            updateStatus("success", `📄 Answered from Knowledge Base 📄 (${response.filledCount || response.data?.answers?.length || 0}টি উত্তর ফাইল থেকে সিলেক্ট সম্পন্ন)`);
          } else if (response.data?.source === "mixed_api") {
            updateStatus("success", `⚡🤖 Hybrid: Memory Cache + API (${response.filledCount || response.data?.answers?.length || 0}টি উত্তর সিলেক্ট সম্পন্ন)`);
          } else {
            updateStatus("success", `🤖 Answered via API 🤖 (${response.filledCount || 0}টি উত্তর সিলেক্ট সম্পন্ন! আপনি দেখে নিয়ে Next চাপুন)`);
          }
        } else {
          updateStatus("error", response?.message || response?.error || "Auto-fill failed.");
        }
      } catch (err) {
        updateStatus("error", err.message || "Operation failed.");
      } finally {
        btnOneclickFill.disabled = false;
        btnOneclickFill.innerHTML = `<span class="btn-icon">🎯</span><span class="btn-label">ম্যানুয়ালি উত্তর সিলেক্ট করুন (Alt+S)</span>`;
      }
    });
  }

  // 8. Action: Next Page Button
  if (btnClickNext) {
    btnClickNext.addEventListener("click", async () => {
      const targetTab = await getCurrentTab();
      if (!targetTab?.id) return;
      try {
        const res = await sendTabAction(targetTab.id, { action: "CLICK_NEXT_BUTTON" });
        if (res && res.success) {
          updateStatus("success", "Proceeding to next page...");
        } else {
          updateStatus("error", res?.message || "Next button not detected.");
        }
      } catch (err) {
        updateStatus("error", err.message || "Could not trigger next button.");
      }
    });
  }

  // 9. Action: Scan Only
  if (btnAnalyze) {
    btnAnalyze.addEventListener("click", async () => {
      const targetTab = await getCurrentTab();
      if (!targetTab?.id) return;
      btnAnalyze.disabled = true;
      updateStatus("loading", "Scanning questions with Gemini 3.8 Flash...");
      try {
        const response = await sendTabAction(targetTab.id, { action: "SCAN_AND_ANALYZE", show_hud: true });
        if (response && response.success) {
          renderResults(response.data);
          if (response.data?.is_from_cache || response.data?.source === "memory_cache") {
            updateStatus("success", "⚡ Answered from Memory Cache ⚡ (Instant Match / Zero API Cost)");
          } else if (response.data?.source === "knowledge_base") {
            updateStatus("success", "📄 Answered from Knowledge Base 📄 (Dataset Match)");
          } else if (response.data?.source === "mixed_api") {
            updateStatus("success", "⚡🤖 Hybrid: Answered via Memory Cache + API");
          } else {
            updateStatus("success", "🤖 Answered via API 🤖 (Gemini 3.8 Flash)");
          }
        } else {
          updateStatus("error", response?.error || "Scan failed.");
        }
      } catch (e) {
        updateStatus("error", e.message || "Failed.");
      } finally {
        btnAnalyze.disabled = false;
      }
    });
  }

  // 10. Clear Highlights
  if (btnClear) {
    btnClear.addEventListener("click", async () => {
      const targetTab = await getCurrentTab();
      if (!targetTab?.id) return;
      try {
        await sendTabAction(targetTab.id, { action: "CLEAR_HIGHLIGHTS" });
        if (resultsList) resultsList.innerHTML = `<div class="empty-state">Highlights cleared.</div>`;
        if (resultsCount) resultsCount.innerText = "0";
        if (trapAlertCard) trapAlertCard.classList.add("hidden");
        updateStatus("idle", "Page highlights cleared.");
      } catch (e) {
        updateStatus("error", e.message || "Failed to clear highlights.");
      }
    });
  }

  // 11. Toggle HUD
  if (btnToggleHud) {
    btnToggleHud.addEventListener("click", async () => {
      const targetTab = await getCurrentTab();
      if (!targetTab?.id) return;
      try {
        const hudRes = await sendTabAction(targetTab.id, { action: "TOGGLE_HUD" });
        updateStatus("idle", hudRes?.visible ? "Page HUD opened." : "Page HUD toggled.");
      } catch (e) {
        updateStatus("error", e.message || "Failed to toggle HUD.");
      }
    });
  }

  // 12. Save & Sync Personal Info Form
  if (btnSavePersonalInfo) {
    btnSavePersonalInfo.addEventListener("click", async () => {
      btnSavePersonalInfo.disabled = true;
      btnSavePersonalInfo.innerText = "⏳ Saving & Syncing...";
      try {
        const formData = collectPersonalInfoForm();
        await chrome.storage.local.set({
          personalInfo: formData,
          personalInfoVerified: true
        });

        // Update badge on copilot tab
        if (personaSummaryBadge) {
          personaSummaryBadge.innerText = `${formData.firstName || "John"} (${formData.myAge || "32"}, ${formData.postalZipCode || "10001"})`;
        }

        // Sync to Jarvis Desktop backend
        const { localBridgeUrl } = await chrome.storage.local.get(["localBridgeUrl"]);
        const baseUrl = localBridgeUrl || "http://127.0.0.1:8765";
        let syncedToBackend = false;

        try {
          const resp = await fetch(`${baseUrl}/save_profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
          });
          if (resp.ok) {
            syncedToBackend = true;
          }
        } catch (e) {
          // Desktop offline
        }

        if (personalInfoStatus) {
          personalInfoStatus.innerText = syncedToBackend
            ? "✅ Personal info saved locally and synced with Jarvis AI Desktop & Mem0!"
            : "✅ Personal info saved in browser extension! Ready for survey answering.";
          personalInfoStatus.className = "personal-info-msg success";
        }

        btnSavePersonalInfo.innerText = "✅ Saved Successfully!";
        setTimeout(() => {
          btnSavePersonalInfo.innerText = "💾 Save Personal Info & Sync";
          btnSavePersonalInfo.disabled = false;
          // Switch to Copilot tab so user can immediately launch Auto-Pilot or 1-Click
          switchToTab("tab-copilot");
          updateStatus("success", `✅ Profile ready: ${formData.firstName} ${formData.lastName} (${formData.myAge}). Click Auto-Pilot to start!`);
        }, 1200);
      } catch (err) {
        if (personalInfoStatus) {
          personalInfoStatus.innerText = `❌ Error saving info: ${err.message}`;
          personalInfoStatus.className = "personal-info-msg error";
        }
        btnSavePersonalInfo.disabled = false;
        btnSavePersonalInfo.innerText = "💾 Save Personal Info & Sync";
      }
    });
  }

  // 13. Load Profile from Jarvis Desktop Backend
  if (btnSyncFromJarvis) {
    btnSyncFromJarvis.addEventListener("click", async () => {
      btnSyncFromJarvis.disabled = true;
      btnSyncFromJarvis.innerText = "🔄 Loading...";
      await fetchProfileFromJarvisBackend(true);
      btnSyncFromJarvis.disabled = false;
      btnSyncFromJarvis.innerText = "🔄 Load from Jarvis Desktop";
    });
  }

  function updateAutopilotButtonUI(active) {
    if (active) {
      btnToggleAutopilot.classList.add("autopilot-active");
      btnToggleAutopilot.innerHTML = `🛑 STOP AUTO-PILOT (RUNNING)`;
    } else {
      btnToggleAutopilot.classList.remove("autopilot-active");
      btnToggleAutopilot.innerHTML = `▶ START AUTO-PILOT`;
    }
  }

  function updateStatus(type, msg) {
    liveStatusText.innerText = msg;
    const box = document.getElementById("live-status-box");
    box.className = `status-box status-${type}`;
  }

  function renderResults(data) {
    if (!resultsList || !data) return;
    resultsList.innerHTML = "";

    if (data.trap_detected) {
      if (trapAlertCard) trapAlertCard.classList.remove("hidden");
      if (trapDesc) trapDesc.innerText = data.trap_alert_message || "Carefully follow this attention check question!";
    } else {
      if (trapAlertCard) trapAlertCard.classList.add("hidden");
    }

    const answers = data.answers || [];
    if (resultsCount) resultsCount.innerText = answers.length;

    // Visual indicator based on answer source
    if (data.source === "hermes" || (data.model_used && data.model_used.includes("Hermes")) || (data.provider_used && data.provider_used.includes("Hermes"))) {
      const banner = document.createElement("div");
      banner.style.cssText = "background: rgba(124, 58, 237, 0.16); border: 1px solid #7c3aed; border-radius: 6px; padding: 6px 10px; font-size: 11px; margin-bottom: 8px; color: #c4b5fd;";
      banner.innerHTML = "🤖 <strong>Answered by Hermes AI Local Agent 🤖</strong><br><span style='color: #cbd5e1; font-size: 10px;'>100% অফলাইন এবং Zero API Cost এ প্রোফাইল ডাটাবেস থেকে নির্ভুল উত্তর নির্বাচিত (0 API Calls)।</span>";
      resultsList.appendChild(banner);
    } else if (data.is_from_cache || data.source === "memory_cache") {
      const banner = document.createElement("div");
      banner.style.cssText = "background: rgba(0, 255, 136, 0.12); border: 1px solid #00ff88; border-radius: 6px; padding: 6px 10px; font-size: 11px; margin-bottom: 8px; color: #00ff88;";
      banner.innerHTML = "⚡ <strong>Answered from Memory Cache ⚡</strong><br><span style='color: #cbd5e1; font-size: 10px;'>পূর্ববর্তী সার্ভে ইতিহাস থেকে 100% অফলাইনে উত্তর সম্পন্ন (0 API Calls / Zero Cost)।</span>";
      resultsList.appendChild(banner);
    } else if (data.source === "knowledge_base") {
      const banner = document.createElement("div");
      banner.style.cssText = "background: rgba(56, 189, 248, 0.12); border: 1px solid #38bdf8; border-radius: 6px; padding: 6px 10px; font-size: 11px; margin-bottom: 8px; color: #38bdf8;";
      banner.innerHTML = "📄 <strong>Answered from Knowledge Base 📄</strong><br><span style='color: #cbd5e1; font-size: 10px;'>আপলোড করা সার্ভে ডাটাবেস থেকে সরাসরি সঠিক উত্তর নির্বাচন করা হয়েছে।</span>";
      resultsList.appendChild(banner);
    } else if (data.source === "mixed_api") {
      const banner = document.createElement("div");
      banner.style.cssText = "background: rgba(168, 85, 247, 0.12); border: 1px solid #a855f7; border-radius: 6px; padding: 6px 10px; font-size: 11px; margin-bottom: 8px; color: #c084fc;";
      banner.innerHTML = "⚡🤖 <strong>Answered via Hybrid (Hermes/Memory + API)</strong><br><span style='color: #cbd5e1; font-size: 10px;'>পরিচিত প্রশ্নগুলো Hermes/মেমরি থেকে এবং বাকিগুলো AI API দিয়ে প্রস্তুত (API খরচ সর্বনিম্ন)।</span>";
      resultsList.appendChild(banner);
    } else if (data.is_screenshot_analysis) {
      const banner = document.createElement("div");
      banner.style.cssText = "background: rgba(0, 240, 255, 0.12); border: 1px solid #00f0ff; border-radius: 6px; padding: 6px 10px; font-size: 11px; margin-bottom: 8px; color: #00f0ff;";
      banner.innerHTML = "📸 <strong>Answered via API 🤖 (Gemini Vision)</strong><br><span style='color: #cbd5e1; font-size: 10px;'>পেজ সরাসরি বিশ্লেষণ না হওয়ায় সম্পূর্ণ স্ক্রিনশট নিয়ে সঠিক উত্তর নির্ণয় করা হয়েছে:</span>";
      resultsList.appendChild(banner);
    }

    if (answers.length === 0) {
      resultsList.innerHTML = `<div class="empty-state">কোনো উত্তর পাওয়া যায়নি।</div>`;
      return;
    }

    answers.forEach((ans, idx) => {
      const item = document.createElement("div");
      item.className = "ans-item";
      const choice = (ans.selected_labels || []).join(", ") || ans.text_input_value || "Option Chosen";

      let sourceBadge = "";
      if (ans.source === "hermes") {
        sourceBadge = `<span class="ans-source-badge tag-hermes" style="background:rgba(124,58,237,0.3); color:#c4b5fd; border:1px solid #7c3aed; padding:1px 5px; border-radius:4px; font-size:9px; font-weight:600;">🤖 Hermes</span>`;
      } else if (ans.source === "memory_cache") {
        sourceBadge = `<span class="ans-source-badge tag-cache">⚡ Cache</span>`;
      } else if (ans.source === "knowledge_base") {
        const fn = ans.fileName ? ` (${ans.fileName.slice(0, 14)})` : "";
        sourceBadge = `<span class="ans-source-badge tag-kb">📄 KB${fn}</span>`;
      } else {
        sourceBadge = `<span class="ans-source-badge tag-api">🤖 API</span>`;
      }

      item.innerHTML = `
        <div class="ans-title">
          <strong>প্রশ্ন ${idx + 1}:</strong> ${ans.question_text || "Question"}
          ${sourceBadge}
        </div>
        <div class="ans-pick"><span style="color:#00f0ff; font-weight:600;">সঠিক উত্তর:</span> <strong style="color:#00ff88;">${choice}</strong></div>
        ${ans.reasoning ? `<div style="font-size:10px; color:#94a3b8; margin-top:3px;">💡 <em>${ans.reasoning}</em></div>` : ""}
      `;
      resultsList.appendChild(item);
    });
  }

  function populatePersonalInfoForm(data) {
    if (!data) return;
    const fieldMap = {
      "info-first-name": data.firstName || data.first_name,
      "info-last-name": data.lastName || data.last_name,
      "info-age": data.myAge || data.age,
      "info-birthdate": data.birthdate || data.birth_date,
      "info-race": data.race || data.race_ethnicity,
      "info-ethnicity": data.ethnicity || data.hispanic_latino,
      "info-home": data.home || data.household_type,
      "info-language": data.language || data.language_spoken_at_home,
      "info-animals": data.animalPets || data.pet,
      "info-job-type": data.jobType || data.employment_status,
      "info-occupation": data.occupation || data.job_title,
      "info-employees": data.companyEmployees || data.organization_employee_count,
      "info-decision": data.decisionTakers || data.decision_maker,
      "info-wife-age": data.wifeAge || data.wife_age,
      "info-son-age": data.sonAge,
      "info-daughter-age": data.daughterAge,
      "info-education": data.educationDegree || data.education,
      "info-zip": data.postalZipCode || data.zip_postal_code,
      "info-email": data.emailAddress || data.email,
      "info-country": data.country
    };

    for (const [id, val] of Object.entries(fieldMap)) {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) {
        el.value = val;
      }
    }

    if (personaSummaryBadge && (data.firstName || data.first_name)) {
      const name = data.firstName || data.first_name;
      const age = data.myAge || data.age || "32";
      const zip = data.postalZipCode || data.zip_postal_code || "10001";
      personaSummaryBadge.innerText = `${name} (${age}, ${zip})`;
    }
  }

  function collectPersonalInfoForm() {
    return {
      firstName: document.getElementById("info-first-name")?.value?.trim() || "John",
      lastName: document.getElementById("info-last-name")?.value?.trim() || "Smith",
      myAge: document.getElementById("info-age")?.value?.trim() || "32",
      birthdate: document.getElementById("info-birthdate")?.value?.trim() || "15/08/1992",
      race: document.getElementById("info-race")?.value?.trim() || "White",
      ethnicity: document.getElementById("info-ethnicity")?.value?.trim() || "Not hispanic/latin",
      home: document.getElementById("info-home")?.value?.trim() || "Own single Home/ Condo",
      language: document.getElementById("info-language")?.value?.trim() || "English",
      animalPets: document.getElementById("info-animals")?.value?.trim() || "Dog, Cat",
      jobType: document.getElementById("info-job-type")?.value?.trim() || "Full time",
      occupation: document.getElementById("info-occupation")?.value?.trim() || "Computer Software",
      companyEmployees: document.getElementById("info-employees")?.value?.trim() || "1000-5000",
      decisionTakers: document.getElementById("info-decision")?.value?.trim() || "Myself (all section)",
      wifeAge: document.getElementById("info-wife-age")?.value?.trim() || "30",
      sonAge: document.getElementById("info-son-age")?.value?.trim() || "5",
      daughterAge: document.getElementById("info-daughter-age")?.value?.trim() || "3",
      educationDegree: document.getElementById("info-education")?.value?.trim() || "Bachelor Degree",
      postalZipCode: document.getElementById("info-zip")?.value?.trim() || "10001",
      emailAddress: document.getElementById("info-email")?.value?.trim() || "alaminmiah1976@gmail.com",
      country: document.getElementById("info-country")?.value?.trim() || "United States"
    };
  }

  async function fetchProfileFromJarvisBackend(showMessage = false) {
    try {
      const { localBridgeUrl } = await chrome.storage.local.get(["localBridgeUrl"]);
      const baseUrl = localBridgeUrl || "http://127.0.0.1:8765";
      const resp = await fetch(`${baseUrl}/get_profile`);
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && json.personal_info) {
          populatePersonalInfoForm(json.personal_info);
          await chrome.storage.local.set({ personalInfo: json.personal_info, personalInfoVerified: true });
          if (showMessage && personalInfoStatus) {
            personalInfoStatus.innerText = "✅ Successfully loaded personal info from Jarvis Desktop!";
            personalInfoStatus.className = "personal-info-msg success";
          }
        }
      }

      // Also sync API keys from Jarvis Desktop if available
      try {
        const cfgResp = await fetch(`${baseUrl}/get_config`);
        if (cfgResp.ok) {
          const cfg = await cfgResp.json();
          if (cfg.success) {
            const updates = {};
            if (cfg.geminiApiKey && inputApiKey) { inputApiKey.value = cfg.geminiApiKey; updates.geminiApiKey = cfg.geminiApiKey; }
            if (cfg.geminiApiKey2 && inputApiKey2) { inputApiKey2.value = cfg.geminiApiKey2; updates.geminiApiKey2 = cfg.geminiApiKey2; }
            if (cfg.geminiApiKey3 && inputApiKey3) { inputApiKey3.value = cfg.geminiApiKey3; updates.geminiApiKey3 = cfg.geminiApiKey3; }
            if (cfg.openRouterApiKey && inputOrApiKey) { inputOrApiKey.value = cfg.openRouterApiKey; updates.openRouterApiKey = cfg.openRouterApiKey; }
            if (cfg.openRouterApiKey2 && inputOrApiKey2) { inputOrApiKey2.value = cfg.openRouterApiKey2; updates.openRouterApiKey2 = cfg.openRouterApiKey2; }
            if (cfg.openRouterApiKey3 && inputOrApiKey3) { inputOrApiKey3.value = cfg.openRouterApiKey3; updates.openRouterApiKey3 = cfg.openRouterApiKey3; }
            if (cfg.torveAiApiKey && inputTorveApiKey) { inputTorveApiKey.value = cfg.torveAiApiKey; updates.torveAiApiKey = cfg.torveAiApiKey; }
            if (cfg.torveAiApiKey2 && inputTorveApiKey2) { inputTorveApiKey2.value = cfg.torveAiApiKey2; updates.torveAiApiKey2 = cfg.torveAiApiKey2; }
            if (cfg.torveAiApiKey3 && inputTorveApiKey3) { inputTorveApiKey3.value = cfg.torveAiApiKey3; updates.torveAiApiKey3 = cfg.torveAiApiKey3; }
            if (Object.keys(updates).length > 0) {
              await chrome.storage.local.set(updates);
            }
          }
        }
      } catch (ce) {}
    } catch (e) {
      if (showMessage && personalInfoStatus) {
        personalInfoStatus.innerText = "⚪ Jarvis Desktop server offline; using local saved info.";
        personalInfoStatus.className = "personal-info-msg";
      }
    }
  }

  async function checkJarvisBridgeStatus() {
    try {
      const resp = await chrome.runtime.sendMessage({ action: "CHECK_LOCAL_JARVIS" });
      if (resp && resp.connected) {
        bridgeStatusText.innerText = "🟢 Connected (Local Desktop Jarvis)";
        bridgeStatusText.className = "status-connected";
      } else {
        bridgeStatusText.innerText = "🌐 Standalone Cloud Mode (Internet Direct)";
        bridgeStatusText.className = "status-connected";
      }
    } catch (e) {
      bridgeStatusText.innerText = "🌐 Standalone Cloud Mode (Internet Direct)";
      bridgeStatusText.className = "status-connected";
    }
  }

  async function ensureContentScriptInjected(tabId) {
    if (!tabId) return false;

    let tab = null;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (e) {
      return false;
    }

    if (!tab || !tab.url) return false;
    const url = tab.url;

    if (
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:") ||
      url.startsWith("devtools://") ||
      url.startsWith("view-source:")
    ) {
      throw new Error("ব্রাউজারের ইন্টারনাল পেজে (chrome://) এক্সটেনশন কাজ করে না। অনুগ্রহ করে কোনো সাধারণ ওয়েব পেজ বা সার্ভে পেজে যান।");
    }

    // 1. Initial quick ping check
    try {
      const pingRes = await chrome.tabs.sendMessage(tabId, { action: "PING" });
      if (pingRes && pingRes.pong) return true;
    } catch (e) {
      // Content script not answering yet
    }

    // 2. Programmatically inject content script into MAIN FRAME (target: { tabId: tabId })
    // In Manifest V3, injecting into main frame is rock-solid and never fails on accessible pages
    let injected = false;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content/content_script.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["content/overlay.css"]
      });
      injected = true;
    } catch (injectErr) {
      console.warn("[Jarvis Popup] Main frame executeScript:", injectErr);
      if (url.startsWith("file://")) {
        throw new Error("লোকাল ফাইল (file://) এ কাজ করতে Chrome Extensions পেজে গিয়ে এই এক্সটেনশনের 'Allow access to file URLs' অন করুন, অথবা পেজটি রিফ্রেশ (F5) করুন।");
      }
    }

    // Also attempt allFrames injection for nested surveys (ignore if restricted subframes error out)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        files: ["content/content_script.js"]
      });
    } catch (e) {}

    // 3. Verification polling: ping until content script acknowledges readiness (up to 2 seconds)
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 120));
      try {
        const pingRes = await chrome.tabs.sendMessage(tabId, { action: "PING" });
        if (pingRes && pingRes.pong) return true;
      } catch (err) {}
    }

    return injected;
  }

  /**
   * Dispatches survey actions across main frame and survey iframes with bulletproof error handling
   */
  async function sendTabAction(tabId, message) {
    const ready = await ensureContentScriptInjected(tabId);
    if (!ready) {
      throw new Error("এক্সটেনশন পেজের সাথে সংযোগ করতে পারছে না। অনুগ্রহ করে সার্ভে পেজটি একবার রিফ্রেশ (F5 বা Reload) করুন।");
    }

    // Try top frame first
    let mainResult = null;
    let mainErr = null;
    try {
      mainResult = await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
      if (mainResult && (mainResult.success || (mainResult.filledCount && mainResult.filledCount > 0))) {
        return mainResult;
      }
    } catch (e) {
      mainErr = e;
      console.warn("[Jarvis Popup] Frame 0 message failed:", e.message);
    }

    // Also try without frameId (browser default broadcast)
    try {
      const res = await chrome.tabs.sendMessage(tabId, message);
      if (res && (res.success || (res.filledCount && res.filledCount > 0))) {
        return res;
      }
      if (res && res.error) {
        return res;
      }
    } catch (e) {}

    // If survey is inside an iframe (like Survey Sherpa / Cint / Qualtrics), query all frames
    try {
      if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });
        for (const frame of frames) {
          if (frame.frameId === 0) continue;
          try {
            const frameRes = await chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId });
            if (frameRes && (frameRes.success || (frameRes.filledCount && frameRes.filledCount > 0))) {
              return frameRes;
            }
          } catch (err) {}
        }
      }
    } catch (e) {}

    // Return mainResult if we got one
    if (mainResult) return mainResult;
    if (mainErr) {
      throw new Error("সার্ভে পেজের সাথে সংযোগ স্থাপন সম্ভব হয়নি। অনুগ্রহ করে পেজটি একবার রিফ্রেশ (F5) করে আবার চেষ্টা করুন।");
    }
    throw new Error("পেজে কোনো প্রতিক্রিয়া পাওয়া যায়নি। অনুগ্রহ করে পেজটি রিফ্রেশ (F5) করুন।");
  }

  // =========================================================================
  // MEMORY CACHE & KNOWLEDGE BASE LOGIC
  // =========================================================================
  async function loadMemoryStatsAndFiles() {
    try {
      const statsRes = await chrome.runtime.sendMessage({ action: "MEMORY_GET_STATS" });
      if (statsRes && statsRes.success && statsRes.stats) {
        const stats = statsRes.stats;
        if (copilotCacheCount) copilotCacheCount.innerText = stats.cacheCount || 0;
        if (copilotKbCount) copilotKbCount.innerText = stats.kbEntriesCount || 0;
        if (badgeSavedCalls) badgeSavedCalls.innerText = `⚡ ${stats.savedApiCalls || 0} API Saved`;

        const hermesHitCount = document.getElementById("hermes-hit-count");
        const hermesSavedBadge = document.getElementById("hermes-saved-badge");
        if (hermesHitCount) hermesHitCount.innerText = stats.hermesHits || 0;
        if (hermesSavedBadge) hermesSavedBadge.innerText = `🤖 ${stats.hermesHits || 0} Offline Ans`;

        if (memQaCount) memQaCount.innerText = stats.cacheCount || 0;
        if (memHitCount) memHitCount.innerText = stats.savedApiCalls || 0;

        if (inputMemoryApiKey && stats.memoryApiKey) inputMemoryApiKey.value = stats.memoryApiKey;
        if (inputSettingsMemKey && stats.memoryApiKey) inputSettingsMemKey.value = stats.memoryApiKey;
        if (selectMemoryProvider && stats.memoryProvider) selectMemoryProvider.value = stats.memoryProvider;
      }

      const filesRes = await chrome.runtime.sendMessage({ action: "MEMORY_GET_FILES" });
      if (filesRes && filesRes.success && filesRes.files) {
        renderKnowledgeFilesList(filesRes.files);
      }
    } catch (e) {
      console.warn("[Jarvis Popup] loadMemoryStatsAndFiles error:", e);
    }
  }

  function renderKnowledgeFilesList(files) {
    if (!kbFilesList) return;
    if (kbFilesCount) kbFilesCount.innerText = files.length;

    if (!files || files.length === 0) {
      kbFilesList.innerHTML = `<div class="empty-state">No survey files attached yet. Upload a JSON, CSV, TXT, or PDF file.</div>`;
      return;
    }

    kbFilesList.innerHTML = "";
    files.forEach((f) => {
      const card = document.createElement("div");
      card.className = "kb-file-card";
      const sizeKb = Math.round((f.fileSize || 0) / 1024) || 1;
      const dateStr = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : "";

      card.innerHTML = `
        <div class="kb-file-info">
          <span class="kb-file-name" title="${f.fileName}">📄 ${f.fileName}</span>
          <span class="kb-file-meta">${f.entryCount} Q&A entries • ${sizeKb} KB • ${dateStr}</span>
        </div>
        <button type="button" class="btn-file-delete" data-file-id="${f.fileId}" title="Remove dataset file">🗑️</button>
      `;

      const delBtn = card.querySelector(".btn-file-delete");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          delBtn.disabled = true;
          try {
            await chrome.runtime.sendMessage({ action: "MEMORY_REMOVE_FILE", fileId: f.fileId });
            await loadMemoryStatsAndFiles();
          } catch (err) {
            console.error(err);
          }
        });
      }

      kbFilesList.appendChild(card);
    });
  }

  async function handleSurveyFileUpload(file) {
    if (!file) return;

    const validExtensions = [".json", ".csv", ".txt", ".pdf"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(ext)) {
      showUploadStatus("error", "❌ শুধুমাত্র JSON, CSV, TXT, বা PDF ফরম্যাটের ফাইল আপলোড করা যাবে।");
      return;
    }

    showUploadStatus("loading", `⏳ ${file.name} পড়া ও পার্স করা হচ্ছে...`);

    try {
      let content = null;
      let isBinary = false;

      if (ext === ".pdf") {
        isBinary = true;
        const arrayBuf = await file.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(arrayBuf);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        content = btoa(binary);
      } else {
        content = await file.text();
      }

      const res = await chrome.runtime.sendMessage({
        action: "MEMORY_UPLOAD_FILE",
        fileName: file.name,
        fileType: ext.replace(".", ""),
        fileSize: file.size,
        content: content,
        isBinary: isBinary
      });

      if (res && res.success) {
        showUploadStatus("success", `✅ ${res.fileName}: ${res.count}টি প্রশ্ন-উত্তরের ডাটাবেস সফলভাবে মেমরিতে যুক্ত হয়েছে!`);
        await loadMemoryStatsAndFiles();
      } else {
        showUploadStatus("error", `❌ ফাইল পার্সিং ব্যর্থ: ${res?.error || "অজ্ঞাত ত্রুটি"}`);
      }
    } catch (err) {
      showUploadStatus("error", `❌ ফাইল প্রসেসিং সমস্যা: ${err.message}`);
    }
  }

  function showUploadStatus(type, msg) {
    if (kbUploadStatus) {
      kbUploadStatus.innerText = msg;
      kbUploadStatus.className = `personal-info-msg ${type === "loading" ? "info" : type}`;
    }
    updateStatus(type === "loading" ? "loading" : (type === "success" ? "success" : "error"), msg);
  }

  async function handleClearMemoryCacheAction() {
    try {
      const res = await chrome.runtime.sendMessage({ action: "MEMORY_CLEAR_CACHE" });
      if (res && res.success) {
        if (cacheClearMsg) {
          cacheClearMsg.innerText = "✅ লোকাল মেমরি ক্যাশ সফলভাবে ক্লিয়ার করা হয়েছে!";
          cacheClearMsg.className = "personal-info-msg success";
          setTimeout(() => { if (cacheClearMsg) cacheClearMsg.innerText = ""; }, 3000);
        }
        updateStatus("success", "🧹 Local Memory Cache cleared! Ready for fresh survey type.");
        await loadMemoryStatsAndFiles();
      }
    } catch (e) {
      updateStatus("error", "Failed to clear memory cache: " + e.message);
    }
  }

  async function handleClearAllFilesAction() {
    try {
      const res = await chrome.runtime.sendMessage({ action: "MEMORY_CLEAR_ALL_FILES" });
      if (res && res.success) {
        showUploadStatus("success", "🗑️ সব সার্ভে নলেজ ফাইল মুছে ফেলা হয়েছে।");
        await loadMemoryStatsAndFiles();
      }
    } catch (e) {
      showUploadStatus("error", e.message);
    }
  }

  async function handleSaveMemorySettingsAction() {
    const key = (inputMemoryApiKey?.value || inputSettingsMemKey?.value || "").trim();
    const provider = selectMemoryProvider?.value || "local_offline";

    try {
      await chrome.runtime.sendMessage({
        action: "SAVE_MEMORY_SETTINGS",
        memoryApiKey: key,
        memoryProvider: provider
      });

      if (memorySettingsMsg) {
        memorySettingsMsg.innerText = "✅ Memory Settings Saved!";
        memorySettingsMsg.className = "personal-info-msg success";
        setTimeout(() => { if (memorySettingsMsg) memorySettingsMsg.innerText = ""; }, 3000);
      }
      updateStatus("success", "✅ Memory & Embedding settings saved!");
    } catch (e) {
      if (memorySettingsMsg) {
        memorySettingsMsg.innerText = "❌ " + e.message;
        memorySettingsMsg.className = "personal-info-msg error";
      }
    }
  }

  // Connect Button & File Event Listeners
  if (btnQuickClearCache) btnQuickClearCache.addEventListener("click", handleClearMemoryCacheAction);
  if (btnClearMemoryCache) btnClearMemoryCache.addEventListener("click", handleClearMemoryCacheAction);

  if (btnQuickUploadFile && quickFileInput) {
    btnQuickUploadFile.addEventListener("click", () => quickFileInput.click());
    quickFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSurveyFileUpload(e.target.files[0]);
        quickFileInput.value = "";
      }
    });
  }

  if (kbDropZone && kbFileInput) {
    kbDropZone.addEventListener("click", () => kbFileInput.click());
    kbFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSurveyFileUpload(e.target.files[0]);
        kbFileInput.value = "";
      }
    });

    kbDropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      kbDropZone.classList.add("drag-over");
    });
    kbDropZone.addEventListener("dragleave", () => {
      kbDropZone.classList.remove("drag-over");
    });
    kbDropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      kbDropZone.classList.remove("drag-over");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleSurveyFileUpload(e.dataTransfer.files[0]);
      }
    });
  }

  if (btnClearAllFiles) btnClearAllFiles.addEventListener("click", handleClearAllFilesAction);
  if (btnSaveMemorySettings) btnSaveMemorySettings.addEventListener("click", handleSaveMemorySettingsAction);

  // Helper: Show/hide OpenRouter settings fields based on checkbox state
  function toggleOpenRouterSectionVisibility(useOpenRouter) {
    if (openRouterSettings) {
      openRouterSettings.style.display = useOpenRouter ? "block" : "none";
    }
    if (openRouterModelSettings) {
      openRouterModelSettings.style.display = useOpenRouter ? "block" : "none";
    }
  }

  // Helper: Show/hide Torve AI settings fields based on checkbox state
  function toggleTorveAiSectionVisibility(useTorveAi) {
    if (torveAiSettings) torveAiSettings.style.display = useTorveAi ? "block" : "none";
    if (torveAiSettings2) torveAiSettings2.style.display = useTorveAi ? "block" : "none";
    if (torveAiSettings3) torveAiSettings3.style.display = useTorveAi ? "block" : "none";
    if (torveAiModelSettings) torveAiModelSettings.style.display = useTorveAi ? "block" : "none";
  }
});
