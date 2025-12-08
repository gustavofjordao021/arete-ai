/**
 * Tests for arete_validate_fact MCP tool
 *
 * RED-GREEN-REFACTOR: These tests are written first (RED phase)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  validateFactHandler,
  setConfigDir,
} from "./identity-validate.js";

const TEST_DIR = join(tmpdir(), "arete-mcp-validate-test-" + Date.now());

// Mock @arete/core - only cloud functions need mocking
// The handler uses local implementations for isIdentityV2 and validateFact
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
}));

// Types for test helpers
interface IdentityFact {
  id: string;
  category: string;
  content: string;
  confidence: number;
  lastValidated: string;
  validationCount: number;
  maturity: string;
  source: string;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

interface IdentityV2 {
  version: string;
  deviceId: string;
  userId?: string;
  facts: IdentityFact[];
  core: { name?: string; role?: string };
  settings: {
    decayHalfLifeDays: number;
    autoInfer: boolean;
    excludedDomains: string[];
  };
}

// Helper to create a test fact (inline, no module import needed)
function createTestFact(overrides: Partial<IdentityFact> & { category: string; content: string }): IdentityFact {
  const now = new Date().toISOString();
  const source = overrides.source ?? "manual";
  const isManual = source === "manual";

  return {
    id: crypto.randomUUID(),
    category: overrides.category,
    content: overrides.content,
    confidence: overrides.confidence ?? (isManual ? 1.0 : 0.5),
    lastValidated: overrides.lastValidated ?? now,
    validationCount: overrides.validationCount ?? (isManual ? 1 : 0),
    maturity: overrides.maturity ?? (isManual ? "established" : "candidate"),
    source,
    sourceRef: overrides.sourceRef,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// Helper to create a v2 identity with facts
function createTestIdentityV2(facts: IdentityFact[] = []): IdentityV2 {
  return {
    version: "2.0.0",
    deviceId: "test-device",
    facts,
    core: { name: "Test User", role: "Developer" },
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
    },
  };
}

describe("arete_validate_fact tool", () => {
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

  describe("validation by factId", () => {
    it("validates fact by ID and increases validationCount", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "TypeScript",
        source: "inferred",
        confidence: 0.5,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await validateFactHandler({
        factId: fact.id,
        reasoning: "User confirmed TypeScript expertise",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.id === fact.id);
      expect(updatedFact.validationCount).toBe(1);
    });

    it("boosts confidence by 0.2 on validation", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "React",
        source: "inferred",
        confidence: 0.5,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await validateFactHandler({
        factId: fact.id,
        reasoning: "Confirmed React skills",
      });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.id === fact.id);
      expect(updatedFact.confidence).toBe(0.7);
    });

    it("caps confidence at 1.0", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "Node.js",
        confidence: 0.9,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await validateFactHandler({
        factId: fact.id,
        reasoning: "Strong Node.js expertise",
      });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.id === fact.id);
      expect(updatedFact.confidence).toBe(1.0);
    });

    it("updates lastValidated timestamp", async () => {
      const oldDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
      const fact = createTestFact({
        category: "expertise",
        content: "Python",
        source: "inferred",
        lastValidated: oldDate,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await validateFactHandler({
        factId: fact.id,
        reasoning: "Still using Python",
      });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.id === fact.id);
      expect(new Date(updatedFact.lastValidated).getTime()).toBeGreaterThan(
        new Date(oldDate).getTime()
      );
    });
  });

  describe("validation by content match", () => {
    it("validates fact by exact content match when factId not found", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "Supabase",
        source: "inferred",
        confidence: 0.6,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await validateFactHandler({
        factId: "non-existent-id",
        content: "Supabase", // Fallback to content match
        reasoning: "User knows Supabase",
      });

      expect(result.structuredContent.success).toBe(true);

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.content === "Supabase");
      expect(updatedFact.validationCount).toBe(1);
    });

    it("validates fact by content match alone (no factId)", async () => {
      const fact = createTestFact({
        category: "preference",
        content: "Communication style: concise",
        source: "inferred",
        confidence: 0.5,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await validateFactHandler({
        content: "Communication style: concise",
        reasoning: "User prefers concise responses",
      });

      expect(result.structuredContent.success).toBe(true);
    });
  });

  describe("maturity progression", () => {
    it("promotes candidate to established after 2 validations", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "GraphQL",
        source: "inferred",
        confidence: 0.5,
        validationCount: 1,
        maturity: "candidate",
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await validateFactHandler({
        factId: fact.id,
        reasoning: "GraphQL confirmed again",
      });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.id === fact.id);
      expect(updatedFact.maturity).toBe("established");
      expect(updatedFact.validationCount).toBe(2);
    });

    it("promotes established to proven after 5 validations", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "Docker",
        source: "inferred",
        validationCount: 4,
        maturity: "established",
        confidence: 0.9,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await validateFactHandler({
        factId: fact.id,
        reasoning: "Docker expertise proven",
      });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.id === fact.id);
      expect(updatedFact.maturity).toBe("proven");
      expect(updatedFact.validationCount).toBe(5);
    });

    it("keeps proven facts as proven", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "JavaScript",
        validationCount: 10,
        maturity: "proven",
        confidence: 1.0,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await validateFactHandler({
        factId: fact.id,
        reasoning: "Still proven",
      });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const updatedFact = stored.facts.find((f: IdentityFact) => f.id === fact.id);
      expect(updatedFact.maturity).toBe("proven");
    });
  });

  describe("error handling", () => {
    it("returns error when fact not found", async () => {
      const identity = createTestIdentityV2([]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await validateFactHandler({
        factId: "non-existent-id",
        reasoning: "Trying to validate missing fact",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("not found");
    });

    it("returns error when identity file is corrupt", async () => {
      writeFileSync(join(TEST_DIR, "identity.json"), "not valid json");

      const result = await validateFactHandler({
        factId: "some-id",
        reasoning: "Corrupt file test",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toBeDefined();
    });

    it("handles v1 identity gracefully (no facts array)", async () => {
      // v1 identity doesn't have facts array
      const v1Identity = {
        meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "test" },
        core: { name: "Test" },
        expertise: ["TypeScript"],
        communication: { style: [], format: [], avoid: [] },
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(v1Identity));

      const result = await validateFactHandler({
        factId: "some-id",
        reasoning: "v1 identity test",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("v2");
    });
  });

  describe("response format", () => {
    it("returns previous and updated fact in response", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "Rust",
        source: "inferred",
        confidence: 0.5,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await validateFactHandler({
        factId: fact.id,
        reasoning: "Learning Rust",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.previousFact?.confidence).toBe(0.5);
      expect(result.structuredContent.updatedFact?.confidence).toBe(0.7);
      expect(result.structuredContent.updatedFact?.validationCount).toBe(1);
    });

    it("includes human-readable text content", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "Go",
        source: "inferred",
        confidence: 0.6,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await validateFactHandler({
        factId: fact.id,
        reasoning: "Confirmed Go expertise",
      });

      expect(result.content[0].text).toContain("Go");
      expect(result.content[0].text).toContain("validated");
    });
  });

  describe("cloud sync", () => {
    it("syncs to cloud when authenticated", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "AWS",
        source: "inferred",
        confidence: 0.5,
      });
      const identity = createTestIdentityV2([fact]);
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

      await validateFactHandler({
        factId: fact.id,
        reasoning: "Cloud sync test",
      });

      expect(mockSaveIdentity).toHaveBeenCalled();
    });

    it("works offline when not authenticated", async () => {
      const fact = createTestFact({
        category: "expertise",
        content: "GCP",
        source: "inferred",
        confidence: 0.5,
      });
      const identity = createTestIdentityV2([fact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const { loadConfig } = await import("@arete/core");
      vi.mocked(loadConfig).mockReturnValue({});

      const result = await validateFactHandler({
        factId: fact.id,
        reasoning: "Offline test",
      });

      expect(result.structuredContent.success).toBe(true);
    });
  });
});
