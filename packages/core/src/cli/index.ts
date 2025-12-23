#!/usr/bin/env node
/**
 * Arete CLI - Identity and context management
 *
 * Usage:
 *   arete auth login                      Login with API key
 *   arete auth logout                     Clear credentials
 *   arete auth whoami                     Show current user
 *
 *   arete identity get                    Show current identity
 *   arete identity set "prose..."         Extract and store identity from prose
 *   arete identity transform --model X    Output system prompt for model
 *   arete identity clear                  Clear stored identity
 *   arete identity archive                Archive expired facts
 *
 *   arete context list                    Show recent context events
 *   arete context list --type page_visit  Filter by type
 *   arete context list --limit 5          Limit results
 *   arete context clear                   Clear all context
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  createEmptyIdentity,
  safeParseIdentity,
  createClaudeTransform,
  createOpenAITransform,
  type AreteIdentity,
} from "../index.js";
import {
  exportToOpenIdentity,
  importFromOpenIdentity,
  importFromChatGPT,
  type Visibility,
} from "../interchange/index.js";
import { type IdentityV2 } from "../schema/identity-v2.js";
import {
  listContextEvents,
  clearContextStore,
  formatContextList,
  importFromExtension,
  type ListContextOptions,
} from "./context.js";
import {
  cmdAuthLogin,
  cmdAuthLogout,
  cmdAuthWhoami,
  cmdAuthStatus,
  cmdAuthSignup,
  cmdAuthHelp,
} from "./auth.js";
import {
  loadConfig,
  createCLIClient,
  type CLIClient,
} from "../supabase/cli-client.js";
import {
  runArchiveCleanup,
  setConfigDir,
  getArchiveDir,
  loadIdentityV2,
  saveIdentityV2,
} from "../archive/index.js";

// Storage location
const CONFIG_DIR = join(homedir(), ".arete");
const IDENTITY_FILE = join(CONFIG_DIR, "identity.json");

/**
 * Check if user is authenticated with cloud
 */
function isAuthenticated(): boolean {
  const config = loadConfig();
  return !!(config.apiKey && config.supabaseUrl);
}

