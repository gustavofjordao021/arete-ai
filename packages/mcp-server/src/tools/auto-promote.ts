/**
 * Auto-promote: Automatically promote high-signal insights to identity facts
 *
 * When Claude stores an insight via arete_add_context_event, this module
 * classifies it and auto-promotes if it's a clear identity signal.
 * No user approval needed - like ChatGPT/Claude memory.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import {
  loadConfig,
  createCLIClient,
  type IdentityV2,
  type IdentityFact,
  type CLIClient,
} from "@arete/core";
import { similarity } from "./fuzzy-match.js";

// Supabase Edge Function for Haiku classification
const SUPABASE_URL = "https://dvjgxddjmevmmtzqmzrm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2amd4ZGRqbWV2bW10enFtenJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMzQ1MjAsImV4cCI6MjA4MDYxMDUyMH0.DxLL_lftNcuE1ROQigLc9xWdPiJZVVpPT2e6ZBPeyaE";
const CLASSIFY_ENDPOINT = `${SUPABASE_URL}/functions/v1/classify-insight`;

// Configurable directory (for testing)
let CONFIG_DIR = join(homedir(), ".arete");

export function setConfigDir(dir: string): void {
  CONFIG_DIR = dir;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

function getIdentityFile(): string {
  return join(CONFIG_DIR, "identity.json");
}

// --- Types ---

export type FactCategory = "core" | "expertise" | "preference" | "context" | "focus";

export interface PromotionResult {
  promote: boolean;
  category: FactCategory;
  confidence: number;
  content: string;
}

export interface AutoPromoteInput {
  insight: string;
  source: string;
}

export interface AutoPromoteResult {
  promoted: boolean;
  fact?: IdentityFact;
  reason?: string;
}

// --- Heuristic Patterns ---

interface PatternRule {
  pattern: RegExp;
  category: FactCategory;
  extractContent: (match: RegExpMatchArray, insight: string) => string;
}

// IMPORTANT: Order matters! More specific patterns must come BEFORE generic ones
const IDENTITY_PATTERNS: PatternRule[] = [
  // --- FOCUS patterns (most specific with "I'm X-ing") ---
  // "I'm learning X" -> focus
  {
    pattern: /^I(?:'m| am) learning (.+)$/i,
    category: "focus",
    extractContent: (match) => `Learning ${match[1]}`,
  },
  // "I'm building X" -> focus
  {
    pattern: /^I(?:'m| am) building (.+)$/i,
    category: "focus",
    extractContent: (match) => `Building ${match[1]}`,
  },
  // "I'm working on X" -> focus
  {
    pattern: /^I(?:'m| am) working on (.+)$/i,
    category: "focus",
    extractContent: (match) => `Working on ${match[1]}`,
  },

  // --- EXPERTISE patterns (specific phrases) ---
  // "I'm an expert in X" -> expertise
  {
    pattern: /^I(?:'m| am) (?:an )?expert (?:in|at|with) (.+)$/i,
    category: "expertise",
    extractContent: (match) => `Expert in ${match[1]}`,
  },
  // "I have X years of experience in Y" -> expertise
  {
    pattern: /^I have (?:\d+|\w+) years? (?:of )?experience (?:in|with) (.+)$/i,
    category: "expertise",
    extractContent: (match, insight) => insight, // Keep the full statement
  },
  // "I know X" -> expertise
  {
    pattern: /^I know (.+?)(?:\s+(?:really |very )?well)?$/i,
    category: "expertise",
    extractContent: (match) => `Knows ${match[1]}`,
  },

  // --- CORE patterns (work, role) ---
  // "I work at/for X" -> core
  {
    pattern: /^I work (?:at|for) (.+)$/i,
    category: "core",
    extractContent: (match) => `Works at ${match[1]}`,
  },

  // --- PREFERENCE patterns ---
  // "I prefer X" -> preference
  {
    pattern: /^I prefer (.+)$/i,
    category: "preference",
    extractContent: (match) => `Prefers ${match[1]}`,
  },
  // "I like X" -> preference
  {
    pattern: /^I like (.+)$/i,
    category: "preference",
    extractContent: (match) => `Likes ${match[1]}`,
  },
  // "I want X" -> preference
  {
    pattern: /^I want (.+)$/i,
    category: "preference",
    extractContent: (match) => `Wants ${match[1]}`,
  },
  // "I always X" -> preference
  {
    pattern: /^I always (.+)$/i,
    category: "preference",
    extractContent: (match) => `Always ${match[1]}`,
  },

  // --- GENERIC "I am" pattern (MUST BE LAST) ---
  // "I am a/an X" (role/profession) -> core
  {
    pattern: /^I(?:'m| am) (?:a |an )?(.+)$/i,
    category: "core",
    extractContent: (match, insight) => {
      const role = match[1].trim();
      // Check if it's a nationality
      if (/(?:ian|ean|an|ish|ese|ch)$/i.test(role) || isNationality(role)) {
        return `${capitalize(role)} nationality`;
      }
      return capitalize(role);
    },
  },
];

const NATIONALITIES = new Set([
  "brazilian", "american", "british", "canadian", "australian",
  "german", "french", "spanish", "italian", "portuguese",
  "japanese", "chinese", "korean", "indian", "mexican",
  "russian", "polish", "dutch", "swedish", "norwegian",
  "danish", "finnish", "irish", "scottish", "welsh",
]);

function isNationality(word: string): boolean {
  return NATIONALITIES.has(word.toLowerCase());
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Heuristic Classifier ---

/**
 * Classify an insight using heuristic pattern matching.
 * No LLM call - fast and works offline.
 */
