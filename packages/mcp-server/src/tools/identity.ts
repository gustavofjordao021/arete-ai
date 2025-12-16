/**
 * arete_get_identity MCP tool
 *
 * Reads identity from Supabase (if authenticated) or ~/.arete/identity.json.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  safeParseIdentity,
  createEmptyIdentity,
  createClaudeTransform,
  type AreteIdentity,
  loadConfig,
  createCLIClient,
  type CLIClient,
} from "@arete/core";

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

/**
 * Get CLI client for cloud operations (if authenticated)
 */
function getCloudClient(): CLIClient | null {
  const config = loadConfig();
  if (!config.apiKey || !config.supabaseUrl) {
    return null;
  }
  return createCLIClient({
    supabaseUrl: config.supabaseUrl,
    apiKey: config.apiKey,
  });
}

export interface GetIdentityInput {
  format?: "json" | "prompt";
}

export interface ValidationOpportunity {
  factId: string;
  content: string;
  category: string;
  daysSinceValidation: number;
  effectiveConfidence: number;
  reason: string;
}

export interface GetIdentityOutput {
  exists: boolean;
  identity?: AreteIdentity;
  formatted?: string;
  error?: string;
  guidance?: string;
  /** Facts that could benefit from validation during conversation */
  validationOpportunities?: ValidationOpportunity[];
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: GetIdentityOutput;
}

/**
 * Handler for arete_get_identity tool.
 * Tries cloud first (if authenticated), falls back to local file.
 */
