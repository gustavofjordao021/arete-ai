/**
 * CLI Authentication Commands
 *
 * Manages API key authentication for CLI/MCP.
 *
 * Commands:
 *   arete auth login           Login with API key
 *   arete auth logout          Clear credentials
 *   arete auth whoami          Show current user
 *   arete auth status          Show authentication status
 */

import * as readline from "readline";
import {
  loadConfig,
  saveConfig,
  clearConfig,
  createCLIClient,
  type CLIConfig,
} from "../supabase/cli-client.js";

// Default Supabase URL (can be overridden with environment variable)
const DEFAULT_SUPABASE_URL =
  process.env.SUPABASE_URL || "https://dvjgxddjmevmmtzqmzrm.supabase.co";

/**
 * Prompt user for input (with optional hidden input for sensitive data)
 */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden && process.stdin.isTTY) {
      // Hide input for sensitive data
      process.stdout.write(question);
      let input = "";
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", (char) => {
        const c = char.toString();
        if (c === "\n" || c === "\r") {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          rl.close();
          resolve(input);
        } else if (c === "\u0003") {
          // Ctrl+C
          process.exit(1);
        } else if (c === "\u007f") {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(question + "*".repeat(input.length));
          }
        } else {
          input += c;
          process.stdout.write("*");
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Login with API key
 */
export async function cmdAuthLogin(apiKeyArg?: string): Promise<void> {
  console.log("\nArete CLI Authentication\n");

  // Check if already logged in
  const existingConfig = loadConfig();
  if (existingConfig.apiKey && existingConfig.userId) {
    console.log(`Already logged in as ${existingConfig.email || existingConfig.userId}`);
    const overwrite = await prompt("Overwrite existing credentials? (y/N): ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return;
    }
  }

  // Get API key
  let apiKey = apiKeyArg;
  if (!apiKey) {
    console.log("To get an API key:");
    console.log("1. Open the Arete extension popup in Chrome");
    console.log("2. Sign in with Google if not already");
    console.log("3. Go to Settings > Create API Key");
    console.log("");
    apiKey = await prompt("Enter your API key: ", true);
  }

  if (!apiKey || !apiKey.startsWith("sk_live_")) {
    console.error("\nError: Invalid API key format. Expected: sk_live_...");
    process.exit(1);
  }

  // Get Supabase URL
  let supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.log("");
    const urlInput = await prompt(
      `Supabase URL (Enter for default): `
    );
    supabaseUrl = urlInput || DEFAULT_SUPABASE_URL;
  }

  // Validate the API key
  console.log("\nValidating API key...");
  const client = createCLIClient({ supabaseUrl, apiKey });

  try {
    const result = await client.validateKey();

    if (!result) {
      console.error("\nError: Invalid or expired API key.");
      process.exit(1);
    }

    // Save config
    const config: CLIConfig = {
      supabaseUrl,
      apiKey,
      userId: result.userId,
      email: result.email,
    };
    saveConfig(config);

    console.log(`\nSuccess! Logged in as ${result.email || result.userId}`);
    console.log("\nYou can now use:");
    console.log("  arete identity get    - View your identity from cloud");
    console.log("  arete context list    - View your context events");
  } catch (error) {
    console.error("\nError validating API key:", (error as Error).message);
    process.exit(1);
  }
}

/**
 * Logout - clear credentials
 */
export function cmdAuthLogout(): void {
  const config = loadConfig();

  if (!config.apiKey) {
    console.log("Not currently logged in.");
    return;
  }

  clearConfig();
  console.log("Logged out successfully.");
  console.log("Local identity and context files are still preserved in ~/.arete/");
}

/**
 * Show current user
 */
export async function cmdAuthWhoami(): Promise<void> {
  const config = loadConfig();

  if (!config.apiKey || !config.supabaseUrl) {
    console.log("Not logged in. Run: arete auth login");
    return;
  }

  console.log("Checking authentication status...\n");

  const client = createCLIClient({
    supabaseUrl: config.supabaseUrl,
    apiKey: config.apiKey,
  });

  try {
    const result = await client.validateKey();

    if (!result) {
      console.log("Status: Not authenticated (API key may be expired)");
      console.log("\nRun: arete auth login");
      return;
    }

    console.log("Status: Authenticated");
    console.log(`User ID: ${result.userId}`);
    if (result.email) {
      console.log(`Email: ${result.email}`);
    }
    console.log(`\nAPI Key: ${config.apiKey.slice(0, 16)}...`);
    console.log(`Supabase: ${config.supabaseUrl}`);
  } catch (error) {
    console.error("Error checking status:", (error as Error).message);
  }
}

/**
 * Show authentication status
 */
export function cmdAuthStatus(): void {
  const config = loadConfig();

  if (!config.apiKey) {
    console.log("Status: Not logged in");
    console.log("\nRun: arete auth login");
    return;
  }

  console.log("Status: Configured");
  console.log(`API Key: ${config.apiKey.slice(0, 16)}...`);
  if (config.email) {
    console.log(`Email: ${config.email}`);
  }
  if (config.userId) {
    console.log(`User ID: ${config.userId}`);
  }
  if (config.supabaseUrl) {
    console.log(`Supabase: ${config.supabaseUrl}`);
  }
  console.log("\nRun: arete auth whoami   - to verify credentials are valid");
}

/**
 * Show auth help
 */
export function cmdAuthHelp(): void {
  console.log(`
Authentication Commands:
  arete auth login              Login with API key
  arete auth login <api-key>    Login with API key (inline)
  arete auth logout             Clear stored credentials
  arete auth whoami             Show current user and verify credentials
  arete auth status             Show stored credentials (without verification)

Getting an API Key:
  1. Open the Arete extension popup in Chrome
  2. Sign in with Google
  3. Go to Settings > Create API Key
  4. Copy the key and run: arete auth login

Environment Variables:
  SUPABASE_URL                  Override the default Supabase URL
`);
}