/**
 * Get CLI client for cloud operations
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

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadIdentity(): AreteIdentity {
  ensureConfigDir();
  if (!existsSync(IDENTITY_FILE)) {
    return createEmptyIdentity("cli");
  }
  try {
    const data = readFileSync(IDENTITY_FILE, "utf-8");
    const parsed = safeParseIdentity(JSON.parse(data));
    if (parsed) {
      return parsed;
    }
    console.error("Invalid identity file, creating new one");
    return createEmptyIdentity("cli");
  } catch {
    return createEmptyIdentity("cli");
  }
}

function saveIdentity(identity: AreteIdentity): void {
  ensureConfigDir();
  writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2));
}

function formatIdentity(identity: AreteIdentity): string {
  const lines: string[] = [];

  if (identity.core.name) lines.push(`Name: ${identity.core.name}`);
  if (identity.core.role) lines.push(`Role: ${identity.core.role}`);
  if (identity.core.location) lines.push(`Location: ${identity.core.location}`);
  if (identity.core.background) lines.push(`Background: ${identity.core.background}`);
  if (identity.expertise.length > 0) lines.push(`Expertise: ${identity.expertise.join(", ")}`);
  if (identity.communication.style.length > 0) {
    lines.push(`Style: ${identity.communication.style.join(", ")}`);
  }
  if (identity.communication.avoid.length > 0) {
    lines.push(`Avoid: ${identity.communication.avoid.join(", ")}`);
  }
  if (identity.currentFocus.projects.length > 0) {
    lines.push(`Projects: ${identity.currentFocus.projects.map((p) => p.name).join(", ")}`);
  }
  if (identity.currentFocus.goals.length > 0) {
    lines.push(`Goals: ${identity.currentFocus.goals.join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : "No identity configured.";
}

// Commands
async function cmdGet(): Promise<void> {
  const client = getCloudClient();

  if (client) {
    // Try cloud first
    try {
      console.log("(synced from cloud)");
      const identity = await client.getIdentity();
      if (identity) {
        console.log(formatIdentity(identity));
        // Also cache locally
        saveIdentity(identity);
      } else {
        console.log("No identity configured in cloud.");
      }
      return;
    } catch (err) {
      console.warn(`Cloud sync failed: ${(err as Error).message}`);
      console.log("Falling back to local...\n");
    }
  }

  // Fallback to local
  const identity = loadIdentity();
  console.log(formatIdentity(identity));
}

async function cmdSet(prose: string): Promise<void> {
  if (!prose) {
    console.error("Usage: arete identity set \"your description here\"");
    process.exit(1);
  }

  // For now, do a simple manual extraction (LLM extraction requires API key)
  // In production, this would call the LLM
  console.log("Note: Full LLM extraction requires API key. Storing prose as background.");

  const identity = loadIdentity();
  identity.core.background = prose;
  identity.meta.lastModified = new Date().toISOString();
  saveIdentity(identity);

  // Sync to cloud if authenticated
  const client = getCloudClient();
  if (client) {
    try {
      await client.saveIdentity(identity);
      console.log("(synced to cloud)");
    } catch (err) {
      console.warn(`Cloud sync failed: ${(err as Error).message}`);
    }
  }

  console.log("\nIdentity updated:");
  console.log(formatIdentity(identity));
}

async function cmdTransform(model: string): Promise<void> {
  // Get identity from cloud if authenticated
  let identity: AreteIdentity;
  const client = getCloudClient();

  if (client) {
    try {
      const cloudIdentity = await client.getIdentity();
      identity = cloudIdentity || loadIdentity();
    } catch {
      identity = loadIdentity();
    }
  } else {
    identity = loadIdentity();
  }

  let result: string;
  if (model === "claude" || model === "anthropic") {
    const transform = createClaudeTransform();
    result = transform.transform(identity).content;
  } else if (model === "openai" || model === "gpt") {
    const transform = createOpenAITransform();
    result = transform.transform(identity).content;
  } else {
    console.error(`Unknown model: ${model}. Use 'claude' or 'openai'.`);
    process.exit(1);
  }

  console.log(result);
}

async function cmdClear(): Promise<void> {
  const identity = createEmptyIdentity("cli");
  saveIdentity(identity);

  // Also clear in cloud if authenticated
  const client = getCloudClient();
  if (client) {
    try {
      await client.saveIdentity(identity);
      console.log("Identity cleared (local + cloud).");
    } catch (err) {
      console.warn(`Cloud sync failed: ${(err as Error).message}`);
      console.log("Identity cleared (local only).");
    }
  } else {
    console.log("Identity cleared.");
  }
}

// Context commands
async function cmdContextList(options: ListContextOptions): Promise<void> {
  const client = getCloudClient();

  if (client) {
    // Try cloud first
    try {
      console.log("(from cloud)");
      const events = await client.getRecentContext({
        type: options.type as "page_visit" | "selection" | "conversation" | "insight" | "file" | undefined,
        source: options.source,
        limit: options.limit,
      });

      if (events.length === 0) {
        console.log("No context events found.");
        return;
      }

      // Format events for display
      for (const event of events) {
        const date = new Date(event.timestamp).toLocaleString();
        const data = event.data as Record<string, unknown>;
        let summary = "";

        if (event.type === "page_visit") {
          summary = `${data.title || data.url}`;
        } else if (event.type === "insight") {
          summary = `${data.fact || data.insight}`;
        } else if (event.type === "conversation") {
          summary = `${data.content?.toString().slice(0, 50)}...`;
        } else {
          summary = JSON.stringify(data).slice(0, 50);
        }

        console.log(`[${date}] ${event.type} (${event.source}): ${summary}`);
      }
      return;
    } catch (err) {
      console.warn(`Cloud fetch failed: ${(err as Error).message}`);
      console.log("Falling back to local...\n");
    }
  }

  // Fallback to local
  const events = listContextEvents(options);
  console.log(formatContextList(events));
}

async function cmdContextClear(): Promise<void> {
  clearContextStore();

  // Also clear in cloud if authenticated
  const client = getCloudClient();
  if (client) {
    try {
      await client.clearContext();
      console.log("Context cleared (local + cloud).");
    } catch (err) {
      console.warn(`Cloud clear failed: ${(err as Error).message}`);
      console.log("Context cleared (local only).");
    }
  } else {
    console.log("Context cleared.");
  }
}

async function cmdContextImport(filePath: string): Promise<void> {
  if (!filePath) {
    console.error("Usage: arete context import <path-to-export.json>");
    process.exit(1);
  }

  const result = await importFromExtension(filePath);

  if (result.errors.length > 0) {
    console.error("Errors:");
    result.errors.forEach((e) => console.error(`  - ${e}`));
  }

  console.log(`\nImported: ${result.imported} events`);
  if (result.skipped > 0) {
    console.log(`Skipped: ${result.skipped} duplicates`);
  }
}

function cmdContextHelp(): void {
  console.log(`
Context Commands:
  arete context list                    Show recent context events
  arete context list --type TYPE        Filter by type (page_visit, selection, insight, etc.)
  arete context list --source SOURCE    Filter by source (chrome, cli, claude-desktop)
  arete context list --limit N          Limit results (default: all)
  arete context clear                   Clear all context events
  arete context import <file>           Import from Chrome extension export

Examples:
  arete context list --type page_visit --limit 10
  arete context list --source chrome
  arete context import ~/Downloads/arete-export.json
`);
}

function cmdHelp(): void {
  console.log(`
Arete CLI - Portable AI Identity & Context

Authentication:
  arete auth login                      Login with API key (for cloud sync)
  arete auth logout                     Clear stored credentials
  arete auth whoami                     Show current user
  arete auth status                     Show authentication status

Identity:
  arete identity get                    Show current identity
  arete identity set "prose..."         Store identity from prose
  arete identity transform --model X    Output system prompt (claude|openai)
  arete identity clear                  Clear stored identity
  arete identity json                   Output raw JSON
  arete identity archive                Archive expired facts (confidence < 0.1)
  arete identity export --format oi     Export to OpenIdentity format
  arete identity import <file.oi>       Import from OpenIdentity file
  arete identity import-chatgpt "..."   Import from ChatGPT instructions

Context:
  arete context list                    Show recent context events
  arete context list --type TYPE        Filter by type
  arete context list --limit N          Limit results
  arete context clear                   Clear all context
  arete context import <file>           Import from Chrome extension

Export Options:
  --format oi                           OpenIdentity format (default)
  --visibility public|trusted|local     Filter by privacy tier (default: trusted)

Examples:
  arete auth login
  arete identity set "I'm a PM at fintech, prefer concise responses"
  arete identity transform --model claude
  arete identity export --format oi --visibility public > public.oi
  arete identity import ./backup.oi
  arete context list --type page_visit --limit 5
`);
}

function cmdJson(): void {
  const identity = loadIdentity();
  console.log(JSON.stringify(identity, null, 2));
}

/**
 * Archive expired facts (effective confidence < 0.1)
 */
