/**
 * Tests for auto-promote functionality
 *
 * TDD: RED phase - write failing tests first
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock @arete/core to avoid loadConfig issues in tests
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
}));

import {
  classifyWithHeuristics,
  autoPromoteInsight,
  setConfigDir,
  type PromotionResult,
} from "./auto-promote";

describe("classifyWithHeuristics", () => {
  describe("identity patterns (should promote)", () => {
    it("promotes 'I'm Brazilian' as context fact", () => {
      const result = classifyWithHeuristics("I'm Brazilian");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("context");
      expect(result.content).toContain("Brazilian");
    });

    it("promotes 'I am a software engineer' as core fact", () => {
      const result = classifyWithHeuristics("I am a software engineer");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("core");
      expect(result.content.toLowerCase()).toContain("software engineer");
    });

    it("promotes 'I work at PayNearMe' as core fact", () => {
      const result = classifyWithHeuristics("I work at PayNearMe");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("core");
      expect(result.content).toContain("PayNearMe");
    });

    it("promotes 'I work for Google' as core fact", () => {
      const result = classifyWithHeuristics("I work for Google");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("core");
      expect(result.content).toContain("Google");
    });
  });

  describe("preference patterns (should promote)", () => {
    it("promotes 'I prefer TypeScript' as preference", () => {
      const result = classifyWithHeuristics("I prefer TypeScript");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("preference");
      expect(result.content).toContain("TypeScript");
    });

    it("promotes 'I like concise answers' as preference", () => {
      const result = classifyWithHeuristics("I like concise answers");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("preference");
    });

    it("promotes 'I want detailed explanations' as preference", () => {
      const result = classifyWithHeuristics("I want detailed explanations");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("preference");
    });

    it("promotes 'I always use vim' as preference", () => {
      const result = classifyWithHeuristics("I always use vim");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("preference");
    });
  });

  describe("expertise patterns (should promote)", () => {
    it("promotes 'I'm an expert in React' as expertise", () => {
      const result = classifyWithHeuristics("I'm an expert in React");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("expertise");
      expect(result.content).toContain("React");
    });

    it("promotes 'I have 10 years of experience in Python' as expertise", () => {
      const result = classifyWithHeuristics(
        "I have 10 years of experience in Python"
      );
      expect(result.promote).toBe(true);
      expect(result.category).toBe("expertise");
    });

    it("promotes 'I know TypeScript really well' as expertise", () => {
      const result = classifyWithHeuristics("I know TypeScript really well");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("expertise");
    });
  });

  describe("focus patterns (should promote)", () => {
    it("promotes 'I'm learning Rust' as focus", () => {
      const result = classifyWithHeuristics("I'm learning Rust");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("focus");
      expect(result.content).toContain("Rust");
    });

    it("promotes 'I'm building a Chrome extension' as focus", () => {
      const result = classifyWithHeuristics("I'm building a Chrome extension");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("focus");
    });

    it("promotes 'I'm working on an AI project' as focus", () => {
      const result = classifyWithHeuristics("I'm working on an AI project");
      expect(result.promote).toBe(true);
      expect(result.category).toBe("focus");
    });
  });

  describe("non-promotable patterns (should NOT promote)", () => {
    it("does not promote 'The weather is nice'", () => {
      const result = classifyWithHeuristics("The weather is nice");
      expect(result.promote).toBe(false);
    });

    it("does not promote 'User visited supabase.com' (third person)", () => {
      const result = classifyWithHeuristics("User visited supabase.com");
      expect(result.promote).toBe(false);
    });

    it("does not promote 'The user prefers TypeScript' (third person)", () => {
      const result = classifyWithHeuristics("The user prefers TypeScript");
      expect(result.promote).toBe(false);
    });

    it("does not promote generic statements", () => {
      const result = classifyWithHeuristics("TypeScript is a great language");
      expect(result.promote).toBe(false);
    });

    it("does not promote questions", () => {
      const result = classifyWithHeuristics("Do I need to use TypeScript?");
      expect(result.promote).toBe(false);
    });
  });

  describe("confidence levels", () => {
    it("sets confidence to 0.7 for promoted facts", () => {
      const result = classifyWithHeuristics("I'm Brazilian");
      expect(result.confidence).toBe(0.7);
    });

    it("sets confidence to 0 for non-promoted", () => {
      const result = classifyWithHeuristics("The weather is nice");
      expect(result.confidence).toBe(0);
    });
  });
});

describe("autoPromoteInsight", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "arete-test-"));
    setConfigDir(tempDir);

    // Create empty identity file
    const identityV2 = {
      version: "2.0.0",
      deviceId: "test-device",
      facts: [],
      core: {},
      settings: {
        decayHalfLifeDays: 60,
        autoInfer: false,
        excludedDomains: [],
        autoPromote: true,
      },
    };
    writeFileSync(
      join(tempDir, "identity.json"),
      JSON.stringify(identityV2, null, 2)
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("promotion flow", () => {
    it("promotes high-signal insight to identity", async () => {
      const result = await autoPromoteInsight({
        insight: "I'm Brazilian",
        source: "claude-desktop",
      });

      expect(result.promoted).toBe(true);
      expect(result.fact).toBeDefined();
      expect(result.fact?.content).toContain("Brazilian");
      expect(result.fact?.category).toBe("context");
      expect(result.fact?.confidence).toBe(0.7);
      expect(result.fact?.maturity).toBe("candidate");
      expect(result.fact?.source).toBe("conversation");
    });

    it("does not promote low-signal insight", async () => {
      const result = await autoPromoteInsight({
        insight: "The weather is nice today",
        source: "claude-desktop",
      });

      expect(result.promoted).toBe(false);
      expect(result.fact).toBeUndefined();
    });

    it("returns reason when not promoted", async () => {
      const result = await autoPromoteInsight({
        insight: "The weather is nice today",
        source: "claude-desktop",
      });

      expect(result.reason).toBeDefined();
      expect(result.reason).toContain("low-signal");
    });
  });

  describe("duplicate prevention", () => {
    it("skips promotion if similar fact already exists", async () => {
      // First, add an existing fact
      const identityWithFact = {
        version: "2.0.0",
        deviceId: "test-device",
        facts: [
          {
            id: "existing-fact",
            category: "context",
            content: "Brazilian nationality",
            confidence: 0.8,
            maturity: "established",
            source: "manual",
            lastValidated: new Date().toISOString(),
            validationCount: 2,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        core: {},
        settings: { autoPromote: true },
      };
      writeFileSync(
        join(tempDir, "identity.json"),
        JSON.stringify(identityWithFact, null, 2)
      );

      const result = await autoPromoteInsight({
        insight: "I'm Brazilian",
        source: "claude-desktop",
      });

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("duplicate");
    });
  });

  describe("settings respect", () => {
    it("does not promote when autoPromote is disabled", async () => {
      const identityDisabled = {
        version: "2.0.0",
        deviceId: "test-device",
        facts: [],
        core: {},
        settings: { autoPromote: false },
      };
      writeFileSync(
        join(tempDir, "identity.json"),
        JSON.stringify(identityDisabled, null, 2)
      );

      const result = await autoPromoteInsight({
        insight: "I'm Brazilian",
        source: "claude-desktop",
      });

      expect(result.promoted).toBe(false);
      expect(result.reason).toContain("disabled");
    });
  });
});
