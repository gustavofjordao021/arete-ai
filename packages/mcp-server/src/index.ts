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
import {
  initTelemetry,
  shutdownTelemetry,
  getTelemetryClient,
} from "@arete/telemetry";

// Initialize telemetry (ON by default, opt-out via ~/.arete/config.json)
const telemetry = initTelemetry();
telemetry.setConnector("mcp-server");

/**
 * Wrapper to track tool execution with telemetry
 */
async function withTelemetry<T>(
  toolName: string,
  handler: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await handler();
    telemetry.trackToolCall(toolName, true, Date.now() - startTime);
    return result;
  } catch (error) {
    telemetry.trackToolCall(toolName, false, Date.now() - startTime);
    throw error;
  }
}

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
    return withTelemetry("arete_get_identity", async () => {
      const result = await getIdentityHandler(input);
      // Return text content plus JSON stringified data
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);
      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_get_recent_context", async () => {
      const result = await getContextHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track context retrieval metrics
      const events = result.structuredContent?.events || [];
      telemetry.track({
        event: "context.events_retrieved",
        properties: {
          count: events.length,
          source_filter: input.source,
          type_filter: input.type,
        },
      });

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_add_context_event", async () => {
      const result = await addContextEventHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track context event addition
      telemetry.trackContextEventAdded(
        input.type as "page_visit" | "selection" | "conversation" | "insight" | "file",
        input.source || "claude-desktop",
        (result.structuredContent as unknown as Record<string, unknown>)?.autoPromoted as boolean | undefined
      );

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_update_identity", async () => {
      const result = await updateIdentityHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track fact creation if a new fact was added
      if (result.structuredContent?.success && input.operation === "add") {
        const category = input.section as "core" | "expertise" | "preference" | "context" | "focus";
        telemetry.trackFactCreated(category, "conversation", "established");
      }

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_validate_fact", async () => {
      const result = await validateFactHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track fact validation
      if (result.structuredContent?.success) {
        const sc = result.structuredContent as unknown as Record<string, unknown>;
        const updatedFact = sc.updatedFact as Record<string, unknown> | undefined;
        const previousMaturity = (sc.previousMaturity || "candidate") as string;
        const currentMaturity = (updatedFact?.maturity || "candidate") as string;
        const promoted = previousMaturity !== currentMaturity;
        const matchScore = sc.matchScore as number | undefined;
        const factId = (updatedFact?.id || input.factId) as string | undefined;
        telemetry.trackFactValidated(
          promoted,
          previousMaturity as "candidate" | "established" | "proven",
          currentMaturity as "candidate" | "established" | "proven",
          input.factId ? "id" : (matchScore === 1.0 ? "exact" : "fuzzy"),
          factId
        );
      }

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_context", async () => {
      const result = await contextHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track projection call and fact surfacing
      const sc = result.structuredContent as unknown as Record<string, unknown>;
      const facts = sc?.facts as Array<Record<string, unknown>> | undefined;
      if (facts && facts.length > 0) {
        const totalFacts = (sc.totalFacts || 0) as number;
        telemetry.trackProjectionCalled(
          !!input.task,
          facts.length,
          totalFacts - facts.length
        );

        // Track each surfaced fact for utilization metrics
        for (const fact of facts) {
          telemetry.trackFactSurfaced(
            (fact.category || "focus") as "core" | "expertise" | "preference" | "context" | "focus",
            (fact.maturity || "candidate") as "candidate" | "established" | "proven",
            (fact.relevanceScore || 0.5) as number
          );
        }
      }

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_infer", async () => {
      const result = await inferHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track inference call and candidate proposals
      const sc = result.structuredContent as unknown as Record<string, unknown>;
      const candidates = sc?.candidates as Array<Record<string, unknown>> | undefined;
      if (candidates && candidates.length > 0) {
        const contextEventsAnalyzed = (sc.contextEventsAnalyzed || sc.eventsAnalyzed || 0) as number;
        const source = (sc.source || "local_context") as string;
        telemetry.track({
          event: "identity.infer_called",
          properties: {
            lookback_days: input.lookbackDays || 7,
            context_event_count: contextEventsAnalyzed,
            source: source as "local_context" | "rollup" | "haiku_analysis",
          },
        });

        // Track each proposed candidate (for approval rate calculation)
        for (const candidate of candidates) {
          telemetry.trackCandidateProposed(
            ((candidate.category || "focus") as string) as "core" | "expertise" | "preference" | "context" | "focus",
            (candidate.confidence || 0.5) as number,
            candidates.length,
            candidate.id as string | undefined
          );
        }
      }

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_reject_fact", async () => {
      const result = await rejectFactHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track candidate rejection
      if (result.structuredContent?.success) {
        const sc = result.structuredContent as unknown as Record<string, unknown>;
        const blockedFactId = sc.blockedFactId as string | undefined;
        telemetry.trackCandidateRejected(
          !!input.reason,
          input.factId,  // candidateId (input factId was the candidate)
          blockedFactId  // factId (the blocked entry created)
        );
      }

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_accept_candidate", async () => {
      const result = await acceptCandidateHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track candidate acceptance
      if (result.structuredContent?.success) {
        const fact = result.structuredContent.fact;
        telemetry.trackCandidateAccepted(
          (fact?.category || "focus") as "core" | "expertise" | "preference" | "context" | "focus",
          false, // single acceptance
          input.candidateId,
          fact?.id as string | undefined
        );
      }

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
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
    return withTelemetry("arete_accept_candidates", async () => {
      const result = await acceptCandidatesHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track batch candidate acceptance
      if (result.structuredContent?.success) {
        const sc = result.structuredContent as unknown as Record<string, unknown>;
        const facts = (sc.facts || sc.accepted || []) as Array<Record<string, unknown>>;
        for (const fact of facts) {
          telemetry.trackCandidateAccepted(
            ((fact?.category || "focus") as string) as "core" | "expertise" | "preference" | "context" | "focus",
            true, // batch acceptance
            fact?.candidateId as string | undefined,
            fact?.id as string | undefined
          );
        }
      }

      return {
        content: [
          ...result.content,
          { type: "text" as const, text: `\n---\n${jsonContent}` },
        ],
      };
    });
  }
);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Arete MCP server running on stdio");
}