async function cmdArchive(threshold?: number): Promise<void> {
  // Ensure archive module uses the same config dir
  setConfigDir(CONFIG_DIR);

  console.log("Scanning for expired facts...");
  const result = await runArchiveCleanup(threshold);

  if (result.archivedCount === 0) {
    console.log("No expired facts found.");
    console.log(`Total facts: ${result.remainingCount}`);
    return;
  }

  console.log(`\nArchived ${result.archivedCount} expired fact(s).`);
  console.log(`Remaining facts: ${result.remainingCount}`);
  if (result.archivePath) {
    console.log(`Archive file: ${result.archivePath}`);
  }
  console.log(`\nArchive directory: ${getArchiveDir()}`);
}

/**
 * Export identity to OpenIdentity format
 */
async function cmdExport(format: string, visibility?: Visibility): Promise<void> {
  if (format !== "oi" && format !== "openidentity") {
    console.error(`Unknown format: ${format}. Use 'oi' or 'openidentity'.`);
    process.exit(1);
  }

  // Ensure we use the right config dir for loading
  setConfigDir(CONFIG_DIR);

  // Load identity from local storage (v2 format)
  const identityV2 = loadIdentityV2();

  if (!identityV2 || identityV2.facts.length === 0) {
    console.error("No identity facts to export.");
    console.error("Use 'arete identity set' or the MCP server to add facts first.");
    process.exit(1);
  }

  const exported = exportToOpenIdentity(identityV2, {
    visibility: visibility ?? "trusted",
  });

  console.log(JSON.stringify(exported, null, 2));
}

/**
 * Import identity from OpenIdentity file
 */
