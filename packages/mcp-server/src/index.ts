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
 *   arete_onboard   - Interactive interview to build user identity
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
import { onboardHandler } from "./tools/arete-onboard.js";

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
      "- minConfidence: Filter low-confidence facts (default: 0.3)\n\n" +
      "**Task-Aware Relevance:**\n" +
      "When you pass a `task`, facts are scored by semantic relevance and returned in order of usefulness.\n" +
      "- 'help me with React' → surfaces frontend/JS expertise\n" +
      "- 'write a cover letter' → surfaces role, company, career goals\n" +
      "- 'plan my trip' → surfaces location preferences, travel context\n\n" +
      "**Best practice:** Always infer a task from the user's first message and pass it.\n" +
      "Even vague messages like 'hey' can use task='general greeting'.",
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

// --- arete_onboard ---
server.registerTool(
  "arete_onboard",
  {
    title: "Onboard User Identity",
    description:
      "Conduct interactive interview to build user identity.\n\n" +
      "**CRITICAL: Always check `nextAction.mode` in the response to know what to call next.**\n\n" +
      "The response includes `nextAction: { mode, description }` that tells you exactly which mode to use. " +
      "Don't guess based on phase - just follow nextAction.\n\n" +
      "**Extract facts yourself for faster performance:**\n" +
      "When calling mode='answer', include extractedFacts to avoid extra LLM call.\n" +
      "- EXPLICIT: 'I'm a PM' → { category: 'core', content: 'Product Manager', confidence: 1.0 }\n" +
      "- IMPLICIT: 'Building with Next.js' → { category: 'expertise', content: 'React/Next.js', confidence: 0.8 }\n" +
      "- Categories: core (role/name), expertise (skills), preference (style), context (company), focus (projects)\n\n" +
      "**Flow:**\n" +
      "1. mode='start' → returns question + nextAction.mode='answer'\n" +
      "2. Ask question, get response, extract facts\n" +
      "3. mode='answer' with answer + extractedFacts → returns next step + nextAction\n" +
      "4. Follow nextAction.mode for each subsequent call\n" +
      "5. When nextAction.mode='branch', call mode='branch' with branchDecision\n" +
      "6. When nextAction.mode='complete', interview is done\n\n" +
      "Make conversation feel natural, not like a form.",
    inputSchema: {
      mode: z
        .enum(["start", "answer", "branch", "status"])
        .describe("Interview action to take"),
      answer: z
        .string()
        .optional()
        .describe("User's response to the last question (for mode: 'answer')"),
      extractedFacts: z
        .array(
          z.object({
            category: z.enum(["core", "expertise", "preference", "context", "focus"]),
            content: z.string(),
            confidence: z.number().min(0).max(1).optional(),
            visibility: z.enum(["public", "trusted"]).optional(),
          })
        )
        .optional()
        .describe("Facts extracted from the answer by host LLM (recommended for performance)"),
      branchDecision: z
        .enum(["continue", "done"])
        .optional()
        .describe("Whether to continue with follow-ups or complete (for mode: 'branch')"),
      selectedQuestions: z
        .array(z.string())
        .optional()
        .describe("Specific follow-up question IDs to explore (optional)"),
    },
  },
  async (input) => {
    return withTelemetry("arete_onboard", async () => {
      const result = await onboardHandler(input);
      const jsonContent = JSON.stringify(result.structuredContent, null, 2);

      // Track interview events (using type assertion for new event types)
      const phase = result.structuredContent.phase;
      const trackEvent = (event: string, properties: Record<string, unknown>) => {
        (telemetry as unknown as { track: (e: { event: string; properties: Record<string, unknown> }) => void }).track({ event, properties });
      };

      const timing = result.structuredContent.timing;

      if (input.mode === "start") {
        trackEvent("interview.started", {});
      } else if (input.mode === "answer" && result.structuredContent.recentFacts) {
        trackEvent("interview.question_answered", {
          facts_extracted: result.structuredContent.recentFacts.length,
          question_number: result.structuredContent.question?.number || 0,
          extraction_source: timing?.source || "unknown",
          extraction_ms: timing?.extractionMs,
          total_ms: timing?.totalMs,
        });
      } else if (phase === "branching") {
        trackEvent("interview.branching_offered", {
          suggestions_count: result.structuredContent.branching?.suggestions.length || 0,
          extraction_source: timing?.source || "unknown",
          total_ms: timing?.totalMs,
        });
      } else if (input.mode === "branch") {
        trackEvent(
          input.branchDecision === "continue" ? "interview.branching_accepted" : "interview.branching_declined",
          {}
        );
      } else if (phase === "complete") {
        trackEvent("interview.completed", {
          facts_extracted: result.structuredContent.completion?.factsExtracted || 0,
        });
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

// Claude Code hooks installation
async function installClaudeCodeHooks(
  fs: typeof import("fs"),
  path: typeof import("path"),
  os: typeof import("os")
): Promise<void> {
  const CLAUDE_DIR = path.join(os.homedir(), ".claude");
  const CLAUDE_SETTINGS = path.join(CLAUDE_DIR, "settings.json");
  const ARETE_HOOKS_DIR = path.join(os.homedir(), ".arete", "hooks");

  // Check if Claude Code is installed
  if (!fs.existsSync(CLAUDE_DIR)) {
    return; // Claude Code not detected, skip hook installation
  }

  console.log("\n🔗 Claude Code detected! Installing hooks...\n");

  // Create hooks directory
  if (!fs.existsSync(ARETE_HOOKS_DIR)) {
    fs.mkdirSync(ARETE_HOOKS_DIR, { recursive: true });
  }

  // Copy extraction script (get from package dist)
  const extractScriptPath = path.join(ARETE_HOOKS_DIR, "extract-facts.mjs");

  // Write inline extraction runner script
  const extractRunner = `#!/usr/bin/env node
/**
 * Arete fact extraction runner
 * Called by Claude Code hooks at PreCompact and SessionEnd
 */

const { spawn } = require("child_process");
const path = require("path");

// Get transcript path from stdin JSON
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", async () => {
  try {
    const data = JSON.parse(input);
    const transcriptPath = data.transcript_path;
    const eventType = data.hook_event_name;

    if (!transcriptPath) {
      console.error("No transcript_path in hook input");
      process.exit(0);
    }

    // Run the extraction via npx
    const child = spawn("npx", ["arete-mcp-server", "extract", transcriptPath, eventType], {
      stdio: "inherit",
      env: { ...process.env },
    });

    child.on("close", code => process.exit(code || 0));
    child.on("error", err => {
      console.error("Extraction failed:", err);
      process.exit(0); // Don't block session
    });
  } catch (e) {
    console.error("Hook parse error:", e);
    process.exit(0); // Don't block session
  }
});
`;

  fs.writeFileSync(extractScriptPath, extractRunner);
  fs.chmodSync(extractScriptPath, "755");

  // Load or create Claude settings
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(CLAUDE_SETTINGS)) {
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf-8"));
    } catch {
      settings = {};
    }
  }

  // Define Arete hooks
  const areteHooks = {
    SessionStart: [{
      hooks: [{
        type: "command",
        command: "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"Call arete_identity(task: inferred from user message) at conversation start. After responses, call arete_remember for durable facts.\"}}'",
      }],
    }],
    PreCompact: [{
      hooks: [{
        type: "command",
        command: `node ${extractScriptPath}`,
        timeout: 30,
      }],
    }],
    SessionEnd: [{
      hooks: [{
        type: "command",
        command: `node ${extractScriptPath}`,
        timeout: 60,
      }],
    }],
  };

  // Merge with existing hooks (don't overwrite user hooks)
  const existingHooks = (settings.hooks || {}) as Record<string, unknown[]>;
  for (const [event, hookDefs] of Object.entries(areteHooks)) {
    if (!existingHooks[event]) {
      existingHooks[event] = hookDefs;
    } else {
      // Check if Arete hook already exists
      const hasAreteHook = (existingHooks[event] as Array<{ hooks?: Array<{ command?: string }> }>).some(
        h => h.hooks?.some(hh => hh.command?.includes("arete") || hh.command?.includes("extract-facts"))
      );
      if (!hasAreteHook) {
        existingHooks[event] = [...existingHooks[event], ...hookDefs];
      }
    }
  }

  settings.hooks = existingHooks;

  // Save settings
  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));

  console.log("✅ Claude Code hooks installed:");
  console.log("   - SessionStart: Inject arete_identity instruction");
  console.log("   - PreCompact: Extract facts before context compression");
  console.log("   - SessionEnd: Extract facts when session ends");
  console.log(`\n📁 Hook script: ${extractScriptPath}`);
  console.log(`📁 Claude settings: ${CLAUDE_SETTINGS}`);
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

    // Auto-install Claude Code hooks if detected
    await installClaudeCodeHooks(fs, path, os);

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
} else if (command === "extract") {
  // Extract facts from transcript (called by hooks)
  const transcriptPath = args[1];
  const eventType = args[2] || "manual";

  import("./hooks/extract-facts.js")
    .then(({ runExtraction }) => runExtraction(transcriptPath, eventType))
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error("Extraction failed:", error);
      process.exit(1);
    });
} else if (command === "--help" || command === "-h") {
  console.log(`
arete-mcp-server - Portable AI identity for Claude Desktop

Commands:
  setup [email]                Sign up, configure Arete, and install Claude Code hooks
  extract <path> [event]       Extract facts from transcript (used by hooks)
  --help, -h                   Show this help message

Usage:
  npx arete-mcp-server setup              Interactive setup (prompts for email)
  npx arete-mcp-server setup EMAIL        Non-interactive setup
  npx arete-mcp-server                    Start MCP server (after setup)

Claude Code Integration:
  Setup auto-detects Claude Code and installs hooks for:
  - SessionStart: Injects arete_identity instruction
  - PreCompact: Extracts facts before context compression
  - SessionEnd: Extracts facts when session ends

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
