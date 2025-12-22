/**
 * Tests for arete_remember - consolidated storage tool
 *
 * Replaces: arete_add_context_event, arete_update_identity, arete_validate_fact
 * Mental model: "Remember this"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock @arete/core
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
  createIdentityFact: vi.fn((opts) => ({
    id: `fact-${Date.now()}`,
    category: opts.category,
    content: opts.content,
    confidence: opts.confidence,
    source: opts.source,
    maturity: "candidate",
    createdAt: new Date().toISOString(),
    lastValidated: new Date().toISOString(),
    validationCount: 0,
  })),
  DEFAULT_HALF_LIFE_DAYS: 60,
}));

import {
  rememberHandler,
  detectCategory,
  setConfigDir,
  type RememberInput,
} from "./arete-remember.js";

describe("arete_remember", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `arete-remember-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    setConfigDir(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // --- Category Auto-Detection ---

  describe("detectCategory", () => {
    it("detects core identity from 'I'm a...'", () => {
      expect(detectCategory("I'm a software engineer")).toBe("core");
      expect(detectCategory("I am a PM at Google")).toBe("core");
    });

    it("detects core identity from 'I work at...'", () => {
      expect(detectCategory("I work at Anthropic")).toBe("core");
      expect(detectCategory("My role is tech lead")).toBe("core");
    });

    it("detects expertise from skill mentions", () => {
      expect(detectCategory("I know React and TypeScript")).toBe("expertise");
      expect(detectCategory("Expert in machine learning")).toBe("expertise");
      expect(detectCategory("10 years of Python experience")).toBe("expertise");
    });

    it("detects preference from likes/dislikes", () => {
      expect(detectCategory("I prefer dark mode")).toBe("preference");
      expect(detectCategory("I like concise answers")).toBe("preference");
      expect(detectCategory("I hate verbose explanations")).toBe("preference");
      expect(detectCategory("I always want examples")).toBe("preference");
    });

    it("detects context from location/tools", () => {
      expect(detectCategory("I'm based in San Francisco")).toBe("context");
      expect(detectCategory("I use VS Code on Mac")).toBe("context");
      expect(detectCategory("Located in the EU timezone")).toBe("context");
    });

    it("detects focus from learning/building", () => {
      expect(detectCategory("I'm learning Rust")).toBe("focus");
      expect(detectCategory("I'm building an AI assistant")).toBe("focus");
      expect(detectCategory("Working on a Chrome extension")).toBe("focus");
      expect(detectCategory("Currently studying ML")).toBe("focus");
    });

    it("defaults to context for unknown patterns", () => {
      expect(detectCategory("Random text without patterns")).toBe("context");
    });
  });

  // --- Add Operation ---

  describe("operation: add (default)", () => {
    it("creates new fact with auto-detected category", async () => {
      // Create empty identity
      writeIdentity(testDir, createEmptyV2Identity());

      const result = await rememberHandler({
        content: "I prefer TypeScript over JavaScript",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.operation).toBe("add");
      expect(result.structuredContent.fact?.category).toBe("preference");
    });

    it("uses explicit category when provided", async () => {
      writeIdentity(testDir, createEmptyV2Identity());

      const result = await rememberHandler({
        content: "Works at Anthropic",
        category: "expertise", // Override auto-detection
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.fact?.category).toBe("expertise");
    });

    it("stores reasoning with the fact", async () => {
      writeIdentity(testDir, createEmptyV2Identity());

      const result = await rememberHandler({
        content: "Prefers dark mode",
        reasoning: "User mentioned this in conversation",
      });

      expect(result.structuredContent.success).toBe(true);
      // Reasoning is stored for audit trail
    });

    it("creates identity file if it doesn't exist", async () => {
      // No identity file exists

      const result = await rememberHandler({
        content: "I'm a software engineer",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(existsSync(join(testDir, "identity.json"))).toBe(true);
    });

    it("prevents duplicate facts", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "I prefer dark mode", category: "preference" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "I prefer dark mode", // Same content
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.alreadyExists).toBe(true);
    });
  });

  // --- Validate Operation ---

  describe("operation: validate", () => {
    it("strengthens matching fact confidence", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "Expert in React", category: "expertise", confidence: 0.6, validationCount: 2 },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "Expert in React",
        operation: "validate",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.operation).toBe("validate");
      expect(result.structuredContent.validated).toBe(true);

      // Check confidence increased
      const updated = readIdentity(testDir);
      const fact = updated.facts.find((f: { id: string }) => f.id === "1");
      expect(fact.confidence).toBeGreaterThan(0.6);
    });

    it("uses fuzzy matching for validation", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "Expert in React and TypeScript", category: "expertise" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "Expert in React", // Similar structure, partial match
        operation: "validate",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.validated).toBe(true);
    });

    it("returns error if no matching fact found", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "Expert in Python programming", category: "expertise" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "Loves cooking Italian food", // Completely different topic
        operation: "validate",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("No matching fact");
    });
  });

  // --- Remove Operation ---

  describe("operation: remove", () => {
    it("removes matching fact", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "Expert in React", category: "expertise" },
        { id: "2", content: "Prefers dark mode", category: "preference" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "Expert in React",
        operation: "remove",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.operation).toBe("remove");
      expect(result.structuredContent.removed).toBe(true);

      // Check fact was removed
      const updated = readIdentity(testDir);
      expect(updated.facts.length).toBe(1);
      expect(updated.facts[0].content).toBe("Prefers dark mode");
    });

    it("uses fuzzy matching for removal", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "I prefer dark mode interfaces", category: "preference" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "dark mode preference", // Different wording
        operation: "remove",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.removed).toBe(true);
    });

    it("returns error if no matching fact to remove", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "Expert in Python programming", category: "expertise" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "Loves cooking Italian food", // Completely different topic
        operation: "remove",
      });

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("No matching fact");
    });
  });

  // --- Response Format ---

  describe("response format", () => {
    it("returns conversational response for add", async () => {
      writeIdentity(testDir, createEmptyV2Identity());

      const result = await rememberHandler({
        content: "Prefers TypeScript",
      });

      expect(result.content[0].text).toContain("Remembered");
    });

    it("returns conversational response for validate", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "Expert in React", category: "expertise" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "Expert in React",
        operation: "validate",
      });

      expect(result.content[0].text).toMatch(/Validated|Confirmed/i);
    });

    it("returns conversational response for remove", async () => {
      const identity = createV2IdentityWithFacts([
        { id: "1", content: "Expert in React", category: "expertise" },
      ]);
      writeIdentity(testDir, identity);

      const result = await rememberHandler({
        content: "Expert in React",
        operation: "remove",
      });

      expect(result.content[0].text).toContain("Removed");
    });
  });
});

// --- Test Helpers ---

function createEmptyV2Identity() {
  const now = new Date().toISOString();
  return {
    version: "2.0.0" as const,
    facts: [],
    settings: {},
    createdAt: now,
    lastModified: now,
  };
}

interface TestFact {
  id: string;
  content: string;
  category: string;
  confidence?: number;
  validationCount?: number;
}

function createV2IdentityWithFacts(facts: TestFact[]) {
  const now = new Date().toISOString();
  return {
    version: "2.0.0" as const,
    facts: facts.map(f => ({
      id: f.id,
      category: f.category,
      content: f.content,
      confidence: f.confidence ?? 0.8,
      maturity: "established",
      source: "manual" as const,
      createdAt: now,
      lastValidated: now,
      validationCount: f.validationCount ?? 1,
    })),
    settings: {},
    createdAt: now,
    lastModified: now,
  };
}

function writeIdentity(dir: string, identity: unknown): void {
  writeFileSync(join(dir, "identity.json"), JSON.stringify(identity, null, 2));
}

function readIdentity(dir: string): any {
  return JSON.parse(readFileSync(join(dir, "identity.json"), "utf-8"));
}
