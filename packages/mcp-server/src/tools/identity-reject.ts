/**
 * arete_reject_fact MCP tool
 *
 * Blocks a fact from being suggested again.
 * Optionally removes candidate facts from identity.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import {
  type IdentityV2,
  type IdentityFact,
} from "@arete/core";

// Configurable directory (for testing)
let CONFIG_DIR = join(homedir(), ".arete");

export function setConfigDir(dir: string): void {
  CONFIG_DIR = dir;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

function getBlockedFile(): string {
  return join(CONFIG_DIR, "blocked.json");
}

function getIdentityFile(): string {
  return join(CONFIG_DIR, "identity.json");
}

// --- Types ---

interface BlockedFact {
  factId: string;
  content?: string;
  reason?: string;
  blockedAt: string;
}

function isIdentityV2(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

// --- Storage ---

/**
 * Load blocked facts from file
 */
export function loadBlocked(): BlockedFact[] {
  const blockedFile = getBlockedFile();
  if (!existsSync(blockedFile)) {
    return [];
  }

  try {
    const data = readFileSync(blockedFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save blocked facts to file
 */
function saveBlocked(blocked: BlockedFact[]): void {
  const blockedFile = getBlockedFile();
  writeFileSync(blockedFile, JSON.stringify(blocked, null, 2));
}

/**
 * Load identity from file
 */
function loadIdentity(): IdentityV2 | null {
  const identityFile = getIdentityFile();
  if (!existsSync(identityFile)) {
    return null;
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    const parsed = JSON.parse(data);
    if (isIdentityV2(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save identity to file
 */
function saveIdentity(identity: IdentityV2): void {
  const identityFile = getIdentityFile();
  writeFileSync(identityFile, JSON.stringify(identity, null, 2));
}

/**
 * Generate a deterministic ID from content
 */
function generateIdFromContent(content: string): string {
  const hash = createHash("sha256").update(content).digest("hex");
  return `blocked-${hash.substring(0, 12)}`;
}

// --- Handler ---

export interface RejectInput {
  factId?: string;
  content?: string;
  reason?: string;
}

export interface RejectOutput {
  success: boolean;
  blocked?: BlockedFact;
  removed?: boolean;
  error?: string;
  guidance?: string;
}

export interface RejectToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: RejectOutput;
}

/**
 * Handler for arete_reject_fact tool
 */
export async function rejectFactHandler(input: RejectInput): Promise<RejectToolResult> {
  const { factId, content, reason } = input;

  // Validate input
  if (!factId && !content) {
    const output: RejectOutput = {
      success: false,
      error: "Either factId or content must be provided",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Determine the factId to use
  const effectiveFactId = factId ?? generateIdFromContent(content!);

  // Load existing blocked list
  const blocked = loadBlocked();

  // Check if already blocked
  const existingIndex = blocked.findIndex((b) => b.factId === effectiveFactId);

  const blockedEntry: BlockedFact = {
    factId: effectiveFactId,
    content,
    reason,
    blockedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    // Update existing entry (e.g., new reason)
    blocked[existingIndex] = blockedEntry;
  } else {
    // Add new entry
    blocked.push(blockedEntry);
  }

  // Save updated blocked list
  saveBlocked(blocked);

  // Try to remove from identity if it's a candidate
  let removed = false;
  let notRemovedReason = "";

  if (factId) {
    const identity = loadIdentity();
    if (identity) {
      const factIndex = identity.facts.findIndex((f) => f.id === factId);

      if (factIndex >= 0) {
        const fact = identity.facts[factIndex];

        // Only remove candidate facts; established/proven facts stay
        if (fact.maturity === "candidate") {
          identity.facts.splice(factIndex, 1);
          saveIdentity(identity);
          removed = true;
        } else {
          notRemovedReason =
            `Fact is ${fact.maturity} (not candidate), so it was not removed from identity. ` +
            `It has been blocked from future inference. ` +
            `Use arete_update_identity to explicitly remove established facts.`;
        }
      }
    }
  }

  // Cloud sync if authenticated (future enhancement)
  // Note: saveBlockedFacts not yet implemented in CLIClient
  // try {
  //   const config = loadConfig();
  //   if (config.apiKey && config.supabaseUrl) {
  //     const client = createCLIClient(config);
  //     await client.saveBlockedFacts?.(blocked);
  //   }
  // } catch {
  //   // Silent failure for cloud sync - local file is source of truth
  // }

  // Build response
  const guidance =
    "This fact will not be suggested again in future inference. " +
    "Acknowledge the user's preference naturally without dwelling on it.";

  let text: string;
  if (content) {
    text = `Blocked: "${content}"`;
  } else {
    text = `Blocked fact ${effectiveFactId}`;
  }

  if (removed) {
    text += " - removed from identity";
  } else if (notRemovedReason) {
    text += ` - ${notRemovedReason}`;
  }

  const output: RejectOutput = {
    success: true,
    blocked: blockedEntry,
    removed,
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
export const rejectTool = {
  name: "arete_reject_fact",
  description: `Block a fact from being suggested in future inference.

Use this when:
- User declines a candidate fact from arete_infer
- User says something like "I don't actually know X" or "I'm not an expert in Y"
- User wants to prevent certain topics from appearing in their identity

For candidate facts (not yet validated), this also removes them from identity.
For established/proven facts, this only blocks future inference.`,
  inputSchema: {
    type: "object",
    properties: {
      factId: {
        type: "string",
        description: "ID of the fact to block",
      },
      content: {
        type: "string",
        description: "Content of the fact (used to generate ID if factId not provided)",
      },
      reason: {
        type: "string",
        description: "Why this fact is being rejected",
      },
    },
  },
};
