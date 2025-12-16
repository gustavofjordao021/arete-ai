/**
 * Inference Response Parser Tests - Phase 3
 *
 * Tests for parsing Haiku's JSON response from cross-type inference.
 */

import { describe, it, expect } from "vitest";
import {
  parseInferenceResponse,
  type InferenceResult,
  type CandidateFact,
} from "./inference-response.js";
import type { IdentityFact } from "@arete/core";

describe("Inference Response Parser", () => {
  describe("valid JSON parsing", () => {
    it("parses candidate facts from JSON response", () => {
      const response = JSON.stringify({
        candidates: [
          {
            content: "health and fitness optimization",
            category: "focus",
            confidence: 0.75,
            signals: ["ro.com visits", "health conversations"],
            reasoning: "Multiple signals across browsing and conversations",
          },
        ],
        reinforce: [],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].content).toBe("health and fitness optimization");
      expect(result.candidates[0].category).toBe("focus");
      expect(result.candidates[0].confidence).toBe(0.75);
      expect(result.candidates[0].signals).toContain("ro.com visits");
    });

    it("parses multiple candidates", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "TypeScript expertise", category: "expertise", confidence: 0.8, signals: [".ts files"], reasoning: "test" },
          { content: "health focus", category: "focus", confidence: 0.7, signals: ["ro.com"], reasoning: "test" },
        ],
        reinforce: [],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.candidates).toHaveLength(2);
    });

    it("parses reinforcement suggestions", () => {
      const response = JSON.stringify({
        candidates: [],
        reinforce: [
          { factId: "fact-123", reason: "Recent TypeScript activity supports this" },
        ],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.reinforce).toHaveLength(1);
      expect(result.reinforce[0].factId).toBe("fact-123");
      expect(result.reinforce[0].reason).toBe("Recent TypeScript activity supports this");
    });

    it("parses downgrade suggestions", () => {
      const response = JSON.stringify({
        candidates: [],
        reinforce: [],
        downgrade: [
          { factId: "fact-456", reason: "No recent activity related to this fact" },
        ],
      });

      const result = parseInferenceResponse(response);

      expect(result.downgrade).toHaveLength(1);
      expect(result.downgrade[0].factId).toBe("fact-456");
      expect(result.downgrade[0].reason).toBe("No recent activity related to this fact");
    });

    it("parses all three sections together", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "health focus", category: "focus", confidence: 0.7, signals: ["ro.com"], reasoning: "test" },
        ],
        reinforce: [
          { factId: "ts-fact", reason: "Active coding" },
        ],
        downgrade: [
          { factId: "old-fact", reason: "No recent activity" },
        ],
      });

      const result = parseInferenceResponse(response);

      expect(result.candidates).toHaveLength(1);
      expect(result.reinforce).toHaveLength(1);
      expect(result.downgrade).toHaveLength(1);
    });

    it("handles empty arrays in response", () => {
      const response = JSON.stringify({
        candidates: [],
        reinforce: [],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.candidates).toEqual([]);
      expect(result.reinforce).toEqual([]);
      expect(result.downgrade).toEqual([]);
      expect(result.error).toBeUndefined();
    });
  });

  describe("malformed JSON handling", () => {
    it("handles non-JSON response gracefully", () => {
      const response = "This is not JSON at all";

      const result = parseInferenceResponse(response);

      expect(result.candidates).toEqual([]);
      expect(result.reinforce).toEqual([]);
      expect(result.downgrade).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("parse");
    });

    it("handles partial JSON response", () => {
      const response = '{"candidates": [{"content": "test"';

      const result = parseInferenceResponse(response);

      expect(result.candidates).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it("handles JSON with wrong structure", () => {
      const response = JSON.stringify({
        wrongField: "wrong value",
      });

      const result = parseInferenceResponse(response);

      // Should return empty arrays, not error
      expect(result.candidates).toEqual([]);
      expect(result.reinforce).toEqual([]);
      expect(result.downgrade).toEqual([]);
    });

    it("handles JSON with markdown code blocks", () => {
      const response = `\`\`\`json
{
  "candidates": [{"content": "test fact", "category": "focus", "confidence": 0.7, "signals": ["signal"], "reasoning": "test"}],
  "reinforce": [],
  "downgrade": []
}
\`\`\``;

      const result = parseInferenceResponse(response);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].content).toBe("test fact");
    });

    it("handles JSON with leading/trailing text", () => {
      const response = `Here is the analysis:
{"candidates": [{"content": "test", "category": "focus", "confidence": 0.7, "signals": [], "reasoning": ""}], "reinforce": [], "downgrade": []}
That's my analysis.`;

      const result = parseInferenceResponse(response);

      expect(result.candidates).toHaveLength(1);
    });
  });

  describe("duplicate filtering", () => {
    it("filters out candidates that match existing facts by content", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "TypeScript", category: "expertise", confidence: 0.8, signals: [".ts files"], reasoning: "test" },
          { content: "health focus", category: "focus", confidence: 0.7, signals: ["ro.com"], reasoning: "test" },
        ],
        reinforce: [],
        downgrade: [],
      });

      const existingFacts: IdentityFact[] = [
        {
          id: "existing-1",
          category: "expertise",
          content: "TypeScript",
          source: "manual",
          confidence: 0.9,
          maturity: "stable",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = parseInferenceResponse(response, existingFacts);

      // Should filter out TypeScript since it already exists
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].content).toBe("health focus");
    });

    it("filters case-insensitively", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "typescript", category: "expertise", confidence: 0.8, signals: [], reasoning: "test" },
        ],
        reinforce: [],
        downgrade: [],
      });

      const existingFacts: IdentityFact[] = [
        {
          id: "existing-1",
          category: "expertise",
          content: "TypeScript", // Different case
          source: "manual",
          confidence: 0.9,
          maturity: "stable",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = parseInferenceResponse(response, existingFacts);

      expect(result.candidates).toHaveLength(0);
    });

    it("does not filter candidates with different content", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "React", category: "expertise", confidence: 0.8, signals: [], reasoning: "test" },
        ],
        reinforce: [],
        downgrade: [],
      });

      const existingFacts: IdentityFact[] = [
        {
          id: "existing-1",
          category: "expertise",
          content: "TypeScript",
          source: "manual",
          confidence: 0.9,
          maturity: "stable",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const result = parseInferenceResponse(response, existingFacts);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].content).toBe("React");
    });
  });

  describe("validation", () => {
    it("filters out candidates with invalid category", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "test", category: "invalid_category", confidence: 0.7, signals: [], reasoning: "test" },
          { content: "valid", category: "expertise", confidence: 0.7, signals: [], reasoning: "test" },
        ],
        reinforce: [],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].content).toBe("valid");
    });

    it("clamps confidence to valid range", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "too high", category: "expertise", confidence: 1.5, signals: [], reasoning: "test" },
          { content: "too low", category: "expertise", confidence: -0.1, signals: [], reasoning: "test" },
        ],
        reinforce: [],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.candidates[0].confidence).toBe(1.0);
      expect(result.candidates[1].confidence).toBe(0.0);
    });

    it("filters out candidates missing required fields", () => {
      const response = JSON.stringify({
        candidates: [
          { content: "missing category", confidence: 0.7 }, // missing category
          { category: "expertise", confidence: 0.7 }, // missing content
          { content: "valid", category: "expertise", confidence: 0.7, signals: [], reasoning: "test" },
        ],
        reinforce: [],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].content).toBe("valid");
    });

    it("validates reinforce entries have factId", () => {
      const response = JSON.stringify({
        candidates: [],
        reinforce: [
          { factId: "valid-id", reason: "test" },
          { reason: "missing factId" }, // invalid
        ],
        downgrade: [],
      });

      const result = parseInferenceResponse(response);

      expect(result.reinforce).toHaveLength(1);
      expect(result.reinforce[0].factId).toBe("valid-id");
    });

    it("validates downgrade entries have factId", () => {
      const response = JSON.stringify({
        candidates: [],
        reinforce: [],
        downgrade: [
          { factId: "valid-id", reason: "test" },
          { reason: "missing factId" }, // invalid
        ],
      });

      const result = parseInferenceResponse(response);

      expect(result.downgrade).toHaveLength(1);
      expect(result.downgrade[0].factId).toBe("valid-id");
    });
  });
});
