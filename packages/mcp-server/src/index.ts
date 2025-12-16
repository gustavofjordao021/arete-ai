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
 *   arete_accept_candidate   - Accept a candidate fact from arete_infer
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
import { acceptCandidateHandler, acceptCandidatesHandler } from "./tools/identity-accept.js";

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
      "RECOMMENDED FIRST CALL: Get the user's identity to personalize your responses.\n\n" +
      "**When to call:**\n" +
      "- At conversation start (establishes baseline context)\n" +
      "- Before answering questions about the user's background, skills, or preferences\n" +
      "- When the user asks something where their role/expertise would shape your answer\n\n" +
      "Returns who they are, their role, expertise, interests, and current focus. " +
      "Use this to avoid asking questions Arete already knows. " +
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
      "**OUTPUT TOOL** — Records information, not searches for it.\n\n" +
      "ALWAYS call this tool after your response when the user revealed:\n" +
      "- A preference (\"I like X\", \"I prefer Y\", \"I always want Z\")\n" +
      "- A constraint (\"I'm on iPad\", \"I don't have admin access\", \"I only use...\")\n" +
      "- Personal context (nationality, role, team, location, habits)\n" +
      "- A dislike or frustration (\"I don't like...\", \"I hate when...\")\n" +
      "- Current focus (\"I'm learning...\", \"I'm working on...\", \"I'm building...\")\n\n" +
      "This is NOT optional. Every conversation reveals facts worth storing.\n\n" +
      "**After answering the user's question, make a SECOND tool call to record what you learned.**\n\n" +
      "Examples from this conversation:\n" +
      "- User said \"I'm Brazilian\" → call with type='insight', data={insight: 'User is Brazilian'}\n" +
      "- User said \"I like using the air fryer\" → call with data={insight: 'Prefers air fryer for cooking'}\n" +
      "- User said \"I don't like the iron taste\" → call with data={insight: 'Dislikes iron/blood taste in meats'}",
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
      "**OUTPUT TOOL** — Stores structured facts about the user.\n\n" +
      "ALWAYS call this tool after your response when the user stated:\n" +
      "- Who they are (\"I'm a PM\", \"I'm Brazilian\", \"I work at...\")\n" +
      "- What they know (\"I've been doing X for years\", demonstrates expertise)\n" +
      "- What they're working on (\"I'm building...\", \"I'm learning...\")\n" +
      "- How they want responses (\"Keep it brief\", \"Don't explain basics\")\n\n" +
      "This is NOT optional. Make a SECOND tool call after answering to store what you learned.\n\n" +
      "**Choose the right section:**\n" +
      "- `expertise` — skills, technologies, domains (\"knows React\", \"10 years in fintech\")\n" +
      "- `currentFocus` — active projects/learning (\"building a Chrome extension\")\n" +
      "- `context` — environment, constraints (\"uses iPad\", \"based in Miami\")\n" +
      "- `communication` — response preferences (\"prefers concise answers\")\n" +
      "- `custom` — personal facts (\"Brazilian\", \"CrossFit enthusiast\", \"likes chicken hearts\")",
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
      "Strengthen a fact you've observed to be accurate. Facts gain confidence through validation.\n\n" +
      "**Use proactively when:**\n" +
      "- User's behavior confirms an existing fact (e.g., they're using the tech stack we have recorded)\n" +
      "- User explicitly reaffirms something (\"Yes, I'm still at that company\")\n" +
      "- Conversation demonstrates a recorded preference is still active\n" +
      "- You notice the user acting consistently with a stored fact\n\n" +
      "**You don't need exact wording.** Fuzzy matching means 'works at PayNearMe' matches 'PayNearMe employee'. Just describe what you're validating.\n\n" +
      "**Why this matters:** Validated facts surface more prominently. Unvalidated facts decay over time. Validation keeps the identity fresh.",
    inputSchema: {
      factId: z
        .string()
        .optional()
        .describe("UUID of the fact to validate"),
      content: z
        .string()
        .optional()
        .describe("Content to match (supports fuzzy matching - doesn't need exact wording)"),
      fuzzyThreshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Similarity threshold 0-1 (default: 0.7). Lower = more lenient matching."),
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
      "Get identity facts most relevant to the current task. Returns a focused slice, not the full profile.\n\n" +
      "**Use instead of arete_get_identity when:**\n" +
      "- You need context for a specific question, not general personalization\n" +
      "- The full identity would be overwhelming for the task\n" +
      "- You want facts ranked by relevance to what you're doing\n\n" +
      "**Example:**\n" +
      "- Task: \"Help me debug this React component\"\n" +
      "- Returns: React expertise, current project context, relevant preferences\n" +
      "- Filters out: Unrelated facts about hobbies, older focus areas\n\n" +
      "Proven facts always surface. Lower-confidence facts only appear if relevant.",
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
      "Analyze recent activity to discover expertise signals and summarize what the user has been doing.\n\n" +
      "**Use proactively when:**\n" +
      "- User asks \"what have I been up to?\" or wants an activity recap\n" +
      "- You want to propose new identity facts based on observed patterns\n" +
      "- Starting a conversation and want to acknowledge recent context\n" +
      "- User seems to have shifted focus and you want to confirm\n\n" +
      "**PRO TIP:** Call arete_get_identity first. This connects activity to known facts " +
      "(e.g., 'Globo Esporte visits' becomes 'checking on Vasco da Gama' if user is a known fan).\n\n" +
      "Returns candidate facts — propose them to the user for confirmation. " +
      "Candidates don't auto-save; use arete_accept_candidate when user approves.",
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
      "Block a fact the user has rejected. Prevents re-suggestion.\n\n" +
      "**Use when:**\n" +
      "- User explicitly rejects a candidate (\"No, that's not accurate\")\n" +
      "- User corrects an inference (\"I'm not learning Go, I was just curious\")\n" +
      "- User asks you to stop suggesting something\n\n" +
      "Rejected facts are blocked permanently — the system won't re-infer them.",
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

// --- arete_accept_candidate ---
server.registerTool(
  "arete_accept_candidate",
  {
    title: "Accept Inferred Candidate",
    description:
      "Accept a candidate fact that the user has confirmed.\n\n" +
      "**Use when:**\n" +
      "- User explicitly approves a candidate from arete_infer (\"Yes, that's right\")\n" +
      "- User implicitly confirms by not objecting when you mention it\n" +
      "- User says \"add that\" or \"remember that\" about an inference\n\n" +
      "Simpler than arete_update_identity — preserves all inference metadata automatically.\n\n" +
      "**When to use arete_accept_candidates (batch) instead:**\n" +
      "- User says \"yes to all\" or \"accept everything\"\n" +
      "- Multiple candidates are confirmed at once",
    inputSchema: {
      candidateId: z
        .string()
        .optional()
        .describe("UUID of the candidate from arete_infer"),
      content: z
        .string()
        .optional()
        .describe("Content of the candidate (used if candidateId not provided)"),
      reasoning: z
        .string()
        .optional()
        .describe("Optional reason for acceptance"),
    },
  },
  async (input) => {
    const result = await acceptCandidateHandler(input);
    const jsonContent = JSON.stringify(result.structuredContent, null, 2);
    return {
      content: [
        ...result.content,
        { type: "text" as const, text: `\n---\n${jsonContent}` },
      ],
    };
  }
);

// --- arete_accept_candidates (batch) ---
server.registerTool(
  "arete_accept_candidates",
  {
    title: "Batch Accept Candidates",
    description:
      "Accept multiple candidates at once.\n\n" +
      "**Use when:**\n" +
      "- User says \"yes to all\" or \"accept everything\"\n" +
      "- User approves several candidates in one response\n" +
      "- User gives blanket approval (\"those all look right\")\n\n" +
      "Pass candidateIds array for selective acceptance, or set all=true to accept everything from last arete_infer.",
    inputSchema: {
      candidateIds: z
        .array(z.string())
        .optional()
        .describe("Array of candidate UUIDs to accept"),
      all: z
        .boolean()
        .optional()
        .describe("Set to true to accept ALL pending candidates"),
    },
  },
  async (input) => {
    const result = await acceptCandidatesHandler(input);
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
