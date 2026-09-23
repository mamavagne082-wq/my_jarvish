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

  const liveStatusText = document.getElementById("live-status-text");
  const trapAlertCard = document.getElementById("trap-alert-card");
  const trapDesc = document.getElementById("trap-desc");
  const resultsList = document.getElementById("results-list");
  const resultsCount = document.getElementById("results-count");

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

  let isAutoPilotActive = false;

  // 1. Tab Navigation
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      document.getElementById(targetId)?.classList.add("active");
    });
  });

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
  if (storage.geminiModel) {
    selectModel.value = storage.geminiModel;
    modelNameBadge.innerText = storage.geminiModel.replace("gemini-", "").toUpperCase();
  } else {
    selectModel.value = "gemini-3.8-flash";
    modelNameBadge.innerText = "GEMINI 3.8";
  }
  if (storage.autoFillDelay) {
    inputFillDelay.value = storage.autoFillDelay;
  }
  if (storage.useVisionScreenshot !== undefined) {
    checkUseVision.checked = storage.useVisionScreenshot;
  }
  if (storage.localBridgeEnabled !== undefined) {
    checkLocalBridge.checked = storage.localBridgeEnabled;
  }

  // Auto-Pilot state
  isAutoPilotActive = !!storage.autoPilotActive;
  updateAutopilotButtonUI(isAutoPilotActive);

  // Populate persona tab if available
  if (storage.surveyPersona) {
    populatePersonaUI(storage.surveyPersona);
  }

  // Check Local Bridge
  checkJarvisBridgeStatus();

  // 4. Toggle API Key Visibility
  btnToggleKey.addEventListener("click", () => {
    if (inputApiKey.type === "password") {
      inputApiKey.type = "text";
      btnToggleKey.innerText = "🔒";
    } else {
      inputApiKey.type = "password";
      btnToggleKey.innerText = "👁️";
    }
  });

  // 5. Save Settings
  btnSaveSettings.addEventListener("click", async () => {
    const updated = {
      geminiApiKey: inputApiKey.value.trim(),
      geminiModel: selectModel.value,
      autoFillDelay: parseInt(inputFillDelay.value, 10) || 350,
      useVisionScreenshot: checkUseVision.checked,
      localBridgeEnabled: checkLocalBridge.checked
    };

    await chrome.storage.local.set(updated);
    modelNameBadge.innerText = updated.geminiModel.replace("gemini-", "").toUpperCase();

    btnSaveSettings.innerText = "✅ Saved Successfully!";
    setTimeout(() => {
      btnSaveSettings.innerText = "💾 Save Settings";
    }, 1800);
  });

  // 6. Action: Toggle Autonomous Auto-Pilot
  btnToggleAutopilot.addEventListener("click", async () => {
    isAutoPilotActive = !isAutoPilotActive;
    await chrome.storage.local.set({ autoPilotActive: isAutoPilotActive });
    updateAutopilotButtonUI(isAutoPilotActive);

    if (activeTab?.id) {
      await ensureContentScriptInjected(activeTab.id);
      await chrome.tabs.sendMessage(activeTab.id, {
        action: "AUTOPILOT_STATE_CHANGED",
        active: isAutoPilotActive
      });
    }

    if (isAutoPilotActive) {
      updateStatus("success", "🤖 Auto-Pilot Started: Hands-free loop is active!");
    } else {
      updateStatus("idle", "Auto-Pilot stopped.");
    }
  });

  // 7. Action: Manual Mode 1-Click Page Auto-Fill
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

  // 8. Action: Next Page Button
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
      updateStatus("error", "Could not trigger next button.");
    }
  });

  // 9. Action: Scan Only
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

  // 10. Clear Highlights
  btnClear.addEventListener("click", async () => {
    if (!activeTab?.id) return;
    await chrome.tabs.sendMessage(activeTab.id, { action: "CLEAR_HIGHLIGHTS" });
    resultsList.innerHTML = `<div class="empty-state">Highlights cleared.</div>`;
    resultsCount.innerText = "0";
    trapAlertCard.classList.add("hidden");
    updateStatus("idle", "Page highlights cleared.");
  });

  // 11. Toggle HUD
  btnToggleHud.addEventListener("click", async () => {
    if (!activeTab?.id) return;
    await ensureContentScriptInjected(activeTab.id);
    await chrome.tabs.sendMessage(activeTab.id, { action: "TOGGLE_HUD" });
  });

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

  function populatePersonaUI(persona) {
    const p = persona.personal || {};
    const emp = persona.employment_and_industry || {};
    const fin = persona.household_and_finances || {};
    const auto = persona.automotive || {};

    if (p.first_name) document.getElementById("p-name").innerText = `${p.first_name} ${p.last_name || ""}`;
    if (p.age) document.getElementById("p-age").innerText = `${p.age} (${p.birth_year || 1976})`;
    if (p.gender) document.getElementById("p-demographics").innerText = `${p.gender} / ${p.race_ethnicity || "White"}`;
    if (p.city) document.getElementById("p-location").innerText = `${p.city}, ${p.state_region || "NY"} ${p.zip_postal_code || "10001"}`;
    if (emp.job_title) document.getElementById("p-job").innerText = emp.job_title;
    if (fin.annual_household_income_before_taxes) document.getElementById("p-income").innerText = fin.annual_household_income_before_taxes;
    if (auto.primary_car_model) document.getElementById("p-car").innerText = `${auto.primary_car_model} (${auto.year_purchased || "2023"})`;
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
});
