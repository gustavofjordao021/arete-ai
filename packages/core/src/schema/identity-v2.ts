/**
 * Identity v2 Schema with confidence, maturity, and decay
 *
 * Key changes from v1:
 * - Facts as individual units with confidence scores
 * - Maturity state machine (candidate → established → proven)
 * - Confidence decay over time without validation
 * - Task-aware projection support
 */

import { z } from "zod";
import type { AreteIdentity } from "./identity.js";

// Default half-life for confidence decay (60 days)
export const DEFAULT_HALF_LIFE_DAYS = 60;

/**
 * Category of identity fact
 */
export const FactCategorySchema = z.enum([
  "core",       // Name, role, background
  "expertise",  // Skills, technologies, domains
  "preference", // Communication style, format preferences
  "context",    // Personal/professional context
  "focus",      // Current projects, goals
]);

export type FactCategory = z.infer<typeof FactCategorySchema>;

/**
 * Maturity level of a fact
 */
export const MaturitySchema = z.enum([
  "candidate",   // Inferred, not yet validated
  "established", // Validated 2+ times or manual entry
  "proven",      // Validated 5+ times, high trust
]);

export type Maturity = z.infer<typeof MaturitySchema>;

/**
 * Source of the fact
 */
export const FactSourceSchema = z.enum([
  "manual",       // User directly entered
  "inferred",     // Extracted from context patterns
  "conversation", // Learned during AI conversation
  "imported",     // Imported from external source (OpenIdentity, ChatGPT, etc.)
]);

export type FactSource = z.infer<typeof FactSourceSchema>;

/**
 * Visibility (privacy tier) of a fact
 */
export const VisibilitySchema = z.enum([
  "public",   // Safe to share with any AI tool
  "trusted",  // Only authorized apps (default)
  "local",    // Never leaves device, never syncs to cloud
]);

export type Visibility = z.infer<typeof VisibilitySchema>;

/**
 * Individual identity fact with confidence tracking
 */
export const IdentityFactSchema = z.object({
  id: z.string(),
  category: FactCategorySchema,
  content: z.string(),

  // Confidence tracking
  confidence: z.number().min(0).max(1),
  lastValidated: z.string(), // ISO timestamp
  validationCount: z.number().int().min(0),
  maturity: MaturitySchema,

  // Privacy
  visibility: VisibilitySchema.default("trusted"),

  // Provenance
  source: FactSourceSchema,
  sourceRef: z.string().optional(),

  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IdentityFact = z.infer<typeof IdentityFactSchema>;

/**
 * Settings for identity behavior
 */
export const IdentitySettingsSchema = z.object({
  decayHalfLifeDays: z.number().default(DEFAULT_HALF_LIFE_DAYS),
  autoInfer: z.boolean().default(false),
  excludedDomains: z.array(z.string()).default([]),
  // Auto-promote high-signal insights to identity facts (like ChatGPT/Claude memory)
  autoPromote: z.boolean().default(true),
  // Use Haiku for classification (vs heuristics-only)
  useHaikuClassification: z.boolean().default(true),
});

export type IdentitySettings = z.infer<typeof IdentitySettingsSchema>;

/**
 * Core identity fields (protected, not facts)
 */
export const IdentityCoreSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
});

export type IdentityCore = z.infer<typeof IdentityCoreSchema>;

/**
 * Identity v2 Schema
 */
export const IdentityV2Schema = z.object({
  version: z.literal("2.0.0"),
  deviceId: z.string(),
  userId: z.string().optional(),

  facts: z.array(IdentityFactSchema),
  core: IdentityCoreSchema,
  settings: IdentitySettingsSchema,
});

export type IdentityV2 = z.infer<typeof IdentityV2Schema>;

/**
 * Create a new identity fact
 */
