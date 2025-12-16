/**
 * arete_accept_candidate MCP tool
 *
 * Accepts a candidate fact from arete_infer results.
 * Preserves inference metadata (confidence, signals, source).
 * Much simpler than manually calling update_identity.
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
import {
  getCandidate,
  getCandidateByContent,
  removeCandidate,
  getAllCandidates,
  type StoredCandidate,
} from "./candidate-registry.js";

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
 * Local v2 identity check
 */
function isIdentityV2(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

/**
 * Get CLI client for cloud operations (if authenticated)
 */
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

export interface AcceptCandidateInput {
  candidateId?: string;
  content?: string;
  reasoning?: string;
}

export interface AcceptCandidateOutput {
  success: boolean;
  fact?: IdentityFact;
  error?: string;
}

export interface AcceptToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: AcceptCandidateOutput;
}

/**
 * Load identity v2 from file
 */
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

/**
 * Save identity v2 to file
 */
function saveIdentityV2(identity: IdentityV2): void {
  const identityFile = getIdentityFile();
  const dir = dirname(identityFile);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(identityFile, JSON.stringify(identity, null, 2));
}

/**
 * Check if fact with same content already exists (case-insensitive)
 */
function factExists(facts: IdentityFact[], content: string): boolean {
  const normalizedContent = content.toLowerCase().trim();
  return facts.some((f) => f.content.toLowerCase().trim() === normalizedContent);
}

/**
 * Create an IdentityFact from a StoredCandidate
 */
