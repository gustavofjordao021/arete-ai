#!/usr/bin/env node
/**
 * Arete MCP Server
 *
 * Provides identity and context tools for Claude Desktop.
 *
 * Tools:
 *   arete_get_identity       - Get user identity for system prompt injection
 *   arete_get_recent_context - Get recent browsing/interaction context
 *   arete_add_context_event  - Record a new context event (insight, etc.)
 *   arete_update_identity    - Update identity sections with user approval
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { getIdentityHandler } from "./tools/identity.js";
import { getContextHandler, addContextEventHandler } from "./tools/context.js";
import { updateIdentityHandler } from "./tools/identity-update.js";

const server = new McpServer({
  name: "arete",
  version: "0.1.0",
});

// --- arete_get_identity ---
server.registerTool(
  "arete_get_identity",
  {
    title: "Get User Identity",
    description:
      "Retrieves the user's identity profile from ~/.arete/identity.json. " +
      "Use this at the start of conversations to personalize responses. " +
      "Set format='prompt' to get pre-formatted text for system prompt injection.",
    inputSchema: {
      format: z
        .enum(["json", "prompt"])
        .optional()
        .describe("Output format: 'json' for raw data, 'prompt' for formatted text"),
    },
  },
  async (input) => {
    const result = await getIdentityHandler(input);
    // Return text content plus JSON stringified data
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// --- arete_get_recent_context ---
server.registerTool(
  "arete_get_recent_context",
  {
    title: "Get Recent Context",
    description:
      "Retrieves recent context events from ~/.arete/context.json. " +
      "Events include page visits, text selections, conversations, and insights. " +
      "Use this to understand what the user has been working on recently.",
    inputSchema: {
      type: z
        .enum(["page_visit", "selection", "conversation", "insight", "file"])
        .optional()
        .describe("Filter by event type"),
      source: z
        .string()
        .optional()
        .describe("Filter by source (e.g., 'chrome', 'cli', 'claude-desktop')"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of events to return"),
      since: z
        .string()
        .optional()
        .describe("ISO timestamp - only return events after this time"),
    },
  },
  async (input) => {
    const result = await getContextHandler(input);
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// --- arete_add_context_event ---
server.registerTool(
  "arete_add_context_event",
  {
    title: "Add Context Event",
    description:
      "Records a new context event to ~/.arete/context.json. " +
      "Use this to save insights about the user learned during conversation. " +
      "The event will be available in future sessions.",
    inputSchema: {
      type: z
        .enum(["page_visit", "selection", "conversation", "insight", "file"])
        .describe("Type of context event"),
      source: z
        .string()
        .optional()
        .describe("Source of the event (defaults to 'claude-desktop')"),
      data: z.record(z.any()).describe("Event-specific data payload"),
    },
  },
  async (input) => {
    const result = await addContextEventHandler(input);
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// --- arete_update_identity ---
server.registerTool(
  "arete_update_identity",
  {
    title: "Update User Identity",
    description:
      "Updates user identity sections based on observed patterns. " +
      "IMPORTANT: Always ask the user for approval BEFORE calling this tool. " +
      "Present your reasoning and proposed change, wait for confirmation. " +
      "Protected sections (core, meta, privacy) cannot be modified.",
    inputSchema: {
      section: z
        .enum(["expertise", "currentFocus", "context", "communication", "custom"])
        .describe("Which identity section to update"),
      operation: z
        .enum(["add", "set", "remove"])
        .describe("add: append to array, set: replace value, remove: delete from array"),
      field: z
        .string()
        .optional()
        .describe("Nested field path (e.g., 'projects' for currentFocus.projects)"),
      value: z.any().describe("The value to add/set/remove"),
      reasoning: z
        .string()
        .describe("Brief explanation of why this update was made"),
    },
  },
  async (input) => {
    const result = await updateIdentityHandler(input);
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Arete MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
