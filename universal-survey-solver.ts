/**
 * ========================================================================================
 * JARVIS AI - UNIVERSAL SURVEY & SCREEN SOLVER MODULE (TypeScript Definition & Source)
 * ========================================================================================
 * Compatible across:
 *   1. PC Executable (Node.js, Electron, Next.js / React HUD)
 *   2. Android Mobile APK (WebView, Foreground Service)
 *   3. Browser Extensions (Manifest V3 Service Worker, Content Scripts, Popup, Sidepanel)
 * ========================================================================================
 */

export interface SurveyPersona {
  name?: string;
  age?: string;
  birthYear?: string;
  gender?: string;
  ethnicity?: string;
  education?: string;
  employment?: string;
  industry?: string;
  jobRole?: string;
  companySize?: string;
  householdIncome?: string;
  maritalStatus?: string;
  children?: string;
  location?: string;
  [key: string]: string | undefined;
}

export interface SurveySolverOptions {
  timeoutMs?: number;
  persona?: SurveyPersona;
  debug?: boolean;
  onProgress?: (status: string) => void;
}

export const DEFAULT_SURVEY_PERSONA: SurveyPersona = {
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
 */
export function sanitizeFinalAnswer(raw: string): string {
  if (!raw) return '';
  let clean = String(raw).trim();

  // 1. Strip Markdown Code Fences (```json, ```text, ```)
  const codeBlockMatch = clean.match(/^```(?:json|text|markdown)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    clean = codeBlockMatch[1].trim();
  }

  // 2. Handle embedded JSON objects if returned by model
  if (clean.charAt(0) === '{' && clean.charAt(clean.length - 1) === '}') {
    try {
      const parsed = JSON.parse(clean);
      const val = parsed.answer || parsed.selection || parsed.text || parsed.result ||
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
  const lines = clean.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.match(/^(?:Note|Explanation|Reasoning|Because|Why|Summary|Confidence):/i));

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
 * Universal Fetch with strict AbortController Timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;
  let timer: any = null;

  const fetchPromise = new Promise<Response>((resolve, reject) => {
    if (controller) {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Network timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    const fetchOptions: RequestInit = { ...options, signal };
    fetch(url, fetchOptions)
      .then(res => resolve(res))
      .catch(err => reject(err));
  });

  try {
    const result = await fetchPromise;
    if (timer) clearTimeout(timer);
    return result;
  } catch (err) {
    if (timer) clearTimeout(timer);
    throw err;
  }
}

/**
 * Helper: Normalize screenshot input to clean string representation
 */
async function normalizeScreenshot(screenshot?: string | Blob | File | null): Promise<string> {
  if (!screenshot) return '';
  if (typeof screenshot === 'string') return screenshot.trim();

  if (typeof Blob !== 'undefined' && screenshot instanceof Blob) {
    return new Promise((resolve, reject) => {
      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(screenshot);
      } else {
        resolve('');
      }
    });
  }

  return '';
}

/**
 * Rule-based Deterministic Heuristic Solver
 */
function solveWithDeterministicHeuristic(questionText: string, persona: SurveyPersona): string {
  if (!questionText) return '';
  const q = questionText.toLowerCase();

  // Attention checks & Quality traps
  if (q.includes('please select') || q.includes('attention check') || q.includes('quality check')) {
    const colorMatches = ['red', 'blue', 'green', 'yellow', 'purple', 'black', 'white'];
    for (const color of colorMatches) {
      if (q.includes('select ' + color) || q.includes('choose ' + color)) {
        return color.charAt(0).toUpperCase() + color.slice(1);
      }
    }
    if (q.includes('somewhat agree')) return 'Somewhat agree';
    if (q.includes('strongly agree')) return 'Strongly agree';
    if (q.includes('disagree')) return 'Disagree';
  }

  // Demographics
  if (q.includes('age') || q.includes('how old') || q.includes('birth year')) {
    if (q.includes('year')) return persona.birthYear || '1976';
    return persona.age || '50';
  }
  if (q.includes('gender') || q.includes('sex')) {
    return persona.gender || 'Male';
  }
  if (q.includes('employment') || q.includes('working status')) {
    return persona.employment || 'Employed Full-Time';
  }
  if (q.includes('industry') || q.includes('occupation') || q.includes('field of work')) {
    return persona.industry || 'Computer Software / Technology / IT';
  }
  if (q.includes('job title') || q.includes('role') || q.includes('seniority')) {
    return persona.jobRole || 'Director / Senior Engineering Manager';
  }
  if (q.includes('income') || q.includes('salary') || q.includes('earnings')) {
    return persona.householdIncome || '$125,000 - $149,999';
  }
  if (q.includes('education') || q.includes('degree')) {
    return persona.education || "Master's Degree / Post-Graduate";
  }

  // Likert & Rating
  if (q.includes('how satisfied') || q.includes('satisfaction')) return 'Very satisfied';
  if (q.includes('how likely') || q.includes('recommend')) return 'Extremely likely';
  if (q.includes('agree or disagree') || q.includes('level of agreement')) return 'Agree';
  if (q.includes('why') || q.includes('comment') || q.includes('feedback')) {
    return 'High quality, reliable performance, and intuitive user experience.';
  }

  return '';
}

/**
 * PRIMARY UNIVERSAL API: fetchSmartSurveyAnswer(screenshot, question, options)
 *
 * @param screenshot - Image base64, data URI, Blob, File, or null
 * @param question - Question text, survey prompt, or option list
 * @param options - Additional settings (timeoutMs, persona, fallback)
 * @returns The direct clean answer string
 */
export async function fetchSmartSurveyAnswer(
  screenshot?: string | Blob | File | null,
  question?: string,
  options?: SurveySolverOptions
): Promise<string> {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 10000;
  const persona = { ...DEFAULT_SURVEY_PERSONA, ...(opts.persona || {}) };
  const questionText = (question || '').trim();

  let screenshotData = '';
  try {
    screenshotData = await normalizeScreenshot(screenshot);
  } catch (_) {
    screenshotData = '';
  }

  const personaContext = `User Profile: Age ${persona.age} (${persona.birthYear}), ${persona.gender}, ${persona.education}, ${persona.jobRole} in ${persona.industry}, Household Income: ${persona.householdIncome}, Location: ${persona.location}.`;

  const strictSystemInstruction =
    "You are an automated survey solver, calculation engine, and screen assistant. " +
    "Provide ONLY the final, direct, concise answer or exact option name. " +
    "If the question is arithmetic or factual, output the exact correct answer/number. " +
    "DO NOT provide any introduction, explanation, commentary, disclaimers, quotes, or markdown wrappers. " +
    "DO NOT say 'The answer is', 'Based on the image', 'Here is the answer', or 'Selected option:'. " +
    "Output strictly the exact choice or answer text alone.";

  let userPrompt = "";
  if (screenshotData && screenshotData.length > 50) {
    userPrompt += "[Screen Visual Context Provided]\n";
  }
  if (questionText) {
    userPrompt += `Question / Task:\n${questionText}\n\n`;
  } else {
    userPrompt += "Look at the screen survey question. Select the best answer.\n";
  }
  userPrompt += `${personaContext}\nOutput ONLY the exact final answer:`;

  // ── TIER 1: Pollinations Anonymous AI Engine (Zero Key, Zero Login) ──
  try {
    const pollUrl = `https://text.pollinations.ai/${encodeURIComponent(userPrompt)}?system=${encodeURIComponent(strictSystemInstruction)}&seed=42`;

    const res = await fetchWithTimeout(pollUrl, {
      method: "GET",
      headers: { "Accept": "text/plain,application/json,*/*" }
    }, timeoutMs);

    if (res && res.ok) {
      const rawText = await res.text();
      const answer = sanitizeFinalAnswer(rawText);
      if (answer && answer.length > 0) {
        return answer;
      }
    }
  } catch (tier1Err: any) {
    if (opts.debug) {
      console.warn("[UniversalSurveySolver] Tier 1 fetch bypassed:", tier1Err.message);
    }
  }

  // ── TIER 2: Local Desktop / Extension Bridge ──
  try {
    const bridgeUrl = "http://127.0.0.1:8765/api/survey_analyze";
    const bridgePayload = {
      questions: [{ text: questionText, options: [] }],
      screenshot: screenshotData ? screenshotData.slice(0, 1000) : null
    };

    const bridgeRes = await fetchWithTimeout(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bridgePayload)
    }, Math.min(timeoutMs, 4000));

    if (bridgeRes && bridgeRes.ok) {
      const bridgeData: any = await bridgeRes.json();
      if (bridgeData && bridgeData.answers && bridgeData.answers.length > 0) {
        const bAns = bridgeData.answers[0];
        const bText = (bAns.selected_labels && bAns.selected_labels[0]) ||
                      bAns.text_input_value || bAns.answer;
        const cleanBridge = sanitizeFinalAnswer(bText);
        if (cleanBridge) {
          return cleanBridge;
        }
      }
    }
  } catch (_) {}

  // ── TIER 3: Autonomous Heuristic & Trap Detection Engine ──
  const heuristicAnswer = solveWithDeterministicHeuristic(questionText, persona);
  if (heuristicAnswer) {
    return sanitizeFinalAnswer(heuristicAnswer);
  }

  // ── TIER 4: Ultimate Safe Fallback ──
  const optionMatch = questionText.match(/(?:[A-D]\)|[1-4]\.)\s*([^\n\r,]+)/);
  if (optionMatch && optionMatch[1]) {
    return sanitizeFinalAnswer(optionMatch[1]);
  }

  return "Agree";
}

export default {
  fetchSmartSurveyAnswer,
  sanitizeFinalAnswer,
  DEFAULT_SURVEY_PERSONA
};
