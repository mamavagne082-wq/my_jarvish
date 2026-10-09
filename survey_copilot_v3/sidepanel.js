/**
 * ==============================================================================
 * JARVIS GEMINI SURVEY COPILOT - SIDE PANEL CONTROLLER (sidepanel.js)
 * ==============================================================================
 * Manages:
 * 1. UI State transitions (Idle -> Loading animation -> Result cards).
 * 2. Background coordination for Screenshot + Live DOM capturing.
 * 3. Gemini Multimodal Vision Prompt formatting & JSON response parsing.
 * 4. Web page execution trigger ("Auto-Fill & Select Answers").
 * 5. Battle Log event streaming & Settings persistence.
 * ==============================================================================
 */

// Global State
let currentTabId = null;
let lastAiResponse = null;
let isProcessing = false;

// Default Survey Persona Profile
const DEFAULT_PERSONA = `
You are an autonomous survey answering engine. Answer realistically, consistently, and accurately based on this persona:
- Demographics: Male, 50 years old, Married with 2 children.
- Location: US Resident, homeowner.
- Education: Master's / Professional Degree.
- Employment: Full-time IT / Software Management (CTO / Director level).
- Tech & Devices Owned: Smartphone, Television, Computer (PC/Mac laptop & desktop), Vehicle/Car, Watch/Smartwatch, Tablet.
- TRAP DETECTION (Attention Checks):
  * Watch out for red herring/trap options designed to disqualify bots (e.g. "Rocketship", "Have you been to Neptune?", "Please select None of the above to prove you are human").
  * Never select impossible or non-existent choices.
  * Follow explicit screener instructions (e.g. "Select Strongly Agree for this row").
`.trim();

// DOM Element References
const viewIdle = document.getElementById('viewIdle');
const viewLoading = document.getElementById('viewLoading');
const viewResults = document.getElementById('viewResults');
const activePageDomain = document.getElementById('activePageDomain');
const statusAlert = document.getElementById('statusAlert');
const battleLogList = document.getElementById('battleLogList');

const btnScanAnalyze = document.getElementById('btnScanAnalyze');
const btnAutoFill = document.getElementById('btnAutoFill');
const btnClearLog = document.getElementById('btnClearLog');
const toggleAutopilot = document.getElementById('toggleAutopilot');

const resTopicText = document.getElementById('resTopicText');
const resQuestionsList = document.getElementById('resQuestionsList');

const inputApiKey = document.getElementById('inputApiKey');
const selectModel = document.getElementById('selectModel');
const personaPrompt = document.getElementById('personaPrompt');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnLaunchGeminiWeb = document.getElementById('btnLaunchGeminiWeb');
const geminiWebAccount = document.getElementById('geminiWebAccount');

/**
 * Adds an entry to the live Battle Log
 */
function addLog(message, type = 'info') {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.textContent = `[${timeStr}] ${message}`;
  battleLogList.appendChild(item);
  battleLogList.scrollTop = battleLogList.scrollHeight;
}

/**
 * Displays status notification alert
 */
function showStatus(text, type = 'info', durationMs = 4000) {
  statusAlert.textContent = text;
  statusAlert.className = `status-msg ${type}`;
  if (durationMs > 0) {
    setTimeout(() => {
      statusAlert.className = 'status-msg';
    }, durationMs);
  }
}

/**
 * Changes UI state between Idle, Loading, and Results
 */
function setUiState(state) {
  viewIdle.style.display = 'none';
  viewLoading.style.display = 'none';
  viewResults.style.display = 'none';

  if (state === 'loading') {
    viewLoading.style.display = 'flex';
    btnScanAnalyze.disabled = true;
  } else if (state === 'results') {
    viewResults.style.display = 'flex';
    btnScanAnalyze.disabled = false;
  } else {
    viewIdle.style.display = 'block';
    btnScanAnalyze.disabled = false;
  }
}

/**
 * Loads stored user settings from chrome.storage.local
 */
async function loadSettings() {
  const stored = await chrome.storage.local.get([
    'gemini_api_key',
    'gemini_model',
    'survey_persona',
    'autopilot_enabled',
    'gemini_web_account'
  ]);

  if (stored.gemini_api_key) inputApiKey.value = stored.gemini_api_key;
  if (stored.gemini_model) selectModel.value = stored.gemini_model;
  personaPrompt.value = stored.survey_persona || DEFAULT_PERSONA;
  toggleAutopilot.checked = !!stored.autopilot_enabled;
  geminiWebAccount.value = stored.gemini_web_account || 'Active Browser Session';
}

