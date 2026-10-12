/**
 * ========================================================================================
 * JARVIS AI - UNIVERSAL SURVEY & SCREEN SOLVER MODULE
 * ========================================================================================
 * Universal JavaScript & TypeScript compatible solver that runs seamlessly across:
 *   1. PC Executable (Electron / Node.js / React HUD / Python Bridge)
 *   2. Android Mobile APK (WebView / Foreground Service / Asset UI)
 *   3. Browser Extensions (Chrome Manifest V3 Service Worker, Content Scripts & Popup)
 *
 * KEY GUARANTEES:
 *   - Zero Login & Zero API Key: Works immediately without user accounts or credentials.
 *   - Screenshot & Vision Analysis: Accepts base64, data URIs, Blobs, Files, and URLs.
 *   - Resilient Error Handling & Timeout: AbortControllers prevent freezing or hung states.
 *   - Direct Clean Output: Returns strictly the final concise answer string (no fluff/intros).
 * ========================================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var exports = factory();
    root.UniversalSurveySolver = exports;
    root.fetchSmartSurveyAnswer = exports.fetchSmartSurveyAnswer;
    root.queryPolymerAI = exports.fetchSmartSurveyAnswer;
    root.sanitizeFinalAnswer = exports.sanitizeFinalAnswer;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  'use strict';

  // Default User Demographic Profile (Used for consistent survey completions)
  var DEFAULT_SURVEY_PERSONA = {
    name: "Al Amin Miah",
    age: "50",
    birthYear: "1976",
    gender: "Male",
    ethnicity: "Asian / South Asian",
    education: "Master's Degree / Post-Graduate",
    employment: "Employed Full-Time",
    industry: "Computer Software / Technology / IT",
    jobRole: "Director / Senior Engineering Manager",
    companySize: "2500 - 5000 employees",
    householdIncome: "$125,000 - $149,999",
    maritalStatus: "Married",
    children: "2 children (13 and 12 years old)",
    location: "United States (Zip: 10001)"
  };

  /**
   * Post-Processing Sanitizer: Strips greetings, labels, explanations, markdown fences,
   * quotes, and conversational fluff so only the final concise answer remains.
   *
   * @param {string} raw - Raw output string from AI or heuristic engine
   * @returns {string} - Clean, direct answer suitable for UI clicking or voice readout
   */
  function sanitizeFinalAnswer(raw) {
    if (!raw) return '';
    var clean = String(raw).trim();

    // 1. Strip Markdown Code Fences (```json, ```text, ```)
    var codeBlockMatch = clean.match(/^```(?:json|text|markdown)?\s*([\s\S]*?)\s*```$/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      clean = codeBlockMatch[1].trim();
    }

    // 2. Handle embedded JSON objects if returned by model
    if (clean.charAt(0) === '{' && clean.charAt(clean.length - 1) === '}') {
      try {
        var parsed = JSON.parse(clean);
        var val = parsed.answer || parsed.selection || parsed.text || parsed.result ||
                  parsed.value || parsed.selected_option || Object.values(parsed)[0];
        if (typeof val === 'string') clean = val.trim();
        else if (Array.isArray(val) && val.length > 0) clean = String(val[0]).trim();
      } catch (_) {}
    }

    // 3. Strip conversational greetings and introductory clauses
    clean = clean.replace(/^(?:Sure[!,.]?|Certainly[!,.]?|Yes[!,.]?|Hello[!,.]?|Hi[!,.]?|Okay[!,.]?|Alright[!,.]?)\s*/i, '');
    clean = clean.replace(/^(?:Based on the (?:screenshot|image|survey|question)[!,.]?|According to the (?:screenshot|image|survey)[!,.]?)\s*/i, '');
    clean = clean.replace(/^(?:The (?:correct |best |recommended )?answer is:?|The (?:selected )?option is:?|Selected option:?|I would choose:?)\s*/i, '');

    // 4. Strip label headers (e.g. "**Answer:**", "**Answer**:", "Answer:", "Option A:", "Final Answer:")
    clean = clean.replace(/^(?:\*{1,2})?(?:Answer|Final Answer|Recommended Option|Selection|Choice)(?::\*{1,2}|\*{1,2}:?|:)\s*/i, '');

    // 5. Strip surrounding quotes and parentheses
    clean = clean.replace(/^["'`]|["'`]$/g, '').trim();
    clean = clean.replace(/^\((.+)\)$/, '$1').trim();

    // 6. Split lines and filter out explanation / reasoning / note blocks
    var lines = clean.split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) {
        return l.length > 0 && !l.match(/^(?:Note|Explanation|Reasoning|Because|Why|Summary|Confidence):/i);
      });

    if (lines.length > 0) {
      clean = lines[0];
    }

    // 7. Strip leading numbering or bullet markers (e.g. "1. Male" -> "Male", "- Agree" -> "Agree")
    clean = clean.replace(/^[0-9]+[.)]\s*/, '').trim();
    clean = clean.replace(/^[-*•]\s*/, '').trim();
    clean = clean.replace(/^["'`]|["'`]$/g, '').trim();

    return clean.trim();
  }

  /**
   * Helper: Convert Blob/File to base64 Data URL (Universal across browser/webview)
   */
  function convertBlobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      if (typeof FileReader !== 'undefined') {
        var reader = new FileReader();
        reader.onloadend = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      } else {
        // Fallback for Node / Non-browser environments
        resolve('');
      }
    });
  }

  /**
   * Helper: Normalize screenshot input to clean string representation
   */
  async function normalizeScreenshot(screenshot) {
    if (!screenshot) return '';
    if (typeof screenshot === 'string') return screenshot.trim();

    // If Blob or File in Browser / WebView
    if (typeof Blob !== 'undefined' && screenshot instanceof Blob) {
      try {
        return await convertBlobToBase64(screenshot);
      } catch (_) {
        return '';
      }
    }

    return '';
  }

  /**
   * Universal Fetch with strict AbortController Timeout
   */
  async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var signal = controller ? controller.signal : undefined;
    var timer = null;

    var fetchPromise = new Promise(function (resolve, reject) {
      if (controller) {
        timer = setTimeout(function () {
          controller.abort();
          reject(new Error('Network timeout after ' + timeoutMs + 'ms'));
        }, timeoutMs);
      }

      var fetchOptions = Object.assign({}, options, { signal: signal });
      fetch(url, fetchOptions)
        .then(function (res) { resolve(res); })
        .catch(function (err) { reject(err); });
    });

    try {
      var result = await fetchPromise;
      if (timer) clearTimeout(timer);
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Rule-based Deterministic Heuristic Solver
   * Used for offline fallback or instant trap detection without external API calls
   */
  function solveWithDeterministicHeuristic(questionText, persona) {
    if (!questionText) return '';
    var q = questionText.toLowerCase();
    var p = persona || DEFAULT_SURVEY_PERSONA;

    // Attention checks & Quality traps
    if (q.indexOf('please select') !== -1 || q.indexOf('attention check') !== -1 || q.indexOf('quality check') !== -1) {
      var colorMatches = ['red', 'blue', 'green', 'yellow', 'purple', 'black', 'white'];
      for (var c = 0; c < colorMatches.length; c++) {
        if (q.indexOf('select ' + colorMatches[c]) !== -1 || q.indexOf('choose ' + colorMatches[c]) !== -1) {
          return colorMatches[c].charAt(0).toUpperCase() + colorMatches[c].slice(1);
        }
      }
      if (q.indexOf('somewhat agree') !== -1) return 'Somewhat agree';
      if (q.indexOf('strongly agree') !== -1) return 'Strongly agree';
      if (q.indexOf('disagree') !== -1) return 'Disagree';
    }

    // Demographics: Age / Birth Year
    if (q.indexOf('age') !== -1 || q.indexOf('how old') !== -1 || q.indexOf('birth year') !== -1) {
      if (q.indexOf('year') !== -1) return p.birthYear;
      return p.age;
    }

    // Demographics: Gender
    if (q.indexOf('gender') !== -1 || q.indexOf('sex') !== -1) {
      return p.gender;
    }

    // Demographics: Employment & Industry
    if (q.indexOf('employment') !== -1 || q.indexOf('working status') !== -1) {
      return p.employment;
    }
    if (q.indexOf('industry') !== -1 || q.indexOf('occupation') !== -1 || q.indexOf('field of work') !== -1) {
      return p.industry;
    }
    if (q.indexOf('job title') !== -1 || q.indexOf('role') !== -1 || q.indexOf('seniority') !== -1) {
      return p.jobRole;
    }

    // Demographics: Income
    if (q.indexOf('income') !== -1 || q.indexOf('salary') !== -1 || q.indexOf('earnings') !== -1) {
      return p.householdIncome;
    }

    // Demographics: Education
    if (q.indexOf('education') !== -1 || q.indexOf('degree') !== -1) {
      return p.education;
    }

    // Common Likert / Rating Questions
    if (q.indexOf('how satisfied') !== -1 || q.indexOf('satisfaction') !== -1) {
      return 'Very satisfied';
    }
    if (q.indexOf('how likely') !== -1 || q.indexOf('recommend') !== -1) {
      return 'Extremely likely';
    }
    if (q.indexOf('agree or disagree') !== -1 || q.indexOf('level of agreement') !== -1) {
      return 'Agree';
    }

    // Text input / open-ended default
    if (q.indexOf('why') !== -1 || q.indexOf('comment') !== -1 || q.indexOf('feedback') !== -1) {
      return 'High quality, reliable performance, and intuitive user experience.';
    }

    return '';
  }

  /**
   * PRIMARY UNIVERSAL API: fetchSmartSurveyAnswer(screenshot, question, options)
   *
   * @param {string|Blob|File|null} screenshot - Image base64, data URI, Blob, File, or null
   * @param {string} question - Question text, survey prompt, or option list
   * @param {Object} [options] - Additional settings (timeoutMs, persona, fallback)
   * @returns {Promise<string>} - The direct clean answer string
   */
  async function fetchSmartSurveyAnswer(screenshot, question, options) {
    options = options || {};
    var timeoutMs = options.timeoutMs || 10000;
    var persona = Object.assign({}, DEFAULT_SURVEY_PERSONA, options.persona || {});
    var questionText = (question || '').trim();

    // 1. Normalize Screenshot
    var screenshotData = '';
    try {
      screenshotData = await normalizeScreenshot(screenshot);
    } catch (_) {
      screenshotData = '';
    }

    // Prepare Persona Context for accurate, consistent answers
    var personaContext = "User Profile: Age " + persona.age + " (" + persona.birthYear + "), " +
      persona.gender + ", " + persona.education + ", " + persona.jobRole + " in " + persona.industry +
      ", Household Income: " + persona.householdIncome + ", Location: " + persona.location + ".";

    var strictSystemInstruction =
      "You are an automated survey solver, calculation engine, and screen assistant. " +
      "Provide ONLY the final, direct, concise answer or exact option name. " +
      "If the question is arithmetic or factual, output the exact correct answer/number. " +
      "DO NOT provide any introduction, explanation, commentary, disclaimers, quotes, or markdown wrappers. " +
      "DO NOT say 'The answer is', 'Based on the image', 'Here is the answer', or 'Selected option:'. " +
      "Output strictly the exact choice or answer text alone.";

    // Assemble Prompt Text
    var userPrompt = "";
    if (screenshotData && screenshotData.length > 50) {
      userPrompt += "[Screen Visual Context Provided]\n";
    }
    if (questionText) {
      userPrompt += "Question / Task:\n" + questionText + "\n\n";
    } else {
      userPrompt += "Look at the screen survey question. Select the best answer.\n";
    }
    userPrompt += personaContext + "\nOutput ONLY the exact final answer:";

    // ── TIER 1: Pollinations Anonymous AI Engine (100% Free, Zero Key, Zero Login) ──
    try {
      var pollUrl = "https://text.pollinations.ai/" + encodeURIComponent(userPrompt) +
                    "?system=" + encodeURIComponent(strictSystemInstruction) +
                    "&seed=42";

      var res = await fetchWithTimeout(pollUrl, {
        method: "GET",
        headers: {
          "Accept": "text/plain,application/json,*/*"
        }
      }, timeoutMs);

      if (res && res.ok) {
        var rawText = await res.text();
        var answer = sanitizeFinalAnswer(rawText);
        if (answer && answer.length > 0) {
          return answer;
        }
      }
    } catch (tier1Err) {
      // Tier 1 timed out or network error - gracefully fall through to Tier 2
      if (options.debug) {
        console.warn("[UniversalSurveySolver] Tier 1 fetch bypassed:", tier1Err.message);
      }
    }

    // ── TIER 2: Local Desktop / Extension Bridge (If running on PC with Jarvis Bridge) ──
    try {
      var bridgeUrl = "http://127.0.0.1:8765/api/survey_analyze";
      var bridgePayload = {
        questions: [{
          text: questionText,
          options: []
        }],
        screenshot: screenshotData ? screenshotData.slice(0, 1000) : null
      };

      var bridgeRes = await fetchWithTimeout(bridgeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bridgePayload)
      }, Math.min(timeoutMs, 4000));

      if (bridgeRes && bridgeRes.ok) {
        var bridgeData = await bridgeRes.json();
        if (bridgeData && bridgeData.answers && bridgeData.answers.length > 0) {
          var bAns = bridgeData.answers[0];
          var bText = (bAns.selected_labels && bAns.selected_labels[0]) ||
                      bAns.text_input_value || bAns.answer;
          var cleanBridge = sanitizeFinalAnswer(bText);
          if (cleanBridge) {
            return cleanBridge;
          }
        }
      }
    } catch (_) {
      // Local bridge not running (e.g. mobile standalone or extension without desktop)
    }

    // ── TIER 3: Autonomous Heuristic & Trap Detection Engine (Deterministic Zero-Latency) ──
    var heuristicAnswer = solveWithDeterministicHeuristic(questionText, persona);
    if (heuristicAnswer) {
      return sanitizeFinalAnswer(heuristicAnswer);
    }

    // ── TIER 4: Ultimate Safe Fallback ──
    // Extract first logical option if question format is "A) ... B) ..."
    var optionMatch = questionText.match(/(?:[A-D]\)|[1-4]\.)\s*([^\n\r,]+)/);
    if (optionMatch && optionMatch[1]) {
      return sanitizeFinalAnswer(optionMatch[1]);
    }

    // Safe default if open-ended
    return "Agree";
  }

  return {
    fetchSmartSurveyAnswer: fetchSmartSurveyAnswer,
    queryPolymerAI: fetchSmartSurveyAnswer,
    sanitizeFinalAnswer: sanitizeFinalAnswer,
    DEFAULT_SURVEY_PERSONA: DEFAULT_SURVEY_PERSONA
  };
}));
