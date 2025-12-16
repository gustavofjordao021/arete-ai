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

describe("validation opportunities (v2 identity)", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setConfigDir(TEST_DIR);
    vi.resetAllMocks();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  const createV2Identity = (facts: Array<{
    id: string;
    category: string;
    content: string;
    confidence: number;
    lastValidated: string;
    validationCount: number;
    maturity: string;
  }>) => ({
    version: "2.0.0",
    deviceId: "test-device",
    facts,
    core: { name: "Test User" },
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
    },
  });

  it("returns validation opportunities for stale facts", async () => {
    const { loadConfig } = await import("@arete/core");
    vi.mocked(loadConfig).mockReturnValue({});

    // Fact last validated 65 days ago with high confidence
    // At 65 days with halfLife=60: effective = 1.0 * 0.5^(65/60) ≈ 0.47 > 0.4 (not decayed)
    // But 65 >= 60 days (triggers stale reason)
    const oldDate = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString();
    const identity = createV2Identity([
      {
        id: "stale-fact",
        category: "expertise",
        content: "TypeScript development",
        confidence: 1.0,
        lastValidated: oldDate,
        validationCount: 1,
        maturity: "established",
      },
    ]);

    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.validationOpportunities).toBeDefined();
    expect(result.structuredContent.validationOpportunities!.length).toBeGreaterThan(0);
    expect(result.structuredContent.validationOpportunities![0].content).toBe("TypeScript development");
    expect(result.structuredContent.validationOpportunities![0].reason).toContain("60+");
  });

  it("returns validation opportunities for decayed confidence", async () => {
    const { loadConfig } = await import("@arete/core");
    vi.mocked(loadConfig).mockReturnValue({});

    // Fact with low confidence, validated long ago
    const oldDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
    const identity = createV2Identity([
      {
        id: "decayed-fact",
        category: "expertise",
        content: "React development",
        confidence: 0.6,
        lastValidated: oldDate,
        validationCount: 1,
        maturity: "candidate",
      },
    ]);

    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.validationOpportunities).toBeDefined();
    expect(result.structuredContent.validationOpportunities!.length).toBeGreaterThan(0);
    expect(result.structuredContent.validationOpportunities![0].reason).toContain("decayed");
  });

  it("does not return opportunities for recently validated proven facts", async () => {
    const { loadConfig } = await import("@arete/core");
    vi.mocked(loadConfig).mockReturnValue({});

    // Proven fact validated recently
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const identity = createV2Identity([
      {
        id: "proven-fact",
        category: "expertise",
        content: "JavaScript",
        confidence: 1.0,
        lastValidated: recentDate,
        validationCount: 10,
        maturity: "proven",
      },
    ]);

    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.validationOpportunities).toBeUndefined();
  });

  it("limits to top 3 opportunities", async () => {
    const { loadConfig } = await import("@arete/core");
    vi.mocked(loadConfig).mockReturnValue({});

    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const identity = createV2Identity([
      { id: "1", category: "expertise", content: "Fact 1", confidence: 0.8, lastValidated: oldDate, validationCount: 1, maturity: "established" },
      { id: "2", category: "expertise", content: "Fact 2", confidence: 0.8, lastValidated: oldDate, validationCount: 1, maturity: "established" },
      { id: "3", category: "expertise", content: "Fact 3", confidence: 0.8, lastValidated: oldDate, validationCount: 1, maturity: "established" },
      { id: "4", category: "expertise", content: "Fact 4", confidence: 0.8, lastValidated: oldDate, validationCount: 1, maturity: "established" },
      { id: "5", category: "expertise", content: "Fact 5", confidence: 0.8, lastValidated: oldDate, validationCount: 1, maturity: "established" },
    ]);

    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.validationOpportunities).toBeDefined();
    expect(result.structuredContent.validationOpportunities!.length).toBe(3);
  });

  it("adds validation hint to guidance when opportunities exist", async () => {
    const { loadConfig } = await import("@arete/core");
    vi.mocked(loadConfig).mockReturnValue({});

    const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const identity = createV2Identity([
      {
        id: "stale-fact",
        category: "expertise",
        content: "TypeScript",
        confidence: 0.8,
        lastValidated: oldDate,
        validationCount: 1,
        maturity: "established",
      },
    ]);

    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.guidance).toContain("arete_validate_fact");
    expect(result.structuredContent.guidance).toContain("fuzzy matching");
  });

  it("does not return opportunities for v1 identity", async () => {
    const { loadConfig } = await import("@arete/core");
    vi.mocked(loadConfig).mockReturnValue({});

    const v1Identity = {
      meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "test" },
      core: { name: "V1 User" },
      expertise: ["TypeScript"],
      communication: { style: [], format: [], avoid: [] },
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(v1Identity));

    const { getIdentityHandler: handler, setConfigDir: setDir } = await import("./identity.js");
    setDir(TEST_DIR);
    const result = await handler({});

    expect(result.structuredContent.validationOpportunities).toBeUndefined();
  });
});