export async function getIdentityHandler(
  input: GetIdentityInput
): Promise<ToolResult> {
  let parsed: AreteIdentity | null = null;
  let source = "local";

  // Try cloud first if authenticated
  const client = getCloudClient();
  if (client) {
    try {
      const cloudIdentity = await client.getIdentity();
      if (cloudIdentity) {
        parsed = cloudIdentity;
        source = "cloud";
      }
    } catch (err) {
      // Fall through to local
      console.error("Cloud identity fetch failed:", err);
    }
  }

  // Track raw data for v2 detection (before safeParseIdentity transforms it)
  let rawIdentityData: unknown = null;

  // Fallback to local file
  if (!parsed) {
    const identityFile = getIdentityFile();

    if (!existsSync(identityFile)) {
      const output: GetIdentityOutput = {
        exists: false,
        identity: createEmptyIdentity("mcp-server"),
      };
      return {
        content: [{ type: "text", text: "No identity configured." }],
        structuredContent: output,
      };
    }

    try {
      const data = readFileSync(identityFile, "utf-8");
      rawIdentityData = JSON.parse(data);

      // For v2 identities, create a compatible AreteIdentity from the v2 data
      if (isV2Identity(rawIdentityData)) {
        const v2 = rawIdentityData as {
          core?: { name?: string; role?: string; location?: string; background?: string };
          facts?: Array<{ category: string; content: string }>;
        };
        // Create minimal v1-compatible identity from v2 data
        parsed = createEmptyIdentity("mcp-server");
        if (v2.core) {
          parsed.core = { ...parsed.core, ...v2.core };
        }
        // Convert facts to expertise if available
        if (v2.facts) {
          const expertiseFacts = v2.facts
            .filter(f => f.category === "expertise")
            .map(f => f.content);
          if (expertiseFacts.length > 0) {
            parsed.expertise = expertiseFacts;
          }
        }
      } else {
        parsed = safeParseIdentity(rawIdentityData);
      }
    } catch (err) {
      const output: GetIdentityOutput = {
        exists: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
      return {
        content: [{ type: "text", text: `Error reading identity: ${output.error}` }],
        structuredContent: output,
      };
    }
  }

  if (!parsed) {
    const output: GetIdentityOutput = {
      exists: false,
      error: "Invalid identity file format",
    };
    return {
      content: [{ type: "text", text: "Invalid identity file format." }],
      structuredContent: output,
    };
  }

  // Find validation opportunities for v2 identities (use raw data before transformation)
  const validationOpportunities = findValidationOpportunities(rawIdentityData);

  // System prompt guidance for natural behavior + proactive context capture
  let guidance =
    `Use this identity to personalize responses naturally. ` +
    `Don't say "based on your profile" or "your identity shows". ` +
    `Just know the user - their expertise, preferences, and context. ` +
    `Adapt complexity, examples, and tone to match their background.\n\n` +
    `IMPORTANT - CONTEXT CAPTURE WORKFLOW:\n` +
    `After EVERY response where the user reveals a preference, constraint, or personal fact, ` +
    `make a tool call to store it. This is not optional.\n\n` +
    `Use arete_add_context_event (type="insight") for:\n` +
    `- Preferences: "I like X", "I prefer Y", "I always want Z"\n` +
    `- Constraints: "I'm on iPad", "I don't have admin access"\n` +
    `- Dislikes: "I don't like...", "I hate when..."\n` +
    `- Current focus: "I'm learning...", "I'm working on..."\n\n` +
    `Use arete_update_identity for structured facts:\n` +
    `- Role/job: "I'm a PM at...", "I work at..."\n` +
    `- Expertise: demonstrates knowledge through conversation\n` +
    `- Location: "I'm based in...", "I live in..."\n\n` +
    `These are OUTPUT tools for recording, not INPUT tools for searching. ` +
    `Storing context is part of completing the task well.`;

  // Add validation hint if opportunities exist
  if (validationOpportunities.length > 0) {
    guidance +=
      ` Some facts could use validation - if conversation naturally confirms them, ` +
      `use arete_validate_fact (fuzzy matching works, no exact wording needed).`;
  }

  // Format for system prompt if requested
  if (input.format === "prompt") {
    const transform = createClaudeTransform();
    const formatted = transform.transform(parsed).content;
    const output: GetIdentityOutput = {
      exists: true,
      identity: parsed,
      formatted,
      guidance,
      validationOpportunities: validationOpportunities.length > 0 ? validationOpportunities : undefined,
    };
    const prefix = source === "cloud" ? "(from cloud) " : "";
    return {
      content: [{ type: "text", text: prefix + formatted }],
      structuredContent: output,
    };
  }

  // Default: return identity as JSON
  const output: GetIdentityOutput = {
    exists: true,
    identity: parsed,
    guidance,
    validationOpportunities: validationOpportunities.length > 0 ? validationOpportunities : undefined,
  };

  const summary = formatIdentitySummary(parsed);
  const prefix = source === "cloud" ? "(synced from cloud)\n" : "";
  return {
    content: [{ type: "text", text: prefix + summary }],
    structuredContent: output,
  };
}

function formatIdentitySummary(identity: AreteIdentity): string {
  const lines: string[] = [];

  if (identity.core?.name) lines.push(`Name: ${identity.core.name}`);
  if (identity.core?.role) lines.push(`Role: ${identity.core.role}`);
  if (identity.core?.location) lines.push(`Location: ${identity.core.location}`);
  if (identity.core?.background) lines.push(`Background: ${identity.core.background}`);
  if (identity.expertise?.length > 0) {
    lines.push(`Expertise: ${identity.expertise.join(", ")}`);
  }
  if (identity.currentFocus?.goals?.length > 0) {
    lines.push(`Goals: ${identity.currentFocus.goals.join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : "Identity exists but has no details.";
}

/**
 * Check if identity is v2 format (has facts array)
 */
function isV2Identity(identity: unknown): boolean {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

/**
 * Calculate effective confidence with time decay
 * Confidence decays by half every 60 days since last validation
 */
function calculateEffectiveConfidence(
  confidence: number,
  lastValidated: string,
  halfLifeDays: number = 60
): number {
  const now = Date.now();
  const validated = new Date(lastValidated).getTime();
  const daysSince = (now - validated) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, daysSince / halfLifeDays);
  return confidence * decayFactor;
}

/**
 * Find facts that would benefit from validation
 * Returns up to 3 opportunities, prioritized by need
 */
function findValidationOpportunities(identity: unknown): ValidationOpportunity[] {
  if (!isV2Identity(identity)) return [];

  const v2 = identity as {
    facts: Array<{
      id: string;
      category: string;
      content: string;
      confidence: number;
      lastValidated: string;
      validationCount: number;
      maturity: string;
    }>;
    settings?: { decayHalfLifeDays?: number };
  };

  const halfLifeDays = v2.settings?.decayHalfLifeDays ?? 60;
  const now = Date.now();
  const opportunities: ValidationOpportunity[] = [];

  for (const fact of v2.facts) {
    const validated = new Date(fact.lastValidated).getTime();
    const daysSince = Math.floor((now - validated) / (1000 * 60 * 60 * 24));
    const effectiveConfidence = calculateEffectiveConfidence(
      fact.confidence,
      fact.lastValidated,
      halfLifeDays
    );

    // Skip proven facts with recent validation
    if (fact.maturity === "proven" && daysSince < 30) continue;

    // Find opportunities:
    // 1. Facts with decayed confidence (below 0.5)
    // 2. Facts not validated in 30+ days
    // 3. Candidate facts (not yet established)
    let reason = "";
    let priority = 0;

    if (effectiveConfidence < 0.4) {
      reason = "confidence has decayed";
      priority = 3; // Highest priority
    } else if (daysSince >= 60) {
      reason = "not validated in 60+ days";
      priority = 2;
    } else if (fact.maturity === "candidate" && daysSince >= 14) {
      reason = "candidate fact awaiting confirmation";
      priority = 1;
    }

    if (reason) {
      opportunities.push({
        factId: fact.id,
        content: fact.content,
        category: fact.category,
        daysSinceValidation: daysSince,
        effectiveConfidence: Math.round(effectiveConfidence * 100) / 100,
        reason,
      });
    }
  }

  // Sort by priority (highest first) and return top 3
  return opportunities
    .sort((a, b) => {
      // Priority based on reason
      const priorityA = a.reason.includes("decayed") ? 3 : a.reason.includes("60+") ? 2 : 1;
      const priorityB = b.reason.includes("decayed") ? 3 : b.reason.includes("60+") ? 2 : 1;
      return priorityB - priorityA;
    })
    .slice(0, 3);
}