// Graceful shutdown handlers to flush telemetry events
async function shutdown(signal: string) {
  console.error(`\n${signal} received, shutting down...`);
  await shutdownTelemetry();
  process.exit(0);
}

// Setup command - inline signup for easy onboarding
async function setup(inviteCode?: string, email?: string) {
  const readline = await import("readline");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  const CONFIG_DIR = path.join(os.homedir(), ".arete");
  const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
  const SUPABASE_URL = "https://dvjgxddjmevmmtzqmzrm.supabase.co";

  console.log("\n🔮 Arete MCP Server Setup\n");

  // Check if already configured
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      if (config.apiKey) {
        console.log(`Already configured for: ${config.email || config.userId}`);
        console.log(`Config file: ${CONFIG_FILE}`);
        console.log("\nTo reconfigure, delete ~/.arete/config.json and run setup again.");
        process.exit(0);
      }
    } catch {
      // Config exists but invalid, continue with setup
    }
  }

  // Helper to prompt for input
  const prompt = (question: string): Promise<string> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  };

  // Get invite code
  let code = inviteCode;
  if (!code) {
    console.log("To sign up, you need an invite code from the Arete team.");
    console.log("(Request one at: https://github.com/gustavofjordao021/arete-ai)\n");
    code = await prompt("Invite code: ");
  }

  if (!code) {
    console.error("Error: Invite code is required.");
    process.exit(1);
  }

  // Get email
  let userEmail = email;
  if (!userEmail) {
    userEmail = await prompt("Email: ");
  }

  if (!userEmail || !userEmail.includes("@")) {
    console.error("Error: Valid email is required.");
    process.exit(1);
  }

  console.log("\nCreating account...");

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup-with-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: code, email: userEmail }),
    });

    const data = (await response.json()) as {
      error?: string;
      api_key?: string;
      user_id?: string;
      email?: string;
    };

    if (!response.ok) {
      console.error(`\nError: ${data.error || "Signup failed"}`);
      process.exit(1);
    }

    if (!data.api_key || !data.user_id) {
      console.error("\nError: Invalid response from server");
      process.exit(1);
    }

    // Save config
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const config = {
      supabaseUrl: SUPABASE_URL,
      apiKey: data.api_key,
      userId: data.user_id,
      email: data.email,
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    console.log(`\n✅ Success! Account created for ${data.email}`);
    console.log(`\n📁 Config saved to: ${CONFIG_FILE}`);
    console.log(`\n🔑 Your API key: ${data.api_key}`);
    console.log("\n⚠️  Save this key - it won't be shown again!");
    console.log("\n" + "─".repeat(50));
    console.log("\n📋 Next step: Configure Claude Desktop\n");
    console.log("Add this to ~/.config/claude/claude_desktop_config.json:\n");
    console.log(`{
  "mcpServers": {
    "arete": {
      "command": "npx",
      "args": ["arete-mcp-server"]
    }
  }
}`);
    console.log("\nThen restart Claude Desktop and ask: \"What do you know about me?\"\n");

  } catch (error) {
    console.error("\nError:", (error as Error).message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === "setup") {
  // Run setup flow
  setup(args[1], args[2]).catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
} else if (command === "--help" || command === "-h") {
  console.log(`
arete-mcp-server - Portable AI identity for Claude Desktop

Commands:
  setup [invite-code] [email]   Sign up and configure Arete
  --help, -h                    Show this help message

Usage:
  npx arete-mcp-server setup              Interactive setup
  npx arete-mcp-server setup CODE EMAIL   Non-interactive setup
  npx arete-mcp-server                    Start MCP server (after setup)

Examples:
  npx arete-mcp-server setup
  npx arete-mcp-server setup ARETE-BETA-001 you@example.com
`);
  process.exit(0);
} else {
  // Start MCP server
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  main().catch(async (error) => {
    console.error("Fatal error:", error);
    await shutdownTelemetry();
    process.exit(1);
  });
}
