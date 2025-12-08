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
 *   arete_validate_fact      - Validate an identity fact (v2 identity)
 *   arete_context            - Task-aware identity projection (v2 identity)
 *   arete_infer              - Extract candidate facts from browsing patterns
 *   arete_reject_fact        - Block a fact from future inference
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";
import { getIdentityHandler } from "./tools/identity.js";
import { getContextHandler, addContextEventHandler } from "./tools/context.js";
import { updateIdentityHandler } from "./tools/identity-update.js";
import { validateFactHandler } from "./tools/identity-validate.js";
import { contextHandler } from "./tools/identity-context.js";
import { inferHandler } from "./tools/identity-infer.js";
import { rejectFactHandler } from "./tools/identity-reject.js";

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
      "Get the user's full identity profile - who they are, what they work on, their expertise. " +
      "Returns everything known about the user. " +
      "format='prompt' gives pre-formatted text, format='json' gives raw data.",
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
    title: "Get Recent Context (Raw)",
    description:
      "Low-level access to raw context events. " +
      "For activity summaries or 'what have I been up to', use arete_infer instead. " +
      "This tool returns unprocessed event logs.",
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
      "Save a context event - an insight, observation, or interaction. " +
      "Events persist across sessions and can inform future conversations.",
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
      "Add, update, or remove facts from the user's identity. " +
      "Sections: expertise, currentFocus, context, communication, custom. " +
      "Core/meta/privacy sections are protected.",
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

// --- arete_validate_fact ---
server.registerTool(
  "arete_validate_fact",
  {
    title: "Validate Identity Fact",
    description:
      "Confirm a fact is accurate, boosting its confidence. " +
      "Facts mature: candidate → established → proven as they're validated. " +
      "Validated facts persist longer and rank higher.",
    inputSchema: {
      factId: z
        .string()
        .optional()
        .describe("UUID of the fact to validate"),
      content: z
        .string()
        .optional()
        .describe("Exact content of the fact (used if factId not provided)"),
      reasoning: z
        .string()
        .describe("Brief explanation of why this fact is being validated"),
    },
  },
  async (input) => {
    const result = await validateFactHandler(input);
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// --- arete_context ---
server.registerTool(
  "arete_context",
  {
    title: "Task-Aware Identity",
    description:
      "Get identity facts relevant to a specific task. " +
      "Returns a focused subset ranked by relevance and confidence. " +
      "Confidence decays over time; proven facts always surface.",
    inputSchema: {
      task: z
        .string()
        .optional()
        .describe("Current task or question to optimize projection for"),
      maxFacts: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum facts to return (default: 10)"),
      minConfidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum effective confidence threshold 0-1 (default: 0.3)"),
    },
  },
  async (input) => {
    const result = await contextHandler(input);
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// --- arete_infer ---
server.registerTool(
  "arete_infer",
  {
    title: "Infer Identity from Patterns",
    description:
      "Summarize what the user has been working on and discover expertise signals. " +
      "Best for 'what have I been up to' or activity recaps. " +
      "Returns insights and offers to remember new facts.",
    inputSchema: {
      lookbackDays: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("How many days of context to analyze (default: 7)"),
    },
  },
  async (input) => {
    const result = await inferHandler(input);
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// --- arete_reject_fact ---
server.registerTool(
  "arete_reject_fact",
  {
    title: "Reject/Block Fact",
    description:
      "Block a fact from future inference suggestions. " +
      "Removes candidate facts; blocks established facts from re-suggestion.",
    inputSchema: {
      factId: z
        .string()
        .optional()
        .describe("ID of the fact to block"),
      content: z
        .string()
        .optional()
        .describe("Content of the fact (used to generate ID if factId not provided)"),
      reason: z
        .string()
        .optional()
        .describe("Why this fact is being rejected"),
    },
  },
  async (input) => {
    const result = await rejectFactHandler(input);
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
