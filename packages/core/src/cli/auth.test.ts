/**
 * Tests for CLI auth commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Create a unique test directory
const TEST_DIR = join(tmpdir(), ".arete-auth-test-" + Date.now());
const CONFIG_FILE = join(TEST_DIR, "config.json");

// Mock os.homedir to use test directory
vi.mock("os", async () => {
  const actual = await vi.importActual("os");
  return {
    ...actual,
    homedir: () => tmpdir(),
  };
});

// Import after mocking
import {
  cmdAuthLogout,
  cmdAuthStatus,
  cmdAuthWhoami,
  cmdAuthHelp,
} from "./auth.js";
import {
  loadConfig,
  saveConfig,
  clearConfig,
  type CLIConfig,
} from "../supabase/cli-client.js";

// Helper to capture console output
function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  console.warn = (...args: unknown[]) => warns.push(args.join(" "));

  return {
    logs,
    errors,
    warns,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

describe("CLI Auth Commands", () => {
  beforeEach(() => {
    // Setup test directory
    const areteDir = join(tmpdir(), ".arete");
    if (!existsSync(areteDir)) {
      mkdirSync(areteDir, { recursive: true });
    }
    // Clear any existing config
    clearConfig();
  });

  afterEach(() => {
    // Cleanup
    clearConfig();
    vi.unstubAllGlobals();
  });

  describe("cmdAuthLogout", () => {
    it("clears credentials when logged in", () => {
      // Setup: logged in
      saveConfig({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test123",
        userId: "user-123",
        email: "test@example.com",
      });

      const output = captureConsole();
      cmdAuthLogout();
      output.restore();

      expect(output.logs.join(" ")).toContain("Logged out successfully");

      // Verify config is cleared
      const config = loadConfig();
      expect(config.apiKey).toBeUndefined();
    });

    it("handles not logged in state", () => {
      // Ensure not logged in
      clearConfig();

      const output = captureConsole();
      cmdAuthLogout();
      output.restore();

      expect(output.logs.join(" ")).toContain("Not currently logged in");
    });
  });

  describe("cmdAuthStatus", () => {
    it("shows status when logged in", () => {
      saveConfig({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_testkey12345678",
        userId: "user-123",
        email: "test@example.com",
      });

      const output = captureConsole();
      cmdAuthStatus();
      output.restore();

      const allLogs = output.logs.join(" ");
      expect(allLogs).toContain("Status: Configured");
      expect(allLogs).toContain("sk_live_testkey1");
      expect(allLogs).toContain("test@example.com");
      expect(allLogs).toContain("user-123");
    });

    it("shows not logged in when no credentials", () => {
      clearConfig();

      const output = captureConsole();
      cmdAuthStatus();
      output.restore();

      expect(output.logs.join(" ")).toContain("Status: Not logged in");
    });

    it("masks API key in output", () => {
      saveConfig({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_verysecretkey123456789",
        userId: "user-123",
      });

      const output = captureConsole();
      cmdAuthStatus();
      output.restore();

      const allLogs = output.logs.join(" ");
      // Should show only first 16 chars
      expect(allLogs).toContain("sk_live_verysecr...");
      // Should NOT show full key
      expect(allLogs).not.toContain("sk_live_verysecretkey123456789");
    });
  });

  describe("cmdAuthWhoami", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("shows not logged in when no credentials", async () => {
      clearConfig();

      const output = captureConsole();
      await cmdAuthWhoami();
      output.restore();

      expect(output.logs.join(" ")).toContain("Not logged in");
    });

    it("validates key and shows user info on success", async () => {
      saveConfig({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_validkey123456",
        userId: "user-123",
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          user_id: "user-123",
          email: "verified@example.com",
        }),
      } as Response);

      const output = captureConsole();
      await cmdAuthWhoami();
      output.restore();

      const allLogs = output.logs.join(" ");
      expect(allLogs).toContain("Status: Authenticated");
      expect(allLogs).toContain("user-123");
      expect(allLogs).toContain("verified@example.com");
    });

    it("shows expired message when key is invalid", async () => {
      saveConfig({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_expiredkey123",
        userId: "user-123",
      });

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ valid: false, error: "Invalid API key" }),
      } as Response);

      const output = captureConsole();
      await cmdAuthWhoami();
      output.restore();

      expect(output.logs.join(" ")).toContain("Not authenticated");
    });

    it("handles network errors gracefully", async () => {
      saveConfig({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_validkey123456",
      });

      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const output = captureConsole();
      await cmdAuthWhoami();
      output.restore();

      expect(output.errors.join(" ")).toContain("Error checking status");
    });
  });

  describe("cmdAuthHelp", () => {
    it("shows help text with all commands", () => {
      const output = captureConsole();
      cmdAuthHelp();
      output.restore();

      const allLogs = output.logs.join(" ");
      expect(allLogs).toContain("auth login");
      expect(allLogs).toContain("auth logout");
      expect(allLogs).toContain("auth whoami");
      expect(allLogs).toContain("auth status");
      expect(allLogs).toContain("API Key");
    });
  });
});

describe("cmdAuthLogin", () => {
  beforeEach(() => {
    const areteDir = join(tmpdir(), ".arete");
    if (!existsSync(areteDir)) {
      mkdirSync(areteDir, { recursive: true });
    }
    clearConfig();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    clearConfig();
    vi.unstubAllGlobals();
  });

  // Note: cmdAuthLogin is interactive and uses readline, making it harder to test.
  // We test the key validation flow using cmdAuthWhoami instead.
  // For full E2E testing, we'd need to mock readline or use a test harness.

  it("rejects invalid API key format", async () => {
    // Import dynamically to avoid side effects
    const { cmdAuthLogin } = await import("./auth.js");

    // Mock process.exit to prevent test from exiting
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const output = captureConsole();

    try {
      await cmdAuthLogin("invalid_key_format");
    } catch (e) {
      // Expected: process.exit throws
    }

    output.restore();
    mockExit.mockRestore();

    expect(output.errors.join(" ")).toContain("Invalid API key format");
  });

  it("validates API key with server", async () => {
    const { cmdAuthLogin } = await import("./auth.js");

    // Mock successful validation
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: true,
        user_id: "user-new-123",
        email: "new@example.com",
      }),
    } as Response);

    // Set environment variable to skip URL prompt
    const originalUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "https://test.supabase.co";

    const output = captureConsole();

    try {
      await cmdAuthLogin("sk_live_validkey12345678");
    } catch (e) {
      // May throw if readline is used
    }

    output.restore();
    process.env.SUPABASE_URL = originalUrl;

    // Check that validation was attempted
    // The CLI client uses anon key for Authorization, passes API key in body
    expect(fetch).toHaveBeenCalledWith(
      "https://test.supabase.co/functions/v1/auth-api-key",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ api_key: "sk_live_validkey12345678" }),
      })
    );
  });

  it("saves config on successful login", async () => {
    const { cmdAuthLogin } = await import("./auth.js");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        valid: true,
        user_id: "user-saved-123",
        email: "saved@example.com",
      }),
    } as Response);

    const originalUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "https://test.supabase.co";

    const output = captureConsole();

    try {
      await cmdAuthLogin("sk_live_tobesaved123456");
    } catch (e) {
      // May throw
    }

    output.restore();
    process.env.SUPABASE_URL = originalUrl;

    // Check config was saved
    const config = loadConfig();
    expect(config.apiKey).toBe("sk_live_tobesaved123456");
    expect(config.userId).toBe("user-saved-123");
    expect(config.email).toBe("saved@example.com");
  });

  it("handles validation failure", async () => {
    const { cmdAuthLogin } = await import("./auth.js");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ valid: false, error: "Invalid API key" }),
    } as Response);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const originalUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = "https://test.supabase.co";

    const output = captureConsole();

    try {
      await cmdAuthLogin("sk_live_invalidkey12345");
    } catch (e) {
      // Expected: process.exit throws
    }

    output.restore();
    mockExit.mockRestore();
    process.env.SUPABASE_URL = originalUrl;

    expect(output.errors.join(" ")).toContain("Invalid or expired API key");
  });
});