async function cmdImportOI(filePath: string): Promise<void> {
  if (!filePath) {
    console.error("Usage: arete identity import <file.oi>");
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let data: unknown;
  try {
    const content = readFileSync(filePath, "utf-8");
    data = JSON.parse(content);
  } catch (err) {
    console.error(`Failed to parse file: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = importFromOpenIdentity(data);

  if (!result.success || !result.identity) {
    console.error(`Import failed: ${result.error ?? "Unknown error"}`);
    process.exit(1);
  }

  const importedIdentity = result.identity;

  // Ensure we use the right config dir
  setConfigDir(CONFIG_DIR);

  // Merge with existing identity or create new
  let existing = loadIdentityV2();
  if (!existing) {
    existing = importedIdentity;
  } else {
    // Merge facts (avoid duplicates by content)
    const existingContents = new Set(existing.facts.map((f) => f.content));
    const newFacts = importedIdentity.facts.filter(
      (f) => !existingContents.has(f.content)
    );
    existing.facts.push(...newFacts);

    // Merge core if empty
    if (!existing.core.name && importedIdentity.core.name) {
      existing.core.name = importedIdentity.core.name;
    }
    if (!existing.core.role && importedIdentity.core.role) {
      existing.core.role = importedIdentity.core.role;
    }
  }

  saveIdentityV2(existing);

  console.log(`Imported ${importedIdentity.facts.length} fact(s) from OpenIdentity file.`);
  if (importedIdentity.core.name || importedIdentity.core.role) {
    console.log(`Core: ${importedIdentity.core.name || ""} ${importedIdentity.core.role ? `(${importedIdentity.core.role})` : ""}`);
  }
}

/**
 * Import identity from ChatGPT custom instructions
 */
async function cmdImportChatGPT(instructions: string): Promise<void> {
  if (!instructions) {
    console.error('Usage: arete identity import-chatgpt "your custom instructions"');
    console.error("       arete identity import-chatgpt --file ~/instructions.txt");
    process.exit(1);
  }

  // Note: Full LLM extraction requires an API key and provider
  // For CLI, we output a message about needing LLM integration
  console.error("Note: ChatGPT import requires LLM extraction.");
  console.error("This feature is available via the Chrome extension or MCP server.");
  console.error("\nTo use via MCP, the arete_remember tool can process instructions.");
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

// Auth commands
if (command === "auth") {
  switch (subcommand) {
    case "signup":
      cmdAuthSignup(args[2], args[3]).catch((e) => {
        console.error("Signup failed:", e.message);
        process.exit(1);
      });
      break;
    case "login":
      cmdAuthLogin(args[2]).catch((e) => {
        console.error("Login failed:", e.message);
        process.exit(1);
      });
      break;
    case "logout":
      cmdAuthLogout();
      break;
    case "whoami":
      cmdAuthWhoami().catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    case "status":
      cmdAuthStatus();
      break;
    default:
      cmdAuthHelp();
  }
} else if (command === "identity" || command === "id") {
  switch (subcommand) {
    case "get":
      cmdGet().catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    case "set":
      cmdSet(args.slice(2).join(" ")).catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    case "transform": {
      const modelIdx = args.indexOf("--model");
      const model = modelIdx !== -1 ? args[modelIdx + 1] : "claude";
      cmdTransform(model).catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    }
    case "clear":
      cmdClear().catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    case "json":
      cmdJson();
      break;
    case "archive": {
      const thresholdIdx = args.indexOf("--threshold");
      const threshold = thresholdIdx !== -1 ? parseFloat(args[thresholdIdx + 1]) : undefined;
      cmdArchive(threshold).catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    }
    case "export": {
      const formatIdx = args.indexOf("--format");
      const format = formatIdx !== -1 ? args[formatIdx + 1] : "oi";
      const visIdx = args.indexOf("--visibility");
      const visibility = visIdx !== -1 ? (args[visIdx + 1] as Visibility) : undefined;
      cmdExport(format, visibility).catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    }
    case "import":
      cmdImportOI(args[2]).catch((e) => {
        console.error("Import failed:", e.message);
        process.exit(1);
      });
      break;
    case "import-chatgpt":
      cmdImportChatGPT(args.slice(2).join(" ")).catch((e) => {
        console.error("Import failed:", e.message);
        process.exit(1);
      });
      break;
    default:
      cmdHelp();
  }
} else if (command === "context" || command === "ctx") {
  switch (subcommand) {
    case "list": {
      const options: ListContextOptions = {};
      const typeIdx = args.indexOf("--type");
      if (typeIdx !== -1 && args[typeIdx + 1]) {
        options.type = args[typeIdx + 1];
      }
      const sourceIdx = args.indexOf("--source");
      if (sourceIdx !== -1 && args[sourceIdx + 1]) {
        options.source = args[sourceIdx + 1];
      }
      const limitIdx = args.indexOf("--limit");
      if (limitIdx !== -1 && args[limitIdx + 1]) {
        options.limit = parseInt(args[limitIdx + 1], 10);
      }
      cmdContextList(options).catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    }
    case "clear":
      cmdContextClear().catch((e) => {
        console.error("Error:", e.message);
        process.exit(1);
      });
      break;
    case "import":
      cmdContextImport(args[2]).catch((e) => {
        console.error("Import failed:", e.message);
        process.exit(1);
      });
      break;
    default:
      cmdContextHelp();
  }
} else {
  cmdHelp();
}
