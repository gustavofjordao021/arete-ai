/**
 * arete_update_identity MCP tool
 *
 * Updates identity sections (expertise, currentFocus, communication, context, custom).
 * Protected sections (core, meta, privacy) cannot be modified by AI.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import {
  safeParseIdentity,
  createEmptyIdentity,
  type AreteIdentity,
  type IdentityV2,
  type IdentityFact,
  type FactCategory,
  createIdentityFact,
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

// Sections that AI can modify
const WRITABLE_SECTIONS = ["expertise", "currentFocus", "context", "communication", "custom"] as const;
type WritableSection = (typeof WRITABLE_SECTIONS)[number];

// Sections that are protected
const PROTECTED_SECTIONS = ["core", "meta", "privacy", "sources"] as const;

function isWritableSection(section: string): section is WritableSection {
  return WRITABLE_SECTIONS.includes(section as WritableSection);
}

function isProtectedSection(section: string): boolean {
  return PROTECTED_SECTIONS.includes(section as any);
}

/**
 * Check if identity is v2 format
 */
function isIdentityV2(data: unknown): data is IdentityV2 {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
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

export interface UpdateIdentityInput {
  section: string;
  operation: "add" | "set" | "remove";
  field?: string;
  value: unknown;
  reasoning: string;
}

export interface UpdateIdentityOutput {
  success: boolean;
  previousValue?: unknown;
  newValue?: unknown;
  error?: string;
}

export interface UpdateToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: UpdateIdentityOutput;
}

type LoadedIdentity =
  | { version: "v1"; identity: AreteIdentity }
  | { version: "v2"; identity: IdentityV2 };

/**
 * Load identity from file, creating empty one if needed
 */
function loadIdentity(): LoadedIdentity | null {
  const identityFile = getIdentityFile();

  if (!existsSync(identityFile)) {
    return { version: "v1", identity: createEmptyIdentity("mcp-server") };
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    const parsed = JSON.parse(data);

    // Check if v2 format
    if (isIdentityV2(parsed)) {
      return { version: "v2", identity: parsed };
    }

    // Try v1 format
    const v1 = safeParseIdentity(parsed);
    if (v1) {
      return { version: "v1", identity: v1 };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Save identity to file
 */
function saveIdentity(identity: AreteIdentity | IdentityV2): void {
  const identityFile = getIdentityFile();
  const dir = dirname(identityFile);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(identityFile, JSON.stringify(identity, null, 2));
}

/**
 * Map v1 section names to v2 fact categories
 * Valid categories: core, expertise, preference, context, focus
 */
function sectionToCategory(section: string, field?: string): FactCategory {
  if (section === "expertise") return "expertise";
  if (section === "context" && field === "personal") return "context";
  if (section === "context" && field === "professional") return "expertise";
  if (section === "currentFocus") return "focus";
  if (section === "communication") return "preference";
  // Default to context for custom/unknown
  return "context";
}

/**
 * Normalize value to a clean string
 * - Single-element arrays unwrap to the string
 * - Multi-element arrays join with "; "
 * - Strings pass through trimmed
 * - Empty arrays return empty string
 */
function normalizeValueToString(value: unknown): string {
  if (Array.isArray(value)) {
    // Filter to strings and trim
    const strings = value
      .filter((item): item is string => typeof item === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (strings.length === 0) return "";
    if (strings.length === 1) return strings[0];
    return strings.join("; ");
  }

  if (typeof value === "string") {
    return value.trim();
  }

  // Fallback for other types
  return String(value);
}

/**
 * Apply v2 operation - adds/removes facts
 */
function applyV2Operation(
  identity: IdentityV2,
  input: UpdateIdentityInput
): { previousValue: unknown; newValue: unknown } {
  const { section, operation, field, value } = input;
  const category = sectionToCategory(section, field);
  const content = normalizeValueToString(value);

  // Don't add empty facts
  if (!content) {
    return {
      previousValue: identity.facts.map((f) => f.content),
      newValue: identity.facts.map((f) => f.content),
    };
  }

  // Find existing fact with same content
  const existingIndex = identity.facts.findIndex(
    (f) => f.category === category && f.content.toLowerCase() === content.toLowerCase()
  );

  switch (operation) {
    case "add": {
      if (existingIndex >= 0) {
        // Already exists, just return
        return {
          previousValue: identity.facts.map((f) => f.content),
          newValue: identity.facts.map((f) => f.content),
        };
      }

      // Create new fact using helper
      const newFact = createIdentityFact({
        category,
        content,
        source: "manual",
        confidence: 0.8,
      });

      const previousContents = identity.facts.filter((f) => f.category === category).map((f) => f.content);
      identity.facts.push(newFact);
      const newContents = identity.facts.filter((f) => f.category === category).map((f) => f.content);

      return { previousValue: previousContents, newValue: newContents };
    }

    case "remove": {
      if (existingIndex < 0) {
        // Doesn't exist
        return {
          previousValue: identity.facts.map((f) => f.content),
          newValue: identity.facts.map((f) => f.content),
        };
      }

      const previousContents = identity.facts.filter((f) => f.category === category).map((f) => f.content);
      identity.facts.splice(existingIndex, 1);
      const newContents = identity.facts.filter((f) => f.category === category).map((f) => f.content);

      return { previousValue: previousContents, newValue: newContents };
    }

    case "set": {
      // For set, remove all facts of this category and add new one
      const previousContents = identity.facts.filter((f) => f.category === category).map((f) => f.content);
      identity.facts = identity.facts.filter((f) => f.category !== category);

      const newFact = createIdentityFact({
        category,
        content,
        source: "manual",
        confidence: 0.8,
      });
      identity.facts.push(newFact);

      return { previousValue: previousContents, newValue: [content] };
    }

    default:
      return { previousValue: [], newValue: [] };
  }
}

/**
 * Get value at a path in the identity
 */
function getValueAtPath(identity: AreteIdentity, section: string, field?: string): unknown {
  const sectionValue = (identity as any)[section];
  if (!field) {
    return sectionValue;
  }
  return sectionValue?.[field];
}

/**
 * Set value at a path in the identity
 */
function setValueAtPath(
  identity: AreteIdentity,
  section: string,
  field: string | undefined,
  value: unknown
): void {
  if (!field) {
    (identity as any)[section] = value;
  } else {
    if (!(identity as any)[section]) {
      (identity as any)[section] = {};
    }
    (identity as any)[section][field] = value;
  }
}

/**
 * Parse value if it's a JSON string (Claude sometimes passes arrays as strings)
 */
function parseValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Try to parse if it looks like JSON array or object
    const trimmed = value.trim();
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // Not valid JSON, return as-is
        return value;
      }
    }
  }
  return value;
}

