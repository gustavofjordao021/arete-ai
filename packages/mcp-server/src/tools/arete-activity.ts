/**
 * arete_activity - Activity Context Tool
 *
 * Replaces: arete_get_recent_context
 * Mental model: "What have I been doing?"
 *
 * Returns recent browsing/interaction context for understanding
 * what the user has been working on.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  safeParseContextStore,
  createEmptyContextStore,
  getSyncService,
  type ContextStore,
  type ContextEvent,
} from "@arete/core";

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

// --- Types ---

export interface ActivityInput {
  type?: string;
  source?: string;
  limit?: number;
  since?: string;
}

export interface ActivityOutput {
  events: ContextEvent[];
  count: number;
  guidance?: string;
}

export interface ActivityToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: ActivityOutput;
}

// --- Loading ---

function loadContextStore(): ContextStore {
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

// --- Main Handler ---

export async function activityHandler(
  input: ActivityInput
): Promise<ActivityToolResult> {
  // Local-first: read from local file instantly
  const store = loadContextStore();
  let events: ContextEvent[] = [...store.events];

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

  // Queue background sync (non-blocking)
  getSyncService()?.queueSync("context");

  // Guidance for natural presentation
  const guidance =
    "Use this context naturally in conversation. " +
    "Don't say 'based on your browsing' or 'I see you visited'. " +
    "Just know what they've been working on and respond accordingly. " +
    "If they ask what they've been up to, summarize casually without listing URLs.";

  const output: ActivityOutput = {
    events,
    count: events.length,
    guidance,
  };

  // Conversational summary
  let text: string;
  if (events.length === 0) {
    text = "No recent activity to draw from.";
  } else {
    // Extract unique domains/topics for a natural summary
    const domains = new Set<string>();
    for (const e of events.slice(0, 10)) {
      if (e.type === "page_visit" && e.data.url) {
        try {
          const url = new URL(e.data.url as string);
          const domain = url.hostname.replace(/^www\./, "");
          if (!["google.com", "bing.com", "duckduckgo.com"].includes(domain)) {
            domains.add(domain);
          }
        } catch {
          // skip invalid URLs
        }
      }
    }
    const domainList = Array.from(domains).slice(0, 5);
    if (domainList.length > 0) {
      text = `Recent activity includes ${domainList.join(", ")}.`;
    } else {
      text = `${events.length} recent events.`;
    }
  }

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

// --- Tool Definition ---

export const activityTool = {
  name: "arete_activity",
  description: `Get recent browsing/interaction context.

**Usage:**
- No params: Returns recent events
- type: Filter by event type (page_visit, insight, conversation, file, selection)
- source: Filter by source (chrome, claude-desktop, cli)
- limit: Max events to return
- since: ISO timestamp to filter from

Use this for "what have I been up to?" questions or to understand recent context.
For most conversations, arete_identity is more useful.`,
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["page_visit", "selection", "conversation", "insight", "file"],
        description: "Filter by event type",
      },
      source: {
        type: "string",
        description: "Filter by source (e.g., 'chrome', 'claude-desktop')",
      },
      limit: {
        type: "number",
        description: "Maximum events to return",
      },
      since: {
        type: "string",
        description: "ISO timestamp - only return events after this time",
      },
    },
  },
};
