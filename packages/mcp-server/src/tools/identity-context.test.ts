/**
 * Tests for arete_context MCP tool (Projection Engine)
 *
 * RED-GREEN-REFACTOR: These tests are written first (RED phase)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  contextHandler,
  projectIdentity,
  scoreRelevance,
  setConfigDir,
} from "./identity-context.js";

const TEST_DIR = join(tmpdir(), "arete-mcp-context-test-" + Date.now());

// Mock @arete/core - only cloud functions need mocking
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
  DEFAULT_HALF_LIFE_DAYS: 60,
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

// Helper to create a test fact
function createTestFact(
  overrides: Partial<IdentityFact> & { category: string; content: string }
): IdentityFact {
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

// Helper to create a fact with old lastValidated (for decay tests)
// Note: Uses "established" maturity by default so it can be filtered
// (proven facts are always included regardless of confidence)
function createOldFact(
  content: string,
  daysAgo: number,
  category: string = "expertise",
  maturity: string = "established"
): IdentityFact {
  const oldDate = new Date(
    Date.now() - daysAgo * 24 * 60 * 60 * 1000
  ).toISOString();
  return createTestFact({
    category,
    content,
    lastValidated: oldDate,
    confidence: 1.0,
    maturity,
  });
}

describe("arete_context tool", () => {
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

  describe("scoreRelevance", () => {
    it("returns 0.5 when no task provided", () => {
      const fact = createTestFact({ category: "expertise", content: "TypeScript" });
      const score = scoreRelevance(fact, undefined);
      expect(score).toBe(0.5);
    });

    it("scores higher when fact content matches task keywords", () => {
      const fact = createTestFact({ category: "expertise", content: "React hooks" });
      const score = scoreRelevance(fact, "Help me debug this React component");
      expect(score).toBeGreaterThan(0.5);
    });

    it("scores low when fact content doesn't match task", () => {
      const fact = createTestFact({ category: "expertise", content: "Cooking recipes" });
      const score = scoreRelevance(fact, "Help me debug this React component");
      expect(score).toBeLessThanOrEqual(0.5);
    });

    it("boosts expertise facts for debug tasks", () => {
      const expertiseFact = createTestFact({ category: "expertise", content: "JavaScript" });
      const preferenceFact = createTestFact({ category: "preference", content: "JavaScript style" });

      const expertiseScore = scoreRelevance(expertiseFact, "debug this code");
      const preferenceScore = scoreRelevance(preferenceFact, "debug this code");

      expect(expertiseScore).toBeGreaterThan(preferenceScore);
    });

    it("boosts preference facts for writing tasks", () => {
      const preferenceFact = createTestFact({
        category: "preference",
        content: "Communication style: concise",
      });
      const expertiseFact = createTestFact({
        category: "expertise",
        content: "Writing skills",
      });

      const preferenceScore = scoreRelevance(preferenceFact, "write documentation");
      const expertiseScore = scoreRelevance(expertiseFact, "write documentation");

      expect(preferenceScore).toBeGreaterThan(expertiseScore);
    });

    it("caps relevance score at 1.0", () => {
      const fact = createTestFact({
        category: "expertise",
        content: "React TypeScript hooks debugging components",
      });
      const score = scoreRelevance(fact, "debug React TypeScript hooks component");
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe("projectIdentity", () => {
    it("returns empty array when no identity exists", async () => {
      const result = await projectIdentity({});
      expect(result.facts).toEqual([]);
      expect(result.totalFacts).toBe(0);
    });

    it("returns all facts when no filters applied", async () => {
      const facts = [
        createTestFact({ category: "expertise", content: "TypeScript" }),
        createTestFact({ category: "expertise", content: "React" }),
        createTestFact({ category: "preference", content: "Concise responses" }),
      ];
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({});

      expect(result.facts.length).toBe(3);
      expect(result.totalFacts).toBe(3);
      expect(result.filteredOut).toBe(0);
    });

    it("filters out low confidence facts", async () => {
      const facts = [
        createTestFact({
          category: "expertise",
          content: "TypeScript",
          confidence: 0.8,
        }),
        createTestFact({
          category: "expertise",
          content: "COBOL",
          confidence: 0.1, // Below default threshold
        }),
      ];
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({ minConfidence: 0.3 });

      expect(result.facts.length).toBe(1);
      expect(result.facts[0].content).toBe("TypeScript");
      expect(result.filteredOut).toBe(1);
    });

    it("applies confidence decay based on lastValidated", async () => {
      const recentFact = createTestFact({
        category: "expertise",
        content: "Fresh skill",
        confidence: 1.0,
      });
      const oldFact = createOldFact("Stale skill", 120); // 2 half-lives = 0.25 effective

      const identity = createTestIdentityV2([recentFact, oldFact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({ minConfidence: 0.3 });

      // Old fact should be filtered out (0.25 < 0.3)
      expect(result.facts.length).toBe(1);
      expect(result.facts[0].content).toBe("Fresh skill");
    });

    it("respects maxFacts limit", async () => {
      const facts = Array.from({ length: 20 }, (_, i) =>
        createTestFact({ category: "expertise", content: `Skill ${i}` })
      );
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({ maxFacts: 5 });

      expect(result.facts.length).toBe(5);
      expect(result.totalFacts).toBe(20);
      expect(result.filteredOut).toBe(15);
    });

    it("ranks facts by relevance × confidence", async () => {
      const facts = [
        createTestFact({
          category: "expertise",
          content: "TypeScript",
          confidence: 0.9,
        }),
        createTestFact({
          category: "expertise",
          content: "React",
          confidence: 0.7,
        }),
        createTestFact({
          category: "expertise",
          content: "Cooking",
          confidence: 1.0, // High confidence but irrelevant
        }),
      ];
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({ task: "debug React component" });

      // React should rank higher than Cooking despite lower confidence
      const reactIndex = result.facts.findIndex((f) => f.content === "React");
      const cookingIndex = result.facts.findIndex((f) => f.content === "Cooking");
      expect(reactIndex).toBeLessThan(cookingIndex);
    });

    it("includes relevanceScore in projected facts", async () => {
      const facts = [
        createTestFact({ category: "expertise", content: "TypeScript React" }),
      ];
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({ task: "build React app" });

      expect(result.facts[0].relevanceScore).toBeDefined();
      expect(typeof result.facts[0].relevanceScore).toBe("number");
    });

    it("includes effectiveConfidence in projected facts", async () => {
      const facts = [createOldFact("Old skill", 60)]; // Half-life = 0.5 effective
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({});

      expect(result.facts[0].effectiveConfidence).toBeDefined();
      expect(result.facts[0].effectiveConfidence).toBeCloseTo(0.5, 1);
    });
  });

  describe("contextHandler", () => {
    it("returns formatted projection for MCP tool", async () => {
      const facts = [
        createTestFact({ category: "expertise", content: "TypeScript" }),
        createTestFact({ category: "preference", content: "Concise style" }),
      ];
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await contextHandler({ task: "code review" });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.projection).toBeDefined();
    });

    it("returns empty projection gracefully", async () => {
      const result = await contextHandler({});

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.projection.facts).toEqual([]);
    });

    it("includes task in response when provided", async () => {
      const facts = [
        createTestFact({ category: "expertise", content: "React" }),
      ];
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await contextHandler({ task: "debug React hooks" });

      expect(result.content[0].text).toContain("debug React hooks");
    });

    it("formats facts for system prompt injection", async () => {
      const facts = [
        createTestFact({ category: "expertise", content: "TypeScript" }),
        createTestFact({ category: "expertise", content: "React" }),
      ];
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await contextHandler({ task: "code review" });

      const text = result.content[0].text;
      expect(text).toContain("TypeScript");
      expect(text).toContain("React");
    });

    it("handles v1 identity gracefully", async () => {
      const v1Identity = {
        meta: {
          version: "1.0.0",
          lastModified: new Date().toISOString(),
          deviceId: "test",
        },
        core: { name: "Test" },
        expertise: ["TypeScript"],
        communication: { style: [], format: [], avoid: [] },
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };
      writeFileSync(
        join(TEST_DIR, "identity.json"),
        JSON.stringify(v1Identity)
      );

      const result = await contextHandler({});

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("v2");
    });

    it("passes through maxFacts and minConfidence", async () => {
      const facts = Array.from({ length: 10 }, (_, i) =>
        createTestFact({ category: "expertise", content: `Skill ${i}` })
      );
      const identity = createTestIdentityV2(facts);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await contextHandler({ maxFacts: 3, minConfidence: 0.5 });

      expect(result.structuredContent.projection.facts.length).toBeLessThanOrEqual(3);
    });
  });

  describe("proven facts always included", () => {
    it("includes proven facts regardless of relevance", async () => {
      const provenFact = createTestFact({
        category: "core",
        content: "Senior Engineer",
        maturity: "proven",
        validationCount: 10,
        confidence: 1.0,
      });
      const candidateFact = createTestFact({
        category: "expertise",
        content: "React", // More relevant to task
        maturity: "candidate",
        confidence: 0.5,
      });
      const identity = createTestIdentityV2([provenFact, candidateFact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await projectIdentity({ task: "React debugging", maxFacts: 10 });

      // Both should be included - proven facts always make it
      const hasProven = result.facts.some((f) => f.content === "Senior Engineer");
      expect(hasProven).toBe(true);
    });
  });
});
