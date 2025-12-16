/**
 * arete_context MCP tool - Projection Engine
 *
 * THE KILLER FEATURE: Task-aware identity projection
 * Instead of dumping all facts, projects only what's relevant to the current task.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  loadConfig,
  createCLIClient,
  DEFAULT_HALF_LIFE_DAYS,
  type IdentityV2,
  type IdentityFact,
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
 * Local v2 identity check (avoids mocking issues in tests)
 */
function isIdentityV2Local(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
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
 * Formula: confidence × 0.5^(daysSinceValidation / halfLifeDays)
 */
function getEffectiveConfidenceLocal(
  fact: IdentityFact,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): number {
  const days = daysSince(fact.lastValidated);
  return fact.confidence * Math.pow(0.5, days / halfLifeDays);
}

/**
 * Get CLI client for cloud operations (if authenticated)
 */
function getCloudClient(): CLIClient | null {
  const config = loadConfig();
  if (!config || !config.apiKey || !config.supabaseUrl) {
    return null;
  }
  return createCLIClient({
    supabaseUrl: config.supabaseUrl,
    apiKey: config.apiKey,
  });
}

/**
 * Load identity v2 - tries cloud first, falls back to local
 */
async function loadIdentityV2Async(): Promise<IdentityV2 | null> {
  // Try cloud first if authenticated
  const client = getCloudClient();
  if (client) {
    try {
      const cloudIdentity = await client.getIdentity();
      if (cloudIdentity && isIdentityV2Local(cloudIdentity)) {
        return cloudIdentity as IdentityV2;
      }
    } catch (err) {
      console.error("Cloud identity fetch failed:", err);
      // Fall through to local
    }
  }

  // Fallback to local file
  const identityFile = getIdentityFile();

  if (!existsSync(identityFile)) {
    return null;
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    const parsed = JSON.parse(data);

    if (!isIdentityV2Local(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// --- Projection Types ---

export interface ProjectionRequest {
  task?: string;
  maxFacts?: number;
  minConfidence?: number;
}

export interface ProjectedFact {
  id: string;
  content: string;
  category: string;
  confidence: number;
  effectiveConfidence: number;
  maturity: string;
  relevanceScore: number;
}

export interface ProjectionResult {
  facts: ProjectedFact[];
  totalFacts: number;
  filteredOut: number;
}

// --- Relevance Scoring ---

/**
 * Score relevance of a fact to a task
 * MVP implementation: keyword matching + category boost
 */
export function scoreRelevance(fact: IdentityFact, task?: string): number {
  // No task = medium relevance for all
  if (!task) return 0.5;

  const taskLower = task.toLowerCase();
  const contentLower = fact.content.toLowerCase();

  // Simple keyword overlap
  const taskWords = new Set(
    taskLower.split(/\s+/).filter((w) => w.length > 2)
  );
  const factWords = contentLower.split(/\s+/).filter((w) => w.length > 2);

  let matches = 0;
  for (const word of factWords) {
    if (taskWords.has(word)) matches++;
  }

  // Base relevance from keyword matches (each match = +0.2, capped contribution)
  let relevance = Math.min(0.7, matches * 0.2);

  // Category boost based on task type
  if (taskLower.includes("debug") && fact.category === "expertise") {
    relevance += 0.35;
  }
  if (
    (taskLower.includes("write") || taskLower.includes("documentation")) &&
    fact.category === "preference"
  ) {
    relevance += 0.25;
  }
  if (taskLower.includes("review") && fact.category === "preference") {
    relevance += 0.15;
  }

  // Proven facts get a small boost
  if (fact.maturity === "proven") {
    relevance += 0.1;
  }

  // Cap at 1.0
  return Math.min(1.0, relevance);
}

// --- Projection Engine ---

/**
 * Project identity facts for a specific task
 * Returns ranked, relevant facts with decay applied
 */
export async function projectIdentity(
  req: ProjectionRequest
): Promise<ProjectionResult> {
  const identity = await loadIdentityV2Async();

  if (!identity) {
    return {
      facts: [],
      totalFacts: 0,
      filteredOut: 0,
    };
  }

  const allFacts = identity.facts;
  const halfLifeDays = identity.settings?.decayHalfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const minConfidence = req.minConfidence ?? 0.3;
  const maxFacts = req.maxFacts ?? 10;

  // 1. Calculate effective confidence (with decay) and relevance
  const withScores = allFacts.map((fact) => {
    const effectiveConfidence = getEffectiveConfidenceLocal(fact, halfLifeDays);
    const relevanceScore = scoreRelevance(fact, req.task);

    return {
      ...fact,
      effectiveConfidence,
      relevanceScore,
      // Combined score for ranking: relevance × confidence
      combinedScore: relevanceScore * effectiveConfidence,
    };
  });

  // 2. Filter by minimum confidence (but always include proven facts)
  const activeFacts = withScores.filter(
    (f) => f.effectiveConfidence >= minConfidence || f.maturity === "proven"
  );

  // 3. Sort by combined score (relevance × confidence)
  activeFacts.sort((a, b) => b.combinedScore - a.combinedScore);

  // 4. Take top N
  const projected = activeFacts.slice(0, maxFacts);

  // 5. Map to ProjectedFact format
  const result: ProjectedFact[] = projected.map((f) => ({
    id: f.id,
    content: f.content,
    category: f.category,
    confidence: f.confidence,
    effectiveConfidence: f.effectiveConfidence,
    maturity: f.maturity,
    relevanceScore: f.relevanceScore,
  }));

  return {
    facts: result,
    totalFacts: allFacts.length,
    filteredOut: allFacts.length - result.length,
  };
}

// --- MCP Tool Handler ---

export interface ContextInput {
  task?: string;
  maxFacts?: number;
  minConfidence?: number;
}

export interface ContextOutput {
  success: boolean;
  projection: ProjectionResult;
  error?: string;
  guidance?: string;
}

export interface ContextToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ContextOutput;
}

/**
 * Handler for arete_context tool
 */
export async function contextHandler(
  input: ContextInput
): Promise<ContextToolResult> {
  const { task, maxFacts, minConfidence } = input;

  // Check if identity exists and is v2
  const identityFile = getIdentityFile();
  if (existsSync(identityFile)) {
    try {
      const data = JSON.parse(readFileSync(identityFile, "utf-8"));
      if (!isIdentityV2Local(data)) {
        const output: ContextOutput = {
          success: false,
          projection: { facts: [], totalFacts: 0, filteredOut: 0 },
          error:
            "Identity is v1 format. Please migrate to v2 for task-aware projection.",
        };
        return {
          content: [{ type: "text", text: `Error: ${output.error}` }],
          structuredContent: output,
        };
      }
    } catch {
      // Fall through to projection which will handle missing/corrupt file
    }
  }

  // Run projection
  const projection = await projectIdentity({
    task,
    maxFacts,
    minConfidence,
  });

  // Format human-readable output
  let text: string;

  if (projection.facts.length === 0) {
    text = "No relevant identity facts found.";
    if (task) {
      text += ` (Task: "${task}")`;
    }
  } else {
    const taskInfo = task ? ` for task: "${task}"` : "";
    const lines = [
      `Identity projection${taskInfo}:`,
      `(${projection.facts.length} of ${projection.totalFacts} facts, ${projection.filteredOut} filtered)`,
      "",
    ];

    // Group by category
    const byCategory = new Map<string, ProjectedFact[]>();
    for (const fact of projection.facts) {
      const existing = byCategory.get(fact.category) ?? [];
      existing.push(fact);
      byCategory.set(fact.category, existing);
    }

    // Format each category
    for (const [category, facts] of byCategory) {
      lines.push(`**${category.charAt(0).toUpperCase() + category.slice(1)}:**`);
      for (const fact of facts) {
        const conf = `[${(fact.effectiveConfidence * 100).toFixed(0)}%]`;
        const maturity =
          fact.maturity === "proven"
            ? "✓"
            : fact.maturity === "established"
            ? "•"
            : "○";
        lines.push(`  ${maturity} ${fact.content} ${conf}`);
      }
      lines.push("");
    }

    text = lines.join("\n");
  }

  // System prompt guidance for natural behavior
  const guidance = projection.facts.length > 0
    ? `Use these facts naturally to personalize your response. ` +
      `Don't explicitly mention "your identity says" or "based on your profile". ` +
      `Instead, weave the knowledge into your response as if you simply know the user. ` +
      `For example, if they're a TypeScript expert, assume familiarity with advanced concepts. ` +
      `Adapt your tone and depth based on their preferences.`
    : undefined;

  const output: ContextOutput = {
    success: true,
    projection,
    guidance,
  };

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

/**
 * Tool definition for MCP registration
 */
export const contextTool = {
  name: "arete_context",
  description: `Get task-aware identity projection for personalized responses.

Unlike arete_get_identity which dumps everything, this tool returns ONLY the facts
relevant to your current task. Facts are ranked by relevance × confidence.

Examples:
- task="debug React hook" → Returns React/TypeScript expertise, not cooking preferences
- task="write documentation" → Prioritizes communication preferences
- No task → Returns top facts by confidence

Confidence decays over time. Proven facts (validated 5+ times) are always included.

Use this at the start of conversations to personalize your responses efficiently.`,
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Current task or question to optimize projection for",
      },
      maxFacts: {
        type: "number",
        description: "Maximum facts to return (default: 10)",
      },
      minConfidence: {
        type: "number",
        description:
          "Minimum effective confidence threshold 0-1 (default: 0.3)",
      },
    },
  },
};
