/**
 * arete_remember - Consolidated Storage Tool
 *
 * Replaces: arete_add_context_event, arete_update_identity, arete_validate_fact
 * Mental model: "Remember this"
 *
 * Key behaviors:
 * - operation="add" (default): Creates new fact, auto-detects category
 * - operation="validate": Strengthens matching fact confidence
 * - operation="remove": Removes fact matching content
 *
 * This is THE tool Claude should call to store user-revealed information.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import {
  loadConfig,
  createIdentityFact,
  getSyncService,
  type IdentityV2,
  type IdentityFact,
  type FactCategory,
} from "@arete/core";
import { findBestMatch } from "./fuzzy-match.js";
import { getEmbeddingService } from "../services/embedding-service.js";

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

export interface RememberInput {
  content: string;
  category?: FactCategory;
  operation?: "add" | "validate" | "remove";
  reasoning?: string;
}

export interface RememberOutput {
  success: boolean;
  operation: "add" | "validate" | "remove";
  fact?: IdentityFact;
  alreadyExists?: boolean;
  validated?: boolean;
  removed?: boolean;
  error?: string;
}

export interface RememberToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: RememberOutput;
}

// --- Category Auto-Detection ---

/**
 * Detect fact category from content patterns
 *
 * Categories:
 * - core: Identity basics (name, role, company)
 * - expertise: Skills and knowledge
 * - preference: Likes, dislikes, preferences
 * - context: Environment, tools, constraints
 * - focus: Current learning/projects
 */
export function detectCategory(content: string): FactCategory {
  const lower = content.toLowerCase();

  // Core identity: "I'm a...", "I work at..."
  if (/\b(i'm a|i am a|i work at|my role|my job|my title|my name)\b/.test(lower)) {
    return "core";
  }

  // Expertise/skills: "I know...", "expert in...", years of experience
  if (/\b(i know|expert in|skilled|years of|proficient|experienced|expertise|specialist)\b/.test(lower)) {
    return "expertise";
  }

  // Preferences: "I prefer...", "I like...", "I hate..."
  if (/\b(i prefer|i like|i love|i hate|i dislike|i always|i never|prefer|favorite)\b/.test(lower)) {
    return "preference";
  }

  // Current focus: "I'm learning...", "I'm building...", "working on..."
  if (/\b(i'm learning|i'm building|working on|studying|researching|currently|project)\b/.test(lower)) {
    return "focus";
  }

  // Context/environment: "I'm based in...", "I use...", constraints
  if (/\b(i'm based|i live|i use|on my|running on|located|timezone|using)\b/.test(lower)) {
    return "context";
  }

  // Default to context (safe fallback)
  return "context";
}

// --- Identity Loading/Saving ---

function isIdentityV2(data: unknown): data is IdentityV2 {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

function loadIdentityV2(): IdentityV2 {
  const identityFile = getIdentityFile();

  if (!existsSync(identityFile)) {
    // Create empty v2 identity
    return createEmptyV2Identity();
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    const parsed = JSON.parse(data);

    if (isIdentityV2(parsed)) {
      return parsed;
    }

    // Not v2, create new
    return createEmptyV2Identity();
  } catch {
    return createEmptyV2Identity();
  }
}

function createEmptyV2Identity(): IdentityV2 {
  return {
    version: "2.0.0",
    deviceId: `device-${Date.now()}`,
    facts: [],
    core: {},
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: true,
      excludedDomains: [],
      autoPromote: true,
      useHaikuClassification: true,
    },
  };
}

function saveIdentity(identity: IdentityV2): void {
  const identityFile = getIdentityFile();
  const dir = dirname(identityFile);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(identityFile, JSON.stringify(identity, null, 2));
}

// --- Validation Logic ---

const CONFIDENCE_INCREMENT = 0.1;
const MAX_CONFIDENCE = 1.0;

function validateFact(fact: IdentityFact): IdentityFact {
  const newConfidence = Math.min(MAX_CONFIDENCE, fact.confidence + CONFIDENCE_INCREMENT);
  const newValidationCount = fact.validationCount + 1;

  // Determine new maturity
  let newMaturity = fact.maturity;
  if (newValidationCount >= 5) {
    newMaturity = "proven";
  } else if (newValidationCount >= 2) {
    newMaturity = "established";
  }

  return {
    ...fact,
    confidence: newConfidence,
    validationCount: newValidationCount,
    maturity: newMaturity,
    lastValidated: new Date().toISOString(),
  };
}

// --- Main Handler ---

export async function rememberHandler(
  input: RememberInput
): Promise<RememberToolResult> {
  const { content, category, operation = "add", reasoning } = input;

  if (!content || content.trim().length === 0) {
    return {
      content: [{ type: "text", text: "Error: Content is required" }],
      structuredContent: {
        success: false,
        operation,
        error: "Content is required",
      },
    };
  }

  const identity = loadIdentityV2();
  const effectiveCategory = category || detectCategory(content);

  switch (operation) {
    case "add":
      return handleAdd(identity, content, effectiveCategory, reasoning);
    case "validate":
      return handleValidate(identity, content);
    case "remove":
      return handleRemove(identity, content);
    default:
      return {
        content: [{ type: "text", text: `Error: Invalid operation: ${operation}` }],
        structuredContent: {
          success: false,
          operation: "add",
          error: `Invalid operation: ${operation}`,
        },
      };
  }
}

async function handleAdd(
  identity: IdentityV2,
  content: string,
  category: FactCategory,
  reasoning?: string
): Promise<RememberToolResult> {
  // Check for existing fact with same content (case-insensitive)
  const existingFact = identity.facts.find(
    f => f.content.toLowerCase() === content.toLowerCase()
  );

  if (existingFact) {
    return {
      content: [{ type: "text", text: "Already remembered." }],
      structuredContent: {
        success: true,
        operation: "add",
        fact: existingFact,
        alreadyExists: true,
      },
    };
  }

  // Create new fact
  const newFact = createIdentityFact({
    category,
    content: content.trim(),
    source: "manual",
    confidence: 0.8,
  });

  identity.facts.push(newFact);

  // Save locally
  try {
    saveIdentity(identity);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error saving: ${err}` }],
      structuredContent: {
        success: false,
        operation: "add",
        error: `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
    };
  }

  // Pre-generate embedding (async, best effort)
  const config = loadConfig();
  const embeddingService = getEmbeddingService(config?.openaiKey);
  if (embeddingService.isAvailable()) {
    embeddingService.getEmbedding(newFact.content, newFact.id).catch(err => {
      console.error("Embedding pre-generation failed:", err);
    });
  }

  // Queue background sync (non-blocking)
  getSyncService()?.queueSync("identity");

  return {
    content: [{ type: "text", text: `Remembered: ${content}` }],
    structuredContent: {
      success: true,
      operation: "add",
      fact: newFact,
    },
  };
}

async function handleValidate(
  identity: IdentityV2,
  content: string
): Promise<RememberToolResult> {
  // Find matching fact using fuzzy matching
  const match = findBestMatch(
    content,
    identity.facts,
    f => f.content,
    0.7 // Threshold for validation (not too strict, not too loose)
  );

  if (!match) {
    return {
      content: [{ type: "text", text: "No matching fact found to validate." }],
      structuredContent: {
        success: false,
        operation: "validate",
        error: "No matching fact found",
      },
    };
  }

  // Validate the fact
  const factIndex = identity.facts.findIndex(f => f.id === match.item.id);
  const validatedFact = validateFact(match.item);
  identity.facts[factIndex] = validatedFact;

  // Save locally
  try {
    saveIdentity(identity);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error saving: ${err}` }],
      structuredContent: {
        success: false,
        operation: "validate",
        error: `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
    };
  }

  // Queue background sync (non-blocking)
  getSyncService()?.queueSync("identity");

  return {
    content: [{ type: "text", text: `Validated: ${validatedFact.content}` }],
    structuredContent: {
      success: true,
      operation: "validate",
      fact: validatedFact,
      validated: true,
    },
  };
}

