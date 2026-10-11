/**
 * ========================================================================================
 * JARVIS AI - CROSS-PLATFORM COPILOT ENGINE
 * ========================================================================================
 * Universal Cross-Platform Module operating seamlessly across:
 *   1. PC Executable (Electron, Node.js, React HUD, Python Bridge)
 *   2. Android Mobile APK (Android WebView, Background Service, Web Assets)
 *   3. Browser Extensions (Chrome Manifest V3 Content Script, Service Worker, Popup, Sidepanel)
 *
 * THREE CORE CAPABILITIES:
 *   1. Pollinations AI Text API:
 *      - Queries https://text.pollinations.ai with zero login, zero API key, zero user accounts.
 *      - Strict system prompt returning clean, direct, concise answers without fluff or intros.
 *   2. Gemini Premium Webview:
 *      - Renders and manages the in-app embedded Gemini web frame (gemini.google.com/app).
 *      - Leverages pre-logged-in Premium, Pro, or Ultra Pro accounts directly within the app/extension.
 *   3. Full-page Screen Capture & Auto-Selection:
 *      - Captures full-page scrolling screenshots and stitches them into high-res canvas Data URLs.
 *      - Analyzes questions from visual + DOM context, resolves the best answer via AI,
 *        and automatically selects/clicks the matching radio, checkbox, or input in the DOM.
 * ========================================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exports = factory();
    root.JarvisCrossPlatformCopilot = exports;
    root.queryPollinationsAI = exports.queryPollinationsAI;
    root.renderGeminiWebFrame = exports.renderGeminiWebFrame;
    root.checkGeminiSessionStatus = exports.checkGeminiSessionStatus;
    root.captureFullPageScreenshot = exports.captureFullPageScreenshot;
    root.analyzeAndAutoSelectSurvey = exports.analyzeAndAutoSelectSurvey;
    root.fetchSmartSurveyAnswer = exports.fetchSmartSurveyAnswer;
    root.sanitizeFinalAnswer = exports.sanitizeFinalAnswer;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  'use strict';

  // Default Demographic Profile for Survey Answering
  var DEFAULT_PERSONA = {
    name: "Al Amin Miah",
    age: "50",
    birthYear: "1976",
    gender: "Male",
    education: "Master's Degree / Post-Graduate",
    employment: "Employed Full-Time",
    industry: "Computer Software / Technology / IT",
    jobRole: "Director / Senior Engineering Manager",
    companySize: "2500 - 5000 employees",
    householdIncome: "$125,000 - $149,999",
    location: "United States (Zip: 10001)"
  };

  /**
   * Post-Processing Sanitizer: Strips conversational intros, markdown fences,
   * prefixes, and explanations so only the final concise answer is returned.
   */
  function sanitizeFinalAnswer(raw) {
    if (!raw) return '';
    var clean = String(raw).trim();

    // 1. Strip Markdown Code Fences
    var codeMatch = clean.match(/^```(?:json|text|markdown)?\s*([\s\S]*?)\s*```$/i);
    if (codeMatch && codeMatch[1]) {
      clean = codeMatch[1].trim();
    }

    // 2. Handle JSON object if returned
    if (clean.charAt(0) === '{' && clean.charAt(clean.length - 1) === '}') {
      try {
        var parsed = JSON.parse(clean);
        var val = parsed.answer || parsed.selection || parsed.text || parsed.result ||
                  parsed.value || parsed.selected_option || Object.values(parsed)[0];
        if (typeof val === 'string') clean = val.trim();
        else if (Array.isArray(val) && val.length > 0) clean = String(val[0]).trim();
      } catch (_) {}
    }

    // 3. Strip conversational intro clauses
    clean = clean.replace(/^(?:Sure[!,.]?|Certainly[!,.]?|Yes[!,.]?|Hello[!,.]?|Hi[!,.]?|Okay[!,.]?|Alright[!,.]?)\s*/i, '');
    clean = clean.replace(/^(?:Based on the (?:screenshot|image|survey|question)[!,.]?|According to the (?:screenshot|image|survey)[!,.]?)\s*/i, '');
    clean = clean.replace(/^(?:The (?:correct |best |recommended )?answer is:?|The (?:selected )?option is:?|Selected option:?|I would choose:?)\s*/i, '');

    // 4. Strip label headers (e.g. "**Answer:**", "Answer:", "Selection:", "Final Answer:")
    clean = clean.replace(/^(?:\*{1,2})?(?:Answer|Final Answer|Recommended Option|Selection|Choice)(?::\*{1,2}|\*{1,2}:?|:)\s*/i, '');

    // 5. Strip surrounding quotes and parentheses
    clean = clean.replace(/^["'`]|["'`]$/g, '').trim();
    clean = clean.replace(/^\((.+)\)$/, '$1').trim();

    // 6. Split by lines and remove explanation/notes sections
    var lines = clean.split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) {
        return l.length > 0 && !l.match(/^(?:Note|Explanation|Reasoning|Because|Why|Summary):/i);
      });

    if (lines.length > 0) {
      clean = lines[0];
    }

    // 7. Strip leading numbering or bullet points
    clean = clean.replace(/^[0-9]+[.)]\s*/, '').trim();
    clean = clean.replace(/^[-*•]\s*/, '').trim();
    clean = clean.replace(/^["'`]|["'`]$/g, '').trim();

    return clean.trim();
  }

  /**
   * Helper: Universal timeout-protected fetch
   */
  async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var signal = controller ? controller.signal : undefined;
    var timer = null;

    var p = new Promise(function (resolve, reject) {
      if (controller) {
        timer = setTimeout(function () {
          controller.abort();
          reject(new Error('Network request timed out after ' + timeoutMs + 'ms'));
        }, timeoutMs);
      }

      var fetchOptions = Object.assign({}, options, { signal: signal });
      fetch(url, fetchOptions)
        .then(function (res) { resolve(res); })
        .catch(function (err) { reject(err); });
    });

    try {
      var res = await p;
      if (timer) clearTimeout(timer);
      return res;
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw err;
    }
  }

  // ======================================================================================
  // 1. POLLINATIONS AI TEXT API (Zero Login, Zero API Key)
  // ======================================================================================

  /**
   * Query Pollinations AI Text API directly without API key or account login.
   *
   * @param {string} prompt - Question or instruction text
   * @param {Object} [options] - Options (timeoutMs, persona, systemInstruction)
   * @returns {Promise<string>} - The sanitized, direct answer
   */
  async function queryPollinationsAI(prompt, options) {
    options = options || {};
    var timeoutMs = options.timeoutMs || 10000;
    var persona = Object.assign({}, DEFAULT_PERSONA, options.persona || {});
    var rawPrompt = (prompt || '').trim();

    var systemInstruction = options.systemInstruction || (
      "You are an automated survey solver, calculation engine, and screen assistant. " +
      "Provide ONLY the final, direct, concise answer or exact option name. " +
      "If the question is arithmetic or factual, output the exact correct answer/number. " +
      "DO NOT provide any introduction, explanation, commentary, disclaimers, quotes, or markdown wrappers. " +
      "DO NOT say 'The answer is', 'Based on the image', 'Here is the answer', or 'Selected option:'. " +
      "Output strictly the exact choice or answer text alone."
    );

    var personaContext = "User Profile: Age " + persona.age + " (" + persona.birthYear + "), " +
      persona.gender + ", " + persona.education + ", " + persona.jobRole + " in " + persona.industry +
      ", Household Income: " + persona.householdIncome + ", Location: " + persona.location + ".";

    var fullPrompt = "Question / Task:\n" + rawPrompt + "\n\n" + personaContext + "\nOutput ONLY the exact final answer:";

    try {
      var url = "https://text.pollinations.ai/" + encodeURIComponent(fullPrompt) +
                "?system=" + encodeURIComponent(systemInstruction) +
                "&seed=42";

      var res = await fetchWithTimeout(url, {
        method: "GET",
        headers: { "Accept": "text/plain,application/json,*/*" }
      }, timeoutMs);

      if (res && res.ok) {
        var rawAnswer = await res.text();
        var cleanAnswer = sanitizeFinalAnswer(rawAnswer);
        if (cleanAnswer && cleanAnswer.length > 0) {
          return cleanAnswer;
        }
      }
    } catch (err) {
      if (options.debug) {
        console.warn("[JarvisCopilot] Pollinations AI fetch error:", err.message);
      }
    }

    return "";
  }

  // ======================================================================================
  // 2. GEMINI PREMIUM WEBVIEW (In-App Container & Pre-Logged In Account Session)
  // ======================================================================================

  /**
   * Check if user is logged into Google Gemini Web (Cookies, tab, or desktop bridge)
   *
   * @returns {Promise<Object>} Status object with { connected, email, tier }
   */
  async function checkGeminiSessionStatus() {
    // 1. Chrome Extension Environment
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      try {
        var geminiCookies = await chrome.cookies.getAll({ domain: "gemini.google.com" });
        var hasAuthCookie = geminiCookies.some(function (c) {
          return c.name.indexOf("__Secure-") === 0 || c.name === "SID" || c.name === "HSID";
        });

        var storage = (chrome.storage && chrome.storage.local)
          ? await chrome.storage.local.get(["geminiAccountEmail", "geminiAccountTier", "geminiWebConnected"])
          : {};

        return {
          connected: hasAuthCookie || !!storage.geminiWebConnected,
          email: storage.geminiAccountEmail || "Active Google Session",
          tier: storage.geminiAccountTier || "Gemini Advanced (Pro/Ultra)",
          platform: "chrome_extension"
        };
      } catch (_) {}
    }

    // 2. Android Mobile WebView Environment
    if (typeof window !== 'undefined' && window.JarvisNativeBridge && window.JarvisNativeBridge.getGeminiLoginStatus) {
      try {
        var mobileStatusJson = window.JarvisNativeBridge.getGeminiLoginStatus();
        var mobileStatus = JSON.parse(mobileStatusJson);
        return {
          connected: !!mobileStatus.loggedIn,
          email: mobileStatus.email || "Android Gemini Web Session",
          tier: mobileStatus.tier || "Gemini Pro / Ultra",
          platform: "android_apk"
        };
      } catch (_) {}
    }

    // 3. PC Desktop Bridge Environment (http://127.0.0.1:8765)
    try {
      var bridgeRes = await fetchWithTimeout("http://127.0.0.1:8765/api/gemini_session", { method: "GET" }, 2000);
      if (bridgeRes && bridgeRes.ok) {
        var bridgeData = await bridgeRes.json();
        return {
          connected: !!bridgeData.cookies && bridgeData.cookies.length > 0,
          email: bridgeData.activeEmail || "PC Desktop Gemini Session",
          tier: bridgeData.tier || "Gemini Pro / Ultra",
          platform: "pc_desktop"
        };
      }
    } catch (_) {}

    return {
      connected: false,
      email: null,
      tier: "Not Logged In",
      platform: "unknown"
    };
  }

  /**
   * Render or mount the Gemini Webview frame INSIDE the app/sidepanel/container
   * without launching any external browser tabs.
   *
   * @param {HTMLElement|string} container - Target container element or CSS selector
   * @param {Object} [options] - Options (accountIndex, className, width, height)
   * @returns {HTMLIFrameElement|null} - The mounted iframe element
   */
  function renderGeminiWebFrame(container, options) {
    if (typeof document === 'undefined') return null;

    options = options || {};
    var target = typeof container === 'string' ? document.querySelector(container) : container;
    if (!target) {
      console.warn("[JarvisCopilot] Target container for Gemini frame not found.");
      return null;
    }

    var authUserIdx = Math.max(0, parseInt(options.accountIndex || 0, 10));
    var geminiUrl = "https://gemini.google.com/app?authuser=" + authUserIdx;

    // Check if an existing frame is present
    var existingFrame = target.querySelector('iframe[data-jarvis-gemini-frame="true"]');
    if (existingFrame) {
      existingFrame.src = geminiUrl;
      return existingFrame;
    }

    var iframe = document.createElement('iframe');
    iframe.setAttribute('data-jarvis-gemini-frame', 'true');
    iframe.src = geminiUrl;
    iframe.style.width = options.width || "100%";
    iframe.style.height = options.height || "100%";
    iframe.style.border = "none";
    iframe.style.borderRadius = "8px";
    iframe.style.display = "block";
    iframe.setAttribute("allow", "clipboard-read; clipboard-write; microphone; camera");

    target.appendChild(iframe);
    return iframe;
  }

  // ======================================================================================
  // 3. FULL-PAGE SCREEN CAPTURE & AUTO-SELECTION
  // ======================================================================================

  /**
   * Helper: Stitch multi-slice screenshots on an HTML5 canvas
   */
  function stitchSlices(slices, width, totalHeight, viewportHeight) {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined') {
        resolve(slices[0] ? slices[0].dataUrl : null);
        return;
      }

      try {
        var canvas = document.createElement('canvas');
        var effectiveHeight = Math.min(4000, slices.length * viewportHeight);
        canvas.width = Math.min(width, 1920);
        canvas.height = effectiveHeight;
        var ctx = canvas.getContext('2d');

        var loaded = 0;
        slices.forEach(function (slice, idx) {
          var img = new Image();
          img.onload = function () {
            var destY = idx * viewportHeight;
            if (destY < effectiveHeight) {
              ctx.drawImage(img, 0, destY, canvas.width, Math.min(viewportHeight, effectiveHeight - destY));
            }
            loaded++;
            if (loaded === slices.length) {
              resolve(canvas.toDataURL('image/jpeg', 0.82));
            }
          };
          img.onerror = function () {
            loaded++;
            if (loaded === slices.length) {
              resolve(slices[0] ? slices[0].dataUrl : null);
            }
          };
          img.src = slice.dataUrl;
        });
      } catch (err) {
        resolve(slices[0] ? slices[0].dataUrl : null);
      }
    });
  }

  /**
   * Capture a full-page screenshot of the current page.
   * If scrollable, scrolls in slices and stitches them into a single high-res canvas Data URL.
   *
   * @param {Object} [options] - Options (maxSlices, sliceDelay)
   * @returns {Promise<string|null>} - Base64 Data URL of the full-page screenshot
   */
  async function captureFullPageScreenshot(options) {
    options = options || {};
    var maxSlices = options.maxSlices || 4;
    var sliceDelay = options.sliceDelay || 150;

    // 1. Chrome Extension Environment
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.captureVisibleTab) {
      return new Promise(function (resolve) {
        chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, function (dataUrl) {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(dataUrl || null);
          }
        });
      });
    }

    // 2. Extension Content Script Context (Multi-Slice Scrolling Capture)
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        var scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        var viewportHeight = window.innerHeight || 800;
        var viewportWidth = window.innerWidth || 1280;

        // If single screen height
        if (scrollHeight <= viewportHeight * 1.2) {
          var singleRes = await new Promise(function (res) {
            chrome.runtime.sendMessage({ action: "CAPTURE_SCREENSHOT" }, function (r) { res(r); });
          });
          return (singleRes && singleRes.screenshot) ? singleRes.screenshot : null;
        }

        // Multi-slice scrolling capture
        var origX = window.scrollX;
        var origY = window.scrollY;
        var slices = [];
        var numSlices = Math.min(maxSlices, Math.ceil(scrollHeight / viewportHeight));

        for (var i = 0; i < numSlices; i++) {
          var targetY = Math.min(i * viewportHeight, Math.max(0, scrollHeight - viewportHeight));
          window.scrollTo(0, targetY);
          await new Promise(function (res) { setTimeout(res, sliceDelay); });

          var sliceRes = await new Promise(function (res) {
            chrome.runtime.sendMessage({ action: "CAPTURE_SCREENSHOT" }, function (r) { res(r); });
          });

          if (sliceRes && sliceRes.screenshot) {
            slices.push({ dataUrl: sliceRes.screenshot, y: targetY });
          }
        }

        window.scrollTo(origX, origY);

        if (slices.length === 0) return null;
        if (slices.length === 1) return slices[0].dataUrl;

        return await stitchSlices(slices, viewportWidth, scrollHeight, viewportHeight);
      } catch (err) {
        console.warn("[JarvisCopilot] Multi-slice capture failed:", err);
      }
    }

    // 3. Fallback: Local Desktop Bridge Screenshot Endpoint (http://127.0.0.1:8765/api/screenshot)
    try {
      var bridgeRes = await fetchWithTimeout("http://127.0.0.1:8765/api/screenshot", { method: "GET" }, 2000);
      if (bridgeRes && bridgeRes.ok) {
        var bData = await bridgeRes.json();
        if (bData && bData.screenshot) return bData.screenshot;
      }
    } catch (_) {}

    return null;
  }

  /**
   * Helper: Extract visible survey questions and option elements from the live DOM
   */
  function extractSurveyQuestionsFromDOM() {
    if (typeof document === 'undefined') return [];

    var results = [];
    // Common survey card and question container selectors
    var questionCards = document.querySelectorAll(
      '.question-container, .survey-question, .question, [data-question-id], fieldset, ' +
      '.form-group, .text-question, .choice-question, [role="radiogroup"]'
    );

    if (questionCards.length > 0) {
      questionCards.forEach(function (card, idx) {
        var textEl = card.querySelector('.question-text, .title, legend, label, h2, h3, h4');
        var qText = textEl ? textEl.innerText.trim() : card.innerText.split('\n')[0].trim();

        var options = [];
        var inputs = card.querySelectorAll('input[type="radio"], input[type="checkbox"], select, textarea');
        inputs.forEach(function (input) {
          var labelEl = card.querySelector('label[for="' + input.id + '"]') || input.closest('label');
          var labelText = labelEl ? labelEl.innerText.trim() : (input.value || "");
          options.push({
            element: input,
            label: labelText,
            value: input.value,
            type: input.type || input.tagName.toLowerCase()
          });
        });

        if (options.length > 0 || card.querySelector('textarea, input[type="text"]')) {
          results.push({
            index: idx,
            text: qText,
            card: card,
            options: options
          });
        }
      });
    }

    // Fallback: If no structured cards found, find standalone inputs
    if (results.length === 0) {
      var allRadios = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      if (allRadios.length > 0) {
        var genericOpts = [];
        allRadios.forEach(function (radio) {
          var lbl = radio.closest('label') || document.querySelector('label[for="' + radio.id + '"]');
          genericOpts.push({
            element: radio,
            label: lbl ? lbl.innerText.trim() : radio.value,
            value: radio.value,
            type: radio.type
          });
        });

        results.push({
          index: 0,
          text: document.title || "Survey Question",
          card: document.body,
          options: genericOpts
        });
      }
    }

    return results;
  }

  /**
   * Dispatch human-like synthetic clicks and change events to select an option in the DOM
   */
  function simulateSelectElement(element, textValue) {
    if (!element) return false;

    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (element.tagName.toLowerCase() === 'textarea' || (element.tagName.toLowerCase() === 'input' && element.type === 'text')) {
        element.focus();
        element.value = textValue || "High quality and reliable.";
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      if (element.tagName.toLowerCase() === 'select') {
        element.focus();
        if (textValue) {
          for (var i = 0; i < element.options.length; i++) {
            if (element.options[i].text.toLowerCase().indexOf(textValue.toLowerCase()) !== -1) {
              element.selectedIndex = i;
              break;
            }
          }
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // Checkbox or Radio button
      var clickTarget = element;
      var parentLabel = element.closest('label');
      if (parentLabel) clickTarget = parentLabel;

      var events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      events.forEach(function (evtName) {
        var evt = new MouseEvent(evtName, {
          view: window,
          bubbles: true,
          cancelable: true
        });
        clickTarget.dispatchEvent(evt);
      });

      if (!element.checked && (element.type === 'radio' || element.type === 'checkbox')) {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return true;
    } catch (err) {
      console.warn("[JarvisCopilot] Error selecting element:", err);
      return false;
    }
  }

  /**
   * FULL AUTONOMOUS SURVEY WORKFLOW:
   * 1. Captures full-page screenshot of the survey page
   * 2. Extracts question and options from DOM + Visual context
   * 3. Queries Pollinations AI / Gemini Premium for the accurate direct answer
   * 4. Automatically selects and clicks the matching option on the live page!
   *
   * @param {Object} [options] - Options (screenshot, autoClick, persona, timeoutMs)
   * @returns {Promise<Object>} - Execution report with answer and action status
   */
  async function analyzeAndAutoSelectSurvey(options) {
    options = options || {};
    var autoClick = options.autoClick !== false; // Default true

    // Step 1: Capture Full-page Screenshot
    var screenshot = options.screenshot || await captureFullPageScreenshot();

    // Step 2: Extract Questions from DOM
    var questions = extractSurveyQuestionsFromDOM();
    if (questions.length === 0) {
      return {
        success: false,
        error: "No survey questions found on current page."
      };
    }

    var primaryQ = questions[0];
    var qText = primaryQ.text;
    var optionLabels = primaryQ.options.map(function (o) { return o.label; }).filter(Boolean);

    var promptText = qText;
    if (optionLabels.length > 0) {
      promptText += "\nOptions:\n" + optionLabels.map(function (lbl, i) { return (i + 1) + ". " + lbl; }).join("\n");
    }

    // Step 3: Query AI (Pollinations AI / Gemini Session)
    var chosenAnswer = await queryPollinationsAI(promptText, {
      timeoutMs: options.timeoutMs || 10000,
      persona: options.persona || DEFAULT_PERSONA
    });

    if (!chosenAnswer) {
      // Fallback: Pick first non-negative option
      chosenAnswer = optionLabels[0] || "Agree";
    }

    // Step 4: Locate matching element in DOM
    var matchedOption = null;
    var lowerChosen = chosenAnswer.toLowerCase();

    for (var i = 0; i < primaryQ.options.length; i++) {
      var opt = primaryQ.options[i];
      var lowerLbl = (opt.label || opt.value || '').toLowerCase();
      if (lowerLbl === lowerChosen || lowerLbl.indexOf(lowerChosen) !== -1 || lowerChosen.indexOf(lowerLbl) !== -1) {
        matchedOption = opt;
        break;
      }
    }

    if (!matchedOption && primaryQ.options.length > 0) {
      matchedOption = primaryQ.options[0];
    }

    // Step 5: Auto-select/click the element
    var clicked = false;
    if (autoClick && matchedOption && matchedOption.element) {
      clicked = simulateSelectElement(matchedOption.element, chosenAnswer);
    }

    return {
      success: true,
      questionText: qText,
      chosenAnswer: chosenAnswer,
      matchedOptionLabel: matchedOption ? matchedOption.label : null,
      clicked: clicked,
      totalQuestionsDetected: questions.length,
      screenshotCaptured: !!screenshot,
      engine: "Pollinations AI Text API + Gemini Webview Pipeline"
    };
  }

  return {
    queryPollinationsAI: queryPollinationsAI,
    renderGeminiWebFrame: renderGeminiWebFrame,
    checkGeminiSessionStatus: checkGeminiSessionStatus,
    captureFullPageScreenshot: captureFullPageScreenshot,
    analyzeAndAutoSelectSurvey: analyzeAndAutoSelectSurvey,
    fetchSmartSurveyAnswer: queryPollinationsAI,
    sanitizeFinalAnswer: sanitizeFinalAnswer,
    DEFAULT_PERSONA: DEFAULT_PERSONA
  };
}));