export function createIdentityFact(input: {
  category: FactCategory;
  content: string;
  source?: FactSource;
  confidence?: number;
  visibility?: Visibility;
  sourceRef?: string;
}): IdentityFact {
  const now = new Date().toISOString();
  const source = input.source ?? "manual";
  const isManual = source === "manual";

  return {
    id: crypto.randomUUID(),
    category: input.category,
    content: input.content,
    confidence: input.confidence ?? (isManual ? 1.0 : 0.5),
    lastValidated: now,
    validationCount: isManual ? 1 : 0,
    maturity: isManual ? "established" : "candidate",
    visibility: input.visibility ?? "trusted",
    source,
    sourceRef: input.sourceRef,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create an empty v2 identity
 */
export function createEmptyIdentityV2(deviceId: string): IdentityV2 {
  return {
    version: "2.0.0",
    deviceId,
    facts: [],
    core: {},
    settings: {
      decayHalfLifeDays: DEFAULT_HALF_LIFE_DAYS,
      autoInfer: false,
      excludedDomains: [],
      autoPromote: true,
      useHaikuClassification: true,
    },
  };
}

/**
 * Check if an identity is v2 format
 */
export function isIdentityV2(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  return (identity as { version?: string }).version === "2.0.0";
}

/**
 * Calculate days since a timestamp
 */
function daysSince(timestamp: string): number {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}

/**
 * Calculate effective confidence with decay
 *
 * Formula: confidence × 0.5^(daysSinceValidation / halfLifeDays)
 */
export function getEffectiveConfidence(
  fact: IdentityFact,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): number {
  const days = daysSince(fact.lastValidated);
  return fact.confidence * Math.pow(0.5, days / halfLifeDays);
}

/**
 * Validate a fact (bump confidence + maturity)
 */
export function validateFact(fact: IdentityFact): IdentityFact {
  const validationCount = fact.validationCount + 1;
  const now = new Date().toISOString();

  // Determine new maturity
  let maturity = fact.maturity;
  if (validationCount >= 5) {
    maturity = "proven";
  } else if (validationCount >= 2) {
    maturity = "established";
  }

  // Boost confidence (cap at 1.0)
  const confidence = Math.min(1.0, fact.confidence + 0.2);

  return {
    ...fact,
    confidence,
    lastValidated: now,
    validationCount,
    maturity,
    updatedAt: now,
  };
}

/**
 * Filter facts by visibility tier
 *
 * Visibility levels (ordered from most to least restrictive):
 * - "public" (0): Returns only public facts
 * - "trusted" (1): Returns public + trusted facts
 * - "local" (2): Returns all facts including local
 */
export function filterFactsByVisibility(
  facts: IdentityFact[],
  maxVisibility: Visibility
): IdentityFact[] {
  const levels: Record<Visibility, number> = {
    public: 0,
    trusted: 1,
    local: 2,
  };
  const maxLevel = levels[maxVisibility];

  return facts.filter((f) => {
    const factVisibility = f.visibility ?? "trusted";
    return levels[factVisibility] <= maxLevel;
  });
}

/**
 * Migrate v1 identity to v2 format
 */
export function migrateV1ToV2(v1: AreteIdentity): IdentityV2 {
  const now = new Date().toISOString();
  const facts: IdentityFact[] = [];

  // Helper to create proven fact (existing = trusted)
  const createMigratedFact = (
    category: FactCategory,
    content: string
  ): IdentityFact => ({
    id: crypto.randomUUID(),
    category,
    content,
    confidence: 1.0,
    lastValidated: now,
    validationCount: 5, // Proven status
    maturity: "proven",
    visibility: "trusted", // Default visibility for migrated facts
    source: "manual",
    createdAt: v1.meta.lastModified,
    updatedAt: now,
  });

  // Migrate expertise array
  for (const skill of v1.expertise ?? []) {
    facts.push(createMigratedFact("expertise", skill));
  }

  // Migrate communication styles
  for (const style of v1.communication?.style ?? []) {
    facts.push(createMigratedFact("preference", `Communication style: ${style}`));
  }

  // Migrate communication avoid
  for (const avoid of v1.communication?.avoid ?? []) {
    facts.push(createMigratedFact("preference", `Avoid: ${avoid}`));
  }

  // Migrate projects
  for (const project of v1.currentFocus?.projects ?? []) {
    const name = typeof project === "string" ? project : project.name;
    const desc = typeof project === "string" ? "" : ` - ${project.description}`;
    facts.push(createMigratedFact("focus", `Project: ${name}${desc}`));
  }

  // Migrate goals
  for (const goal of v1.currentFocus?.goals ?? []) {
    facts.push(createMigratedFact("focus", `Goal: ${goal}`));
  }

  // Migrate personal context
  for (const item of v1.context?.personal ?? []) {
    facts.push(createMigratedFact("context", item));
  }

  // Migrate professional context
  for (const item of v1.context?.professional ?? []) {
    facts.push(createMigratedFact("context", item));
  }

  return {
    version: "2.0.0",
    deviceId: v1.meta.deviceId,
    facts,
    core: {
      name: v1.core.name,
      role: v1.core.role,
    },
    settings: {
      decayHalfLifeDays: DEFAULT_HALF_LIFE_DAYS,
      autoInfer: false,
      excludedDomains: [],
      autoPromote: true,
      useHaikuClassification: true,
    },
  };
}
