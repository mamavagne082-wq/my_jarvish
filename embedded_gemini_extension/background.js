/**
 * ==============================================================================
 * BACKGROUND SERVICE WORKER (background.js) - Manifest V3
 * ==============================================================================
 * Coordinates:
 * 1. Side Panel activation & lifecycle.
 * 2. Message relay between Side Panel, Target Survey Tab, and Embedded Gemini Bridge.
 * 3. High-resolution screenshot capture.
 * ==============================================================================
 */

// Configure Chrome Side Panel to open immediately on toolbar icon click
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Jarvis Background] Embedded Gemini Copilot Installed.');
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (err) {
    console.warn('[Jarvis Background] Could not set panel behavior:', err);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (err) {
    console.error('[Jarvis Background] Error opening side panel:', err);
  }
});

/**
 * Ensures content script is injected into the target tab
 */
async function ensureSurveyScriptInjected(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (ping && ping.status === 'PONG') return true;
  } catch (_) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await new Promise((r) => setTimeout(r, 100));
    return true;
  } catch (err) {
    throw new Error(`Cannot access target tab: ${err.message}`);
  }
}

/**
 * Captures active tab visible screenshot as data URL
 */
async function captureVisibleTabScreenshot(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png', quality: 90 }, (dataUrl) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(dataUrl);
    });
  });
}

/**
 * Central Message Router
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message;

  (async () => {
    try {
      switch (action) {
        // Scrapes DOM inputs and captures screenshot from active survey tab
        case 'SCRAPE_ACTIVE_SURVEY': {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!activeTab || !activeTab.id) {
            return sendResponse({ success: false, error: 'No active tab found.' });
          }

          await ensureSurveyScriptInjected(activeTab.id);

          // Get structured DOM from content script
          const domResponse = await chrome.tabs.sendMessage(activeTab.id, { action: 'EXTRACT_PAGE_DATA' });
          if (!domResponse || !domResponse.success) {
            return sendResponse({ success: false, error: domResponse?.error || 'Failed to scrape survey DOM.' });
          }

          // Capture visible screen
          let screenshot = null;
          try {
            screenshot = await captureVisibleTabScreenshot(activeTab.windowId);
          } catch (e) {
            console.warn('[Jarvis Background] Screenshot capture skipped:', e.message);
          }

          return sendResponse({
            success: true,
            tabId: activeTab.id,
            url: activeTab.url,
            title: activeTab.title,
            surveyData: domResponse.data,
            screenshot: screenshot
          });
        }

        // Relays auto-fill execution instruction to the target survey page
        case 'RELAY_AUTO_FILL_TO_PAGE': {
          const { tabId, answers } = payload;
          let targetTabId = tabId;

          if (!targetTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            targetTabId = activeTab?.id;
          }

          if (!targetTabId) {
            return sendResponse({ success: false, error: 'Target survey tab not identified.' });
          }

          await ensureSurveyScriptInjected(targetTabId);

          const fillRes = await chrome.tabs.sendMessage(targetTabId, {
            action: 'AUTO_FILL_SURVEY_PAGE',
            payload: { answers }
          });

          return sendResponse(fillRes || { success: true });
        }

        // Opens gemini in full tab if user needs to login or switch account
        case 'OPEN_GEMINI_FULL_TAB': {
          const tabs = await chrome.tabs.query({ url: '*://gemini.google.com/*' });
          if (tabs.length > 0) {
            await chrome.tabs.update(tabs[0].id, { active: true });
            return sendResponse({ success: true, tabId: tabs[0].id });
          }
          const newTab = await chrome.tabs.create({ url: 'https://gemini.google.com/app', active: true });
          return sendResponse({ success: true, tabId: newTab.id });
        }

        default:
          return sendResponse({ success: false, error: `Unhandled action: ${action}` });
      }
    } catch (err) {
      console.error(`[Jarvis Background] Message handling failed for '${action}':`, err);
      return sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep async response channel open
});
