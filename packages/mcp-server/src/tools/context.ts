/**
 * arete_get_recent_context and arete_add_context_event MCP tools
 *
 * Reads/writes context from Supabase (if authenticated) or ~/.arete/context.json.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  safeParseContextStore,
  createEmptyContextStore,
  createContextEvent,
  ContextEventType,
  type ContextStore,
  type ContextEvent,
  type ContextEventTypeValue,
  loadConfig,
  createCLIClient,
  type CLIClient,
} from "@arete/core";

// Constants
const MAX_EVENTS = 100;
const VALID_EVENT_TYPES = Object.values(ContextEventType);

// Configurable directory (for testing)
let CONFIG_DIR = join(homedir(), ".arete");

export function setConfigDir(dir: string): void {
  CONFIG_DIR = dir;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

function getContextFile(): string {
  return join(CONFIG_DIR, "context.json");
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Get CLI client for cloud operations (if authenticated)
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

function loadContextStore(): ContextStore {
  ensureConfigDir();
  const contextFile = getContextFile();

  if (!existsSync(contextFile)) {
    return createEmptyContextStore();
  }

  try {
    const data = readFileSync(contextFile, "utf-8");
    const parsed = safeParseContextStore(JSON.parse(data));
    return parsed || createEmptyContextStore();
  } catch {
    return createEmptyContextStore();
  }
}

function saveContextStore(store: ContextStore): void {
  ensureConfigDir();
  store.lastModified = new Date().toISOString();
  writeFileSync(getContextFile(), JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

// --- arete_get_recent_context ---

export interface GetContextInput {
  type?: string;
  source?: string;
  limit?: number;
  since?: string;
}

export interface GetContextOutput {
  events: ContextEvent[];
  count: number;
}

export interface ToolResult<T> {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: T;
}

export async function getContextHandler(
  input: GetContextInput
): Promise<ToolResult<GetContextOutput>> {
  let events: ContextEvent[] = [];
  let source = "local";

  // Try cloud first if authenticated
  const client = getCloudClient();
  if (client) {
    try {
      const cloudEvents = await client.getRecentContext({
        type: input.type as "page_visit" | "selection" | "conversation" | "insight" | "file" | undefined,
        source: input.source,
        limit: input.limit,
      });
      // Convert cloud events to local format
      events = cloudEvents.map((e: { id: string; type: string; source: string; timestamp: string; data: Record<string, unknown> }) => ({
        id: e.id,
        type: e.type as ContextEventTypeValue,
        source: e.source,
        timestamp: e.timestamp,
        data: e.data,
      }));
      source = "cloud";
    } catch (err) {
      // Fall through to local
      console.error("Cloud context fetch failed:", err);
    }
  }

  // Fallback to local file
  if (source === "local") {
    const store = loadContextStore();
    events = [...store.events];

    // Filter by type
    if (input.type) {
      events = events.filter((e) => e.type === input.type);
    }

    // Filter by source
    if (input.source) {
      events = events.filter((e) => e.source === input.source);
    }

    // Filter by time
    if (input.since) {
      const sinceTime = new Date(input.since).getTime();
      events = events.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
    }

    // Sort by timestamp descending (newest first)
    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply limit
    if (input.limit && input.limit > 0) {
      events = events.slice(0, input.limit);
    }
  }

  const output: GetContextOutput = {
    events,
    count: events.length,
  };

  const prefix = source === "cloud" ? "(from cloud) " : "";
  const text =
    events.length === 0
      ? "No context events."
      : `${prefix}Found ${events.length} context event(s).`;

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

// --- arete_add_context_event ---

export interface AddContextEventInput {
  type: string;
  source?: string;
  data: Record<string, unknown>;
}

export interface AddContextEventOutput {
  success: boolean;
  event?: ContextEvent;
  error?: string;
}

export async function addContextEventHandler(
  input: AddContextEventInput
): Promise<ToolResult<AddContextEventOutput>> {
  // Validate event type
  if (!VALID_EVENT_TYPES.includes(input.type as ContextEventTypeValue)) {
    const output: AddContextEventOutput = {
      success: false,
      error: `Invalid event type: ${input.type}. Valid types: ${VALID_EVENT_TYPES.join(", ")}`,
    };
    return {
      content: [{ type: "text", text: `Error: ${output.error}` }],
      structuredContent: output,
    };
  }

  const eventSource = input.source || "claude-desktop";
  const event = createContextEvent(
    input.type as ContextEventTypeValue,
    eventSource,
    input.data
  );

  // Save locally
  const store = loadContextStore();
  store.events.push(event);

  // Prune oldest events if over limit
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(store.events.length - MAX_EVENTS);
  }

  saveContextStore(store);

  // Sync to cloud if authenticated
  let syncedToCloud = false;
  const client = getCloudClient();
  if (client) {
    try {
      await client.addContextEvent({
        type: input.type as "page_visit" | "selection" | "conversation" | "insight" | "file",
        source: eventSource,
        data: input.data,
      });
      syncedToCloud = true;
    } catch (err) {
      console.error("Cloud sync failed:", err);
    }
  }

  const output: AddContextEventOutput = {
    success: true,
    event,
  };

  const suffix = syncedToCloud ? " (synced to cloud)" : "";
  return {
    content: [{ type: "text", text: `Added ${input.type} event.${suffix}` }],
    structuredContent: output,
  };
}
