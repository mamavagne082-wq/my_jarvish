/**
 * ==============================================================================
 * JARVIS GEMINI SURVEY COPILOT - CONTENT SCRIPT (content.js)
 * ==============================================================================
 * 1. Live DOM Survey Scanner:
 *    - Extracts questions, fieldsets, radio buttons, checkboxes, dropdowns, and text inputs.
 *    - Maps accurate human labels and attaches unique tracking IDs (data-jarvis-uid).
 * 2. Natural Auto-Fill & Selector Engine:
 *    - Matches Gemini AI answers with target DOM elements using exact & fuzzy logic.
 *    - Dispatches native browser interaction events (pointer, mouse, click, change, input).
 *    - Provides subtle Jarvis neon visual highlights on filled choices.
 * ==============================================================================
 */

(() => {
  // Prevent duplicate execution if re-injected
  if (window.__JARVIS_SURVEY_COPILOT_LOADED__) return;
  window.__JARVIS_SURVEY_COPILOT_LOADED__ = true;

  console.log('[Jarvis Survey Copilot] Content script active and initialized.');

  let uidCounter = 1;

  /**
   * Generates a unique tracking ID for page elements
   */
  function getOrCreateUid(element) {
    if (!element.dataset.jarvisUid) {
      element.dataset.jarvisUid = `jarvis_elem_${Date.now()}_${uidCounter++}`;
    }
    return element.dataset.jarvisUid;
  }

  /**
   * Sanitizes string by removing extra whitespace and special decorative characters
   */
  function cleanString(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s*•\-–—]+/, '')
      .replace(/[\s*]+$/, '')
      .trim();
  }

  /**
   * Finds the best label for an interactive input element
   */
  function findElementLabel(input) {
    // 1. Explicit <label for="id">
    if (input.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (explicitLabel && cleanString(explicitLabel.innerText)) {
        return cleanString(explicitLabel.innerText);
      }
    }

    // 2. Enclosing parent <label>
    const parentLabel = input.closest('label');
    if (parentLabel && cleanString(parentLabel.innerText)) {
      return cleanString(parentLabel.innerText);
    }

    // 3. Aria attributes
    if (input.getAttribute('aria-label')) {
      return cleanString(input.getAttribute('aria-label'));
    }
    const ariaLabelledby = input.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const labelledByElem = document.getElementById(ariaLabelledby);
      if (labelledByElem && cleanString(labelledByElem.innerText)) {
        return cleanString(labelledByElem.innerText);
      }
    }

    // 4. Closest text container / sibling (e.g. Alchemer / Qualtrics / Typeform structures)
    const container = input.closest('.sg-question-options, .choice, .option, li, tr, td, div');
    if (container) {
      const siblingText = container.querySelector('.label-text, .sg-label, .choice-label, .option-text, span, p');
      if (siblingText && cleanString(siblingText.innerText)) {
        return cleanString(siblingText.innerText);
      }
    }

    // 5. Placeholder or title attribute
    return cleanString(input.placeholder || input.title || input.name || '');
  }

  /**
   * Finds the parent question container and prompt text for an input
   */
  function findQuestionPrompt(element) {
    // Check common survey question wrappers (Alchemer, SurveyMonkey, Qualtrics, Formstack, Google Forms)
    const questionContainer = element.closest(
      '.sg-question, .question-container, .q-item, .QuestionOuter, .ss-form-question, fieldset, .survey-question, [role="group"]'
    ) || element.closest('table') || element.closest('form') || element.parentElement;

    if (!questionContainer) return 'General Survey Item';

    // Look for question title / legend elements
    const headingSelectors = [
      'legend',
      '.sg-question-title',
      '.question-title',
      '.question-text',
      '.QuestionText',
      'h1, h2, h3, h4, h5, h6',
      '.title',
      'strong'
    ];

    for (const sel of headingSelectors) {
      const heading = questionContainer.querySelector(sel);
      if (heading && cleanString(heading.innerText).length > 2) {
        return cleanString(heading.innerText);
      }
    }

    // Fallback: Check inner text of container header
    return cleanString(questionContainer.innerText?.split('\n')?.[0] || 'Survey Question');
  }

  /**
   * Extracts all survey questions, options, and inputs on the current page
   */
  function scanPageDOM() {
    const questionsMap = new Map();
    const allInputs = document.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], select, textarea, input[type="text"], input[type="number"], input[type="email"], [role="radio"], [role="checkbox"]'
    );

    allInputs.forEach((input) => {
      // Skip hidden, disabled, or extension-internal elements
      if (input.type === 'hidden' || input.style.display === 'none' || input.offsetParent === null) {
        return;
      }

      const uid = getOrCreateUid(input);
      const prompt = findQuestionPrompt(input);
      const label = findElementLabel(input);
      const isRadio = input.type === 'radio' || input.getAttribute('role') === 'radio';
      const isCheckbox = input.type === 'checkbox' || input.getAttribute('role') === 'checkbox';
      const isSelect = input.tagName.toLowerCase() === 'select';
      const isText = input.tagName.toLowerCase() === 'textarea' || ['text', 'number', 'email', 'tel', 'url'].includes(input.type);

      let fieldType = 'unknown';
      if (isRadio) fieldType = 'radio';
      else if (isCheckbox) fieldType = 'checkbox';
      else if (isSelect) fieldType = 'select';
      else if (isText) fieldType = 'text';

      if (!questionsMap.has(prompt)) {
        questionsMap.set(prompt, {
          question_index: questionsMap.size,
          prompt: prompt,
          type: fieldType,
          options: []
        });
      }

      const qRecord = questionsMap.get(prompt);

      if (isSelect) {
        // Collect dropdown select options
        Array.from(input.options).forEach((opt, optIdx) => {
          if (!opt.value && optIdx === 0) return; // Skip placeholder "-- Select --"
          qRecord.options.push({
            uid: uid,
            type: 'select_option',
            label: cleanString(opt.text || opt.value),
            value: opt.value,
            selected: opt.selected
          });
        });
      } else {
        qRecord.options.push({
          uid: uid,
          type: fieldType,
          label: label || `Input #${qRecord.options.length + 1}`,
          checked: !!input.checked,
          current_value: input.value || '',
          name: input.name || '',
          id: input.id || ''
        });
      }
    });

    const structuredQuestions = Array.from(questionsMap.values());

    return {
      url: window.location.href,
      pageTitle: document.title,
      totalQuestions: structuredQuestions.length,
      questions: structuredQuestions
    };
  }

  /**
   * Dispatches human-like natural events to ensure web frameworks register interactions
   */
  function dispatchNaturalEvents(element) {
    if (!element) return;

    // Focus element
    try { element.focus(); } catch (_) {}

    const eventSequence = [
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
    ];

    eventSequence.forEach((evt) => element.dispatchEvent(evt));

    // Native click
    element.click();

    // Change and Input events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Sets text field value safely across React, Angular, and vanilla DOM
   */
  function setNativeValue(element, value) {
    if (!element) return;

    element.focus();

    // Use prototype setter to bypass React's synthetic event wrappers
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  }

  /**
   * Adds glowing visual feedback on auto-filled elements
   */
  function applyJarvisHighlight(element) {
    if (!element) return;
    const target = element.closest('label') || element.closest('.sg-question-options, .choice, li, tr') || element;

    const originalTransition = target.style.transition;
    const originalBoxShadow = target.style.boxShadow;
    const originalOutline = target.style.outline;

    target.style.transition = 'all 0.35s ease';
    target.style.boxShadow = '0 0 14px rgba(0, 230, 118, 0.85), inset 0 0 6px rgba(0, 242, 254, 0.4)';
    target.style.outline = '2px solid #00e676';
    target.style.borderRadius = '6px';

    setTimeout(() => {
      target.style.transition = originalTransition;
      target.style.boxShadow = originalBoxShadow;
      target.style.outline = originalOutline;
    }, 3500);
  }

  /**
   * Matches string similarity for fuzzy option matching
   */
  function isMatch(textA, textB) {
    if (!textA || !textB) return false;
    const a = cleanString(textA).toLowerCase();
    const b = cleanString(textB).toLowerCase();

    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;

    // Alphanumeric stripped comparison
    const aClean = a.replace(/[^a-z0-9]/g, '');
    const bClean = b.replace(/[^a-z0-9]/g, '');
    if (aClean && bClean && (aClean === bClean || aClean.includes(bClean) || bClean.includes(aClean))) {
      return true;
    }

    return false;
  }

  /**
   * Executes auto-fill selections on the page based on Gemini's structured output
   */
  function executeAutoFill(answersPayload) {
    if (!answersPayload) return { success: false, error: 'Empty answers payload provided.' };

    const answersList = answersPayload.questions || answersPayload.answers || (Array.isArray(answersPayload) ? answersPayload : []);
    let filledCount = 0;
    const logDetails = [];

    // Re-scan current DOM to ensure fresh element references
    const scanData = scanPageDOM();

    answersList.forEach((ans, ansIdx) => {
      // Identify target question by index or matching prompt
      const targetQuestion =
        (typeof ans.question_index === 'number' && scanData.questions[ans.question_index]) ||
        scanData.questions.find((q) => isMatch(q.prompt, ans.question_text || ans.question_prompt)) ||
        scanData.questions[ansIdx];

      if (!targetQuestion) {
        logDetails.push({ error: `Question not found for item #${ansIdx + 1}` });
        return;
      }

      const selectedLabels = Array.isArray(ans.selected_options)
        ? ans.selected_options
        : ans.selected_label
        ? [ans.selected_label]
        : ans.selected_answers || [];

      const textValue = ans.text_input_value || ans.text || ans.value || null;

      // 1. Process Choices / Options (Radio, Checkbox, Dropdown)
      if (selectedLabels.length > 0) {
        selectedLabels.forEach((label) => {
          const matchedOpt = targetQuestion.options.find((opt) => isMatch(opt.label, label));

          if (matchedOpt) {
            const elem = document.querySelector(`[data-jarvis-uid="${matchedOpt.uid}"]`);
            if (elem) {
              if (elem.tagName.toLowerCase() === 'select') {
                // Dropdown selection
                for (let i = 0; i < elem.options.length; i++) {
                  if (isMatch(elem.options[i].text, label) || isMatch(elem.options[i].value, label)) {
                    elem.selectedIndex = i;
                    elem.dispatchEvent(new Event('change', { bubbles: true }));
                    applyJarvisHighlight(elem);
                    filledCount++;
                    logDetails.push({ action: 'select_dropdown', label: label });
                    break;
                  }
                }
              } else {
                // Radio button or Checkbox click
                dispatchNaturalEvents(elem);
                applyJarvisHighlight(elem);
                filledCount++;
                logDetails.push({ action: 'clicked_choice', label: matchedOpt.label });
              }
            }
          }
        });
      }

      // 2. Process Text Inputs / Textarea
      if (textValue) {
        const textOpt = targetQuestion.options.find((opt) => opt.type === 'text');
        if (textOpt) {
          const textElem = document.querySelector(`[data-jarvis-uid="${textOpt.uid}"]`);
          if (textElem) {
            setNativeValue(textElem, textValue);
            applyJarvisHighlight(textElem);
            filledCount++;
            logDetails.push({ action: 'typed_text', value: textValue });
          }
        }
      }
    });

    console.log(`[Jarvis Survey Copilot] Auto-fill complete. Applied ${filledCount} selections.`, logDetails);

    return {
      success: true,
      filledCount: filledCount,
      logDetails: logDetails
    };
  }

  /**
   * Message listener from background & side panel
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, payload } = message;

    if (action === 'PING') {
      return sendResponse({ status: 'PONG' });
    }

    if (action === 'SCAN_DOM_ELEMENTS') {
      try {
        const domResult = scanPageDOM();
        return sendResponse({ success: true, data: domResult });
      } catch (err) {
        return sendResponse({ success: false, error: err.message });
      }
    }

    if (action === 'AUTO_FILL_ANSWERS') {
      try {
        const fillResult = executeAutoFill(payload.answers);
        return sendResponse(fillResult);
      } catch (err) {
        return sendResponse({ success: false, error: err.message });
      }
    }

    return false;
  });
})();
