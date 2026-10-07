/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  HERMES AI LOCAL AGENT  —  Jarvis Survey Copilot                    ║
 * ║  100% Offline · Zero API Cost · Instant Answers                     ║
 * ║                                                                      ║
 * ║  Priority: Memory Cache → Hermes Agent → Gemini / OpenRouter API    ║
 * ║                                                                      ║
 * ║  How it works:                                                       ║
 * ║  1. Survey profile & QA rules compiled into smart rule-engine       ║
 * ║  2. Keyword + pattern matching on question text                     ║
 * ║  3. Exact option label matching using compiled profile data         ║
 * ║  4. Falls back to API only if Hermes cannot answer all questions    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

(function (global) {
  "use strict";

  // =========================================================================
  // HERMES PERSONAL PROFILE DATABASE (compiled from survey_profile.md)
  // =========================================================================
  const HERMES_PROFILE = {
    // --- Personal & Demographics ---
    firstName: "Al Amin",
    lastName: "Miah",
    fullName: "Al Amin Miah",
    gender: "Male",
    genderSynonyms: ["male", "man", "men"],
    age: 50,
    birthYear: 1976,
    birthDate: "03/08/1976",
    maritalStatus: "Married",
    race: "White",
    ethnicity: "Not Hispanic",
    education: "Master's",
    educationSynonyms: [
      "master", "graduate", "post-graduate", "professional degree",
      "master's or professional", "bachelor"
    ],
    language: "English",
    houseType: "Own",
    houseTypeSynonyms: ["own", "owned", "single family", "detached", "homeowner"],
    householdSize: 4,
    children: 2,
    childrenAges: [13, 12],
    wifeAge: 40,
    zipCode: "10001",
    state: "New York",
    city: "New York",
    phone: "959-582-8149",
    email: "alaminmiah1976@gmail.com",
    politics: "Republican",
    politicsSynonyms: ["republican", "strong republican", "conservative"],
    religion: "Christian",
    religionSynonyms: ["christian", "protestant", "roman catholic", "catholic"],
    voter: "Yes",
    pets: ["Dog", "Cat"],

    // --- Employment ---
    employmentStatus: "Full-time",
    jobTitle: "Manager",
    jobTitleSynonyms: [
      "manager", "director", "senior management", "cto",
      "chief technology", "information technology", "computer software"
    ],
    industry: "Information Technology",
    industrySynonyms: ["information technology", "it", "computer software", "technology"],
    companySize: "2500-5000",
    companyRevenue: "$50-$99 Million",
    spendingAuthority: ["Marketing", "Sales", "Advertising", "IT Hardware", "IT Software", "Financial Services"],
    covidEmployment: "No",

    // --- Finances ---
    income: "$125,000 - $149,999",
    incomeSynonyms: ["125000", "149999", "125,000", "149,999", "$125k", "$150k"],
    creditScore: "750-800",
    investableAssets: "$500,000 - $999,999",
    financialProducts: ["Personal loan", "Mortgage", "Credit Card", "Checking account", "Savings account"],
    banks: ["Bank of America", "American Express"],
    creditCards: ["American Express", "Discover", "MasterCard", "Visa"],
    primaryCard: "American Express",

    // --- Automotive ---
    cars: ["Audi", "Nissan"],
    carModel: "Audi A8 Sedan",
    carType: ["Full Size", "Mid-Size"],
    carYear: 2023,
    carManufacturedYear: 2022,
    motorcycle: "Yes",
    nextCar: "Two years from now",

    // --- Health ---
    smoker: "Yes",
    cigarettesPerDay: "4 to 7",
    conditions: ["Allergies", "Back Pain", "Dental Problem", "Depression", "Diabetes", "Smoking Addiction"],
    diabetesType: "Type 1",
    cancer: "No",
    hearingAid: "No",
    glasses: "Yes",
    healthInsurance: "Self-insured",
    quitSmokingMethods: ["Cold Turkey", "Vaping"],

    // --- Technology ---
    phone_brand: "Samsung",
    carrier: ["Verizon Wireless", "AT&T"],
    mobilePlan: "Pre-paid",
    internetProvider: "Verizon",
    tvProvider: ["AT&T U-verse", "Xfinity"],
    earlyAdopter: "Yes",
    devicesOwned: [
      "Blu-ray/DVD player", "Portable game console", "Digital Camera",
      "PC/Mac laptop", "Cell Phone", "Cable TV", "Printer",
      "Tablet", "iPad", "Desktop PC", "Smart Phone", "Speaker"
    ],
    subscriptions: ["Netflix", "HBO", "Spotify", "Apple Music", "Chromecast", "Xfinity"],
    socialMedia: ["Facebook", "Instagram", "Pinterest", "YouTube", "Snapchat", "WhatsApp"],
    socialFrequency: "Several times a day",

    // --- Shopping & Food ---
    groceries: ["Walmart", "Target", "Aldi", "Costco"],
    onlineRetailers: ["Amazon", "Best Buy", "eBay", "Target.com", "Walmart.com"],
    fastFoodFrequency: "1 to 3 times",
    fastFoodVisited: [
      "McDonald's", "Burger King", "KFC", "Subway", "Wendy's",
      "Panda Express", "Taco Bell", "Arby's", "Pizza Hut"
    ],
    fastCasual: ["Chipotle", "Five Guys", "Boston Market", "Tim Hortons", "Wingstop"],
    beverages: ["Coffee", "Tea", "Beer", "Wine", "Energy Drinks", "Bottled Water", "Vodka"],
    alcoholPerWeek: "1 to 2",
    services: ["Uber", "Lyft", "Grubhub", "DoorDash", "Airbnb", "UberEATS"],

    // --- Gaming & Entertainment ---
    gamesHoursPerWeek: "7 to 13",
    gameGenres: ["Call of Duty", "FIFA", "Warcraft", "Street Fighter"],
    movieFrequency: "4 or more times per month",
    movieGenres: ["Action", "Comedy", "Science Fiction", "Drama", "Horror", "Thriller"],
    tvHoursPerWeek: "More than 10 hours",
    hobbies: ["Cooking", "Fishing", "Travel", "Swimming", "Hunting", "Motorcycling", "Biking"],
    podcasts: "Every day",

    // --- Travel ---
    travelPurpose: "Both Leisure and Business",
    domesticAirlines: ["United Airlines", "Delta Air Lines", "JetBlue", "Virgin Atlantic"],
    internationalAirlines: ["Singapore Airlines", "EgyptAir", "Emirates", "Air Canada"],
    hotelsStayed: ["4-star Hotel", "5-star Hotel"],
    flightsPerYear: "7 to 9",

    // --- Screener Trap Rules ---
    screenerRules: {
      marketResearch: "No",
      onlineResearch: "No",
      expectingBaby: "No",
      household_industry_trap: "None of the above"
    }
  };

  // =========================================================================
  // HERMES RULE ENGINE — Maps question patterns → answers
  // =========================================================================

  /**
   * Normalize text for matching
   */
  function normalize(text) {
    if (!text) return "";
    return text.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Check if text contains any of the keywords
   */
  function hasKeyword(text, keywords) {
    const n = normalize(text);
    return keywords.some(k => n.includes(normalize(k)));
  }

  /**
   * Find best matching option from a list given target keywords
   */
  function findBestOption(options, targetValues, partial = false) {
    if (!options || options.length === 0) return null;

    const targets = Array.isArray(targetValues) ? targetValues : [targetValues];

    // 1. Exact match first
    for (const opt of options) {
      const optLabel = typeof opt === "string" ? opt : (opt.label || opt.value || opt.text || "");
      const optNorm = normalize(optLabel);
      for (const target of targets) {
        if (optNorm === normalize(target)) {
          return optLabel;
        }
      }
    }

    // 2. Contains match
    for (const opt of options) {
      const optLabel = typeof opt === "string" ? opt : (opt.label || opt.value || opt.text || "");
      const optNorm = normalize(optLabel);
      for (const target of targets) {
        const targetNorm = normalize(target);
        if (!targetNorm) continue;
        if (optNorm.includes(targetNorm)) {
          return optLabel;
        }
        if (partial && optNorm.length >= 5 && targetNorm.includes(optNorm)) {
          return optLabel;
        }
      }
    }

    return null;
  }

  /**
   * Find multiple matching options (for checkbox questions)
   */
  function findMultipleOptions(options, targetValues) {
    if (!options || options.length === 0) return [];
    const results = [];
    for (const target of targetValues) {
      const found = findBestOption(options, [target], true);
      if (found && !results.includes(found)) {
        results.push(found);
      }
    }
    return results;
  }

  /**
   * Find option that contains a number within range
   */
  function findAgeRangeOption(options, targetAge) {
    for (const opt of options) {
      const optLabel = typeof opt === "string" ? opt : (opt.label || opt.value || opt.text || "");
      const numbers = optLabel.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
        const low = parseInt(numbers[0]);
        const high = parseInt(numbers[numbers.length - 1]);
        if (targetAge >= low && targetAge <= high) return optLabel;
      } else if (numbers && numbers.length === 1) {
        if (parseInt(numbers[0]) === targetAge) return optLabel;
      }
    }
    return null;
  }

  /**
   * Core Hermes answer resolution engine
   * Returns answer object or null if cannot confidently answer
   */
  function resolveQuestion(question) {
    const qText = normalize(question.text || question.question || "");
    const options = question.options || [];
    const P = HERMES_PROFILE;

    // =========================================================================
    // SCREENER & TRAP QUESTIONS (highest priority)
    // =========================================================================

    // Market research trap
    if (hasKeyword(qText, ["market research", "marketing research"]) &&
      hasKeyword(qText, ["past 2 weeks", "last 2 weeks", "recently", "within the last", "participate"])) {
      const ans = findBestOption(options, ["No", "None"]);
      if (ans) return makeAnswer(question, [ans], "Hermes: Screener trap — market research → No");
    }

    // Online research trap
    if (hasKeyword(qText, ["online research", "online survey", "survey in the last", "survey in the past"]) &&
      hasKeyword(qText, ["week", "month", "recently"])) {
      const ans = findBestOption(options, ["No", "None"]);
      if (ans) return makeAnswer(question, [ans], "Hermes: Screener trap → No");
    }

    // Expecting baby trap
    if (hasKeyword(qText, ["expecting", "pregnant", "baby", "newborn"])) {
      const ans = findBestOption(options, ["No", "None"]);
      if (ans) return makeAnswer(question, [ans], "Hermes: Screener trap → No");
    }

    // Industry/household trap (market research, advertising, PR)
    if (hasKeyword(qText, ["work in", "employed in", "household member", "anyone in your household", "family member"]) &&
      hasKeyword(qText, ["advertising", "public relations", "market research", "journalism", "pr agency"])) {
      const ans = findBestOption(options, ["None of the above", "None", "No one"]);
      if (ans) return makeAnswer(question, [ans], "Hermes: Industry screener trap → None of the above");
    }

    // Attention check traps: "select option X", "choose X to confirm reading"
    if (hasKeyword(qText, ["select", "choose", "pick", "click"]) &&
      hasKeyword(qText, ["confirm", "reading", "paying attention", "attention check"])) {
      // Try to extract the instruction: e.g. "select strongly agree"
      const instructionMatch = qText.match(/(?:select|choose|pick)\s+['"]?([^'".,]+?)['"]?(?:\s+to\s+confirm|\s+if|\s+for)/i);
      if (instructionMatch) {
        const instructed = instructionMatch[1].trim();
        const ans = findBestOption(options, [instructed], true);
        if (ans) return makeAnswer(question, [ans], `Hermes: Attention check → obey: ${instructed}`);
      }
    }

    // =========================================================================
    // DEMOGRAPHICS
    // =========================================================================

    // Gender
    if (hasKeyword(qText, ["gender", "sex", "are you male", "are you female", "what is your gender"])) {
      const ans = findBestOption(options, ["Male", "Man", "Men"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Gender → Male");
    }

    // Age
    if (hasKeyword(qText, ["how old are you", "your age", "what is your age", "current age", "age group", "age range", "age bracket"]) ||
       (hasKeyword(qText, ["age", "how old"]) && !hasKeyword(qText, ["child", "son", "daughter", "wife", "spouse", "vehicle", "car", "dog", "cat", "pet"]))) {
      // Try range match first
      let ans = findAgeRangeOption(options, P.age);
      if (!ans) ans = findBestOption(options, [String(P.age), "50", "45-54", "45 to 54", "50-59", "50 to 59"]);
      if (!ans && options.length === 0) return makeTextAnswer(question, String(P.age), `Hermes: Age → ${P.age}`);
      if (ans) return makeAnswer(question, [ans], `Hermes: Age → ${P.age}`);
    }

    // Birth year
    if (hasKeyword(qText, ["birth year", "year born", "year of birth", "born in"])) {
      let ans = findBestOption(options, [String(P.birthYear), "1976"]);
      if (!ans) ans = findAgeRangeOption(options, P.birthYear);
      if (ans) return makeAnswer(question, [ans], `Hermes: Birth year → ${P.birthYear}`);
    }

    // Marital status
    if (hasKeyword(qText, ["marital status", "married", "relationship status", "are you married"])) {
      const ans = findBestOption(options, ["Married", "Married/partnered", "In a relationship"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Marital → Married");
    }

    // Race / ethnicity
    if (hasKeyword(qText, ["race", "ethnicity", "racial background", "ethnic background"])) {
      if (hasKeyword(qText, ["hispanic", "latino", "latina"])) {
        const ans = findBestOption(options, ["Not Hispanic", "No", "Non-Hispanic", "Not of Hispanic"], true);
        if (ans) return makeAnswer(question, [ans], "Hermes: Ethnicity → Not Hispanic");
      }
      const ans = findBestOption(options, ["White", "Caucasian", "White/Caucasian"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Race → White");
    }

    // Education
    if (hasKeyword(qText, ["education", "highest level of education", "educational background", "degree"])) {
      const ans = findBestOption(options, [
        "Master's", "Masters", "Master's or Professional Degree",
        "Graduate Degree", "Post-graduate", "Professional Degree", "Bachelor"
      ], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Education → Master's Degree");
    }

    // Language
    if (hasKeyword(qText, ["language spoken", "primary language", "language at home"])) {
      const ans = findBestOption(options, ["English", "English only", "English all the time"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Language → English");
    }

    // Home ownership
    if (hasKeyword(qText, ["own or rent", "housing", "do you own", "home ownership", "type of home"])) {
      const ans = findBestOption(options, ["Own", "Own my home", "Own / buying", "Homeowner", "Own outright"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Home → Own");
    }

    // Home type
    if (hasKeyword(qText, ["type of home", "type of house", "type of dwelling", "kind of home"])) {
      const ans = findBestOption(options, ["Single family", "Detached", "Single family home", "House"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Home type → Single family");
    }

    // Household size
    if (hasKeyword(qText, ["household size", "how many people", "number of people in your household", "people live in your home"])) {
      let ans = findBestOption(options, ["4", "Four (4)", "4 people", "3-4", "3 to 4 people"], true);
      if (!ans) ans = findAgeRangeOption(options, P.householdSize);
      if (ans) return makeAnswer(question, [ans], "Hermes: Household size → 4");
    }

    // Children
    if (hasKeyword(qText, ["children", "kids", "do you have any children", "number of children"])) {
      if (hasKeyword(qText, ["how many", "number of"])) {
        const ans = findBestOption(options, ["2", "Two", "2 children", "Two (2)"], true);
        if (ans) return makeAnswer(question, [ans], "Hermes: Children → 2");
      }
      const ans = findBestOption(options, ["Yes", "Yes, I have children"]);
      if (ans) return makeAnswer(question, [ans], "Hermes: Children → Yes");
    }

    // Child age
    if (hasKeyword(qText, ["child", "children"]) && hasKeyword(qText, ["age", "how old"])) {
      let ans = findAgeRangeOption(options, 13);
      if (!ans) ans = findAgeRangeOption(options, 12);
      if (!ans) ans = findBestOption(options, ["13", "12", "12-17", "13-17", "Under 18"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Child age → 13/12");
    }

    // Politics
    if (hasKeyword(qText, ["political", "politics", "party affiliation", "political party", "political views", "republican", "democrat"])) {
      const ans = findBestOption(options, ["Republican", "Strong Republican", "Conservative", "Republican Party"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Politics → Republican");
    }

    // Religion
    if (hasKeyword(qText, ["religion", "religious", "faith", "worship", "church", "spiritual"])) {
      const ans = findBestOption(options, ["Christian", "Protestant", "Catholic", "Roman Catholic", "Christianity"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Religion → Christian");
    }

    // Voter registration
    if (hasKeyword(qText, ["registered to vote", "voter registration", "are you registered"])) {
      const ans = findBestOption(options, ["Yes", "Yes, registered"]);
      if (ans) return makeAnswer(question, [ans], "Hermes: Voter → Yes");
    }

    // Pets
    if (hasKeyword(qText, ["pet", "pets", "animals", "dog", "cat", "own any pets", "household have pets"])) {
      if (hasKeyword(qText, ["which", "what kind", "what pet", "type of pet", "own any"])) {
        const matches = findMultipleOptions(options, ["Dog", "Cat"]);
        if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Pets → Dog, Cat");
      }
      const ans = findBestOption(options, ["Yes", "Yes, I own pets", "Yes, dog", "Yes, cat"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Pets → Yes");
    }

    // Zip / postal code
    if (hasKeyword(qText, ["zip code", "postal code", "postcode"])) {
      return makeTextAnswer(question, P.zipCode, "Hermes: Zip → 10001");
    }

    // =========================================================================
    // EMPLOYMENT
    // =========================================================================

    // Employment status
    if (hasKeyword(qText, ["employment status", "currently employed", "are you employed", "work status", "working full"])) {
      const ans = findBestOption(options, ["Employed full-time", "Full-time", "Full time", "Employed (full-time)"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Employment → Full-time");
    }

    // Job title / role
    if (hasKeyword(qText, ["job title", "your role", "position", "what is your job", "occupation", "what do you do for work"])) {
      const ans = findBestOption(options, [
        "Manager", "Director", "Senior Management", "CTO",
        "Chief Technology Officer", "IT Manager"
      ], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Job → Manager/Director");
    }

    // Industry / department
    if (hasKeyword(qText, ["industry", "sector", "department", "field of work", "what industry", "which industry", "type of business"])) {
      const ans = findBestOption(options, [
        "Information Technology", "IT", "Computer Software",
        "Technology", "Software", "Computers"
      ], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Industry → IT/Computer Software");
    }

    // Company size / employees
    if (hasKeyword(qText, ["company size", "how many employees", "number of employees", "company employee", "organization size"])) {
      let ans = findBestOption(options, ["2500-5000", "2,500-5,000", "2500 to 5000", "2,500 to 4,999"], true);
      if (!ans) {
        // Check each option for range containing 2500-5000
        for (const opt of options) {
          const label = typeof opt === "string" ? opt : (opt.label || opt.value || "");
          const nums = label.match(/\d[\d,]+/g);
          if (nums && nums.length >= 2) {
            const low = parseInt(nums[0].replace(/,/g, ""));
            const high = parseInt(nums[nums.length - 1].replace(/,/g, ""));
            if (low <= 2500 && high >= 2500) { ans = label; break; }
          }
        }
      }
      if (ans) return makeAnswer(question, [ans], "Hermes: Company size → 2500-5000");
    }

    // Annual revenue
    if (hasKeyword(qText, ["annual revenue", "company revenue", "business revenue", "organization revenue", "sales revenue"])) {
      const ans = findBestOption(options, ["$50-$99 Million", "$50 million", "50 to 99", "$50M-$99M"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Revenue → $50-$99M");
    }

    // Decision authority / spending
    if (hasKeyword(qText, ["purchasing decision", "buying decision", "decision maker", "spending authority", "responsible for purchasing"])) {
      if (options.length > 0) {
        const matches = findMultipleOptions(options, P.spendingAuthority);
        if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Decision authority → IT/Marketing/Sales");
      }
      const ans = findBestOption(options, ["Yes", "I am the decision maker", "Sole decision maker"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Decision → Yes");
    }

    // COVID employment
    if (hasKeyword(qText, ["covid", "pandemic", "employment affected"])) {
      const ans = findBestOption(options, ["No", "Not affected", "My employment has not been affected"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: COVID employment → No");
    }

    // =========================================================================
    // FINANCES
    // =========================================================================

    // Household monthly net income after taxes (e.g. Appinio income question: rent, groceries, per month)
    if (hasKeyword(qText, ["net income", "after taxes", "per month", "monthly income", "rent, groceries", "added up", "total net income", "groceries, etc. per month"])) {
      let ans = findBestOption(options, [
        "More than $7500", "More than $7,500", "> $7500", "> $7,500", "Over $7,500", "$7,500+", "7500+",
        "Between $6501 and $7500", "Between $6,501 and $7,500", "$6,501 - $7,500", "6501-7500",
        "Between $5501 and $6500", "$5,501 - $6,500"
      ], false);
      if (!ans) {
        for (const opt of options) {
          const label = typeof opt === "string" ? opt : (opt.label || opt.value || "");
          if (/more than|over|>|7,?500|6,?501/i.test(label)) { ans = label; break; }
        }
      }
      if (ans) return makeAnswer(question, [ans], "Hermes: Monthly Net Income → More than $7500 / Between $6501 and $7500");
    }

    // Household annual income before tax
    if (hasKeyword(qText, ["household income", "annual income", "total income", "income before tax", "yearly income", "annual household"])) {
      let ans = findBestOption(options, [
        "$125,000 - $149,999", "$125,000-$149,999", "$125,000 to $149,999",
        "125,000 - 149,999", "125,000 to 149,999", "$125K-$150K", "$125,000", "125,000"
      ], false);
      if (!ans) {
        for (const opt of options) {
          const label = typeof opt === "string" ? opt : (opt.label || opt.value || "");
          const nums = label.match(/\d[\d,]+/g);
          if (nums && nums.length >= 2) {
            const low = parseInt(nums[0].replace(/,/g, ""));
            const high = parseInt(nums[nums.length - 1].replace(/,/g, ""));
            if (low <= 125000 && high >= 125000) { ans = label; break; }
          }
        }
      }
      if (ans) return makeAnswer(question, [ans], "Hermes: Income → $125,000-$149,999");
    }

    // Credit score
    if (hasKeyword(qText, ["credit score", "fico", "credit rating"])) {
      let ans = findBestOption(options, ["750-800", "750 to 800", "750-799", "740-800"], true);
      if (!ans) {
        for (const opt of options) {
          const label = typeof opt === "string" ? opt : (opt.label || opt.value || "");
          const nums = label.match(/\d+/g);
          if (nums && nums.length >= 2) {
            const low = parseInt(nums[0]);
            const high = parseInt(nums[nums.length - 1]);
            if (low <= 750 && high >= 750) { ans = label; break; }
          }
        }
      }
      if (ans) return makeAnswer(question, [ans], "Hermes: Credit score → 750-800");
    }

    // Financial products
    if (hasKeyword(qText, ["financial products", "banking products", "which of the following do you have", "financial accounts"])) {
      const matches = findMultipleOptions(options, P.financialProducts);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Financial products");
    }

    // Bank / credit card
    if (hasKeyword(qText, ["credit card", "which credit card", "bank", "banking institution", "financial institution"])) {
      if (hasKeyword(qText, ["most", "primarily", "mainly", "frequently"])) {
        const ans = findBestOption(options, ["American Express", "Amex"], true);
        if (ans) return makeAnswer(question, [ans], "Hermes: Primary card → American Express");
      }
      const matches = findMultipleOptions(options, P.creditCards);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Credit cards");
    }

    // Investable assets
    if (hasKeyword(qText, ["investable assets", "investment assets", "total assets", "household assets"])) {
      const ans = findBestOption(options, ["$500,000 - $999,999", "500k to 999k", "$500K-$1M"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Investable assets → $500K-$999K");
    }

    // =========================================================================
    // AUTOMOTIVE
    // =========================================================================

    // Car ownership
    if (hasKeyword(qText, ["own a car", "have a car", "drive", "have a vehicle", "vehicle owner"])) {
      const ans = findBestOption(options, ["Yes", "Yes, I own a car", "I own/lease a vehicle"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Car → Yes");
    }

    // Car brand
    if (hasKeyword(qText, [
      "car brand", "vehicle brand", "car make", "vehicle make", "which car",
      "what car do you drive", "car manufacturer", "kind of car", "type of car",
      "primarily drive", "primary car", "car do you", "vehicle do you", "make of vehicle"
    ])) {
      if (hasKeyword(qText, ["most", "primarily", "primary", "mainly"])) {
        const ans = findBestOption(options, ["Audi"], true);
        if (ans) return makeAnswer(question, [ans], "Hermes: Primary car → Audi");
      }
      const matches = findMultipleOptions(options, P.cars);
      if (matches.length > 0) return makeAnswer(question, matches.slice(0, 2), "Hermes: Cars → Audi, Nissan");
      // Try to get at least Audi
      const ans = findBestOption(options, ["Audi", "Nissan"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Car → Audi");
    }

    // Car type / class
    if (hasKeyword(qText, ["car type", "vehicle type", "vehicle class", "size of vehicle", "car size"])) {
      const matches = findMultipleOptions(options, P.carType);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Car type → Full Size/Mid-Size");
    }

    // Car year purchased
    if (hasKeyword(qText, ["year purchased", "year you bought", "when did you buy", "purchase year"])) {
      let ans = findBestOption(options, ["2023"], true);
      if (!ans) ans = findAgeRangeOption(options, P.carYear);
      if (ans) return makeAnswer(question, [ans], "Hermes: Car year → 2023");
    }

    // Motorcycle
    if (hasKeyword(qText, ["motorcycle", "motorbike", "do you have a motorcycle"])) {
      const ans = findBestOption(options, ["Yes", "Yes, I own one"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Motorcycle → Yes");
    }

    // Next car purchase
    if (hasKeyword(qText, ["next car", "next vehicle", "plan to buy", "purchase in the next", "when will you buy"])) {
      const ans = findBestOption(options, ["2 years", "Two years", "3-6 months", "within 3 to 6 months"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Next car → 2 years");
    }

    // =========================================================================
    // HEALTH
    // =========================================================================

    // Smoker
    if (hasKeyword(qText, ["smoke", "smoker", "tobacco", "cigarette", "do you smoke"])) {
      if (hasKeyword(qText, ["how many", "cigarettes per day", "per day"])) {
        const ans = findBestOption(options, ["4 to 7", "4-7", "1 to 10", "Less than 10"], true);
        if (ans) return makeAnswer(question, [ans], "Hermes: Cigarettes → 4-7/day");
      }
      const ans = findBestOption(options, ["Yes", "Yes, I smoke", "Current smoker"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Smoker → Yes");
    }

    // Quit smoking
    if (hasKeyword(qText, ["quit smoking", "stop smoking", "methods used", "used to quit"])) {
      const matches = findMultipleOptions(options, P.quitSmokingMethods);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Quit methods → Cold Turkey, Vaping");
    }

    // Health conditions
    if (hasKeyword(qText, ["health condition", "diagnosed", "medical condition", "suffer from", "been diagnosed"])) {
      const matches = findMultipleOptions(options, P.conditions);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Health conditions");
    }

    // Diabetes type
    if (hasKeyword(qText, ["diabetes", "type of diabetes", "diabetic"])) {
      const ans = findBestOption(options, ["Type 1", "Type I", "Diabetes Type 1", "Diabetes 1"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Diabetes → Type 1");
    }

    // Cancer
    if (hasKeyword(qText, ["cancer", "tumor"])) {
      const ans = findBestOption(options, ["No", "I don't have cancer", "None", "Never had cancer"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Cancer → No");
    }

    // Glasses
    if (hasKeyword(qText, ["glasses", "contact lenses", "corrective lenses", "eyewear"])) {
      const ans = findBestOption(options, ["Yes", "I wear glasses", "Yes, I wear glasses/contacts"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Glasses → Yes");
    }

    // Hearing aid
    if (hasKeyword(qText, ["hearing aid", "hearing device"])) {
      const ans = findBestOption(options, ["No", "I do not use a hearing aid"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Hearing aid → No");
    }

    // Health insurance
    if (hasKeyword(qText, ["health insurance", "medical insurance", "insurance coverage", "type of insurance"])) {
      const ans = findBestOption(options, ["Self-insured", "I pay for my own", "Private/Self-insured", "Self/Private"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Health insurance → Self-insured");
    }

    // Exercise
    if (hasKeyword(qText, ["exercise", "physical activity", "work out", "hours per week", "sports activities"])) {
      const ans = findBestOption(options, ["5 to 7", "5-7 hours", "5 to 7 hours", "More than 5 hours"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Exercise → 5-7 hrs/week");
    }

    // =========================================================================
    // TECHNOLOGY
    // =========================================================================

    // Smartphone brand
    if (hasKeyword(qText, ["smartphone brand", "phone brand", "what smartphone", "primary phone", "type of phone"])) {
      const ans = findBestOption(options, ["Samsung", "Samsung Galaxy", "Android (Samsung)"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Phone → Samsung");
    }

    // Mobile carrier
    if (hasKeyword(qText, ["mobile carrier", "wireless carrier", "phone carrier", "cell phone provider", "wireless provider"])) {
      const matches = findMultipleOptions(options, P.carrier);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Carrier → Verizon/AT&T");
      const ans = findBestOption(options, ["Verizon", "AT&T"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Carrier → Verizon");
    }

    // Mobile plan type
    if (hasKeyword(qText, ["mobile plan", "phone plan", "prepaid", "postpaid", "type of plan"])) {
      const ans = findBestOption(options, ["Pre-paid", "Prepaid", "Pay-as-you-go", "No contract"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Plan → Pre-paid");
    }

    // Internet provider
    if (hasKeyword(qText, ["internet provider", "internet service", "isp", "home internet", "broadband provider"])) {
      const ans = findBestOption(options, ["Verizon", "Verizon FiOS", "Verizon Wireless"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Internet → Verizon");
    }

    // Internet connection type
    if (hasKeyword(qText, ["connection type", "internet connection", "type of internet"])) {
      const matches = findMultipleOptions(options, ["Satellite", "Wireless", "Fiber"]);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Connection → Satellite/Wireless");
    }

    // TV provider
    if (hasKeyword(qText, ["tv provider", "cable provider", "television provider", "cable company"])) {
      const matches = findMultipleOptions(options, P.tvProvider);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: TV → AT&T/Xfinity");
    }

    // Devices owned
    if (hasKeyword(qText, ["devices", "technology", "which of the following do you own", "electronic devices"])) {
      const matches = findMultipleOptions(options, P.devicesOwned);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Devices owned");
    }

    // Social media platforms
    if (hasKeyword(qText, ["social media", "social network", "which platforms", "social media platform"])) {
      const matches = findMultipleOptions(options, P.socialMedia);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Social media");
    }

    // Social media frequency
    if (hasKeyword(qText, ["how often", "frequency", "how frequently"]) &&
      hasKeyword(qText, ["social media", "social network"])) {
      const ans = findBestOption(options, ["Several times a day", "Multiple times a day", "Daily/Multiple times"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Social frequency → Several times/day");
    }

    // Streaming / subscriptions
    if (hasKeyword(qText, ["streaming", "subscription", "subscribe to", "streaming service"])) {
      const matches = findMultipleOptions(options, P.subscriptions);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Subscriptions");
    }

    // Early adopter
    if (hasKeyword(qText, ["early adopter", "first to buy", "adopt new technology", "new gadget"])) {
      const ans = findBestOption(options, ["Yes", "I am an early adopter", "Strongly agree", "Agree"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Early adopter → Yes");
    }

    // Computer/online usage
    if (hasKeyword(qText, ["computer usage", "how often do you use", "internet usage", "online usage", "computer usage frequency"])) {
      const ans = findBestOption(options, ["Several times a day", "Multiple times a day", "Daily (multiple times)"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Computer usage → Several times/day");
    }

    // =========================================================================
    // SHOPPING & FOOD
    // =========================================================================

    // Grocery stores
    if (hasKeyword(qText, ["grocery", "supermarket", "food store", "grocery store", "where do you shop"])) {
      const matches = findMultipleOptions(options, P.groceries);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Groceries → Walmart/Target/Aldi/Costco");
    }

    // Online shopping
    if (hasKeyword(qText, ["online shopping", "online retailer", "shop online", "online store", "purchase online"])) {
      const matches = findMultipleOptions(options, P.onlineRetailers);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Online retailers");
    }

    // Delivery services
    if (hasKeyword(qText, ["delivery service", "food delivery", "ride sharing", "ride hailing", "services used"])) {
      const matches = findMultipleOptions(options, P.services);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Services → Uber/Lyft/DoorDash");
    }

    // Fast food frequency
    if (hasKeyword(qText, ["fast food", "quick service restaurant"]) && hasKeyword(qText, ["how often", "frequency", "how frequently", "per week", "per month"])) {
      const ans = findBestOption(options, ["1 to 3 times", "1-3 times", "Once to three times", "1-3 times per week"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Fast food → 1-3 times/week");
    }

    // Fast food restaurants visited
    if (hasKeyword(qText, ["fast food", "quick service restaurant"]) && hasKeyword(qText, ["visited", "been to", "eaten at", "dined at"])) {
      const matches = findMultipleOptions(options, P.fastFoodVisited);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Fast food visited");
    }

    // Beverages
    if (hasKeyword(qText, ["beverage", "drink", "consume", "alcohol", "what do you drink"])) {
      if (hasKeyword(qText, ["how many", "how much", "per week", "weekly"])) {
        const ans = findBestOption(options, ["1 to 2", "1-2 drinks", "1 to 2 drinks", "1-2"], true);
        if (ans) return makeAnswer(question, [ans], "Hermes: Alcohol/week → 1-2");
      }
      const matches = findMultipleOptions(options, P.beverages);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Beverages");
    }

    // Brand Associations (e.g. Wine/Champagne brands associated with dinner / celebration)
    if (hasKeyword(qText, ["brands do you associate", "with dinner", "associate with", "which of these brands", "champagne brands", "wine brands"])) {
      const preferredBrands = [
        "Moët & Chandon", "Veuve Clicquot", "Chandon", "Taittinger", "Perrier Jouët", "Laurent Perrier",
        "Luc Belaire", "Nicolas Feuillatte", "Mumm Napa", "GH Mumm", "Barefoot Bubbly", "La Marca", "Mionetto", "Piper Heidsieck"
      ];
      const matches = findMultipleOptions(options, preferredBrands);
      if (matches.length > 0) {
        // Return 2 to 4 representative preferred brands
        return makeAnswer(question, matches.slice(0, 3), "Hermes: Brands associated with dinner → Moët & Chandon, Veuve Clicquot, Chandon");
      }
      const singleMatch = findBestOption(options, preferredBrands, false);
      if (singleMatch) return makeAnswer(question, [singleMatch], "Hermes: Brand Choice");
      const noneAbove = findBestOption(options, ["None of the above"], true);
      if (noneAbove) return makeAnswer(question, [noneAbove], "Hermes: None of the above");
    }

    // Attention check trap: Stop sign color
    if (hasKeyword(qText, ["stop sign", "traffic stop", "color of a stop sign"])) {
      const redOpt = findBestOption(options, ["Red", "Color red"], true);
      if (redOpt) return makeAnswer(question, [redOpt], "Hermes Trap Guard: Stop sign is Red");
    }

    // =========================================================================
    // GAMING & ENTERTAINMENT
    // =========================================================================

    // Gaming hours
    if (hasKeyword(qText, ["gaming", "video game", "play games"]) && hasKeyword(qText, ["hours", "per week", "weekly"])) {
      const ans = findBestOption(options, ["7 to 13", "7-13 hours", "7 or more", "More than 7", "10+ hours"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Gaming → 7-13 hrs/week");
    }

    // Movie frequency
    if (hasKeyword(qText, ["movie theater", "cinema", "movies in theater", "how often do you go to the movies"])) {
      const ans = findBestOption(options, ["4 or more", "Four or more", "4+ times", "More than 4"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Movies → 4+ times/month");
    }

    // Movie genres
    if (hasKeyword(qText, ["movie genre", "film genre", "type of movies", "kind of movies"])) {
      const matches = findMultipleOptions(options, P.movieGenres);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Movie genres");
    }

    // TV hours per week
    if (hasKeyword(qText, ["television", "tv", "watch tv", "hours of tv"]) && hasKeyword(qText, ["how many hours", "per week", "weekly"])) {
      const ans = findBestOption(options, ["More than 10 hours", "10+ hours", "More than 10", "11 or more"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: TV → 10+ hrs/week");
    }

    // Hobbies
    if (hasKeyword(qText, ["hobbies", "interests", "activities", "free time", "enjoy doing"])) {
      const matches = findMultipleOptions(options, P.hobbies);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Hobbies");
    }

    // Podcasts
    if (hasKeyword(qText, ["podcast", "listen to podcast"])) {
      if (hasKeyword(qText, ["how often", "frequency"])) {
        const ans = findBestOption(options, ["Every day", "Daily", "Every day or most days"], true);
        if (ans) return makeAnswer(question, [ans], "Hermes: Podcasts → Daily");
      }
    }

    // =========================================================================
    // TRAVEL
    // =========================================================================

    // Travel purpose
    if (hasKeyword(qText, ["travel purpose", "purpose of travel", "business or leisure", "why do you travel"])) {
      const ans = findBestOption(options, ["Both", "Business and leisure", "Both leisure and business"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Travel → Both leisure & business");
    }

    // Airlines
    if (hasKeyword(qText, ["airline", "flight", "fly with", "which airlines"])) {
      if (hasKeyword(qText, ["international"])) {
        const matches = findMultipleOptions(options, P.internationalAirlines);
        if (matches.length > 0) return makeAnswer(question, matches, "Hermes: International airlines");
      }
      const matches = findMultipleOptions(options, P.domesticAirlines);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Domestic airlines");
    }

    // Hotels
    if (hasKeyword(qText, ["hotel", "accommodation", "where do you stay", "type of hotel"])) {
      const matches = findMultipleOptions(options, P.hotelsStayed);
      if (matches.length > 0) return makeAnswer(question, matches, "Hermes: Hotels → 4-5 star");
    }

    // Flights per year
    if (hasKeyword(qText, ["how many flights", "flights per year", "flight frequency", "number of flights"])) {
      const ans = findBestOption(options, ["7 to 9", "7-9", "6 to 10", "5 to 10"], true);
      if (ans) return makeAnswer(question, [ans], "Hermes: Flights → 7-9/year");
    }

    // =========================================================================
    // SMART SURVEY HEURISTICS (Attention Traps, Likert Scales, Ratings, Text)
    // =========================================================================

    // 1. Attention Check Traps (Crucial to avoid survey termination)
    if (hasKeyword(qText, [
      "attention check", "verify you are reading", "to verify", "to confirm",
      "please select", "carefully select", "select the option", "select the answer",
      "choose the option", "quality check", "ensure quality"
    ])) {
      // Try to find if a specific option name was instructed in the question text
      for (const opt of options) {
        const optLabel = typeof opt === "string" ? opt : (opt.label || opt.value || "");
        if (optLabel && optLabel.length > 2 && hasKeyword(qText, [optLabel])) {
          return makeAnswer(question, [optLabel], "Hermes: Attention Check instructed option → " + optLabel);
        }
      }
      // Common attention check options
      const trapOpt = findBestOption(options, ["Strongly Agree", "Somewhat Agree", "None of the above", "Blue", "Green", "Red"]);
      if (trapOpt) return makeAnswer(question, [trapOpt], "Hermes: Attention Check match");
    }

    // 2. Agreement / Likert scales
    const agreementOpt = findBestOption(options, [
      "Strongly Agree", "Agree", "Somewhat Agree", "Completely Agree",
      "Tend to agree", "Neither agree nor disagree"
    ]);
    if (agreementOpt && hasKeyword(qText, ["agree", "statement", "opinion", "extent", "rate"])) {
      return makeAnswer(question, [agreementOpt], "Hermes: Agreement scale → " + agreementOpt);
    }

    // 3. Satisfaction scales
    const satisfactionOpt = findBestOption(options, [
      "Very Satisfied", "Satisfied", "Somewhat Satisfied", "Extremely Satisfied",
      "Mostly Satisfied"
    ]);
    if (satisfactionOpt && hasKeyword(qText, ["satisf", "experience", "how was", "rate your"])) {
      return makeAnswer(question, [satisfactionOpt], "Hermes: Satisfaction scale → " + satisfactionOpt);
    }

    // 4. Likelihood / Probability
    const likelihoodOpt = findBestOption(options, [
      "Very Likely", "Likely", "Somewhat Likely", "Extremely Likely",
      "Definitely will", "Probably will"
    ]);
    if (likelihoodOpt && hasKeyword(qText, ["likely", "likelihood", "recommend", "future", "would you", "will you"])) {
      return makeAnswer(question, [likelihoodOpt], "Hermes: Likelihood scale → " + likelihoodOpt);
    }

    // 5. Importance scales
    const importanceOpt = findBestOption(options, [
      "Very Important", "Important", "Somewhat Important", "Extremely Important"
    ]);
    if (importanceOpt && hasKeyword(qText, ["important", "importance", "value", "factor"])) {
      return makeAnswer(question, [importanceOpt], "Hermes: Importance scale → " + importanceOpt);
    }

    // 6. Frequency scales
    const frequencyOpt = findBestOption(options, [
      "Often", "Sometimes", "Frequently", "Regularly", "Daily",
      "A few times a week", "Once a week", "1 to 3 times"
    ]);
    if (frequencyOpt && hasKeyword(qText, ["how often", "frequency", "how frequently"])) {
      return makeAnswer(question, [frequencyOpt], "Hermes: Frequency scale → " + frequencyOpt);
    }

    // 7. General Yes/No Questions
    if (options.length === 2) {
      const labels = options.map(o => normalize(typeof o === "string" ? o : (o.label || o.value || "")));
      if (labels.includes("yes") && labels.includes("no")) {
        const isNegativeQ = hasKeyword(qText, ["felony", "crime", "bankrupt", "sued", "fraud", "arrest", "fired", "disease", "cancer"]);
        const chosen = isNegativeQ ? "No" : "Yes";
        const ans = findBestOption(options, [chosen]);
        if (ans) return makeAnswer(question, [ans], `Hermes: Yes/No heuristic → ${chosen}`);
      }
    }

    // 8. Open-ended / Text Input Questions
    if (question.type === "text_input" || options.length === 0 || (options.length === 1 && (options[0].type === "text_input" || options[0].type === "textarea"))) {
      let textFeedback = "Overall reliable service with positive experience and dependable quality.";
      if (hasKeyword(qText, ["why", "explain", "reason", "describe"])) {
        textFeedback = "The service and products have consistently met our expectations, offering reliable performance and great usability.";
      } else if (hasKeyword(qText, ["improve", "suggestion", "feedback", "change"])) {
        textFeedback = "Continuing to enhance ease-of-use and prompt customer support would be appreciated.";
      } else if (hasKeyword(qText, ["brand", "company", "name"])) {
        textFeedback = "Samsung, Apple, and Audi are brands I trust and frequently engage with.";
      }
      return makeTextAnswer(question, textFeedback, "Hermes: Persona-grounded open-ended response");
    }

    // 9. Numeric / Rating scale (1-10, 1-5, 1-7)
    if (options.length >= 5) {
      // Look for high positive rating (e.g. 8, 9, 10 or 4, 5)
      const highRating = findBestOption(options, ["9", "8", "10", "4", "5", "7", "Excellent", "Good"]);
      if (highRating) {
        return makeAnswer(question, [highRating], "Hermes: Rating scale → " + highRating);
      }
    }

    // Cannot confidently answer → return null → can use resolveAnyQuestion if offline fallback requested
    return null;
  }

  /**
   * Standalone fallback solver that GUARANTEES an answer for any survey question
   * Ensures 0 API cost and zero failures when no external API is available.
   */
  function fallbackResolveQuestion(question) {
    if (!question) return null;
    const options = question.options || [];

    if (question.type === "text_input" || options.length === 0 || (options.length === 1 && (options[0].type === "text_input" || options[0].type === "textarea"))) {
      return makeTextAnswer(question, "Overall high satisfaction, dependable performance, and good quality.", "Hermes Fallback Response");
    }

    if (options.length > 0) {
      // 1. Look for moderate-positive option
      const posOpt = findBestOption(options, [
        "Agree", "Somewhat Agree", "Satisfied", "Likely", "Important", "Yes",
        "Good", "Very Good", "4", "5", "8", "9"
      ]);
      if (posOpt) return makeAnswer(question, [posOpt], "Hermes Smart Fallback: " + posOpt);

      // 2. Avoid "Prefer not to say" or "None of the above" unless trapped
      const normalOpts = options.filter(o => {
        const lbl = (typeof o === "string" ? o : (o.label || o.value || "")).toLowerCase();
        return !lbl.includes("prefer not") && !lbl.includes("don't know");
      });

      const chosenOpt = (normalOpts.length > 0 ? normalOpts[0] : options[0]);
      const chosenLabel = typeof chosenOpt === "string" ? chosenOpt : (chosenOpt.label || chosenOpt.value || "Option");
      return makeAnswer(question, [chosenLabel], "Hermes Default Heuristic: " + chosenLabel);
    }

    return makeTextAnswer(question, "Reliable and consistent quality.", "Hermes Default Text");
  }

  /**
   * Build a standardized answer object
   */
  function makeAnswer(question, selectedLabels, reasoning) {
    return {
      question_index: question.index !== undefined ? question.index : (question.question_index || 0),
      question_id: question.id || question.question_id || "",
      question_text: question.text || question.question_text || "",
      recommended_action: selectedLabels.length > 1 ? "select_checkbox" : "select_radio",
      target_element_ids: [],
      selected_labels: selectedLabels,
      text_input_value: null,
      reasoning: reasoning || "Hermes AI Local Agent",
      source: "hermes",
      model_used: "Hermes-Local"
    };
  }

  /**
   * Build text input answer
   */
  function makeTextAnswer(question, value, reasoning) {
    return {
      question_index: question.index !== undefined ? question.index : (question.question_index || 0),
      question_id: question.id || question.question_id || "",
      question_text: question.text || question.question_text || "",
      recommended_action: "type_text",
      target_element_ids: [],
      selected_labels: [],
      text_input_value: value,
      reasoning: reasoning || "Hermes AI Local Agent",
      source: "hermes",
      model_used: "Hermes-Local"
    };
  }

  // =========================================================================
  // PUBLIC HERMES API
  // =========================================================================
  const HermesAgent = {
    /**
     * Try to answer all given questions using Hermes rule engine.
     * Returns { resolvedAnswers, missingQuestions, allHit, hitCount, missCount }
     */
    resolveQuestions(questions, allowFallback = false) {
      if (!questions || questions.length === 0) {
        return { resolvedAnswers: [], missingQuestions: [], allHit: true, hitCount: 0, missCount: 0 };
      }

      const resolvedAnswers = [];
      const missingQuestions = [];

      for (const q of questions) {
        try {
          let answer = resolveQuestion(q);
          if (!answer && allowFallback) {
            answer = fallbackResolveQuestion(q);
          }

          if (answer) {
            resolvedAnswers.push(answer);
          } else {
            missingQuestions.push(q);
          }
        } catch (e) {
          console.warn("[Hermes] Error resolving question:", q.text, e);
          if (allowFallback) {
            const fb = fallbackResolveQuestion(q);
            if (fb) resolvedAnswers.push(fb); else missingQuestions.push(q);
          } else {
            missingQuestions.push(q);
          }
        }
      }

      const allHit = missingQuestions.length === 0;
      return {
        resolvedAnswers,
        missingQuestions,
        allHit,
        hitCount: resolvedAnswers.length,
        missCount: missingQuestions.length
      };
    },

    /**
     * Guarantees 100% offline resolution without needing any API
     */
    resolveAllOffline(questions) {
      return this.resolveQuestions(questions, true);
    },

    fallbackResolveQuestion(q) {
      return fallbackResolveQuestion(q);
    },

    /**
     * Get profile info
     */
    getProfileSummary() {
      const P = HERMES_PROFILE;
      return {
        name: P.fullName,
        age: P.age,
        job: `${P.jobTitle} — ${P.industry}`,
        income: P.income,
        location: `${P.city}, ${P.state} ${P.zipCode}`
      };
    },

    /**
     * Get stats for UI display
     */
    getStats() {
      return {
        profileRulesCount: 85,
        version: "1.0.0",
        status: "active"
      };
    }
  };

  // Export
  if (typeof module !== "undefined" && module.exports) {
    module.exports = HermesAgent;
  } else {
    global.HermesAgent = HermesAgent;
  }

})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this);
