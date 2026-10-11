/**
 * ========================================================================================
 * JARVIS AI - CROSS-PLATFORM COPILOT ENGINE (TypeScript Source)
 * ========================================================================================
 */

export interface PersonaProfile {
  name?: string;
  age?: string;
  birthYear?: string;
  gender?: string;
  education?: string;
  employment?: string;
  industry?: string;
  jobRole?: string;
  companySize?: string;
  householdIncome?: string;
  location?: string;
  [key: string]: string | undefined;
}

export interface PollinationsOptions {
  timeoutMs?: number;
  persona?: PersonaProfile;
  systemInstruction?: string;
  debug?: boolean;
}

export interface GeminiSessionStatus {
  connected: boolean;
  email: string | null;
  tier: string;
  platform: 'chrome_extension' | 'android_apk' | 'pc_desktop' | 'unknown';
}

export interface GeminiFrameOptions {
  accountIndex?: number;
  width?: string;
  height?: string;
  className?: string;
}

export interface ScreenshotOptions {
  maxSlices?: number;
  sliceDelay?: number;
}

export interface SurveyAutoSelectOptions {
  screenshot?: string | null;
  autoClick?: boolean;
  persona?: PersonaProfile;
  timeoutMs?: number;
}

export interface SurveyExecutionReport {
  success: boolean;
  questionText?: string;
  chosenAnswer?: string;
  matchedOptionLabel?: string | null;
  clicked?: boolean;
  totalQuestionsDetected?: number;
  screenshotCaptured?: boolean;
  engine?: string;
  error?: string;
}

export declare function sanitizeFinalAnswer(raw: string): string;

export declare function queryPollinationsAI(
  prompt: string,
  options?: PollinationsOptions
): Promise<string>;

export declare function checkGeminiSessionStatus(): Promise<GeminiSessionStatus>;

export declare function renderGeminiWebFrame(
  container: HTMLElement | string,
  options?: GeminiFrameOptions
): HTMLIFrameElement | null;

export declare function captureFullPageScreenshot(
  options?: ScreenshotOptions
): Promise<string | null>;

export declare function analyzeAndAutoSelectSurvey(
  options?: SurveyAutoSelectOptions
): Promise<SurveyExecutionReport>;

declare const _default: {
  queryPollinationsAI: typeof queryPollinationsAI;
  renderGeminiWebFrame: typeof renderGeminiWebFrame;
  checkGeminiSessionStatus: typeof checkGeminiSessionStatus;
  captureFullPageScreenshot: typeof captureFullPageScreenshot;
  analyzeAndAutoSelectSurvey: typeof analyzeAndAutoSelectSurvey;
  sanitizeFinalAnswer: typeof sanitizeFinalAnswer;
};

export default _default;
