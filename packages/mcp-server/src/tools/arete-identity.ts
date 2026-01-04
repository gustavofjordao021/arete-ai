/**
 * arete_identity - Consolidated Identity Tool
 *
 * Replaces: arete_get_identity, arete_context
 * Mental model: "Know me"
 *
 * Key behaviors:
 * - Without task: Returns all facts sorted by effective confidence
 * - With task: Uses semantic scoring to rank facts by relevance
 * - Format: json (default) or prompt
 *
 * This is THE tool Claude should call at conversation start.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  loadConfig,
  DEFAULT_HALF_LIFE_DAYS,
  getSyncService,
  type IdentityV2,
  type IdentityFact,
} from "@arete/core";
import { EmbeddingService, getEmbeddingService } from "../services/embedding-service.js";
import { cosineSimilarity } from "../services/vector-math.js";

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

export interface IdentityInput {
  task?: string;
  maxFacts?: number;
  minConfidence?: number;
  format?: "json" | "prompt";
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

export interface IdentityOutput {
  success: boolean;
  facts: ProjectedFact[];
  totalFacts: number;
  filteredOut: number;
  scoringMethod?: "semantic" | "keyword";
  format?: "json" | "prompt";
  formatted?: string;
  guidance?: string;
  error?: string;
}

export interface IdentityToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: IdentityOutput;
}

// --- Identity Loading ---

function isIdentityV2(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

/**
 * Load identity from local file (~/.arete/identity.json).
 * This is the source of truth for local-first architecture.
 */
