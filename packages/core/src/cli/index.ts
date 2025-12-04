#!/usr/bin/env node
/**
 * Arete CLI - Identity management commands
 *
 * Usage:
 *   arete identity get                    Show current identity
 *   arete identity set "prose..."         Extract and store identity from prose
 *   arete identity transform --model X    Output system prompt for model
 *   arete identity clear                  Clear stored identity
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

// Storage location
const CONFIG_DIR = join(homedir(), ".arete");
const IDENTITY_FILE = join(CONFIG_DIR, "identity.json");

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
function cmdGet(): void {
  const identity = loadIdentity();
  console.log(formatIdentity(identity));
}

function cmdSet(prose: string): void {
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

  console.log("\nIdentity updated:");
  console.log(formatIdentity(identity));
}

function cmdTransform(model: string): void {
  const identity = loadIdentity();

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

function cmdClear(): void {
  const identity = createEmptyIdentity("cli");
  saveIdentity(identity);
  console.log("Identity cleared.");
}

function cmdHelp(): void {
  console.log(`
Arete CLI - Portable AI Identity

Commands:
  arete identity get                    Show current identity
  arete identity set "prose..."         Store identity from prose
  arete identity transform --model X    Output system prompt (claude|openai)
  arete identity clear                  Clear stored identity
  arete identity json                   Output raw JSON

Examples:
  arete identity set "I'm a PM at fintech, prefer concise responses"
  arete identity transform --model claude
`);
}

function cmdJson(): void {
  const identity = loadIdentity();
  console.log(JSON.stringify(identity, null, 2));
}

// Parse arguments
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

if (command === "identity" || command === "id") {
  switch (subcommand) {
    case "get":
      cmdGet();
      break;
    case "set":
      cmdSet(args.slice(2).join(" "));
      break;
    case "transform": {
      const modelIdx = args.indexOf("--model");
      const model = modelIdx !== -1 ? args[modelIdx + 1] : "claude";
      cmdTransform(model);
      break;
    }
    case "clear":
      cmdClear();
      break;
    case "json":
      cmdJson();
      break;
    default:
      cmdHelp();
  }
} else {
  cmdHelp();
}
