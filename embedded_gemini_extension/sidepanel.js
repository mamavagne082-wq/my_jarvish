/**
 * ==============================================================================
 * SIDE PANEL CONTROLLER (sidepanel.js)
 * ==============================================================================
 * Manages:
 * 1. Embedded Gemini iframe session & authentication status.
 * 2. Automated extraction of survey data from the active browser tab.
 * 3. Injection of structured System Prompt into Gemini's Web UI.
 * 4. Scraping of Gemini's live JSON response & triggering web page auto-fill.
 * ==============================================================================
 */

// State
let lastExtractedSurvey = null;
let lastGeminiAnswers = null;
let currentSurveyTabId = null;
let isBusy = false;

// DOM References
const btnScanAndSend = document.getElementById('btnScanAndSend');
const btnAutoFill = document.getElementById('btnAutoFill');
const btnNewChat = document.getElementById('btnNewChat');
const btnDirectLogin = document.getElementById('btnDirectLogin');
const statusLabel = document.getElementById('statusLabel');
const statusBadgeText = document.getElementById('statusBadgeText');
const activeDomainLabel = document.getElementById('activeDomainLabel');
const loginBanner = document.getElementById('loginBanner');
const btnLoginInFrame = document.getElementById('btnLoginInFrame');
const btnDismissBanner = document.getElementById('btnDismissBanner');
const geminiFrame = document.getElementById('geminiFrame');

/**
 * Updates UI status labels
 */
function updateStatus(text, badge = null, isError = false) {
  statusLabel.textContent = text;
  if (isError) {
    statusLabel.style.color = '#ff5252';
  } else {
    statusLabel.style.color = 'var(--text-dim)';
  }
  if (badge) {
    statusBadgeText.textContent = badge;
  }
}

/**
 * Detects current active survey tab
 */
async function refreshActiveTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.includes('chrome://')) {
      currentSurveyTabId = tab.id;
      const url = new URL(tab.url);
      activeDomainLabel.textContent = url.hostname;
    }
  } catch (_) {}
}

/**
 * Builds the exact prompt requested by the user
 */
function buildGeminiSurveyPrompt(surveyData) {
  return `Analyze the following survey page data and act as John Smith (50-year-old male, IT Manager). Return ONLY a raw JSON object with target field identifiers and answers. Do not include markdown code block backticks.
Format:
{
  "answers": [
    {
      "question_index": 0,
      "action": "select_radio" | "type_text" | "check_box",
      "selected_value": "exact option text or response text"
    }
  ]
}

SURVEY PAGE FORM DATA:
${JSON.stringify(surveyData.questions, null, 2)}`;
}

/**
 * Sends a message specifically to the gemini_bridge content script
 * (running in the iframe or Gemini tab)
 */
async function sendToGeminiBridge(action, payload = {}) {
  // Try sending to runtime; gemini_bridge.js listens to chrome.runtime.onMessage
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, payload }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!response) {
        return reject(new Error('No response from Gemini Web Session. Ensure Gemini is loaded.'));
      }
      resolve(response);
    });
  });
}

/**
 * 1. SCAN ACTIVE SURVEY & SEND DIRECTLY TO GEMINI
 */
