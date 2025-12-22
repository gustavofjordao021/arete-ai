#!/usr/bin/env node
/**
 * Arete MCP Server
 *
 * Provides identity and context tools for Claude Desktop.
 *
 * Tools:
 *   arete_identity  - Get user identity for personalization
 *   arete_remember  - Store/validate/remove facts about the user
 *   arete_activity  - Get recent browsing/interaction context
 *   arete_infer     - Learn from patterns + accept/reject candidates
 */

// Load .env file before any other imports that use config
// Note: quiet mode prevents stdout pollution that breaks MCP JSON-RPC
import { config as loadDotenv } from "dotenv";
loadDotenv({ quiet: true });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

// Tool handlers
import { identityHandler } from "./tools/arete-identity.js";
import { rememberHandler } from "./tools/arete-remember.js";
import { activityHandler } from "./tools/arete-activity.js";
import { inferHandler } from "./tools/identity-infer.js";

import {
  initTelemetry,
  shutdownTelemetry,
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

// --- arete_identity ---
server.registerTool(
  "arete_identity",
  {
    title: "Get User Identity",
    description:
      "Get the user's identity for personalization.\n\n" +
      "**Use at conversation start** to know who you're talking to.\n\n" +
      "**Parameters:**\n" +
      "- task: Focus on facts relevant to a specific task (optional)\n" +
      "- format: 'json' (default) or 'prompt' for formatted text\n" +
      "- maxFacts: Limit number of facts (default: 10)\n" +
      "- minConfidence: Filter low-confidence facts (default: 0.3)",
    inputSchema: {
      task: z
        .string()
        .optional()
        .describe("Current task to optimize projection for"),
      format: z
        .enum(["json", "prompt"])
        .optional()
        .describe("Output format (default: json)"),
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
        .describe("Minimum confidence threshold (default: 0.3)"),
    },
  },
  async (input) => {
    return withTelemetry("arete_identity", async () => {
      const result = await identityHandler(input);
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

// --- arete_remember ---
server.registerTool(
  "arete_remember",
  {
    title: "Remember Information",
    description:
      "Store, validate, or remove facts about the user.\n\n" +
      "**Auto-detects category** from content:\n" +
      "- 'I'm a PM' → core\n" +
      "- 'I know React' → expertise\n" +
      "- 'I prefer dark mode' → preference\n" +
      "- 'I'm learning Rust' → focus\n" +
      "- 'I use VS Code' → context\n\n" +
      "**Operations:**\n" +
      "- add (default): Store new fact\n" +
      "- validate: Strengthen existing fact\n" +
      "- remove: Delete matching fact",
    inputSchema: {
      content: z
        .string()
        .describe("The fact to remember (e.g., 'Prefers dark mode')"),
      operation: z
        .enum(["add", "validate", "remove"])
        .optional()
        .describe("Operation to perform (default: add)"),
      category: z
        .enum(["core", "expertise", "preference", "context", "focus"])
        .optional()
        .describe("Override auto-detected category"),
      reasoning: z
        .string()
        .optional()
        .describe("Why this fact is being stored"),
    },
  },
  async (input) => {
    return withTelemetry("arete_remember", async () => {
      const result = await rememberHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track fact operations
      if (result.structuredContent?.success) {
        const op = input.operation || "add";
        if (op === "add" && result.structuredContent?.fact) {
          const fact = result.structuredContent.fact as Record<string, unknown>;
          telemetry.trackFactCreated(
            (fact.category || "context") as "core" | "expertise" | "preference" | "context" | "focus",
            "conversation",
            "candidate"
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

// --- arete_activity ---
server.registerTool(
  "arete_activity",
  {
    title: "Get Recent Activity",
    description:
      "Get recent browsing/interaction context.\n\n" +
      "**Use for:** 'What have I been up to?' questions.\n\n" +
      "**Filters:**\n" +
      "- type: page_visit, insight, conversation, file, selection\n" +
      "- source: chrome, claude-desktop, cli\n" +
      "- limit: Max events to return\n" +
      "- since: ISO timestamp\n\n" +
      "For analysis and candidate extraction, use arete_infer instead.",
    inputSchema: {
      type: z
        .enum(["page_visit", "selection", "conversation", "insight", "file"])
        .optional()
        .describe("Filter by event type"),
      source: z
        .string()
        .optional()
        .describe("Filter by source (e.g., 'chrome')"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum events to return"),
      since: z
        .string()
        .optional()
        .describe("ISO timestamp - events after this time"),
    },
  },
  async (input) => {
    return withTelemetry("arete_activity", async () => {
      const result = await activityHandler(input);
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

// --- arete_infer ---
server.registerTool(
  "arete_infer",
  {
    title: "Infer Identity from Patterns",
    description:
      "Learn from browsing patterns + manage candidate lifecycle.\n\n" +
      "**Analysis:**\n" +
      "Extracts candidate facts from recent activity. Returns candidates for user approval.\n\n" +
      "**Candidate Management:**\n" +
      "Accept or reject candidates inline (no separate tool calls needed).\n" +
      "- accept: Pass candidate IDs to confirm as facts\n" +
      "- reject: Pass {id, reason} to block candidates permanently\n\n" +
      "**Usage:**\n" +
      "- 'What have I been up to?' → arete_infer() to analyze\n" +
      "- User confirms candidate → arete_infer(accept: ['id1'])\n" +
      "- User declines → arete_infer(reject: [{id: 'id2', reason: 'Not accurate'}])",
    inputSchema: {
      lookbackDays: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("How many days of context to analyze (default: 7)"),
      accept: z
        .array(z.string())
        .optional()
        .describe("Candidate IDs to accept (promotes to facts)"),
      reject: z
        .array(z.object({
          id: z.string(),
          reason: z.string().optional(),
        }))
        .optional()
        .describe("Candidates to reject (blocked permanently)"),
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
async function setup(email?: string) {
  const startTime = Date.now();
  const interactive = !email;

  const readline = await import("readline");
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  const CONFIG_DIR = path.join(os.homedir(), ".arete");
  const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
  const SUPABASE_URL = "https://dvjgxddjmevmmtzqmzrm.supabase.co";

  // Track setup started
  telemetry.trackSetupStarted(interactive);

  console.log("\n🔮 Arete MCP Server Setup\n");

  // Check if already configured
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      if (config.apiKey) {
        telemetry.trackSetupFailed("already_configured", "email_prompt");
        console.log(`Already configured for: ${config.email || config.userId}`);
        console.log(`Config file: ${CONFIG_FILE}`);
        console.log("\nTo reconfigure, delete ~/.arete/config.json and run setup again.");
        await shutdownTelemetry();
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

  // Get email
  let userEmail = email;
  if (!userEmail) {
    userEmail = await prompt("Email: ");
  }

  // Track email entered
  telemetry.trackSetupEmailEntered(interactive);

  if (!userEmail || !userEmail.includes("@")) {
    telemetry.trackSetupFailed("invalid_email", "email_prompt");
    console.error("Error: Valid email is required.");
    await shutdownTelemetry();
    process.exit(1);
  }

  console.log("\nCreating account...");

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/signup-open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail }),
    });

    const data = (await response.json()) as {
      error?: string;
      api_key?: string;
      user_id?: string;
      email?: string;
    };

    if (!response.ok) {
      telemetry.trackSetupFailed("api_error", "api_call");
      console.error(`\nError: ${data.error || "Signup failed"}`);
      await shutdownTelemetry();
      process.exit(1);
    }

    if (!data.api_key || !data.user_id) {
      telemetry.trackSetupFailed("invalid_response", "api_call");
      console.error("\nError: Invalid response from server");
      await shutdownTelemetry();
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

    // Track setup completed
    telemetry.trackSetupCompleted(Date.now() - startTime);

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

    // Flush telemetry before exiting
    await shutdownTelemetry();

  } catch (error) {
    telemetry.trackSetupFailed("network_error", "api_call");
    console.error("\nError:", (error as Error).message);
    await shutdownTelemetry();
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === "setup") {
  // Run setup flow
  setup(args[1]).catch((error) => {
    console.error("Setup failed:", error);
    process.exit(1);
  });
} else if (command === "--help" || command === "-h") {
  console.log(`
arete-mcp-server - Portable AI identity for Claude Desktop

Commands:
  setup [email]   Sign up and configure Arete
  --help, -h      Show this help message

Usage:
  npx arete-mcp-server setup              Interactive setup (prompts for email)
  npx arete-mcp-server setup EMAIL        Non-interactive setup
  npx arete-mcp-server                    Start MCP server (after setup)

Examples:
  npx arete-mcp-server setup
  npx arete-mcp-server setup you@example.com
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