async function handleRemove(
  identity: IdentityV2,
  content: string
): Promise<RememberToolResult> {
  // Find matching fact using fuzzy matching
  const match = findBestMatch(
    content,
    identity.facts,
    f => f.content,
    0.7 // Threshold for removal (not too strict, not too loose)
  );

  if (!match) {
    return {
      content: [{ type: "text", text: "No matching fact found to remove." }],
      structuredContent: {
        success: false,
        operation: "remove",
        error: "No matching fact found",
      },
    };
  }

  // Remove the fact
  const removedFact = match.item;
  identity.facts = identity.facts.filter(f => f.id !== removedFact.id);

  // Save locally
  try {
    saveIdentity(identity);
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error saving: ${err}` }],
      structuredContent: {
        success: false,
        operation: "remove",
        error: `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
    };
  }

  // Invalidate embedding cache
  const config = loadConfig();
  const embeddingService = getEmbeddingService(config?.openaiKey);
  if (embeddingService.isAvailable()) {
    embeddingService.invalidate(removedFact.id);
  }

  // Queue background sync (non-blocking)
  getSyncService()?.queueSync("identity");

  return {
    content: [{ type: "text", text: `Removed: ${removedFact.content}` }],
    structuredContent: {
      success: true,
      operation: "remove",
      fact: removedFact,
      removed: true,
    },
  };
}

// --- Tool Definition ---

export const rememberTool = {
  name: "arete_remember",
  description: `Store facts the user reveals. ONE tool for all storage.

**Usage:**
- content: What to remember (required)
- category: Auto-detected if omitted (core, expertise, preference, context, focus)
- operation: "add" (default), "validate", or "remove"

**Auto-detection examples:**
- "I'm a software engineer" → core
- "Expert in React" → expertise
- "I prefer dark mode" → preference
- "Based in SF" → context
- "Learning Rust" → focus

**Operations:**
- add: Creates new fact (prevents duplicates)
- validate: Strengthens existing fact's confidence (fuzzy matching)
- remove: Deletes matching fact (fuzzy matching)

Call this AFTER your response whenever the user reveals something durable.`,
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "What to remember (required)",
      },
      category: {
        type: "string",
        enum: ["core", "expertise", "preference", "context", "focus"],
        description: "Fact category (auto-detected if omitted)",
      },
      operation: {
        type: "string",
        enum: ["add", "validate", "remove"],
        description: "Operation: add (default), validate, or remove",
      },
      reasoning: {
        type: "string",
        description: "Why this is being stored (for audit trail)",
      },
    },
    required: ["content"],
  },
};
