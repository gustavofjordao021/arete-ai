/**
 * OpenIdentity v1.0 Interchange Format
 *
 * Portable format for sharing identity across AI tools.
 * File extension: .oi
 */

import { z } from "zod";
import {
  type IdentityV2,
  type IdentityFact,
  type Visibility,
  type FactCategory,
  type Maturity,
  FactCategorySchema,
  MaturitySchema,
  VisibilitySchema,
  createEmptyIdentityV2,
  filterFactsByVisibility,
} from "../schema/identity-v2.js";

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * OpenIdentity fact (simplified for interchange)
 */
export const OpenIdentityFactSchema = z.object({
  id: z.string(),
  category: FactCategorySchema,
  content: z.string(),
  confidence: z.number().min(0).max(1),
  maturity: MaturitySchema,
  visibility: VisibilitySchema,
  source: z.string(),
  createdAt: z.string(),
});

export type OpenIdentityFact = z.infer<typeof OpenIdentityFactSchema>;

/**
 * OpenIdentity v1.0 Schema
 */
export const OpenIdentityV1Schema = z.object({
  $schema: z.literal("https://openidentity.org/schema/v1.0.json"),
  version: z.literal("1.0.0"),
  exportedAt: z.string(),
  sourceApp: z.string(),

  identity: z.object({
    name: z.string().optional(),
    role: z.string().optional(),
  }),

  facts: z.array(OpenIdentityFactSchema),

  export: z.object({
    visibility: VisibilitySchema,
    factsIncluded: z.number(),
    factsExcluded: z.number(),
  }),
});

export type OpenIdentityV1 = z.infer<typeof OpenIdentityV1Schema>;

// ============================================================================
// EXPORT
// ============================================================================

export interface ExportOptions {
  /** Maximum visibility tier to include (default: "trusted") */
  visibility?: Visibility;
  /** Include candidate facts (default: false) */
  includeCandidates?: boolean;
}

/**
 * Export IdentityV2 to OpenIdentity v1.0 format
 */
export function exportToOpenIdentity(
  identity: IdentityV2,
  options: ExportOptions = {}
): OpenIdentityV1 {
  const visibility = options.visibility ?? "trusted";
  const includeCandidates = options.includeCandidates ?? false;

  // Filter by visibility
  let facts = filterFactsByVisibility(identity.facts, visibility);

  // Filter out candidates unless explicitly included
  if (!includeCandidates) {
    facts = facts.filter((f) => f.maturity !== "candidate");
  }

  const factsExcluded = identity.facts.length - facts.length;

  return {
    $schema: "https://openidentity.org/schema/v1.0.json",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    sourceApp: "arete",

    identity: {
      name: identity.core.name,
      role: identity.core.role,
    },

    facts: facts.map((f) => ({
      id: f.id,
      category: f.category,
      content: f.content,
      confidence: f.confidence,
      maturity: f.maturity,
      visibility: f.visibility ?? "trusted",
      source: f.source,
      createdAt: f.createdAt,
    })),

    export: {
      visibility,
      factsIncluded: facts.length,
      factsExcluded,
    },
  };
}

// ============================================================================
// IMPORT
// ============================================================================

export interface ImportResult {
  success: boolean;
  identity?: IdentityV2;
  error?: string;
}

/**
 * Import OpenIdentity v1.0 to IdentityV2 format
 *
 * @param oi - OpenIdentity data (can be unknown, will be validated)
 */
export function importFromOpenIdentity(oi: unknown): ImportResult {
  // Validate input
  const parseResult = OpenIdentityV1Schema.safeParse(oi);
  if (!parseResult.success) {
    return {
      success: false,
      error: `Invalid OpenIdentity format: ${parseResult.error.message}`,
    };
  }

  const validated = parseResult.data;
  const now = new Date().toISOString();

  // Create new identity
  const identity = createEmptyIdentityV2(crypto.randomUUID());

  // Set core fields
  identity.core = {
    name: validated.identity.name,
    role: validated.identity.role,
  };

  // Convert facts
  identity.facts = validated.facts.map((oiFact) => ({
    id: crypto.randomUUID(), // Generate new UUID
    category: oiFact.category,
    content: oiFact.content,
    confidence: oiFact.confidence,
    lastValidated: now,
    validationCount: oiFact.maturity === "proven" ? 5 : oiFact.maturity === "established" ? 2 : 0,
    maturity: oiFact.maturity,
    visibility: oiFact.visibility,
    source: "imported" as const, // Always mark as imported
    createdAt: oiFact.createdAt,
    updatedAt: now,
  }));

  return {
    success: true,
    identity,
  };
}
