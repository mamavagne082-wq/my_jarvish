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
  const btnToggleKey = document.getElementById("btn-toggle-key");
  const selectModel = document.getElementById("select-model");
  const inputFillDelay = document.getElementById("input-fill-delay");
  const checkUseVision = document.getElementById("check-use-vision");
  const checkLocalBridge = document.getElementById("check-local-bridge");
  const bridgeStatusText = document.getElementById("bridge-status-text");
  const btnSaveSettings = document.getElementById("btn-save-settings");
  const modelNameBadge = document.getElementById("model-name-badge");

  // OpenRouter settings elements
  const inputOrApiKey = document.getElementById("input-or-api-key");
  const btnToggleOrKey = document.getElementById("btn-toggle-or-key");
  const selectOrModel = document.getElementById("select-or-model");
  const checkUseOpenRouter = document.getElementById("check-use-openrouter");
  const openRouterSettings = document.getElementById("openrouter-settings");
  const openRouterModelSettings = document.getElementById("openrouter-model-settings");
  const settingsSaveMsg = document.getElementById("settings-save-msg");

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

  // 2. Load Active Tab Info
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    activeTabTitle.innerText = activeTab.title || activeTab.url || "Active Tab";
    activeTabTitle.title = activeTab.url || "";
  }

  // 3. Load Storage Settings & Auto-Pilot State
  const storage = await chrome.storage.local.get(null);

  if (storage.geminiApiKey) {
    inputApiKey.value = storage.geminiApiKey;
  }

  const savedModel = storage.geminiModel || "gemini-3.8-flash";
  selectModel.value = savedModel;
  if (modelNameBadge) {
    const badgeText = savedModel.replace("gemini-", "").replace("-latest", "").toUpperCase();
    modelNameBadge.innerText = badgeText;
  }

  if (storage.autoFillDelay) {
    inputFillDelay.value = storage.autoFillDelay;
  }
  if (checkLocalBridge && storage.localBridgeEnabled !== undefined) {
    checkLocalBridge.checked = storage.localBridgeEnabled;
  }

  // Load OpenRouter settings
  if (inputOrApiKey && storage.openRouterApiKey) {
    inputOrApiKey.value = storage.openRouterApiKey;
  }
  if (selectOrModel && storage.openRouterModel) {
    selectOrModel.value = storage.openRouterModel;
  }
  if (checkUseOpenRouter) {
    checkUseOpenRouter.checked = !!storage.useOpenRouter;
    toggleOpenRouterSectionVisibility(!!storage.useOpenRouter);
  }

  // Auto-Pilot state
  isAutoPilotActive = !!storage.autoPilotActive;
  updateAutopilotButtonUI(isAutoPilotActive);

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

  // 4. Toggle API Key Visibility
  if (btnToggleKey && inputApiKey) {
    btnToggleKey.addEventListener("click", () => {
      if (inputApiKey.type === "password") {
        inputApiKey.type = "text";
        btnToggleKey.innerText = "🔒";
      } else {
        inputApiKey.type = "password";
        btnToggleKey.innerText = "👁️";
      }
    });
  }

  // Toggle OpenRouter API Key visibility
  if (btnToggleOrKey && inputOrApiKey) {
    btnToggleOrKey.addEventListener("click", () => {
      if (inputOrApiKey.type === "password") {
        inputOrApiKey.type = "text";
        btnToggleOrKey.innerText = "🔒";
      } else {
        inputOrApiKey.type = "password";
        btnToggleOrKey.innerText = "👁️";
      }
    });
  }

  // Toggle OpenRouter section visibility when checkbox changes
  if (checkUseOpenRouter) {
    checkUseOpenRouter.addEventListener("change", () => {
      toggleOpenRouterSectionVisibility(checkUseOpenRouter.checked);
    });
  }

  // 5. Save Settings
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", async () => {
      const updated = {
        geminiApiKey: inputApiKey ? inputApiKey.value.trim() : "",
        geminiModel: selectModel ? selectModel.value : "gemini-2.5-flash-latest",
        autoFillDelay: inputFillDelay ? parseInt(inputFillDelay.value, 10) || 350 : 350,
        useVisionScreenshot: false,
        localBridgeEnabled: checkLocalBridge ? checkLocalBridge.checked : true,
        // OpenRouter settings
        openRouterApiKey: inputOrApiKey ? inputOrApiKey.value.trim() : "",
        openRouterModel: selectOrModel ? selectOrModel.value : "google/gemini-2.5-flash",
        useOpenRouter: checkUseOpenRouter ? checkUseOpenRouter.checked : false
      };

      await chrome.storage.local.set(updated);

      if (modelNameBadge && updated.geminiModel) {
        modelNameBadge.innerText = updated.geminiModel.replace("gemini-", "").toUpperCase();
      }

      if (settingsSaveMsg) {
        const apiMode = updated.useOpenRouter && updated.openRouterApiKey
          ? `✅ সেভ হয়েছে! OpenRouter (${updated.openRouterModel}) সক্রিয়।`
          : updated.geminiApiKey
          ? `✅ সেভ হয়েছে! Gemini (${updated.geminiModel}) সক্রিয়।`
          : "⚠️ API Key দেওয়া নেই! এক্সটেনশন কাজ করবে না।";
        settingsSaveMsg.innerText = apiMode;
        settingsSaveMsg.className = updated.geminiApiKey || (updated.useOpenRouter && updated.openRouterApiKey)
          ? "personal-info-msg success" : "personal-info-msg error";
        setTimeout(() => {
          if (settingsSaveMsg) settingsSaveMsg.innerText = "";
        }, 3000);
      }

      if (btnSaveSettings) {
        btnSaveSettings.innerText = "✅ Saved!";
        setTimeout(() => {
          btnSaveSettings.innerText = "💾 Save Settings";
        }, 1800);
      }
    });
  }

  // 6. Action: Toggle Autonomous Auto-Pilot
  if (btnToggleAutopilot) {
    btnToggleAutopilot.addEventListener("click", async () => {
      isAutoPilotActive = !isAutoPilotActive;
      await chrome.storage.local.set({ autoPilotActive: isAutoPilotActive });
      updateAutopilotButtonUI(isAutoPilotActive);

      if (activeTab?.id) {
        try {
          await ensureContentScriptInjected(activeTab.id);
          await chrome.tabs.sendMessage(activeTab.id, {
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
      if (!activeTab?.id) return;

      btnOneclickFill.disabled = true;
      btnOneclickFill.innerHTML = `<span>⏳</span> উত্তর সিলেক্ট হচ্ছে...`;
      updateStatus("loading", "ম্যানুয়াল মোড: জেমিনি ৩.৮ দিয়ে পেজ এনালাইসিস ও উত্তর নির্বাচন হচ্ছে...");

      try {
        await ensureContentScriptInjected(activeTab.id);
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          action: "ONE_CLICK_AUTOFILL_NEXT"
        });

        if (response && response.success) {
          updateStatus("success", `✅ ম্যানুয়াল মোড: ${response.filledCount}টি উত্তর সিলেক্ট সম্পন্ন! আপনি দেখে নিয়ে Next চাপুন।`);
        } else {
          updateStatus("error", response?.message || "Auto-fill failed.");
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
      if (!activeTab?.id) return;
      try {
        await ensureContentScriptInjected(activeTab.id);
        const res = await chrome.tabs.sendMessage(activeTab.id, { action: "CLICK_NEXT_BUTTON" });
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
      if (!activeTab?.id) return;
      btnAnalyze.disabled = true;
      updateStatus("loading", "Scanning questions with Gemini 3.8 Flash...");
      try {
        await ensureContentScriptInjected(activeTab.id);
        const response = await chrome.tabs.sendMessage(activeTab.id, { action: "SCAN_AND_ANALYZE" });
        if (response && response.success) {
          renderResults(response.data);
          updateStatus("success", "Scan complete. Answers highlighted on page.");
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
      if (!activeTab?.id) return;
      try {
        await ensureContentScriptInjected(activeTab.id);
        await chrome.tabs.sendMessage(activeTab.id, { action: "CLEAR_HIGHLIGHTS" });
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
      if (!activeTab?.id) return;
      try {
        await ensureContentScriptInjected(activeTab.id);
        await chrome.tabs.sendMessage(activeTab.id, { action: "TOGGLE_HUD" });
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
    resultsList.innerHTML = "";

    if (data.trap_detected) {
      trapAlertCard.classList.remove("hidden");
      trapDesc.innerText = data.trap_alert_message || "Carefully follow this attention check question!";
    } else {
      trapAlertCard.classList.add("hidden");
    }

    const answers = data.answers || [];
    resultsCount.innerText = answers.length;

    if (answers.length === 0) {
      resultsList.innerHTML = `<div class="empty-state">No questions found to answer.</div>`;
      return;
    }

    answers.forEach((ans, idx) => {
      const item = document.createElement("div");
      item.className = "ans-item";
      item.innerHTML = `
        <div class="ans-title">Q${idx + 1}: ${ans.question_text || "Question"}</div>
        <div class="ans-pick"><strong>Choice:</strong> ${(ans.selected_labels || []).join(", ") || ans.text_input_value || "Option Chosen"}</div>
        ${ans.reasoning ? `<div style="font-size:10px; color:#64748b; margin-top:2px;">💡 ${ans.reasoning}</div>` : ""}
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
        bridgeStatusText.innerText = "⚪ Standalone Cloud Mode";
        bridgeStatusText.className = "status-disconnected";
      }
    } catch (e) {
      bridgeStatusText.innerText = "⚪ Standalone Cloud Mode";
      bridgeStatusText.className = "status-disconnected";
    }
  }

  async function ensureContentScriptInjected(tabId) {
    if (!tabId) return;
    if (activeTab && activeTab.url && (
      activeTab.url.startsWith("chrome://") ||
      activeTab.url.startsWith("chrome-extension://") ||
      activeTab.url.startsWith("edge://") ||
      activeTab.url.startsWith("about:") ||
      activeTab.url.startsWith("devtools://") ||
      activeTab.url.startsWith("view-source:")
    )) {
      throw new Error("ব্রাউজারের ইন্টারনাল পেজে (chrome://) কাজ করে না। অনুগ্রহ করে কোনো সাধারণ ওয়েব পেজ বা সার্ভে পেজে যান।");
    }
    try {
      const pingRes = await chrome.tabs.sendMessage(tabId, { action: "PING" });
      if (pingRes && pingRes.pong) return;
    } catch (e) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content/content_script.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["content/overlay.css"]
      });
      // Short delay to ensure content script listeners are ready
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  // Helper: Show/hide OpenRouter settings fields based on checkbox state
  function toggleOpenRouterSectionVisibility(useOpenRouter) {
    if (openRouterSettings) {
      openRouterSettings.style.display = useOpenRouter ? "block" : "none";
    }
    if (openRouterModelSettings) {
      openRouterModelSettings.style.display = useOpenRouter ? "block" : "none";
    }
  }
});