function loadLocalIdentity(): IdentityV2 | null {
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

/**
 * Load identity with local-first approach.
 * - Reads from local file instantly (source of truth)
 * - Queues background sync to cloud (non-blocking)
 */
async function loadIdentityV2(): Promise<IdentityV2 | null> {
  // Local-first: read from local file instantly
  const local = loadLocalIdentity();

  // Queue background sync (non-blocking)
  const syncService = getSyncService();
  if (syncService) {
    syncService.queueSync("identity");
  }

  return local;
}

// --- Confidence Decay ---

function daysSince(timestamp: string): number {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}

function getEffectiveConfidence(
  fact: IdentityFact,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): number {
  const days = daysSince(fact.lastValidated);
  return fact.confidence * Math.pow(0.5, days / halfLifeDays);
}

// --- Relevance Scoring ---

function scoreRelevanceKeyword(fact: IdentityFact, task?: string): number {
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

  // Base relevance from keyword matches
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

  return Math.min(1.0, relevance);
}

function scoreRelevanceSemantic(
  factEmbedding: number[],
  taskEmbedding: number[],
  fact: IdentityFact
): number {
  const similarity = cosineSimilarity(factEmbedding, taskEmbedding);
  const baseSimilarity = Math.max(0, similarity);
  const maturityBonus = fact.maturity === "proven" ? 0.1 : 0;
  return Math.min(1.0, baseSimilarity + maturityBonus);
}

function getEmbeddingServiceInstance(): EmbeddingService {
  const config = loadConfig();
  return getEmbeddingService(config?.openaiKey);
}

// --- Format Output ---

function formatAsPrompt(facts: ProjectedFact[]): string {
  if (facts.length === 0) {
    return "No identity facts available.";
  }

  const lines: string[] = ["# User Identity", ""];

  // Group by category
  const byCategory = new Map<string, ProjectedFact[]>();
  for (const fact of facts) {
    const existing = byCategory.get(fact.category) ?? [];
    existing.push(fact);
    byCategory.set(fact.category, existing);
  }

  // Format each category
  for (const [category, categoryFacts] of byCategory) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    for (const fact of categoryFacts) {
      lines.push(`- ${fact.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- Main Handler ---

export async function identityHandler(
  input: IdentityInput
): Promise<IdentityToolResult> {
  const { task, maxFacts = 10, minConfidence = 0.3, format = "json" } = input;

  const identity = await loadIdentityV2();

  if (!identity) {
    const output: IdentityOutput = {
      success: true,
      facts: [],
      totalFacts: 0,
      filteredOut: 0,
      format,
      guidance: "No identity configured yet. As you learn about the user, use arete_remember to store facts.",
    };
    return {
      content: [{ type: "text", text: "No identity configured yet." }],
      structuredContent: output,
    };
  }

  const allFacts = identity.facts;
  const halfLifeDays = identity.settings?.decayHalfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;

  // Initialize embedding service for semantic scoring
  const service = getEmbeddingServiceInstance();
  const useSemanticScoring = service.isAvailable() && !!task;

  // Prepare embeddings if using semantic scoring
  let taskEmbedding: number[] | null = null;
  let factEmbeddings = new Map<string, number[]>();
  let scoringMethod: "semantic" | "keyword" = "keyword";

  if (useSemanticScoring && task) {
    taskEmbedding = await service.getEmbedding(task);

    if (taskEmbedding) {
      factEmbeddings = await service.getEmbeddings(
        allFacts.map((f) => ({ text: f.content, factId: f.id }))
      );
      scoringMethod = "semantic";
    }
  }

  // Calculate scores for all facts
  const withScores = allFacts.map((fact) => {
    const effectiveConfidence = getEffectiveConfidence(fact, halfLifeDays);

    let relevanceScore: number;
    if (scoringMethod === "semantic" && taskEmbedding) {
      const factEmbedding = factEmbeddings.get(fact.id);
      if (factEmbedding) {
        relevanceScore = scoreRelevanceSemantic(factEmbedding, taskEmbedding, fact);
      } else {
        relevanceScore = scoreRelevanceKeyword(fact, task);
      }
    } else {
      relevanceScore = scoreRelevanceKeyword(fact, task);
    }

    return {
      ...fact,
      effectiveConfidence,
      relevanceScore,
      combinedScore: relevanceScore * effectiveConfidence,
    };
  });

  // Filter by minimum confidence (but always include proven facts)
  const activeFacts = withScores.filter(
    (f) => f.effectiveConfidence >= minConfidence || f.maturity === "proven"
  );

  // Sort by combined score (relevance × confidence)
  activeFacts.sort((a, b) => b.combinedScore - a.combinedScore);

  // Take top N
  const projected = activeFacts.slice(0, maxFacts);

  // Map to output format
  const facts: ProjectedFact[] = projected.map((f) => ({
    id: f.id,
    content: f.content,
    category: f.category,
    confidence: f.confidence,
    effectiveConfidence: f.effectiveConfidence,
    maturity: f.maturity,
    relevanceScore: f.relevanceScore,
  }));

  // Format human-readable output
  let text: string;
  if (facts.length === 0) {
    text = "No relevant identity facts found.";
    if (task) {
      text += ` (Task: "${task}")`;
    }
  } else {
    const taskInfo = task ? ` for task: "${task}"` : "";
    const lines = [
      `Identity${taskInfo}:`,
      `(${facts.length} of ${allFacts.length} facts)`,
      "",
    ];

    // Group by category for display
    const byCategory = new Map<string, ProjectedFact[]>();
    for (const fact of facts) {
      const existing = byCategory.get(fact.category) ?? [];
      existing.push(fact);
      byCategory.set(fact.category, existing);
    }

    for (const [category, categoryFacts] of byCategory) {
      lines.push(`**${category.charAt(0).toUpperCase() + category.slice(1)}:**`);
      for (const fact of categoryFacts) {
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

  // Guidance for natural behavior
  const guidance = facts.length > 0
    ? `Use these facts naturally to personalize your response. ` +
      `Don't explicitly mention "your identity says" or "based on your profile". ` +
      `Instead, weave the knowledge into your response as if you simply know the user. ` +
      `Adapt your tone and depth based on their preferences and expertise.`
    : `No identity configured yet. As you learn about the user, use arete_remember to store facts.`;

  const output: IdentityOutput = {
    success: true,
    facts,
    totalFacts: allFacts.length,
    filteredOut: allFacts.length - facts.length,
    scoringMethod: task ? scoringMethod : undefined,
    format,
    formatted: format === "prompt" ? formatAsPrompt(facts) : undefined,
    guidance,
  };

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

// --- Tool Definition ---

export const identityTool = {
  name: "arete_identity",
  description: `Get user identity for personalization. THE tool to call at conversation start.

**Usage:**
- With task: "debug React hook" → Returns relevant facts ranked by semantic similarity
- Without task: Returns all facts sorted by confidence

**Why use this over arete_get_identity?**
- Semantic scoring surfaces conceptually related facts (e.g., "TypeScript" task → "JavaScript expertise")
- Filters irrelevant facts automatically
- Returns only what you need, not a data dump

Call this FIRST in every conversation. Then use arete_remember to store what you learn.`,
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Current task or question to optimize results for (enables semantic scoring)",
      },
      maxFacts: {
        type: "number",
        description: "Maximum facts to return (default: 10)",
      },
      minConfidence: {
        type: "number",
        description: "Minimum effective confidence threshold 0-1 (default: 0.3)",
      },
      format: {
        type: "string",
        enum: ["json", "prompt"],
        description: "Output format: json (default) or prompt (formatted for system prompt)",
      },
    },
  },
};
