/**
 * Inference Response Parser - Phase 3
 *
 * Parses Haiku's JSON response from cross-type inference.
 * Validates structure, filters duplicates, ensures data quality.
 */

import type { IdentityFact, FactCategory } from "@arete/core";

// --- Types ---

export interface CandidateFact {
  content: string;
  category: FactCategory;
  confidence: number;
  signals: string[];
  reasoning: string;
}

export interface ReinforceAction {
  factId: string;
  reason: string;
}

export interface DowngradeAction {
  factId: string;
  reason: string;
}

export interface InferenceResult {
  candidates: CandidateFact[];
  reinforce: ReinforceAction[];
  downgrade: DowngradeAction[];
  error?: string;
}

// Valid categories for candidate facts
const VALID_CATEGORIES: FactCategory[] = ["expertise", "focus", "preference", "context"];

// --- Helpers ---

/**
 * Extract JSON from response that might have markdown code blocks or surrounding text
 */
function extractJSON(response: string): string {
  // Try to find JSON in markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON object in the text
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return response;
}

/**
 * Validate and normalize a candidate fact
 */
function validateCandidate(raw: unknown): CandidateFact | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Required fields
  if (typeof obj.content !== "string" || !obj.content.trim()) return null;
  if (typeof obj.category !== "string") return null;

  // Validate category
  if (!VALID_CATEGORIES.includes(obj.category as FactCategory)) return null;

  // Normalize confidence (clamp to 0-1)
  let confidence = typeof obj.confidence === "number" ? obj.confidence : 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  // Optional fields with defaults
  const signals = Array.isArray(obj.signals)
    ? obj.signals.filter((s): s is string => typeof s === "string")
    : [];
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";

  return {
    content: obj.content.trim(),
    category: obj.category as FactCategory,
    confidence,
    signals,
    reasoning,
  };
}

/**
 * Validate a reinforce/downgrade action
 */
function validateAction(raw: unknown): ReinforceAction | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.factId !== "string" || !obj.factId.trim()) return null;

  return {
    factId: obj.factId.trim(),
    reason: typeof obj.reason === "string" ? obj.reason : "",
  };
}

/**
 * Check if a candidate matches an existing fact (case-insensitive)
 */
function isDuplicate(candidate: CandidateFact, existingFacts: IdentityFact[]): boolean {
  const normalizedContent = candidate.content.toLowerCase().trim();
  return existingFacts.some(
    (fact) => fact.content.toLowerCase().trim() === normalizedContent
  );
}

// --- Main Parser ---

/**
 * Parse Haiku's inference response
 *
 * @param response - Raw response string from Haiku
 * @param existingFacts - Optional existing facts to filter duplicates
 * @returns Parsed inference result
 */
export function parseInferenceResponse(
  response: string,
  existingFacts: IdentityFact[] = []
): InferenceResult {
  const emptyResult: InferenceResult = {
    candidates: [],
    reinforce: [],
    downgrade: [],
  };

  // Extract JSON from response
  const jsonString = extractJSON(response);

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      ...emptyResult,
      error: `Failed to parse JSON: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return emptyResult;
  }

  const obj = parsed as Record<string, unknown>;

  // Parse candidates
  const rawCandidates = Array.isArray(obj.candidates) ? obj.candidates : [];
  const candidates = rawCandidates
    .map(validateCandidate)
    .filter((c): c is CandidateFact => c !== null)
    .filter((c) => !isDuplicate(c, existingFacts));

  // Parse reinforce actions
  const rawReinforce = Array.isArray(obj.reinforce) ? obj.reinforce : [];
  const reinforce = rawReinforce
    .map(validateAction)
    .filter((a): a is ReinforceAction => a !== null);

  // Parse downgrade actions
  const rawDowngrade = Array.isArray(obj.downgrade) ? obj.downgrade : [];
  const downgrade = rawDowngrade
    .map(validateAction)
    .filter((a): a is DowngradeAction => a !== null);

  return {
    candidates,
    reinforce,
    downgrade,
  };
}
