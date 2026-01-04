/**
 * Tests for CLI client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock the fs and os modules to use temp directory
const TEST_CONFIG_DIR = join(tmpdir(), ".arete-test-" + Date.now());

vi.mock("os", async () => {
  const actual = await vi.importActual("os");
  return {
    ...actual,
    homedir: () => tmpdir(),
  };
});

// Import after mocking
import {
  loadConfig,
  saveConfig,
  clearConfig,
  createCLIClient,
  type CLIConfig,
} from "./cli-client";

describe("CLI Config", () => {
  const configFile = join(tmpdir(), ".arete", "config.json");
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear env vars that loadConfig reads
    delete process.env.ARETE_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.OPENAI_API_KEY;

    // Ensure clean state
    try {
      if (existsSync(configFile)) {
        unlinkSync(configFile);
      }
    } catch {
      // Ignore
    }
  });

  afterEach(() => {
    // Restore env vars
    process.env = { ...originalEnv };

    // Cleanup
    try {
      if (existsSync(configFile)) {
        unlinkSync(configFile);
      }
    } catch {
      // Ignore
    }
  });

  it("returns empty config when no file exists", () => {
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("saves and loads config", () => {
    const config: CLIConfig = {
      supabaseUrl: "https://test.supabase.co",
      apiKey: "sk_live_test123",
      userId: "user-123",
      email: "test@example.com",
    };

    saveConfig(config);
    const loaded = loadConfig();

    // loadConfig spreads file config and adds env var fields
    expect(loaded.apiKey).toBe(config.apiKey);
    expect(loaded.supabaseUrl).toBe(config.supabaseUrl);
    expect(loaded.userId).toBe(config.userId);
    expect(loaded.email).toBe(config.email);
  });

  it("clears config", () => {
    saveConfig({
      apiKey: "sk_live_test",
      supabaseUrl: "https://test.supabase.co",
    });

    clearConfig();
    const config = loadConfig();

    expect(config).toEqual({});
  });
});

describe("CLI Client", () => {
  it("creates client with options", () => {
    const client = createCLIClient({
      supabaseUrl: "https://test.supabase.co",
      apiKey: "sk_live_test123",
    });

    expect(client).toBeDefined();
    expect(client.validateKey).toBeInstanceOf(Function);
    expect(client.getIdentity).toBeInstanceOf(Function);
    expect(client.saveIdentity).toBeInstanceOf(Function);
    expect(client.getRecentContext).toBeInstanceOf(Function);
    expect(client.addContextEvent).toBeInstanceOf(Function);
    expect(client.clearContext).toBeInstanceOf(Function);
  });

  describe("with mocked fetch", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("validateKey returns user info on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, user_id: "user-123", email: "test@test.com" }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test",
      });

      const result = await client.validateKey();

      expect(result).toEqual({ userId: "user-123", email: "test@test.com" });
      // validateKey uses anon key for Authorization, passes API key in body
      expect(fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/auth-api-key",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ api_key: "sk_live_test" }),
        })
      );
    });

    it("validateKey returns null on invalid key", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ valid: false, error: "Invalid API key" }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_invalid",
      });

      const result = await client.validateKey();

      expect(result).toBeNull();
    });

    it("getIdentity fetches from edge function with X-API-Key header", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          identity: {
            core: { name: "Test User" },
            expertise: [],
            communication: { style: [], avoid: [] },
            currentFocus: { projects: [], goals: [] },
            meta: { version: "1.0.0" },
          },
        }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test",
      });

      const identity = await client.getIdentity();

      expect(identity?.core.name).toBe("Test User");
      expect(fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/cli-identity",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-API-Key": "sk_live_test",
          }),
        })
      );
    });

    it("saveIdentity posts to edge function with X-API-Key header", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test",
      });

      // Use a complete identity structure that matches the schema
      const identity = {
        meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "test" },
        core: { name: "Test" },
        expertise: [],
        communication: { style: [], format: [], avoid: [] },
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      await client.saveIdentity(identity);

      expect(fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/cli-identity",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ identity }),
          headers: expect.objectContaining({
            "X-API-Key": "sk_live_test",
          }),
        })
      );
    });

    it("getRecentContext fetches with query params and X-API-Key", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [{ id: "1", type: "page_visit", source: "chrome" }],
          count: 1,
        }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test",
      });

      const events = await client.getRecentContext({
        type: "page_visit",
        source: "chrome",
        limit: 10,
      });

      expect(events).toHaveLength(1);
      expect(fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/cli-context?type=page_visit&source=chrome&limit=10",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-API-Key": "sk_live_test",
          }),
        })
      );
    });

    it("addContextEvent posts event", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          event: { id: "new-1", type: "insight", source: "claude-desktop" },
        }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test",
      });

      const event = await client.addContextEvent({
        type: "insight",
        source: "claude-desktop",
        data: { insight: "User prefers TypeScript" },
      });

      expect(event.id).toBe("new-1");
      expect(fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/cli-context",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("insight"),
        })
      );
    });

    it("clearContext sends DELETE request", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, cleared: "all" }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test",
      });

      await client.clearContext();

      expect(fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/cli-context",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("clearContext with type sends filtered DELETE", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, cleared: "page_visit" }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_test",
      });

      await client.clearContext("page_visit");

      expect(fetch).toHaveBeenCalledWith(
        "https://test.supabase.co/functions/v1/cli-context?type=page_visit",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("throws error on failed request", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid API key" }),
      } as Response);

      const client = createCLIClient({
        supabaseUrl: "https://test.supabase.co",
        apiKey: "sk_live_invalid",
      });

      await expect(client.getIdentity()).rejects.toThrow("Invalid API key");
    });
  });
});