/**
 * Saves user settings
 */
async function saveSettings() {
  await chrome.storage.local.set({
    gemini_api_key: inputApiKey.value.trim(),
    gemini_model: selectModel.value,
    survey_persona: personaPrompt.value.trim(),
    autopilot_enabled: toggleAutopilot.checked
  });
  showStatus('Settings saved successfully.', 'success');
  addLog('Configuration saved.', 'success');
}

/**
 * Detects and displays active tab URL
 */
async function updateActiveTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentTabId = tab.id;
      const urlObj = new URL(tab.url);
      activePageDomain.textContent = urlObj.hostname || tab.title;
      activePageDomain.title = tab.url;
    } else {
      activePageDomain.textContent = 'No active page detected';
    }
  } catch (err) {
    activePageDomain.textContent = 'Active tab unavailable';
  }
}

/**
 * Renders Gemini AI analysis results into UI cards
 */
function renderResults(data) {
  resTopicText.textContent = data.page_topic || 'Survey Question Section';
  resQuestionsList.innerHTML = '';

  const questions = data.questions || [];
  if (questions.length === 0) {
    resQuestionsList.innerHTML = '<div style="font-size:11px; color:#888;">No questions identified on page.</div>';
    return;
  }

  questions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-card';

    const header = document.createElement('div');
    header.className = 'question-card-header';

    const prompt = document.createElement('div');
    prompt.className = 'question-prompt';
    prompt.textContent = `${idx + 1}. ${q.question_prompt || q.question_text || 'Question'}`;

    const badge = document.createElement('div');
    badge.className = 'question-type-badge';
    badge.textContent = q.action || 'Select';

    header.appendChild(prompt);
    header.appendChild(badge);
    card.appendChild(header);

    // Selected choices chips
    const chipsList = document.createElement('div');
    chipsList.className = 'answer-chips-list';

    const choices = q.selected_options || (q.selected_label ? [q.selected_label] : []);
    choices.forEach((choice) => {
      const chip = document.createElement('div');
      chip.className = 'answer-chip';
      chip.innerHTML = `<span>✓</span> <span>${choice}</span>`;
      chipsList.appendChild(chip);
    });

    if (q.text_input_value) {
      const chip = document.createElement('div');
      chip.className = 'answer-chip';
      chip.innerHTML = `<span>✍️</span> <span>"${q.text_input_value}"</span>`;
      chipsList.appendChild(chip);
    }

    card.appendChild(chipsList);

    // AI Reasoning summary
    if (q.reasoning) {
      const reasoning = document.createElement('div');
      reasoning.className = 'ai-reasoning-box';
      reasoning.textContent = `💡 Reasoning: ${q.reasoning}`;
      card.appendChild(reasoning);
    }

    resQuestionsList.appendChild(card);
  });
}

/**
 * Triggers the complete Page Scan & Gemini Multimodal Reasoning workflow
 */
