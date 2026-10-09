/**
 * ==============================================================================
 * SURVEY PAGE CONTENT SCRIPT (content.js)
 * Injected into active survey web pages
 * ==============================================================================
 * 1. Scrapes survey questions, candidate options, and input controls.
 * 2. Receives Gemini JSON answers and executes natural human-like auto-filling.
 * 3. Dispatches realistic browser events (pointerdown, mousedown, click, change, input).
 * ==============================================================================
 */

(() => {
  if (window.__SURVEY_COPILOT_INJECTED__) return;
  window.__SURVEY_COPILOT_INJECTED__ = true;

  console.log('[Survey Content Script] Scanner & Auto-Filler active.');

  let uidSeq = 1;

  function getUid(el) {
    if (!el.dataset.copilotId) {
      el.dataset.copilotId = `copilot_${Date.now()}_${uidSeq++}`;
    }
    return el.dataset.copilotId;
  }

  function clean(str) {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/\s+/g, ' ').replace(/^[\s*•\-]+/, '').trim();
  }

  /**
   * Discovers associated label text for an input control
   */
  function getLabelForInput(input) {
    if (input.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lbl && clean(lbl.innerText)) return clean(lbl.innerText);
    }

    const parent = input.closest('label');
    if (parent && clean(parent.innerText)) return clean(parent.innerText);

    const container = input.closest('.sg-question-options, .choice, .option, li, tr, td, div');
    if (container) {
      const textElem = container.querySelector('.label-text, .choice-label, .option-text, span, p');
      if (textElem && clean(textElem.innerText)) return clean(textElem.innerText);
    }

    return clean(input.getAttribute('aria-label') || input.placeholder || input.name || '');
  }

  /**
   * Discovers parent question title / prompt
   */
  function getQuestionTitle(input) {
    const qBox = input.closest('.sg-question, .question-container, .q-item, .QuestionOuter, fieldset, [role="group"]') ||
                 input.closest('table') || input.parentElement;

    if (!qBox) return 'Survey Question';

    const header = qBox.querySelector('legend, .sg-question-title, .question-title, .question-text, h1, h2, h3, h4, strong');
    if (header && clean(header.innerText)) return clean(header.innerText);

    return clean(qBox.innerText?.split('\n')?.[0] || 'Question');
  }

  /**
   * Scrapes survey page structure
   */
  function extractSurveyData() {
    const questionsMap = new Map();
    const inputs = document.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], select, textarea, input[type="text"], input[type="number"], input[type="email"], [role="radio"], [role="checkbox"]'
    );

    inputs.forEach((input) => {
      if (input.type === 'hidden' || input.style.display === 'none' || input.offsetParent === null) return;

      const qTitle = getQuestionTitle(input);
      const uid = getUid(input);
      const label = getLabelForInput(input);

      let type = 'text';
      if (input.type === 'radio' || input.getAttribute('role') === 'radio') type = 'radio';
      else if (input.type === 'checkbox' || input.getAttribute('role') === 'checkbox') type = 'checkbox';
      else if (input.tagName.toLowerCase() === 'select') type = 'select';

      if (!questionsMap.has(qTitle)) {
        questionsMap.set(qTitle, {
          question_index: questionsMap.size,
          question_text: qTitle,
          type: type,
          options: []
        });
      }

      const qRec = questionsMap.get(qTitle);

      if (type === 'select') {
        Array.from(input.options).forEach((opt, idx) => {
          if (!opt.value && idx === 0) return;
          qRec.options.push({ uid: uid, label: clean(opt.text || opt.value), value: opt.value, type: 'select_option' });
        });
      } else {
        qRec.options.push({
          uid: uid,
          label: label || `Option #${qRec.options.length + 1}`,
          type: type,
          checked: !!input.checked
        });
      }
    });

    return {
      url: window.location.href,
      title: document.title,
      questions: Array.from(questionsMap.values())
    };
  }

  /**
   * Dispatches human-like natural events
   */
  async function simulateHumanClick(element) {
    if (!element) return;
    try { element.focus(); } catch (_) {}

    const events = [
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
    ];

    for (const evt of events) {
      element.dispatchEvent(evt);
      await new Promise((r) => setTimeout(r, 20));
    }

    element.click();
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Types text naturally into an input or textarea
   */
  async function simulateHumanTyping(element, text) {
    if (!element) return;
    element.focus();

    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    element.value = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (setter) {
        setter.call(element, element.value + char);
      } else {
        element.value += char;
      }
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
      // Human typing delay between keystrokes (15-35ms)
      await new Promise((r) => setTimeout(r, 25));
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  }

  /**
   * Glowing visual indicator on filled choices
   */
  function highlightChoice(element) {
    const box = element.closest('label') || element.closest('.choice, li') || element;
    const oldBorder = box.style.outline;
    const oldShadow = box.style.boxShadow;

    box.style.outline = '2px solid #00f2fe';
    box.style.boxShadow = '0 0 12px rgba(0, 242, 254, 0.7)';
    box.style.borderRadius = '4px';

    setTimeout(() => {
      box.style.outline = oldBorder;
      box.style.boxShadow = oldShadow;
    }, 4000);
  }

  /**
   * Fuzzy string matcher
   */
  function matchText(strA, strB) {
    if (!strA || !strB) return false;
    const a = clean(strA).toLowerCase();
    const b = clean(strB).toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
  }

  /**
   * Executes answers on the page
   */
  async function applyAnswers(answersPayload) {
    const list = answersPayload.answers || (Array.isArray(answersPayload) ? answersPayload : []);
    const surveyData = extractSurveyData();
    let count = 0;

    for (let i = 0; i < list.length; i++) {
      const ans = list[i];
      const q = surveyData.questions[ans.question_index] || surveyData.questions[i];
      if (!q) continue;

      const targetVal = ans.selected_value || ans.answer || ans.value || '';
      const action = ans.action || 'select_radio';

      if (action === 'type_text') {
        const textOption = q.options.find((o) => o.type === 'text');
        if (textOption) {
          const el = document.querySelector(`[data-copilot-id="${textOption.uid}"]`);
          if (el) {
            await simulateHumanTyping(el, targetVal);
            highlightChoice(el);
            count++;
          }
        }
      } else {
        // Radio / Checkbox / Dropdown
        const opt = q.options.find((o) => matchText(o.label, targetVal));
        if (opt) {
          const el = document.querySelector(`[data-copilot-id="${opt.uid}"]`);
          if (el) {
            if (el.tagName.toLowerCase() === 'select') {
              for (let sIdx = 0; sIdx < el.options.length; sIdx++) {
                if (matchText(el.options[sIdx].text, targetVal)) {
                  el.selectedIndex = sIdx;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  highlightChoice(el);
                  count++;
                  break;
                }
              }
            } else {
              await simulateHumanClick(el);
              highlightChoice(el);
              count++;
            }
          }
        }
      }

      // Natural pause between answering distinct questions (250ms - 400ms)
      await new Promise((r) => setTimeout(r, 300));
    }

    return { success: true, count: count };
  }

  // Runtime message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'PING') {
      return sendResponse({ status: 'PONG' });
    }

    if (message.action === 'EXTRACT_PAGE_DATA') {
      const data = extractSurveyData();
      return sendResponse({ success: true, data: data });
    }

    if (message.action === 'AUTO_FILL_SURVEY_PAGE') {
      (async () => {
        try {
          const res = await applyAnswers(message.payload.answers);
          sendResponse(res);
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    return false;
  });
})();
