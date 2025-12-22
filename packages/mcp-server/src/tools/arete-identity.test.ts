/**
 * Tests for arete_identity - consolidated identity tool
 *
 * Replaces: arete_get_identity, arete_context
 * Mental model: "Know me"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock @arete/core - only cloud functions need mocking
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
  DEFAULT_HALF_LIFE_DAYS: 60,
}));

import {
  identityHandler,
  setConfigDir,
  type IdentityInput,
} from "./arete-identity.js";

describe("arete_identity", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `arete-identity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    setConfigDir(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // --- Core functionality ---

  describe("without task", () => {
    it("returns all facts sorted by effective confidence", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "Expert in React", category: "expertise", confidence: 0.9 },
        { id: "2", content: "Prefers TypeScript", category: "preference", confidence: 0.7 },
        { id: "3", content: "Based in SF", category: "context", confidence: 0.5 },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({});

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.facts.length).toBe(3);
      // Should be sorted by confidence (highest first)
      expect(result.structuredContent.facts[0].content).toBe("Expert in React");
      expect(result.structuredContent.facts[1].content).toBe("Prefers TypeScript");
      expect(result.structuredContent.facts[2].content).toBe("Based in SF");
    });

    it("returns empty array when no identity exists", async () => {
      const result = await identityHandler({});

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.facts).toEqual([]);
      expect(result.structuredContent.totalFacts).toBe(0);
    });
  });

  describe("with task", () => {
    it("uses semantic scoring when task provided", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "Expert in React and TypeScript", category: "expertise", confidence: 0.9 },
        { id: "2", content: "Likes to cook Italian food", category: "preference", confidence: 0.9 },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({ task: "debug React hook" });

      expect(result.structuredContent.success).toBe(true);
      // With task, should include scoringMethod
      expect(result.structuredContent.scoringMethod).toBeDefined();
      // React expertise should score higher than cooking preference
      const facts = result.structuredContent.facts;
      const reactFact = facts.find(f => f.content.includes("React"));
      const cookingFact = facts.find(f => f.content.includes("cook"));
      if (reactFact && cookingFact) {
        expect(reactFact.relevanceScore).toBeGreaterThan(cookingFact.relevanceScore);
      }
    });

    it("respects maxFacts parameter", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "Fact 1", category: "expertise", confidence: 0.9 },
        { id: "2", content: "Fact 2", category: "expertise", confidence: 0.8 },
        { id: "3", content: "Fact 3", category: "expertise", confidence: 0.7 },
        { id: "4", content: "Fact 4", category: "expertise", confidence: 0.6 },
        { id: "5", content: "Fact 5", category: "expertise", confidence: 0.5 },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({ maxFacts: 3 });

      expect(result.structuredContent.facts.length).toBe(3);
      expect(result.structuredContent.totalFacts).toBe(5);
      expect(result.structuredContent.filteredOut).toBe(2);
    });
  });

  describe("format parameter", () => {
    it("returns json format by default", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "Expert in React", category: "expertise", confidence: 0.9 },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({});

      expect(result.structuredContent.format).toBe("json");
      // Should NOT have formatted field
      expect(result.structuredContent.formatted).toBeUndefined();
    });

    it("returns formatted prompt when format=prompt", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "Expert in React", category: "expertise", confidence: 0.9 },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({ format: "prompt" });

      expect(result.structuredContent.format).toBe("prompt");
      expect(result.structuredContent.formatted).toBeDefined();
      expect(result.structuredContent.formatted).toContain("React");
    });
  });

  describe("guidance", () => {
    it("includes guidance for natural personalization", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "Expert in React", category: "expertise", confidence: 0.9 },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({});

      expect(result.structuredContent.guidance).toBeDefined();
      expect(result.structuredContent.guidance).toContain("naturally");
    });
  });

  describe("minConfidence filter", () => {
    it("filters facts below minConfidence threshold", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "High confidence", category: "expertise", confidence: 0.9 },
        { id: "2", content: "Low confidence", category: "expertise", confidence: 0.2 },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({ minConfidence: 0.5 });

      expect(result.structuredContent.facts.length).toBe(1);
      expect(result.structuredContent.facts[0].content).toBe("High confidence");
    });

    it("always includes proven facts regardless of confidence", async () => {
      const identity = createTestIdentity([
        { id: "1", content: "Proven fact", category: "expertise", confidence: 0.2, maturity: "proven" },
        { id: "2", content: "Candidate fact", category: "expertise", confidence: 0.2, maturity: "candidate" },
      ]);
      writeIdentity(testDir, identity);

      const result = await identityHandler({ minConfidence: 0.5 });

      expect(result.structuredContent.facts.length).toBe(1);
      expect(result.structuredContent.facts[0].content).toBe("Proven fact");
    });
  });
});

// --- Test Helpers ---

interface TestFact {
  id: string;
  content: string;
  category: string;
  confidence: number;
  maturity?: string;
}

function createTestIdentity(facts: TestFact[]) {
  const now = new Date().toISOString();
  return {
    version: "2.0.0" as const,
    facts: facts.map(f => ({
      id: f.id,
      category: f.category,
      content: f.content,
      confidence: f.confidence,
      maturity: f.maturity || "established",
      source: "manual" as const,
      createdAt: now,
      lastValidated: now,
      validationCount: 1,
    })),
    settings: {},
    createdAt: now,
    lastModified: now,
  };
}

function writeIdentity(dir: string, identity: unknown): void {
  writeFileSync(join(dir, "identity.json"), JSON.stringify(identity, null, 2));
}