/**
 * Apply an operation to modify identity
 */
function applyOperation(
  identity: AreteIdentity,
  input: UpdateIdentityInput
): { previousValue: unknown; newValue: unknown } {
  const { section, operation, field } = input;
  // Parse value in case Claude passed a stringified JSON
  const value = parseValue(input.value);

  const previousValue = getValueAtPath(identity, section, field);

  switch (operation) {
    case "add": {
      // Add to array
      const current = getValueAtPath(identity, section, field);
      if (Array.isArray(current)) {
        // Don't add duplicates
        if (!current.includes(value)) {
          const newArray = [...current, value];
          setValueAtPath(identity, section, field, newArray);
          return { previousValue: current, newValue: newArray };
        }
        return { previousValue: current, newValue: current };
      } else if (current === undefined || current === null) {
        // Initialize as array with the value
        const newArray = [value];
        setValueAtPath(identity, section, field, newArray);
        return { previousValue: current, newValue: newArray };
      }
      // Not an array, just set
      setValueAtPath(identity, section, field, value);
      return { previousValue: current, newValue: value };
    }

    case "set": {
      setValueAtPath(identity, section, field, value);
      return { previousValue, newValue: value };
    }

    case "remove": {
      const current = getValueAtPath(identity, section, field);
      if (Array.isArray(current)) {
        const newArray = current.filter((item) => item !== value);
        setValueAtPath(identity, section, field, newArray);
        return { previousValue: current, newValue: newArray };
      }
      // Can't remove from non-array
      return { previousValue: current, newValue: current };
    }

    default:
      return { previousValue, newValue: previousValue };
  }
}

/**
 * Handler for arete_update_identity tool
 */
export async function updateIdentityHandler(
  input: UpdateIdentityInput
): Promise<UpdateToolResult> {
  const { section, operation, field, value, reasoning } = input;

  // Check if section is protected
  if (isProtectedSection(section)) {
    const output: UpdateIdentityOutput = {
      success: false,
      error: `Section '${section}' is protected and cannot be modified by AI`,
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Check if section is writable
  if (!isWritableSection(section)) {
    const output: UpdateIdentityOutput = {
      success: false,
      error: `Section '${section}' is not a valid writable section. Valid sections: ${WRITABLE_SECTIONS.join(", ")}`,
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Load identity
  const loaded = loadIdentity();
  if (!loaded) {
    const output: UpdateIdentityOutput = {
      success: false,
      error: "Failed to load identity file (may be corrupt)",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  let previousValue: unknown;
  let newValue: unknown;

  if (loaded.version === "v2") {
    // V2 identity: add/remove facts
    const result = applyV2Operation(loaded.identity, input);
    previousValue = result.previousValue;
    newValue = result.newValue;

    // Save locally
    try {
      saveIdentity(loaded.identity);
    } catch (err) {
      const output: UpdateIdentityOutput = {
        success: false,
        error: `Failed to save identity: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
      return {
        content: [{ type: "text", text: `Error: ${output.error}` }],
        structuredContent: output,
      };
    }

    // Sync v2 identity to cloud if authenticated (best effort)
    const client = getCloudClient();
    if (client) {
      try {
        await client.saveIdentity(loaded.identity);
      } catch (err) {
        // Log but don't fail - local save succeeded
        console.error("Cloud sync failed:", err);
      }
    }
  } else {
    // V1 identity: use legacy operation
    const result = applyOperation(loaded.identity, input);
    previousValue = result.previousValue;
    newValue = result.newValue;

    // Update lastModified
    loaded.identity.meta.lastModified = new Date().toISOString();

    // Save locally
    try {
      saveIdentity(loaded.identity);
    } catch (err) {
      const output: UpdateIdentityOutput = {
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
        await client.saveIdentity(loaded.identity);
      } catch (err) {
        // Log but don't fail - local save succeeded
        console.error("Cloud sync failed:", err);
      }
    }
  }

  const output: UpdateIdentityOutput = {
    success: true,
    previousValue,
    newValue,
  };

  // Minimal, conversational output
  const text = operation === "remove" ? "Removed." : "Remembered.";

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}
