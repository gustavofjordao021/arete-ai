/**
 * Tests for arete_update_identity MCP tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { updateIdentityHandler, setConfigDir } from "./identity-update.js";

const TEST_DIR = join(tmpdir(), "arete-mcp-update-test-" + Date.now());

// Mock @arete/core for cloud client tests
vi.mock("@arete/core", async () => {
  const actual = await vi.importActual("@arete/core");
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
    createCLIClient: vi.fn(),
  };
});

// Helper to create a valid identity structure matching AreteIdentitySchema
function createTestIdentity(overrides: Record<string, unknown> = {}) {
  return {
    meta: {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      deviceId: "test-device",
    },
    core: { name: "Test User", role: "Developer" },
    expertise: ["TypeScript", "React"],
    communication: {
      style: ["direct"],
      format: ["markdown"],
      avoid: ["jargon", "emojis"],
    },
    currentFocus: {
      // Projects must be ProjectSchema objects, not strings
      projects: [{ name: "Project A", description: "Test project", status: "active" }],
      goals: ["Ship MVP"],
    },
    context: { personal: [], professional: ["Works at startup"] },
    privacy: { public: [], private: [], localOnly: [] },
    custom: { theme: "dark" },
    sources: [],
    ...overrides,
  };
}

describe("arete_update_identity tool", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setConfigDir(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    vi.resetAllMocks();
  });

  describe("add operation", () => {
    it("adds item to expertise array", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "Supabase",
        reasoning: "User confirmed after browsing supabase.com",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.expertise).toContain("Supabase");
      expect(stored.expertise).toHaveLength(3);
    });

    it("adds item to nested field (communication.style)", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "communication",
        operation: "add",
        field: "style",
        value: "concise",
        reasoning: "Observed preference",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.communication.style).toContain("concise");
    });

    it("does not add duplicate items", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "TypeScript", // Already exists
        reasoning: "Trying to add duplicate",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.expertise.filter((e: string) => e === "TypeScript")).toHaveLength(1);
    });
  });

  describe("set operation", () => {
    it("sets currentFocus.projects array", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "currentFocus",
        operation: "set",
        field: "projects",
        value: [
          { name: "Arete", description: "Identity system", status: "active" },
          { name: "MCP Server", description: "Claude integration", status: "active" },
        ],
        reasoning: "User confirmed focus shift",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.currentFocus.projects).toEqual([
        { name: "Arete", description: "Identity system", status: "active" },
        { name: "MCP Server", description: "Claude integration", status: "active" },
      ]);
    });

    it("sets entire section when no field specified", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "set",
        value: ["Python", "FastAPI"],
        reasoning: "Complete expertise refresh",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.expertise).toEqual(["Python", "FastAPI"]);
    });

    it("sets custom section value", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "custom",
        operation: "set",
        field: "preferredEditor",
        value: "VSCode",
        reasoning: "User mentioned their editor",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.custom.preferredEditor).toBe("VSCode");
    });

    it("parses stringified JSON arrays (Claude workaround)", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      // Claude sometimes passes arrays as JSON strings
      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "set",
        value: '["Supabase", "React", "TypeScript"]', // String, not array!
        reasoning: "Testing JSON string parsing",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      // Should be parsed into actual array, not stored as string
      expect(Array.isArray(stored.expertise)).toBe(true);
      expect(stored.expertise).toEqual(["Supabase", "React", "TypeScript"]);
    });
  });

  describe("remove operation", () => {
    it("removes item from communication.avoid", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "communication",
        operation: "remove",
        field: "avoid",
        value: "emojis",
        reasoning: "User now wants emojis",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.communication.avoid).not.toContain("emojis");
      expect(stored.communication.avoid).toContain("jargon");
    });

    it("removes item from expertise array", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "remove",
        value: "React",
        reasoning: "User no longer uses React",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.expertise).not.toContain("React");
      expect(stored.expertise).toContain("TypeScript");
    });

    it("handles removing non-existent item gracefully", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "remove",
        value: "Go", // Doesn't exist
        reasoning: "Trying to remove non-existent",
      });

      expect(result.structuredContent.success).toBe(true);
    });
  });

  describe("protected sections", () => {
    it("rejects updates to core section", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "core" as any,
        operation: "set",
        field: "name",
        value: "Hacker",
        reasoning: "Trying to change name",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("protected");
    });

    it("rejects updates to meta section", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "meta" as any,
        operation: "set",
        value: { version: "99.0.0" },
        reasoning: "Trying to change meta",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("protected");
    });

    it("rejects updates to privacy section", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "privacy" as any,
        operation: "set",
        value: { public: ["everything"] },
        reasoning: "Trying to change privacy",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("protected");
    });
  });

  describe("response format", () => {
    it("returns previous and new values in response", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "Supabase",
        reasoning: "Learning Supabase",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.previousValue).toEqual(["TypeScript", "React"]);
      expect(result.structuredContent.newValue).toEqual(["TypeScript", "React", "Supabase"]);
    });

    it("includes human-readable text content", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "Supabase",
        reasoning: "Learning Supabase",
      });

      expect(result.content[0].text).toContain("expertise");
      expect(result.content[0].text).toContain("Supabase");
    });
  });

  describe("edge cases", () => {
    it("creates identity file if it does not exist", async () => {
      // No identity file exists
      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "TypeScript",
        reasoning: "First skill",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(existsSync(join(TEST_DIR, "identity.json"))).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.expertise).toContain("TypeScript");
    });

    it("handles corrupt identity file gracefully", async () => {
      writeFileSync(join(TEST_DIR, "identity.json"), "not valid json");

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "TypeScript",
        reasoning: "Recovery",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toBeDefined();
    });

    it("updates lastModified in meta on change", async () => {
      const oldDate = "2024-01-01T00:00:00.000Z";
      const identity = createTestIdentity({
        meta: { version: "1.0.0", lastModified: oldDate, deviceId: "test" },
      });
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "Supabase",
        reasoning: "Test",
      });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.meta.lastModified).not.toBe(oldDate);
    });
  });

  describe("cloud sync", () => {
    it("syncs to cloud when authenticated", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const { loadConfig, createCLIClient } = await import("@arete/core");

      const mockSaveIdentity = vi.fn().mockResolvedValue(undefined);

      vi.mocked(loadConfig).mockReturnValue({
        apiKey: "sk_live_test123",
        supabaseUrl: "https://test.supabase.co",
      });

      vi.mocked(createCLIClient).mockReturnValue({
        validateKey: vi.fn(),
        getIdentity: vi.fn(),
        saveIdentity: mockSaveIdentity,
        getRecentContext: vi.fn(),
        addContextEvent: vi.fn(),
        clearContext: vi.fn(),
      });

      await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "Supabase",
        reasoning: "Cloud sync test",
      });

      expect(mockSaveIdentity).toHaveBeenCalled();
    });

    it("works offline (local only) when not authenticated", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const { loadConfig } = await import("@arete/core");
      vi.mocked(loadConfig).mockReturnValue({});

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "Supabase",
        reasoning: "Offline test",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.expertise).toContain("Supabase");
    });

    it("continues on cloud sync failure", async () => {
      const identity = createTestIdentity();
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const { loadConfig, createCLIClient } = await import("@arete/core");

      vi.mocked(loadConfig).mockReturnValue({
        apiKey: "sk_live_test123",
        supabaseUrl: "https://test.supabase.co",
      });

      vi.mocked(createCLIClient).mockReturnValue({
        validateKey: vi.fn(),
        getIdentity: vi.fn(),
        saveIdentity: vi.fn().mockRejectedValue(new Error("Network error")),
        getRecentContext: vi.fn(),
        addContextEvent: vi.fn(),
        clearContext: vi.fn(),
      });

      const result = await updateIdentityHandler({
        section: "expertise",
        operation: "add",
        value: "Supabase",
        reasoning: "Cloud fail test",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      expect(stored.expertise).toContain("Supabase");
    });
  });
});