function candidateToFact(candidate: StoredCandidate): IdentityFact {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(), // New ID for the fact
    category: candidate.category,
    content: candidate.content,
    confidence: candidate.confidence,
    lastValidated: now,
    validationCount: 0,
    maturity: "candidate",
    source: "inferred",
    sourceRef: candidate.sourceRef,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Handler for arete_accept_candidate tool
 */
export async function acceptCandidateHandler(
  input: AcceptCandidateInput
): Promise<AcceptToolResult> {
  const { candidateId, content, reasoning } = input;

  // Validate input
  if (!candidateId && !content) {
    const output: AcceptCandidateOutput = {
      success: false,
      error: "Must provide candidateId or content to identify the candidate",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Look up candidate
  let candidate: StoredCandidate | undefined;
  if (candidateId) {
    candidate = getCandidate(candidateId);
  }
  if (!candidate && content) {
    candidate = getCandidateByContent(content);
  }

  if (!candidate) {
    const searchTerm = candidateId || content || "unknown";
    const output: AcceptCandidateOutput = {
      success: false,
      error: `Candidate not found: "${searchTerm}". Run arete_infer first to get candidates.`,
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Load identity
  const identity = loadIdentityV2();

  if (!identity) {
    const identityFile = getIdentityFile();
    if (existsSync(identityFile)) {
      const output: AcceptCandidateOutput = {
        success: false,
        error: "Identity is v1 format. Please migrate to v2 to accept inferred candidates.",
      };
      return {
        content: [{ type: "text", text: `Error: ${output.error}` }],
        structuredContent: output,
      };
    }

    const output: AcceptCandidateOutput = {
      success: false,
      error: "No identity file found. Create an identity first.",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Check for duplicates
  if (factExists(identity.facts, candidate.content)) {
    const output: AcceptCandidateOutput = {
      success: false,
      error: `Fact already exists: "${candidate.content}"`,
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Create fact from candidate
  const fact = candidateToFact(candidate);
  identity.facts.push(fact);

  // Save locally
  try {
    saveIdentityV2(identity);
  } catch (err) {
    const output: AcceptCandidateOutput = {
      success: false,
      error: `Failed to save identity: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Remove candidate from registry (it's now a fact)
  removeCandidate(candidate.id);

  // Sync to cloud if authenticated (best effort)
  const client = getCloudClient();
  if (client) {
    try {
      await client.saveIdentity(identity as any);
    } catch (err) {
      console.error("Cloud sync failed:", err);
    }
  }

  const output: AcceptCandidateOutput = {
    success: true,
    fact,
  };

  // Simple confirmation message
  const signals = candidate.signals.length > 0
    ? ` (from ${candidate.signals.slice(0, 2).join(", ")})`
    : "";
  const text = `Remembered: "${fact.content}"${signals}`;

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

/**
 * Tool definition for MCP registration
 */
export const acceptCandidateTool = {
  name: "arete_accept_candidate",
  description: `Accept a candidate fact from arete_infer results.

Much simpler than arete_update_identity - just pass the candidate ID or content.
Preserves inference metadata (confidence, signals, source).

Use this when:
- User approves a candidate from arete_infer
- You want to add an inferred fact without manual parameter mapping

The candidate must have been returned by a recent arete_infer call.`,
  inputSchema: {
    type: "object",
    properties: {
      candidateId: {
        type: "string",
        description: "UUID of the candidate from arete_infer",
      },
      content: {
        type: "string",
        description: "Content of the candidate (used if candidateId not provided)",
      },
      reasoning: {
        type: "string",
        description: "Optional reason for acceptance (defaults to inference signals)",
      },
    },
  },
};

// --- Batch Accept ---

export interface AcceptCandidatesInput {
  candidateIds?: string[];
  all?: boolean;
}

export interface AcceptCandidatesOutput {
  success: boolean;
  accepted: IdentityFact[];
  failed: Array<{ id: string; content: string; error: string }>;
  error?: string;
}

export interface AcceptBatchToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: AcceptCandidatesOutput;
}

/**
 * Handler for arete_accept_candidates tool (batch accept)
 */
export async function acceptCandidatesHandler(
  input: AcceptCandidatesInput
): Promise<AcceptBatchToolResult> {
  const { candidateIds, all } = input;

  // Validate input
  if (!all && (!candidateIds || candidateIds.length === 0)) {
    const output: AcceptCandidatesOutput = {
      success: false,
      accepted: [],
      failed: [],
      error: "Must provide candidateIds array or set all=true",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Get candidates to accept
  let candidatesToAccept: StoredCandidate[];
  if (all) {
    candidatesToAccept = getAllCandidates();
  } else {
    candidatesToAccept = candidateIds!
      .map((id) => getCandidate(id))
      .filter((c): c is StoredCandidate => c !== undefined);
  }

  if (candidatesToAccept.length === 0) {
    const output: AcceptCandidatesOutput = {
      success: false,
      accepted: [],
      failed: [],
      error: "No candidates found to accept. Run arete_infer first.",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Load identity
  const identity = loadIdentityV2();
  if (!identity) {
    const output: AcceptCandidatesOutput = {
      success: false,
      accepted: [],
      failed: [],
      error: "No v2 identity found. Create an identity first.",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  const accepted: IdentityFact[] = [];
  const failed: Array<{ id: string; content: string; error: string }> = [];

  // Process each candidate
  for (const candidate of candidatesToAccept) {
    // Check for duplicates
    if (factExists(identity.facts, candidate.content)) {
      failed.push({
        id: candidate.id,
        content: candidate.content,
        error: "Already exists",
      });
      continue;
    }

    // Create fact from candidate
    const fact = candidateToFact(candidate);
    identity.facts.push(fact);
    accepted.push(fact);

    // Remove from registry
    removeCandidate(candidate.id);
  }

  // Save if any were accepted
  if (accepted.length > 0) {
    try {
      saveIdentityV2(identity);
    } catch (err) {
      const output: AcceptCandidatesOutput = {
        success: false,
        accepted: [],
        failed: [],
        error: `Failed to save identity: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
      return {
        content: [{ type: "text", text: `Error: ${output.error}` }],
        structuredContent: output,
      };
    }

    // Sync to cloud if authenticated (best effort)
    const client = getCloudClient();
    if (client) {
      try {
        await client.saveIdentity(identity as any);
      } catch (err) {
        console.error("Cloud sync failed:", err);
      }
    }
  }

  const output: AcceptCandidatesOutput = {
    success: accepted.length > 0,
    accepted,
    failed,
  };

  // Build response text
  let text: string;
  if (accepted.length === 0) {
    text = "No candidates accepted (all duplicates or errors).";
  } else if (failed.length === 0) {
    const items = accepted.map((f) => f.content).join(", ");
    text = `Remembered ${accepted.length} facts: ${items}`;
  } else {
    const items = accepted.map((f) => f.content).join(", ");
    text = `Remembered ${accepted.length} facts: ${items}. ${failed.length} skipped (duplicates).`;
  }

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}