async function startScanAndAnalysis() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    setUiState('loading');
    addLog('Scanning active survey tab: capturing DOM & visible screenshot...', 'info');

    // 1. Request background to scan tab (screenshot + DOM inputs)
    const scanResponse = await chrome.runtime.sendMessage({ action: 'SCAN_ACTIVE_TAB' });

    if (!scanResponse || !scanResponse.success) {
      throw new Error(scanResponse?.error || 'Failed to capture survey page data.');
    }

    currentTabId = scanResponse.tabId;
    const domData = scanResponse.domData;
    const screenshot = scanResponse.screenshotBase64;

    addLog(`DOM extracted: ${domData.questions.length} question(s) found. Visible screenshot ready.`, 'info');
    addLog('Sending Multimodal payload to Gemini AI for reasoning...', 'info');

    // 2. Prepare Gemini Multimodal prompt
    const stored = await chrome.storage.local.get(['gemini_api_key', 'gemini_model', 'survey_persona']);
    const apiKey = stored.gemini_api_key || inputApiKey.value.trim();
    const model = stored.gemini_model || selectModel.value || 'gemini-1.5-flash';
    const persona = stored.survey_persona || personaPrompt.value || DEFAULT_PERSONA;

    if (!apiKey) {
      throw new Error('Gemini API key is not configured. Please open Settings and enter your key.');
    }

    const systemPrompt = `
You are JARVIS 3.8 COPILOT, an expert autonomous survey assistant.
Your goal is to inspect the visual survey screenshot and live DOM inputs to select realistic, consistent answers according to the user persona.

USER PERSONA RULES:
${persona}

REQUIRED OUTPUT FORMAT:
You MUST respond with a strict JSON object having this exact structure:
{
  "page_topic": "Concise section summary (e.g. Device Ownership)",
  "questions": [
    {
      "question_index": 0,
      "question_prompt": "Exact text of the question",
      "selected_options": ["Array of exact matching labels to click"],
      "text_input_value": null,
      "action": "click_checkboxes or click_radio or select_dropdown or type_text",
      "reasoning": "Brief explanation of choice and trap avoidance"
    }
  ]
}
`.trim();

    const userPrompt = `Analyze the current survey page and provide the best answers in the requested JSON schema.`;

    // 3. Execute Gemini AI Inference via background service worker
    const aiResponse = await chrome.runtime.sendMessage({
      action: 'ANALYZE_WITH_GEMINI',
      payload: {
        apiKey,
        model,
        systemPrompt,
        userPrompt,
        domData,
        screenshotBase64: screenshot
      }
    });

    if (!aiResponse || !aiResponse.success) {
      throw new Error(aiResponse?.error || 'Gemini AI inference failed.');
    }

    lastAiResponse = aiResponse.data;
    addLog(`Gemini reasoning completed: Topic "${lastAiResponse.page_topic || 'General'}"`, 'success');

    // 4. Update UI to Results state
    renderResults(lastAiResponse);
    setUiState('results');

    // 5. If Auto-Pilot is enabled, trigger auto-fill immediately!
    if (toggleAutopilot.checked) {
      addLog('⚡ Auto-Pilot active: executing fill immediately...', 'info');
      await executeAutoFillOnPage();
    }

  } catch (err) {
    console.error('[Jarvis SidePanel] Scan error:', err);
    showStatus(err.message, 'error', 6000);
    addLog(`Error: ${err.message}`, 'error');
    setUiState('idle');
  } finally {
    isProcessing = false;
  }
}

/**
 * Triggers the content script to auto-fill answers on the web page
 */
async function executeAutoFillOnPage() {
  if (!lastAiResponse) {
    showStatus('No answers available to fill. Scan the page first.', 'error');
    return;
  }

  try {
    addLog('Executing native DOM selections & inputs on survey page...', 'info');

    const fillResponse = await chrome.runtime.sendMessage({
      action: 'EXECUTE_AUTO_FILL',
      payload: {
        tabId: currentTabId,
        answers: lastAiResponse
      }
    });

    if (!fillResponse || !fillResponse.success) {
      throw new Error(fillResponse?.error || 'Failed to execute auto-fill on target tab.');
    }

    const filledCount = fillResponse.filledCount || 0;
    addLog(`Auto-fill successful! Selected ${filledCount} field(s) on survey page.`, 'success');
    showStatus(`Successfully filled ${filledCount} answer(s)!`, 'success');

  } catch (err) {
    console.error('[Jarvis SidePanel] Auto-fill error:', err);
    showStatus(err.message, 'error', 5000);
    addLog(`Auto-fill Error: ${err.message}`, 'error');
  }
}

/**
 * Event Listeners & Tab Switching
 */
function setupEventListeners() {
  // Navigation Tabs
  document.querySelectorAll('.tab-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-button').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));

      btn.classList.add('active');
      const targetView = document.getElementById(btn.dataset.tab);
      if (targetView) targetView.classList.add('active');
    });
  });

  // Action Buttons
  btnScanAnalyze.addEventListener('click', startScanAndAnalysis);
  btnAutoFill.addEventListener('click', executeAutoFillOnPage);

  btnClearLog.addEventListener('click', () => {
    battleLogList.innerHTML = '';
    addLog('Battle log cleared.', 'info');
  });

  btnSaveSettings.addEventListener('click', saveSettings);

  btnLaunchGeminiWeb.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'OPEN_GEMINI_WEB_SESSION' });
  });

  // Keyboard Shortcuts (Alt+S for Auto-Fill, Alt+A for Scan)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      executeAutoFillOnPage();
    } else if (e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      startScanAndAnalysis();
    }
  });

  // Tab change detection
  chrome.tabs.onActivated.addListener(updateActiveTabInfo);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') updateActiveTabInfo();
  });
}

// Initialization on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadSettings();
  await updateActiveTabInfo();
  setUiState('idle');
});