async function handleScanAndSend() {
  if (isBusy) return;
  isBusy = true;
  btnScanAndSend.disabled = true;
  btnAutoFill.disabled = true;

  try {
    updateStatus('Scraping active survey tab DOM inputs...', 'Scanning');

    // 1. Request survey data from active tab via background
    const scrapeRes = await chrome.runtime.sendMessage({ action: 'SCRAPE_ACTIVE_SURVEY' });
    if (!scrapeRes || !scrapeRes.success) {
      throw new Error(scrapeRes?.error || 'Failed to scrape survey page.');
    }

    lastExtractedSurvey = scrapeRes.surveyData;
    currentSurveyTabId = scrapeRes.tabId;

    const qCount = lastExtractedSurvey.questions?.length || 0;
    updateStatus(`Extracted ${qCount} question(s). Feeding into embedded Gemini...`, 'Thinking');

    // 2. Format prompt
    const promptText = buildGeminiSurveyPrompt(lastExtractedSurvey);

    // 3. Send prompt to embedded Gemini session
    const geminiRes = await sendToGeminiBridge('QUERY_EMBEDDED_GEMINI', { prompt: promptText });

    if (!geminiRes || !geminiRes.success) {
      throw new Error(geminiRes?.error || 'Gemini web session failed to return answers.');
    }

    lastGeminiAnswers = geminiRes.answers;
    const answerCount = lastGeminiAnswers.answers?.length || 0;

    updateStatus(`Gemini reasoning complete! ${answerCount} answer(s) ready. Click Auto-Fill.`, 'Ready');
    btnAutoFill.disabled = false;

  } catch (err) {
    console.error('[SidePanel Controller] Error:', err);
    updateStatus(`Error: ${err.message}`, 'Failed', true);

    // Show login helper if Gemini wasn't ready
    if (err.message.includes('Gemini editor not found') || err.message.includes('No response from Gemini')) {
      loginBanner.style.display = 'block';
    }
  } finally {
    isBusy = false;
    btnScanAndSend.disabled = false;
  }
}

/**
 * 2. AUTO-FILL ANSWERS ON SURVEY PAGE
 */
async function handleAutoFill() {
  if (!lastGeminiAnswers) {
    updateStatus('No answers available. Please scan first.', 'Warning', true);
    return;
  }

  btnAutoFill.disabled = true;
  updateStatus('Auto-filling answers on web page with human-like delays...', 'Filling');

  try {
    const fillRes = await chrome.runtime.sendMessage({
      action: 'RELAY_AUTO_FILL_TO_PAGE',
      payload: {
        tabId: currentSurveyTabId,
        answers: lastGeminiAnswers
      }
    });

    if (!fillRes || !fillRes.success) {
      throw new Error(fillRes?.error || 'Failed to auto-fill survey page.');
    }

    const applied = fillRes.count || 0;
    updateStatus(`Done! Successfully selected and filled ${applied} answer(s).`, 'Completed');

  } catch (err) {
    console.error('[SidePanel Controller] Fill error:', err);
    updateStatus(`Fill error: ${err.message}`, 'Error', true);
  } finally {
    btnAutoFill.disabled = false;
  }
}

/**
 * 3. TRIGGER NEW CHAT IN GEMINI
 */
async function handleNewChat() {
  try {
    updateStatus('Starting fresh Gemini chat...', 'Resetting');
    await sendToGeminiBridge('GEMINI_NEW_CHAT');
    updateStatus('Fresh chat ready in Gemini.', 'Ready');
  } catch (err) {
    updateStatus('Could not trigger new chat automatically.', 'Notice');
  }
}

function triggerInFrameLogin() {
  updateStatus('Loading in-panel Google Sign-In...', 'Signing In');
  geminiFrame.src = "https://accounts.google.com/ServiceLogin?service=mail&continue=https%3A%2F%2Fgemini.google.com%2Fapp";
  if (loginBanner) loginBanner.style.display = 'none';
}

/**
 * Event Listeners
 */
function init() {
  btnScanAndSend.addEventListener('click', handleScanAndSend);
  btnAutoFill.addEventListener('click', handleAutoFill);
  btnNewChat.addEventListener('click', handleNewChat);

  if (btnDirectLogin) btnDirectLogin.addEventListener('click', triggerInFrameLogin);
  if (btnLoginInFrame) btnLoginInFrame.addEventListener('click', triggerInFrameLogin);
  if (btnDismissBanner) btnDismissBanner.addEventListener('click', () => {
    loginBanner.style.display = 'none';
  });

  // Track active tab changes
  chrome.tabs.onActivated.addListener(refreshActiveTabInfo);
  refreshActiveTabInfo();

  // Periodically check if Gemini frame is ready
  setTimeout(async () => {
    try {
      const status = await sendToGeminiBridge('CHECK_GEMINI_BRIDGE_STATUS');
      if (status && status.ready) {
        updateStatus('Embedded Gemini session connected.', 'Online');
      }
    } catch (_) {}
  }, 3500);
}

document.addEventListener('DOMContentLoaded', init);
