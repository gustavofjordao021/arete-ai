/**
 * Inference Prompt Builder Tests - Phase 2
 *
 * Tests for building the Haiku prompt that analyzes cross-type context
 * and proposes identity updates.
 */

import { describe, it, expect } from "vitest";
import {
  buildInferencePrompt,
  type InferencePromptInput,
} from "./inference-prompt.js";
import type { AggregatedContext } from "./context-aggregator.js";
import type { IdentityFact } from "@arete/core";

// Helper to create test aggregated context
function createContext(overrides: Partial<AggregatedContext> = {}): AggregatedContext {
  return {
    pageVisits: [],
    insights: [],
    conversations: [],
    files: [],
    selections: [],
    ...overrides,
  };
}

// Helper to create test identity fact
function createFact(overrides: Partial<IdentityFact> = {}): IdentityFact {
  return {
    id: crypto.randomUUID(),
    category: "expertise",
    content: "Test fact",
    confidence: 0.8,
    lastValidated: new Date().toISOString(),
    validationCount: 1,
    maturity: "established",
    source: "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Inference Prompt Builder", () => {
  describe("basic structure", () => {
    it("includes task section", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<task>");
      expect(prompt).toContain("</task>");
    });

    it("includes output format section with JSON example", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<output_format>");
      expect(prompt).toContain("candidates");
      expect(prompt).toContain("reinforce");
      expect(prompt).toContain("downgrade");
    });

    it("includes instructions section", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<instructions>");
      expect(prompt).toContain("PATTERNS");
    });
  });

  describe("existing identity", () => {
    it("includes existing facts in prompt", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [
          createFact({ content: "TypeScript", category: "expertise" }),
          createFact({ content: "React development", category: "expertise" }),
        ],
        blockedFacts: [],
      });

      expect(prompt).toContain("<existing_identity>");
      expect(prompt).toContain("TypeScript");
      expect(prompt).toContain("React development");
      expect(prompt).toContain("expertise");
    });

    it("includes confidence and maturity for each fact", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [
          createFact({ content: "Supabase", confidence: 0.9, maturity: "proven" }),
        ],
        blockedFacts: [],
      });

      expect(prompt).toContain("Supabase");
      expect(prompt).toContain("0.9");
      expect(prompt).toContain("proven");
    });

    it("handles empty existing facts", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<existing_identity>");
      expect(prompt).toContain("No existing identity facts");
    });
  });

  describe("blocked facts", () => {
    it("includes blocked facts to prevent re-suggestion", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [],
        blockedFacts: [
          { factId: "123", content: "COBOL programming", blockedAt: new Date().toISOString() },
        ],
      });

      expect(prompt).toContain("<blocked_facts>");
      expect(prompt).toContain("COBOL programming");
    });

    it("handles empty blocked facts", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<blocked_facts>");
      expect(prompt).toContain("None");
    });
  });

  describe("context sections", () => {
    it("includes page visits with counts", () => {
      const prompt = buildInferencePrompt({
        context: createContext({
          pageVisits: [
            { domain: "ro.com", count: 5, titles: ["Ro Health", "Ro Products"] },
            { domain: "supabase.com", count: 3, titles: ["Supabase Docs"] },
          ],
        }),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<page_visits>");
      expect(prompt).toContain("ro.com");
      expect(prompt).toContain("5");
      expect(prompt).toContain("Ro Health");
      expect(prompt).toContain("supabase.com");
    });

    it("includes insights", () => {
      const prompt = buildInferencePrompt({
        context: createContext({
          insights: ["Health optimization focus", "Prefers concise communication"],
        }),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<insights>");
      expect(prompt).toContain("Health optimization focus");
      expect(prompt).toContain("Prefers concise communication");
    });

    it("includes conversations", () => {
      const prompt = buildInferencePrompt({
        context: createContext({
          conversations: ["Discussed supplement optimization", "Talked about fitness tracking"],
        }),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<conversations>");
      expect(prompt).toContain("supplement optimization");
      expect(prompt).toContain("fitness tracking");
    });

    it("includes files", () => {
      const prompt = buildInferencePrompt({
        context: createContext({
          files: ["src/whoop-api.ts", "src/health-dashboard.tsx"],
        }),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<files>");
      expect(prompt).toContain("whoop-api.ts");
      expect(prompt).toContain("health-dashboard.tsx");
    });

    it("includes selections", () => {
      const prompt = buildInferencePrompt({
        context: createContext({
          selections: ["HRV metrics and recovery", "Protein synthesis"],
        }),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<selections>");
      expect(prompt).toContain("HRV metrics");
      expect(prompt).toContain("Protein synthesis");
    });

    it("handles empty context sections", () => {
      const prompt = buildInferencePrompt({
        context: createContext({
          pageVisits: [],
          insights: [],
          conversations: [],
          files: [],
          selections: [],
        }),
        existingFacts: [],
        blockedFacts: [],
      });

      expect(prompt).toContain("<page_visits>");
      expect(prompt).toContain("None");
    });
  });

  describe("full integration", () => {
    it("builds complete prompt with all sections", () => {
      const prompt = buildInferencePrompt({
        context: createContext({
          pageVisits: [{ domain: "ro.com", count: 5, titles: ["Ro Health"] }],
          insights: ["Health focus"],
          conversations: ["Supplements discussion"],
          files: ["whoop.ts"],
          selections: ["HRV"],
        }),
        existingFacts: [
          createFact({ content: "TypeScript", category: "expertise" }),
        ],
        blockedFacts: [
          { factId: "1", content: "COBOL", blockedAt: new Date().toISOString() },
        ],
      });

      // Check all major sections present
      expect(prompt).toContain("<task>");
      expect(prompt).toContain("<existing_identity>");
      expect(prompt).toContain("<blocked_facts>");
      expect(prompt).toContain("<recent_context>");
      expect(prompt).toContain("<page_visits>");
      expect(prompt).toContain("<insights>");
      expect(prompt).toContain("<conversations>");
      expect(prompt).toContain("<files>");
      expect(prompt).toContain("<selections>");
      expect(prompt).toContain("<instructions>");
      expect(prompt).toContain("<output_format>");
    });

    it("emphasizes cross-type pattern detection", () => {
      const prompt = buildInferencePrompt({
        context: createContext(),
        existingFacts: [],
        blockedFacts: [],
      });

      // Instructions should emphasize correlation
      expect(prompt).toMatch(/pattern/i);
      expect(prompt).toMatch(/signal/i);
      expect(prompt).toMatch(/across/i);
    });
  });
});
