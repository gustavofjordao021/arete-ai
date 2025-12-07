import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getIdentityHandler, setConfigDir } from "./identity.js";

const TEST_DIR = join(tmpdir(), "arete-mcp-test-" + Date.now());

// Mock @arete/core for cloud client tests
vi.mock("@arete/core", async () => {
  const actual = await vi.importActual("@arete/core");
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
    createCLIClient: vi.fn(),
  };
});

describe("arete_get_identity tool", () => {
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
  });

  it("returns empty identity when no file exists", async () => {
    const result = await getIdentityHandler({});

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe("text");
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent.exists).toBe(false);
  });

  it("returns identity when file exists", async () => {
    const identity = {
      meta: {
        version: "1.0.0",
        lastModified: new Date().toISOString(),
        deviceId: "test-device",
      },
      core: {
        name: "Test User",
        role: "Developer",
        location: "SF",
        background: "Test background",
      },
      expertise: ["TypeScript", "MCP"],
      communication: { style: ["direct"], format: [], avoid: [] },
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    writeFileSync(
      join(TEST_DIR, "identity.json"),
      JSON.stringify(identity, null, 2)
    );

    const result = await getIdentityHandler({});

    expect(result.structuredContent.exists).toBe(true);
    expect(result.structuredContent.identity?.core.name).toBe("Test User");
    expect(result.structuredContent.identity?.core.role).toBe("Developer");
  });

  it("returns formatted text for system prompt injection", async () => {
    const identity = {
      meta: {
        version: "1.0.0",
        lastModified: new Date().toISOString(),
        deviceId: "test-device",
      },
      core: {
        name: "Alice",
        role: "PM",
        background: "Product manager at tech startup",
      },
      expertise: ["Product", "Strategy"],
      communication: { style: ["concise"], format: [], avoid: ["jargon"] },
      currentFocus: { projects: [], goals: ["Ship MVP"] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    writeFileSync(
      join(TEST_DIR, "identity.json"),
      JSON.stringify(identity, null, 2)
    );

    const result = await getIdentityHandler({ format: "prompt" });

    expect(result.content[0].type).toBe("text");
    const text = result.content[0].text;
    expect(text).toContain("Alice");
    expect(text).toContain("PM");
  });

  it("handles corrupt identity file gracefully", async () => {
    writeFileSync(join(TEST_DIR, "identity.json"), "not valid json");

    const result = await getIdentityHandler({});

    expect(result.structuredContent.exists).toBe(false);
    expect(result.structuredContent.error).toBeDefined();
  });
});

describe("arete_get_identity cloud sync", () => {
  beforeEach(async () => {
    vi.resetModules();

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

  it("fetches from cloud when authenticated", async () => {
    const { loadConfig, createCLIClient } = await import("@arete/core");

    const mockIdentity = {
      meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "cloud" },
      core: { name: "Cloud User", role: "Engineer" },
      expertise: ["Cloud"],
      communication: { style: [], format: [], avoid: [] },
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    vi.mocked(loadConfig).mockReturnValue({
      apiKey: "sk_live_test123",
      supabaseUrl: "https://test.supabase.co",
    });

    vi.mocked(createCLIClient).mockReturnValue({
      validateKey: vi.fn(),
      getIdentity: vi.fn().mockResolvedValue(mockIdentity),
      saveIdentity: vi.fn(),
      getRecentContext: vi.fn(),
      addContextEvent: vi.fn(),
      clearContext: vi.fn(),
    });

    // Re-import handler after mocks are set
    const { getIdentityHandler: handler } = await import("./identity.js");
    const result = await handler({});

    expect(result.structuredContent.exists).toBe(true);
    expect(result.structuredContent.identity?.core.name).toBe("Cloud User");
    expect(result.content[0].text).toContain("synced from cloud");
  });

  it("falls back to local file when cloud fails", async () => {
    const { loadConfig, createCLIClient } = await import("@arete/core");

    // Write local identity
    const localIdentity = {
      meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "local" },
      core: { name: "Local User", role: "Developer" },
      expertise: ["Local"],
      communication: { style: [], format: [], avoid: [] },
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };
    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(localIdentity));

    vi.mocked(loadConfig).mockReturnValue({
      apiKey: "sk_live_test123",
      supabaseUrl: "https://test.supabase.co",
    });

    vi.mocked(createCLIClient).mockReturnValue({
      validateKey: vi.fn(),
      getIdentity: vi.fn().mockRejectedValue(new Error("Network error")),
      saveIdentity: vi.fn(),
      getRecentContext: vi.fn(),
      addContextEvent: vi.fn(),
      clearContext: vi.fn(),
    });

    // Re-import handler after mocks are set
    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.exists).toBe(true);
    expect(result.structuredContent.identity?.core.name).toBe("Local User");
    // Should not contain cloud prefix since we fell back
    expect(result.content[0].text).not.toContain("cloud");
  });

  it("uses local when not authenticated", async () => {
    const { loadConfig } = await import("@arete/core");

    // Write local identity
    const localIdentity = {
      meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "local" },
      core: { name: "Offline User" },
      expertise: [],
      communication: { style: [], format: [], avoid: [] },
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };
    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(localIdentity));

    // No credentials
    vi.mocked(loadConfig).mockReturnValue({});

    // Re-import handler after mocks are set
    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.exists).toBe(true);
    expect(result.structuredContent.identity?.core.name).toBe("Offline User");
  });

  it("shows cloud prefix in prompt format", async () => {
    const { loadConfig, createCLIClient } = await import("@arete/core");

    const mockIdentity = {
      meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "cloud" },
      core: { name: "Prompt User", role: "PM" },
      expertise: ["Product"],
      communication: { style: ["concise"], format: [], avoid: [] },
      currentFocus: { projects: [], goals: ["Ship MVP"] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    vi.mocked(loadConfig).mockReturnValue({
      apiKey: "sk_live_test123",
      supabaseUrl: "https://test.supabase.co",
    });

    vi.mocked(createCLIClient).mockReturnValue({
      validateKey: vi.fn(),
      getIdentity: vi.fn().mockResolvedValue(mockIdentity),
      saveIdentity: vi.fn(),
      getRecentContext: vi.fn(),
      addContextEvent: vi.fn(),
      clearContext: vi.fn(),
    });

    // Re-import handler after mocks are set
    const { getIdentityHandler: handler } = await import("./identity.js");
    const result = await handler({ format: "prompt" });

    expect(result.content[0].text).toContain("(from cloud)");
    expect(result.content[0].text).toContain("Prompt User");
  });
});
