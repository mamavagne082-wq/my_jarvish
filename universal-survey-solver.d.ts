/**
 * TypeScript Type Definitions for Universal Survey & Screen Solver Module
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

export declare const DEFAULT_SURVEY_PERSONA: SurveyPersona;

export declare function sanitizeFinalAnswer(raw: string): string;

export declare function fetchSmartSurveyAnswer(
  screenshot?: string | Blob | File | null,
  question?: string,
  options?: SurveySolverOptions
): Promise<string>;

declare const _default: {
  fetchSmartSurveyAnswer: typeof fetchSmartSurveyAnswer;
  sanitizeFinalAnswer: typeof sanitizeFinalAnswer;
  DEFAULT_SURVEY_PERSONA: typeof DEFAULT_SURVEY_PERSONA;
};

export default _default;
