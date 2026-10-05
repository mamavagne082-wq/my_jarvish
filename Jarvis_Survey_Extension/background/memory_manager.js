/**
 * Jarvis AI Survey Copilot - Local Memory Cache & Knowledge Base Matcher
 * Features:
 *  - 100% Offline, Zero-Cost Question Hashing & Canonical Key Generator
 *  - Exact & High-Similarity (Fuzzy) Token & Levenshtein Matcher
 *  - Persistent Dual-Tier Storage (IndexedDB + chrome.storage.local)
 *  - Survey Knowledge File Parsers: JSON, CSV, TXT, and client-side PDF
 *  - Real-Time Hit Tracking & API Savings Calculator
 *  - External Memory / Embedding API Key support with 100% local fallback
 */

(function (global) {
  "use strict";

  const DB_NAME = "JarvisSurveyMemoryDB";
  const DB_VERSION = 1;
  const STORE_QA = "qa_cache";
  const STORE_FILES = "knowledge_files";
  const STORE_ENTRIES = "knowledge_entries";

  // Common stop words to eliminate noise in question text similarity
  const STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "of", "at", "by", "for",
    "with", "about", "against", "between", "into", "through", "during", "before",
    "after", "above", "below", "to", "from", "up", "down", "in", "out", "on",
    "off", "over", "under", "again", "further", "then", "once", "here", "there",
    "when", "where", "why", "how", "all", "any", "both", "each", "few", "more",
    "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
    "so", "than", "too", "very", "can", "will", "just", "should", "now", "is",
    "are", "was", "were", "be", "been", "being", "have", "has", "had", "do",
    "does", "did", "you", "your", "yours", "yourself", "please", "select",
    "which", "following", "best", "describes", "what", "indicate", "choose"
  ]);

  /**
   * 32-bit FNV-1a Hash implementation
   */
  function fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Normalizes question text for canonical lookup
   */
  function normalizeText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .toLowerCase()
      // Remove HTML tags
      .replace(/<[^>]*>/g, " ")
      // Replace smart quotes and apostrophes
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // Remove leading question numbers or bullets: e.g. "Q1.", "1.", "1)", "•", "*"
      .replace(/^\s*(?:q\d*[:.)-]?|\d+[:.)-]?|[•\*\-])\s*/gi, "")
      // Remove common punctuation except alphanumeric and space
      .replace(/[^\w\s\d]/g, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Extracts clean tokens and bigrams for fuzzy matching
   */
  function getTokens(normalizedText) {
    if (!normalizedText) return [];
    const words = normalizedText.split(" ").filter((w) => w.length > 1);
    const meaningful = words.filter((w) => !STOP_WORDS.has(w));
    const tokenSet = new Set(meaningful.length > 0 ? meaningful : words);

    // Add consecutive word bigrams from meaningful words to preserve context (e.g. "household_income", "employment_status")
    const baseList = meaningful.length > 0 ? meaningful : words;
    for (let i = 0; i < baseList.length - 1; i++) {
      tokenSet.add(`${baseList[i]}_${baseList[i + 1]}`);
    }

    return Array.from(tokenSet);
  }

  /**
   * Generates unique canonical and contextual hash keys for a question
   */
  function generateQuestionKey(questionText, options = []) {
    const norm = normalizeText(questionText);
    const canonicalHash = fnv1a(norm);

    let optStr = "";
    if (Array.isArray(options) && options.length > 0) {
      optStr = options
        .map((o) => (typeof o === "string" ? o : o.label || o.value || ""))
        .map(normalizeText)
        .filter(Boolean)
        .sort()
        .join("|");
    }

    const contextHash = optStr ? fnv1a(`${norm}::${optStr}`) : canonicalHash;

    return {
      canonicalKey: `q_${canonicalHash}`,
      contextualKey: `qc_${contextHash}`,
      normalizedText: norm,
      tokens: getTokens(norm)
    };
  }

  /**
   * Jaccard token set similarity (0.0 to 1.0)
   */
  function jaccardSimilarity(tokensA, tokensB) {
    if (!tokensA.length || !tokensB.length) return 0;
    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    let intersection = 0;
    for (const t of setA) {
      if (setB.has(t)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Normalized Levenshtein similarity (0.0 to 1.0)
   */
  function levenshteinSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1.length || !s2.length) return 0.0;

    // Fast-path length discrepancy check
    const maxLen = Math.max(s1.length, s2.length);
    if (Math.abs(s1.length - s2.length) / maxLen > 0.4) {
      // Substring check
      if (s1.includes(s2) || s2.includes(s1)) {
        return Math.min(s1.length, s2.length) / maxLen;
      }
      return 0.2;
    }

    const d = [];
    for (let i = 0; i <= s1.length; i++) d[i] = [i];
    for (let j = 0; j <= s2.length; j++) d[0][j] = j;

    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + cost
        );
      }
    }
    return 1 - d[s1.length][s2.length] / maxLen;
  }

  /**
   * Calculates overall similarity between two questions (offline, fast)
   */
  function calculateSimilarity(normA, tokensA, normB, tokensB, optionsA = [], optionsB = []) {
    if (!normA || !normB) return 0;
    if (normA === normB) return 1.0;

    // Substring containment check (e.g. "What is your employment status" inside "What is your current employment status?")
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    if (minLen >= 8) {
      if (normA.includes(normB) || normB.includes(normA)) {
        const ratio = minLen / maxLen;
        if (ratio >= 0.65) return Math.max(0.88, ratio);
      }
    }

    const tA = Array.isArray(tokensA) && tokensA.length ? tokensA : getTokens(normA);
    const tB = Array.isArray(tokensB) && tokensB.length ? tokensB : getTokens(normB);

    const setA = new Set(tA);
    const setB = new Set(tB);

    let intersection = 0;
    for (const t of setA) {
      if (setB.has(t)) intersection++;
    }

    const minSet = Math.min(setA.size, setB.size);
    const unionSet = setA.size + setB.size - intersection;

    const overlapSim = minSet > 0 ? intersection / minSet : 0;
    const jaccardSim = unionSet > 0 ? intersection / unionSet : 0;
    const charSim = levenshteinSimilarity(normA, normB);

    let score = overlapSim * 0.50 + jaccardSim * 0.30 + charSim * 0.20;

    // Bonus if target options overlap
    if (optionsA.length > 0 && optionsB.length > 0) {
      const optSetA = new Set(optionsA.map((o) => normalizeText(typeof o === "string" ? o : o.label || o.value || "")).filter(Boolean));
      const optSetB = new Set(optionsB.map((o) => normalizeText(typeof o === "string" ? o : o.label || o.value || "")).filter(Boolean));
      let optOverlap = 0;
      for (const opt of optSetA) {
        if (optSetB.has(opt)) optOverlap++;
      }
      if (optOverlap > 0) {
        score = Math.min(1.0, score + 0.08);
      }
    }

    return score;
  }

  /**
   * IndexedDB Initializer
   */
  let dbPromise = null;
  function getDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        console.warn("[JarvisMemory] IndexedDB not available, fallback to chrome.storage");
        resolve(null);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. QA Cache Store
        if (!db.objectStoreNames.contains(STORE_QA)) {
          const qaStore = db.createObjectStore(STORE_QA, { keyPath: "id" });
          qaStore.createIndex("normalizedText", "normalizedText", { unique: false });
          qaStore.createIndex("canonicalKey", "canonicalKey", { unique: false });
          qaStore.createIndex("createdAt", "createdAt", { unique: false });
          qaStore.createIndex("hitCount", "hitCount", { unique: false });
        }

        // 2. Knowledge Files Metadata Store
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES, { keyPath: "fileId" });
        }

        // 3. Knowledge Base Parsed Entries Store
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          const entryStore = db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
          entryStore.createIndex("fileId", "fileId", { unique: false });
          entryStore.createIndex("normalizedText", "normalizedText", { unique: false });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => {
        console.error("[JarvisMemory] IndexedDB open error:", event.target.error);
        resolve(null);
      };
    });

    return dbPromise;
  }

  /**
   * Synchronous chrome.storage.local mirror for high-level stats
   */
  async function updateMemoryStatsSummary() {
    try {
      const stats = await getMemoryStats();
      await chrome.storage.local.set({ jarvis_memory_stats: stats });
    } catch (e) {}
  }

  /**
   * =========================================================================
   * 1. LOCAL MEMORY CACHING ENGINE
   * =========================================================================
   */

  /**
   * Finds matching question in previously generated QA Cache
   */
  async function findCacheMatch(questionText, options = [], threshold = 0.82) {
    if (!questionText) return null;
    const { canonicalKey, contextualKey, normalizedText, tokens } = generateQuestionKey(questionText, options);

    const db = await getDB();
    if (!db) {
      // Fallback to chrome.storage.local
      const storage = await chrome.storage.local.get(["jarvis_qa_cache_fallback"]);
      const cacheMap = storage.jarvis_qa_cache_fallback || {};
      if (cacheMap[contextualKey]) return formatCacheResult(cacheMap[contextualKey], 1.0);
      if (cacheMap[canonicalKey]) return formatCacheResult(cacheMap[canonicalKey], 1.0);

      // Fuzzy check in fallback map
      let bestItem = null;
      let highestScore = 0;
      for (const item of Object.values(cacheMap)) {
        const score = calculateSimilarity(normalizedText, tokens, item.normalizedText, item.tokens, options, item.options);
        if (score > highestScore && score >= threshold) {
          highestScore = score;
          bestItem = item;
        }
      }
      return bestItem ? formatCacheResult(bestItem, highestScore) : null;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QA, "readwrite");
      const store = tx.objectStore(STORE_QA);

      // Fast check 1: Contextual Key (Exact question + options)
      const reqContext = store.get(contextualKey);
      reqContext.onsuccess = () => {
        if (reqContext.result) {
          const item = reqContext.result;
          item.hitCount = (item.hitCount || 0) + 1;
          item.lastUsedAt = Date.now();
          store.put(item);
          resolve(formatCacheResult(item, 1.0));
          return;
        }

        // Fast check 2: Canonical Key (Exact question text)
        const reqCanon = store.get(canonicalKey);
        reqCanon.onsuccess = () => {
          if (reqCanon.result) {
            const item = reqCanon.result;
            item.hitCount = (item.hitCount || 0) + 1;
            item.lastUsedAt = Date.now();
            store.put(item);
            resolve(formatCacheResult(item, 0.98));
            return;
          }

          // Step 3: Fuzzy check over all stored questions
          const cursorReq = store.openCursor();
          let bestMatch = null;
          let maxScore = 0;

          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const item = cursor.value;
              const score = calculateSimilarity(
                normalizedText,
                tokens,
                item.normalizedText,
                item.tokens || getTokens(item.normalizedText),
                options,
                item.options || []
              );

              if (score > maxScore && score >= threshold) {
                maxScore = score;
                bestMatch = item;
              }
              cursor.continue();
            } else {
              if (bestMatch && maxScore >= threshold) {
                bestMatch.hitCount = (bestMatch.hitCount || 0) + 1;
                bestMatch.lastUsedAt = Date.now();
                store.put(bestMatch);
                resolve(formatCacheResult(bestMatch, maxScore));
              } else {
                resolve(null);
              }
            }
          };
          cursorReq.onerror = () => resolve(null);
        };
        reqCanon.onerror = () => resolve(null);
      };
      reqContext.onerror = () => resolve(null);
    });
  }

  function formatCacheResult(item, confidence) {
    return {
      match: true,
      source: "memory_cache",
      confidence: confidence,
      matchedQuestion: item.questionText,
      answer: item.answer,
      recommended_action: item.answer?.recommended_action || "select_radio"
    };
  }

  /**
   * Saves a newly generated (Question -> Answer) pair into local cache
   */
  async function saveToCache(questionText, options, answerObj, source = "api") {
    if (!questionText || !answerObj) return;

    const { canonicalKey, contextualKey, normalizedText, tokens } = generateQuestionKey(questionText, options);

    // Normalize answer object structure
    const cleanAnswer = {
      selected_labels: Array.isArray(answerObj.selected_labels) ? answerObj.selected_labels : (answerObj.selected_label ? [answerObj.selected_label] : []),
      text_input_value: answerObj.text_input_value || null,
      recommended_action: answerObj.recommended_action || "select_radio",
      target_element_ids: answerObj.target_element_ids || [],
      reasoning: answerObj.reasoning || "Stored in Local Memory Cache"
    };

    const record = {
      id: contextualKey,
      canonicalKey: canonicalKey,
      questionText: questionText,
      normalizedText: normalizedText,
      tokens: tokens,
      options: options || [],
      answer: cleanAnswer,
      source: source,
      hitCount: 0,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    const db = await getDB();
    if (!db) {
      const storage = await chrome.storage.local.get(["jarvis_qa_cache_fallback"]);
      const cacheMap = storage.jarvis_qa_cache_fallback || {};
      cacheMap[contextualKey] = record;
      cacheMap[canonicalKey] = record;
      await chrome.storage.local.set({ jarvis_qa_cache_fallback: cacheMap });
      await updateMemoryStatsSummary();
      return;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QA, "readwrite");
      const store = tx.objectStore(STORE_QA);
      store.put(record);
      tx.oncomplete = () => {
        updateMemoryStatsSummary();
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  }

  /**
   * Clears the QA Cache (resetting stored questions history)
   */
  async function clearMemoryCache() {
    const db = await getDB();
    if (!db) {
      await chrome.storage.local.remove(["jarvis_qa_cache_fallback"]);
      await updateMemoryStatsSummary();
      return true;
    }

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_QA, "readwrite");
      tx.objectStore(STORE_QA).clear();
      tx.oncomplete = () => {
        updateMemoryStatsSummary();
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  }

  /**
   * =========================================================================
   * 2. SURVEY KNOWLEDGE BASE (ATTACHED DATASET MATCHING)
   * =========================================================================
   */

  /**
   * Scans Knowledge Base entries for exact or fuzzy match
   */
  async function findKnowledgeBaseMatch(questionText, options = [], threshold = 0.80) {
    if (!questionText) return null;
    const { normalizedText, tokens } = generateQuestionKey(questionText, options);

    const db = await getDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ENTRIES, "readonly");
      const store = tx.objectStore(STORE_ENTRIES);

      // Fast check: Normalized text index
      const index = store.index("normalizedText");
      const reqExact = index.get(normalizedText);

      reqExact.onsuccess = () => {
        if (reqExact.result) {
          const entry = reqExact.result;
          resolve(formatKbResult(entry, 1.0));
          return;
        }

        // Fuzzy scanning over entries
        const cursorReq = store.openCursor();
        let bestMatch = null;
        let maxScore = 0;

        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const entry = cursor.value;
            const score = calculateSimilarity(
              normalizedText,
              tokens,
              entry.normalizedText,
              entry.tokens || getTokens(entry.normalizedText),
              options,
              entry.options || []
            );

            if (score > maxScore && score >= threshold) {
              maxScore = score;
              bestMatch = entry;
            }
            cursor.continue();
          } else {
            if (bestMatch && maxScore >= threshold) {
              resolve(formatKbResult(bestMatch, maxScore));
            } else {
              resolve(null);
            }
          }
        };
        cursorReq.onerror = () => resolve(null);
      };
      reqExact.onerror = () => resolve(null);
    });
  }

  function formatKbResult(entry, confidence) {
    return {
      match: true,
      source: "knowledge_base",
      confidence: confidence,
      matchedQuestion: entry.questionText,
      fileName: entry.fileName || "Uploaded Survey Dataset",
      answer: entry.answer,
      recommended_action: entry.answer?.recommended_action || "select_radio"
    };
  }

  /**
   * Stores parsed file entries into Knowledge Base
   */
  async function saveKnowledgeFile(fileId, fileName, fileType, fileSize, entries) {
    const db = await getDB();
    if (!db) return false;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_FILES, STORE_ENTRIES], "readwrite");
      const fileStore = tx.objectStore(STORE_FILES);
      const entryStore = tx.objectStore(STORE_ENTRIES);

      // Save file metadata
      fileStore.put({
        fileId: fileId,
        fileName: fileName,
        fileType: fileType,
        fileSize: fileSize,
        entryCount: entries.length,
        uploadedAt: Date.now()
      });

      // Save entries
      for (const entry of entries) {
        entryStore.put(entry);
      }

      tx.oncomplete = () => {
        updateMemoryStatsSummary();
        resolve(true);
      };
      tx.onerror = (e) => {
        console.error("[JarvisKB] Error saving file:", e.target.error);
        reject(e.target.error);
      };
    });
  }

  /**
   * Removes a file and its associated entries from Knowledge Base
   */
  async function removeKnowledgeFile(fileId) {
    const db = await getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_FILES, STORE_ENTRIES], "readwrite");
      const fileStore = tx.objectStore(STORE_FILES);
      const entryStore = tx.objectStore(STORE_ENTRIES);

      fileStore.delete(fileId);

      // Delete entries with matching fileId
      const index = entryStore.index("fileId");
      const req = index.openCursor(IDBKeyRange.only(fileId));

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        updateMemoryStatsSummary();
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  }

  /**
   * Clears all uploaded files and entries from Knowledge Base
   */
  async function clearAllKnowledgeFiles() {
    const db = await getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction([STORE_FILES, STORE_ENTRIES], "readwrite");
      tx.objectStore(STORE_FILES).clear();
      tx.objectStore(STORE_ENTRIES).clear();
      tx.oncomplete = () => {
        updateMemoryStatsSummary();
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  }

  /**
   * Retrieves all knowledge files metadata
   */
  async function getKnowledgeFiles() {
    const db = await getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_FILES, "readonly");
      const req = tx.objectStore(STORE_FILES).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  /**
   * =========================================================================
   * 3. SURVEY FILE PARSERS (JSON, CSV, TXT, PDF)
   * =========================================================================
   */

  /**
   * Parses JSON file content into standard Knowledge Entries
   */
  function parseSurveyJson(jsonStr, fileName, fileId) {
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Invalid JSON syntax in ${fileName}: ${e.message}`);
    }

    const entries = [];
    const list = Array.isArray(data)
      ? data
      : data.questions || data.qa || data.data || data.survey || [data];

    // Case 1: Simple Key-Value Object e.g. { "What is your gender?": "Male" }
    if (!Array.isArray(data) && typeof data === "object" && !data.questions && !data.qa) {
      let idx = 0;
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string" || typeof v === "number" || Array.isArray(v)) {
          const qText = String(k).trim();
          const ansVal = Array.isArray(v) ? v.map(String) : [String(v).trim()];
          entries.push(createEntryObj(fileId, fileName, idx++, qText, ansVal, []));
        }
      }
      return entries;
    }

    // Case 2: List of structured question-answer objects
    let idx = 0;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const qText = item.question || item.q || item.question_text || item.prompt || item.title || "";
      if (!qText) continue;

      let labels = [];
      let textInput = null;
      const rawAns = item.answer !== undefined ? item.answer : (item.a !== undefined ? item.a : item.selected_labels || item.response || item.value);

      if (Array.isArray(rawAns)) {
        labels = rawAns.map(String);
      } else if (rawAns !== undefined && rawAns !== null) {
        labels = [String(rawAns).trim()];
      }

      if (item.text_input_value) {
        textInput = String(item.text_input_value);
      }

      const options = Array.isArray(item.options) ? item.options : [];
      entries.push(createEntryObj(fileId, fileName, idx++, qText, labels, options, textInput, item.recommended_action));

      // Expand any question aliases/alternative wordings
      if (Array.isArray(item.aliases)) {
        for (const alias of item.aliases) {
          if (alias && typeof alias === "string" && alias.trim()) {
            entries.push(createEntryObj(fileId, fileName, idx++, alias.trim(), labels, options, textInput, item.recommended_action));
          }
        }
      }
    }

    return entries;
  }

  /**
   * Robust CSV parser handling quotes, commas, multiline entries
   */
  function parseSurveyCsv(csvText, fileName, fileId) {
    if (!csvText || typeof csvText !== "string") return [];

    // Parse CSV rows into 2D array
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if ((char === "\r" || char === "\n") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") i++; // handle CRLF
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) rows.push(currentRow);
    }

    if (rows.length === 0) return [];

    // Check for header row
    const firstRowLower = rows[0].map((h) => h.toLowerCase());
    let qCol = firstRowLower.findIndex((h) => /question|prompt|q\b|query/i.test(h));
    let aCol = firstRowLower.findIndex((h) => /answer|response|choice|selection|a\b|value/i.test(h));
    let optCol = firstRowLower.findIndex((h) => /option|choice/i.test(h));

    let startRow = 0;
    if (qCol !== -1 && aCol !== -1) {
      startRow = 1; // Header found
    } else {
      // Default: Col 0 is Question, Col 1 is Answer
      qCol = 0;
      aCol = 1;
      optCol = 2;
    }

    const entries = [];
    let idx = 0;
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      const qText = row[qCol] || "";
      const aText = row[aCol] || "";
      if (!qText || !aText) continue;

      let options = [];
      if (optCol !== -1 && row[optCol]) {
        options = row[optCol].split(/[;|]/).map((s) => s.trim()).filter(Boolean);
      }

      const labels = [aText.trim()];
      entries.push(createEntryObj(fileId, fileName, idx++, qText, labels, options));
    }

    return entries;
  }

  /**
   * Plain text parser supporting Q: / A: blocks and Key: Value lines
   */
  function parseSurveyTxt(txtText, fileName, fileId) {
    if (!txtText || typeof txtText !== "string") return [];
    const entries = [];
    let idx = 0;

    const lines = txtText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Pattern 1: Multi-line question followed by Answer: / A:
    // e.g.:
    // What is your gender?
    // Answer: Male ( Heterosexual / straight )
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if next line is an Answer
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const ansMatch = nextLine.match(/^(?:Answer|Ans|A)\s*[:.\-]\s*(.*)$/i);
        if (ansMatch) {
          let qText = line.replace(/^(?:Question|Q)\s*(?:\d+)?[:.\-]\s*/i, "").trim();
          let ansText = ansMatch[1].trim();
          if (qText && ansText) {
            entries.push(createEntryObj(fileId, fileName, idx++, qText, [ansText], [], ansText));
            i++; // skip the answer line
            continue;
          }
        }
      }

      // Pattern 2: Single line "Question : Answer" or "First Name : Al Amin" or "Q -> A"
      let q = "", a = "";
      if (line.includes("->")) {
        [q, a] = line.split("->");
      } else if (line.includes("|")) {
        [q, a] = line.split("|");
      } else if (line.includes("\t")) {
        [q, a] = line.split("\t");
      } else if (line.includes(":") && !line.startsWith("http")) {
        const colonIdx = line.indexOf(":");
        q = line.substring(0, colonIdx);
        a = line.substring(colonIdx + 1);
      }

      if (q && a && q.trim().length > 2 && a.trim().length > 0) {
        const cleanQ = q.trim();
        const cleanA = a.trim();
        if (!cleanA.startsWith("http://") && !cleanA.startsWith("https://")) {
          entries.push(createEntryObj(fileId, fileName, idx++, cleanQ, [cleanA], [], cleanA));
        }
      }
    }

    return entries;
  }

  /**
   * Client-side PDF text extractor and parser (100% Offline, Zero Cloud Dependency)
   */
  async function parseSurveyPdf(arrayBuffer, fileName, fileId) {
    if (!arrayBuffer) return [];

    let extractedText = "";
    try {
      const bytes = new Uint8Array(arrayBuffer);
      const binaryString = new TextDecoder("latin1").decode(bytes);

      // Extract uncompressed text operators: (Text) Tj, [(T) 10 (ext)] TJ
      const textPieces = [];
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(binaryString)) !== null) {
        textPieces.push(decodePdfString(tjMatch[1]));
      }

      const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
      let arrayMatch;
      while ((arrayMatch = tjArrayRegex.exec(binaryString)) !== null) {
        const inner = arrayMatch[1];
        const innerPieces = [];
        const strRegex = /\(([^)]*)\)/g;
        let sMatch;
        while ((sMatch = strRegex.exec(inner)) !== null) {
          innerPieces.push(decodePdfString(sMatch[1]));
        }
        textPieces.push(innerPieces.join(""));
      }

      // If FlateDecode streams exist, attempt browser decompression
      if (textPieces.length < 5 && binaryString.includes("/FlateDecode")) {
        const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
        let stMatch;
        while ((stMatch = streamRegex.exec(binaryString)) !== null) {
          try {
            const rawBytes = new Uint8Array(stMatch[1].length);
            for (let b = 0; b < stMatch[1].length; b++) {
              rawBytes[b] = stMatch[1].charCodeAt(b);
            }
            if (typeof DecompressionStream !== "undefined") {
              const ds = new DecompressionStream("deflate");
              const writer = ds.writable.getWriter();
              writer.write(rawBytes);
              writer.close();
              const response = new Response(ds.readable);
              const decompressed = await response.text();
              let dMatch;
              while ((dMatch = tjRegex.exec(decompressed)) !== null) {
                textPieces.push(decodePdfString(dMatch[1]));
              }
            }
          } catch (de) {}
        }
      }

      extractedText = textPieces.join("\n");
    } catch (e) {
      console.warn("[JarvisPDF] Extraction warning:", e.message);
    }

    if (!extractedText.trim()) {
      throw new Error(`PDF ফাইল (${fileName}) থেকে সরাসরি টেক্সট রিড করা সম্ভব হয়নি। ফাইলটি স্ক্যান করা ইমেজ হলে দয়া করে TXT, CSV বা JSON ফরম্যাটে দিন।`);
    }

    const entries = parseSurveyTxt(extractedText, fileName, fileId);
    if (entries.length === 0) {
      // Fallback: Lines with questions ending in "?" followed by answer
      const lines = extractedText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 2);
      let idx = 0;
      for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].endsWith("?")) {
          const q = lines[i];
          const a = lines[i + 1];
          if (q && a && !a.endsWith("?")) {
            entries.push(createEntryObj(fileId, fileName, idx++, q, [a], []));
            i++;
          }
        }
      }
    }

    return entries;
  }

  function decodePdfString(str) {
    return str
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\")
      .replace(/\\(\d{3})/g, (m, oct) => String.fromCharCode(parseInt(oct, 8)));
  }

  function createEntryObj(fileId, fileName, index, questionText, selectedLabels, options = [], textInput = null, action = null) {
    const norm = normalizeText(questionText);
    return {
      id: `kb_${fileId}_${index}`,
      fileId: fileId,
      fileName: fileName,
      questionText: questionText,
      normalizedText: norm,
      tokens: getTokens(norm),
      options: options || [],
      answer: {
        selected_labels: selectedLabels,
        text_input_value: textInput,
        recommended_action: action || (textInput ? "type_text" : (selectedLabels.length > 1 ? "select_checkbox" : "select_radio")),
        reasoning: `Found in Knowledge Base file: ${fileName}`
      }
    };
  }

  /**
   * =========================================================================
   * 4. BATCH SURVEY QUESTION RESOLUTION
   * =========================================================================
   * Resolves questions through: Knowledge Base -> Local Memory Cache -> Missing
   */
  async function resolveSurveyQuestions(questions = [], options = {}) {
    await ensureMasterDatasetLoaded();

    const resolvedAnswers = [];
    const missingQuestions = [];
    let kbHitCount = 0;
    let cacheHitCount = 0;

    for (const q of questions) {
      const qText = q.text || q.question_text || "";
      const qOpts = q.options || [];

      // 1. Try Knowledge Base first (Highest authority: user dataset)
      const kbMatch = await findKnowledgeBaseMatch(qText, qOpts);
      if (kbMatch && kbMatch.match) {
        const targetIds = resolveTargetElementIds(q, kbMatch.answer);
        let labels = kbMatch.answer.selected_labels || [];
        if (q.options && q.options.length > 0 && targetIds.length > 0) {
          const matchedOptLabels = q.options.filter((o) => targetIds.includes(o.id)).map((o) => o.label || o.value).filter(Boolean);
          if (matchedOptLabels.length > 0) {
            labels = matchedOptLabels;
          }
        }

        resolvedAnswers.push({
          question_index: q.index !== undefined ? q.index : resolvedAnswers.length,
          question_id: q.id || `q-${q.index}`,
          question_text: qText,
          recommended_action: kbMatch.recommended_action || (q.type === "checkbox" ? "select_checkbox" : (q.type === "text" ? "type_text" : "select_radio")),
          target_element_ids: targetIds,
          selected_labels: labels,
          text_input_value: kbMatch.answer.text_input_value || (targetIds.length === 0 ? (labels[0] || null) : null),
          reasoning: `📄 Knowledge Base (${kbMatch.fileName || "Master Survey Dataset"}) [Confidence: ${Math.round(kbMatch.confidence * 100)}%] (Zero API Cost)`,
          source: "knowledge_base",
          fileName: kbMatch.fileName,
          confidence: kbMatch.confidence
        });
        kbHitCount++;
        continue;
      }

      // 2. Try Local Memory Cache (Previously generated QA)
      const cacheMatch = await findCacheMatch(qText, qOpts);
      if (cacheMatch && cacheMatch.match) {
        const targetIds = resolveTargetElementIds(q, cacheMatch.answer);
        let labels = cacheMatch.answer.selected_labels || [];
        if (q.options && q.options.length > 0 && targetIds.length > 0) {
          const matchedOptLabels = q.options.filter((o) => targetIds.includes(o.id)).map((o) => o.label || o.value).filter(Boolean);
          if (matchedOptLabels.length > 0) {
            labels = matchedOptLabels;
          }
        }

        resolvedAnswers.push({
          question_index: q.index !== undefined ? q.index : resolvedAnswers.length,
          question_id: q.id || `q-${q.index}`,
          question_text: qText,
          recommended_action: cacheMatch.recommended_action || (q.type === "checkbox" ? "select_checkbox" : (q.type === "text" ? "type_text" : "select_radio")),
          target_element_ids: targetIds,
          selected_labels: labels,
          text_input_value: cacheMatch.answer.text_input_value || (targetIds.length === 0 ? (labels[0] || null) : null),
          reasoning: `⚡ Local Memory Cache [Confidence: ${Math.round(cacheMatch.confidence * 100)}%] (Zero API Cost)`,
          source: "memory_cache",
          confidence: cacheMatch.confidence
        });
        cacheHitCount++;
        continue;
      }

      // 3. Cache Miss - Needs AI Generation
      missingQuestions.push(q);
    }

    let dominantSource = "api";
    if (missingQuestions.length === 0) {
      if (kbHitCount > 0 && cacheHitCount === 0) dominantSource = "knowledge_base";
      else if (cacheHitCount > 0 && kbHitCount === 0) dominantSource = "memory_cache";
      else dominantSource = "mixed_cache";
    }

    return {
      resolvedAnswers,
      missingQuestions,
      kbHitCount,
      cacheHitCount,
      allHit: missingQuestions.length === 0,
      dominantSource
    };
  }

  /**
   * High-precision option label comparator with anti-traps
   */
  function isOptionLabelMatch(optText, targetText) {
    if (!optText || !targetText) return false;
    const o = normalizeText(optText);
    const t = normalizeText(targetText);
    if (!o || !t) return false;
    if (o === t) return true;

    // Strict Anti-traps
    if (/\bmale\b/i.test(t) && !/\bfemale\b/i.test(t) && /\bfemale\b/i.test(o)) return false;
    if (/\bfemale\b/i.test(t) && /\bmale\b/i.test(o) && !/\bfemale\b/i.test(o)) return false;
    if (/\bno\b/i.test(t) && !/\bno\b/i.test(o)) return false;
    if (/\bno\b/i.test(o) && !/\bno\b/i.test(t)) return false;

    // Containment matching
    if (o.length >= 3 && t.includes(o)) return true;
    if (t.length >= 3 && o.includes(t)) return true;

    // Token set overlap
    const oTokens = o.split(" ").filter((w) => w.length > 2);
    const tTokens = t.split(" ").filter((w) => w.length > 2);
    if (oTokens.length > 0 && tTokens.length > 0) {
      let common = 0;
      for (const w of oTokens) {
        if (tTokens.includes(w)) common++;
      }
      if ((common / oTokens.length) >= 0.70 || (common / tTokens.length) >= 0.70) return true;
    }

    return false;
  }

  /**
   * Helper: Matches target option IDs based on answer selected labels
   */
  function resolveTargetElementIds(qObj, answerObj) {
    if (!qObj || !qObj.options || !answerObj) return [];
    const labels = Array.isArray(answerObj.selected_labels) ? answerObj.selected_labels : (answerObj.selected_label ? [answerObj.selected_label] : []);
    if (!labels.length) return [];

    const targetIds = [];
    for (const opt of qObj.options) {
      const optLabel = opt.label || opt.value || "";
      for (const targetLabel of labels) {
        if (isOptionLabelMatch(optLabel, targetLabel)) {
          if (opt.id && !targetIds.includes(opt.id)) {
            targetIds.push(opt.id);
          }
        }
      }
    }
    return targetIds;
  }

  /**
   * =========================================================================
   * 5. STATS & TRACKING
   * =========================================================================
   */
  async function getMemoryStats() {
    const db = await getDB();
    const storage = await chrome.storage.local.get([
      "jarvis_memory_stats",
      "jarvis_qa_cache_fallback",
      "memoryApiKey",
      "memoryProvider"
    ]);

    const persistedStats = storage.jarvis_memory_stats || {
      cacheHits: 0,
      kbHits: 0,
      apiCalls: 0,
      savedApiCalls: 0
    };

    let cacheCount = 0;
    let kbFilesCount = 0;
    let kbEntriesCount = 0;

    if (!db) {
      const cacheMap = storage.jarvis_qa_cache_fallback || {};
      cacheCount = Object.keys(cacheMap).length;
    } else {
      cacheCount = await countStore(db, STORE_QA);
      kbFilesCount = await countStore(db, STORE_FILES);
      kbEntriesCount = await countStore(db, STORE_ENTRIES);
    }

    return {
      cacheCount: cacheCount,
      kbFilesCount: kbFilesCount,
      kbEntriesCount: kbEntriesCount,
      cacheHits: persistedStats.cacheHits || 0,
      kbHits: persistedStats.kbHits || 0,
      hermesHits: persistedStats.hermesHits || 0,
      apiCalls: persistedStats.apiCalls || 0,
      savedApiCalls: (persistedStats.cacheHits || 0) + (persistedStats.kbHits || 0) + (persistedStats.hermesHits || 0),
      memoryApiKey: storage.memoryApiKey || "",
      memoryProvider: storage.memoryProvider || "local_offline"
    };
  }

  function countStore(db, storeName) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      } catch (e) {
        resolve(0);
      }
    });
  }

  async function recordHit(type) {
    const storage = await chrome.storage.local.get(["jarvis_memory_stats"]);
    const stats = storage.jarvis_memory_stats || {
      cacheHits: 0,
      kbHits: 0,
      apiCalls: 0,
      savedApiCalls: 0
    };

    if (type === "cache") {
      stats.cacheHits = (stats.cacheHits || 0) + 1;
    } else if (type === "kb") {
      stats.kbHits = (stats.kbHits || 0) + 1;
    } else if (type === "hermes") {
      stats.hermesHits = (stats.hermesHits || 0) + 1;
    } else if (type === "api") {
      stats.apiCalls = (stats.apiCalls || 0) + 1;
    }

    stats.savedApiCalls = (stats.cacheHits || 0) + (stats.kbHits || 0) + (stats.hermesHits || 0);
    await chrome.storage.local.set({ jarvis_memory_stats: stats });
  }

  /**
   * Auto-seeds the default Master Survey Knowledge Base dataset on startup
   */
  async function ensureMasterDatasetLoaded() {
    const db = await getDB();
    if (!db) return false;

    // Check if master dataset file is already loaded
    const files = await getKnowledgeFiles();
    const existing = files.find((f) => f.fileId === "builtin_master_survey_kb");
    if (existing && existing.entryCount > 50) {
      return true;
    }

    try {
      let datasetJson = null;
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
        const url = chrome.runtime.getURL("persona/survey_master_dataset.json");
        const resp = await fetch(url);
        if (resp.ok) {
          datasetJson = await resp.text();
        }
      }

      if (!datasetJson) {
        return false;
      }

      const entries = parseSurveyJson(datasetJson, "Master Survey Knowledge Base (Built-in)", "builtin_master_survey_kb");
      if (entries.length > 0) {
        await saveKnowledgeFile(
          "builtin_master_survey_kb",
          "⭐ Master Survey Knowledge Base (Built-in)",
          "application/json",
          datasetJson.length,
          entries
        );
        console.log(`[JarvisMemory] Loaded built-in Master Survey Knowledge Base (${entries.length} entries)`);
        return true;
      }
    } catch (e) {
      console.warn("[JarvisMemory] Note on master dataset seeding:", e.message);
    }
    return false;
  }

  // Export module API to global
  const JarvisMemoryManager = {
    normalizeText,
    fnv1a,
    generateQuestionKey,
    calculateSimilarity,
    isOptionLabelMatch,
    findCacheMatch,
    saveToCache,
    clearMemoryCache,
    findKnowledgeBaseMatch,
    saveKnowledgeFile,
    removeKnowledgeFile,
    clearAllKnowledgeFiles,
    getKnowledgeFiles,
    parseSurveyJson,
    parseSurveyCsv,
    parseSurveyTxt,
    parseSurveyPdf,
    resolveSurveyQuestions,
    getMemoryStats,
    recordHit,
    ensureMasterDatasetLoaded
  };

  global.JarvisMemoryManager = JarvisMemoryManager;
})(typeof self !== "undefined" ? self : this);
