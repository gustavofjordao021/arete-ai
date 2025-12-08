/**
 * arete_validate_fact MCP tool
 *
 * Validates an identity fact, boosting its confidence and advancing maturity.
 * This is how facts graduate from candidate → established → proven.
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

/**
 * Local v2 identity check (avoids mocking issues in tests)
 */
function isIdentityV2Local(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

/**
 * Validate a fact (boost confidence + advance maturity)
 * Local implementation to avoid mocking issues in tests
 */
function validateFactLocal(fact: IdentityFact): IdentityFact {
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
  const config = loadConfig() || {};
  if (!config.apiKey || !config.supabaseUrl) {
    return null;
  }
  return createCLIClient({
    supabaseUrl: config.supabaseUrl,
    apiKey: config.apiKey,
  });
}

export interface ValidateFactInput {
  factId?: string;
  content?: string; // Fallback to content match
  reasoning: string;
}

export interface ValidateFactOutput {
  success: boolean;
  previousFact?: IdentityFact;
  updatedFact?: IdentityFact;
  error?: string;
}

export interface ValidateToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ValidateFactOutput;
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

    if (!isIdentityV2Local(parsed)) {
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
 * Find fact by ID or content
 */
function findFact(
  facts: IdentityFact[],
  factId?: string,
  content?: string
): IdentityFact | undefined {
  // First try to find by ID
  if (factId) {
    const byId = facts.find((f) => f.id === factId);
    if (byId) return byId;
  }

  // Fallback to content match
  if (content) {
    return facts.find((f) => f.content === content);
  }

  return undefined;
}

/**
 * Handler for arete_validate_fact tool
 */
export async function validateFactHandler(
  input: ValidateFactInput
): Promise<ValidateToolResult> {
  const { factId, content, reasoning } = input;

  // Load identity
  const identity = loadIdentityV2();

  if (!identity) {
    // Check if it's a v1 identity
    const identityFile = getIdentityFile();
    if (existsSync(identityFile)) {
      try {
        const data = JSON.parse(readFileSync(identityFile, "utf-8"));
        if (data.version !== "2.0.0" || !Array.isArray(data.facts)) {
          const output: ValidateFactOutput = {
            success: false,
            error:
              "Identity is v1 format. Please migrate to v2 to use fact validation. Run identity migration first.",
          };
          return {
            content: [{ type: "text", text: `Error: ${output.error}` }],
            structuredContent: output,
          };
        }
      } catch {
        // Fall through to generic error
      }
    }

    const output: ValidateFactOutput = {
      success: false,
      error: "Failed to load identity file (may be corrupt or missing)",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Find the fact
  const fact = findFact(identity.facts, factId, content);

  if (!fact) {
    const searchTerm = factId || content || "unknown";
    const output: ValidateFactOutput = {
      success: false,
      error: `Fact not found: "${searchTerm}". Make sure the fact exists in the identity.`,
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Store previous state for response
  const previousFact = { ...fact };

  // Validate the fact (boost confidence, advance maturity)
  const updatedFact = validateFactLocal(fact);

  // Update the fact in the identity
  const factIndex = identity.facts.findIndex((f) => f.id === fact.id);
  identity.facts[factIndex] = updatedFact;

  // Save locally
  try {
    saveIdentityV2(identity);
  } catch (err) {
    const output: ValidateFactOutput = {
      success: false,
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
      // Note: We need to convert v2 identity to v1 format for cloud sync
      // For now, we'll sync as-is and let the cloud handle it
      // This will need to be updated when cloud supports v2
      await client.saveIdentity(identity as any);
    } catch (err) {
      // Log but don't fail - local save succeeded
      console.error("Cloud sync failed:", err);
    }
  }

  // Format success message
  const maturityChange =
    previousFact.maturity !== updatedFact.maturity
      ? ` (promoted to ${updatedFact.maturity})`
      : "";

  const output: ValidateFactOutput = {
    success: true,
    previousFact,
    updatedFact,
  };

  const text = `Fact validated: "${fact.content}"${maturityChange}
Confidence: ${previousFact.confidence.toFixed(2)} → ${updatedFact.confidence.toFixed(2)}
Validations: ${previousFact.validationCount} → ${updatedFact.validationCount}
Reason: ${reasoning}`;

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

/**
 * Tool definition for MCP registration
 */
export const validateFactTool = {
  name: "arete_validate_fact",
  description: `Validate an identity fact to boost its confidence and advance its maturity level.

Use this tool when you've confirmed that a fact about the user is accurate.
Facts progress through maturity levels: candidate → established → proven.

Examples:
- User confirms they know TypeScript → validate the TypeScript expertise fact
- User demonstrates a preference → validate the preference fact
- Observed behavior matches a fact → validate to reinforce it

Each validation:
- Increases confidence by 0.2 (max 1.0)
- Increments validation count
- May promote maturity (2 validations → established, 5 → proven)
- Updates lastValidated timestamp

You can find a fact by:
1. factId - exact UUID of the fact
2. content - exact content string to match`,
  inputSchema: {
    type: "object",
    properties: {
      factId: {
        type: "string",
        description: "UUID of the fact to validate",
      },
      content: {
        type: "string",
        description:
          "Exact content of the fact to validate (used if factId not found or not provided)",
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of why this fact is being validated",
      },
    },
    required: ["reasoning"],
  },
};
