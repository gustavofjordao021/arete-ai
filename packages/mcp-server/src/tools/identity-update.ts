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

/**
 * Load identity from file, creating empty one if needed
 */
function loadIdentity(): AreteIdentity | null {
  const identityFile = getIdentityFile();

  if (!existsSync(identityFile)) {
    return createEmptyIdentity("mcp-server");
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    return safeParseIdentity(JSON.parse(data));
  } catch {
    return null;
  }
}

/**
 * Save identity to file
 */
function saveIdentity(identity: AreteIdentity): void {
  const identityFile = getIdentityFile();
  const dir = dirname(identityFile);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(identityFile, JSON.stringify(identity, null, 2));
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
  const identity = loadIdentity();
  if (!identity) {
    const output: UpdateIdentityOutput = {
      success: false,
      error: "Failed to load identity file (may be corrupt)",
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  // Apply the operation
  const { previousValue, newValue } = applyOperation(identity, input);

  // Update lastModified
  identity.meta.lastModified = new Date().toISOString();

  // Save locally
  try {
    saveIdentity(identity);
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
      await client.saveIdentity(identity);
    } catch (err) {
      // Log but don't fail - local save succeeded
      console.error("Cloud sync failed:", err);
    }
  }

  // Format success message
  const fieldPath = field ? `${section}.${field}` : section;
  const operationDesc =
    operation === "add"
      ? `Added "${value}" to`
      : operation === "remove"
        ? `Removed "${value}" from`
        : `Set`;

  const output: UpdateIdentityOutput = {
    success: true,
    previousValue,
    newValue,
  };

  const text = `${operationDesc} ${fieldPath}\nReason: ${reasoning}`;

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}