export function classifyWithHeuristics(insight: string): PromotionResult {
  const trimmed = insight.trim();

  // Check if it starts with first person
  const isFirstPerson = /^I(?:'m| am| have| work| prefer| like| want| always| know)\b/i.test(trimmed);

  if (!isFirstPerson) {
    return {
      promote: false,
      category: "context",
      confidence: 0,
      content: "",
    };
  }

  // Try each pattern
  for (const rule of IDENTITY_PATTERNS) {
    const match = trimmed.match(rule.pattern);
    if (match) {
      const content = rule.extractContent(match, trimmed);

      // Determine category - override for nationality detection
      let category = rule.category;
      if (rule.category === "core" && content.includes("nationality")) {
        category = "context";
      }

      return {
        promote: true,
        category,
        confidence: 0.7,
        content,
      };
    }
  }

  // If first person but no pattern matched, don't promote
  return {
    promote: false,
    category: "context",
    confidence: 0,
    content: "",
  };
}

// --- Haiku Classification (Edge Function) ---

/**
 * Classify an insight using Haiku via Supabase Edge Function.
 * Returns null if the Edge Function is unavailable.
 */
async function classifyWithHaiku(insight: string): Promise<PromotionResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(CLASSIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ insight }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Haiku classification failed: ${response.status}`);
      return null;
    }

    const result = await response.json();

    // Validate response shape
    if (typeof result.promote !== "boolean") {
      console.error("Invalid Haiku response shape:", result);
      return null;
    }

    return {
      promote: result.promote,
      category: result.category || "context",
      confidence: result.confidence || 0.8, // Haiku gets higher confidence
      content: result.content || "",
    };
  } catch (err) {
    // Network error, timeout, etc. - fall back to heuristics
    console.error("Haiku classification error:", err);
    return null;
  }
}

/**
 * Classify an insight, trying Haiku first with heuristics fallback.
 */
async function classifyInsight(insight: string, useHaiku: boolean = true): Promise<PromotionResult> {
  // Try Haiku if enabled
  if (useHaiku) {
    const haikuResult = await classifyWithHaiku(insight);
    if (haikuResult !== null) {
      return haikuResult;
    }
  }

  // Fall back to heuristics
  return classifyWithHeuristics(insight);
}

// --- Identity V2 Helpers ---

function isIdentityV2(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

function loadIdentityV2(): IdentityV2 | null {
  const identityFile = getIdentityFile();

  if (!existsSync(identityFile)) {
    return null;
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    const parsed = JSON.parse(data);

    if (!isIdentityV2(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveIdentityV2(identity: IdentityV2): void {
  const identityFile = getIdentityFile();
  const dir = dirname(identityFile);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(identityFile, JSON.stringify(identity, null, 2));
}

function getCloudClient(): CLIClient | null {
  const config = loadConfig() || {};
  if (!config.apiKey || !config.supabaseUrl) {
    return null;
  }
  return createCLIClient({
    supabaseUrl: config.supabaseUrl,
    apiKey: config.apiKey,
  });
}

// --- Duplicate Detection ---

const FUZZY_THRESHOLD = 0.7;

/**
 * Check if a similar fact already exists using fuzzy matching
 */
function findDuplicateFact(facts: IdentityFact[], content: string): IdentityFact | undefined {
  for (const fact of facts) {
    const score = similarity(content, fact.content);
    if (score >= FUZZY_THRESHOLD) {
      return fact;
    }
  }
  return undefined;
}

// --- Main Auto-Promote Function ---

/**
 * Automatically promote a high-signal insight to an identity fact.
 *
 * Flow:
 * 1. Classify with heuristics (or Haiku if available)
 * 2. Check for duplicates using fuzzy matching
 * 3. Create and save fact if high-signal and not duplicate
 *
 * @param input - The insight to potentially promote
 * @returns Result indicating if promotion happened
 */
export async function autoPromoteInsight(
  input: AutoPromoteInput
): Promise<AutoPromoteResult> {
  const { insight, source } = input;

  // Load identity
  const identity = loadIdentityV2();

  if (!identity) {
    return {
      promoted: false,
      reason: "No v2 identity found",
    };
  }

  // Check settings
  const settings = identity.settings || {};
  if (settings.autoPromote === false) {
    return {
      promoted: false,
      reason: "Auto-promote disabled in settings",
    };
  }

  // Classify the insight (Haiku with heuristics fallback)
  const useHaiku = settings.useHaikuClassification !== false;
  const classification = await classifyInsight(insight, useHaiku);

  if (!classification.promote) {
    return {
      promoted: false,
      reason: "Insight classified as low-signal",
    };
  }

  // Check for duplicates
  const duplicate = findDuplicateFact(identity.facts, classification.content);
  if (duplicate) {
    return {
      promoted: false,
      reason: `Similar fact already exists: "${duplicate.content}" (duplicate)`,
    };
  }

  // Create the fact
  const now = new Date().toISOString();
  const fact: IdentityFact = {
    id: crypto.randomUUID(),
    category: classification.category,
    content: classification.content,
    confidence: classification.confidence,
    lastValidated: now,
    validationCount: 0,
    maturity: "candidate",
    source: "conversation",
    sourceRef: source,
    createdAt: now,
    updatedAt: now,
  };

  // Add to identity
  identity.facts.push(fact);

  // Save locally
  try {
    saveIdentityV2(identity);
  } catch (err) {
    return {
      promoted: false,
      reason: `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  // Sync to cloud (best effort)
  const client = getCloudClient();
  if (client) {
    try {
      await client.saveIdentity(identity as any);
    } catch (err) {
      console.error("Cloud sync failed:", err);
    }
  }

  return {
    promoted: true,
    fact,
  };
}
