/**
 * Candidate Registry Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCandidates,
  getCandidate,
  getCandidateByContent,
  clearCandidates,
  getAllCandidates,
  removeCandidate,
  suppressContent,
  isContentSuppressed,
  getStaleCandidates,
  type StoredCandidate,
  type CandidateInput,
} from "./candidate-registry.js";

describe("Candidate Registry", () => {
  beforeEach(() => {
    clearCandidates();
  });

  const createCandidate = (overrides: Partial<CandidateInput> = {}): CandidateInput => ({
    id: "test-id-1",
    category: "expertise",
    content: "TypeScript development",
    confidence: 0.75,
    sourceRef: "typescriptlang.org",
    signals: ["typescriptlang.org visits", ".ts files"],
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe("registerCandidates", () => {
    it("stores candidates in registry", () => {
      const candidates = [createCandidate()];
      registerCandidates(candidates);

      expect(getAllCandidates()).toHaveLength(1);
    });

    it("stores multiple candidates", () => {
      const candidates = [
        createCandidate({ id: "id-1", content: "TypeScript" }),
        createCandidate({ id: "id-2", content: "React" }),
      ];
      registerCandidates(candidates);

      expect(getAllCandidates()).toHaveLength(2);
    });

    it("returns registered candidates", () => {
      const candidates = [createCandidate()];
      const result = registerCandidates(candidates);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("TypeScript development");
    });

    it("adds inferCount and lastInferred to candidates", () => {
      const candidates = [createCandidate()];
      const result = registerCandidates(candidates);

      expect(result[0].inferCount).toBe(1);
      expect(result[0].lastInferred).toBeDefined();
    });

    it("increments inferCount for same content", () => {
      const candidate1 = createCandidate({ id: "id-1", content: "TypeScript" });
      const candidate2 = createCandidate({ id: "id-2", content: "TypeScript" }); // Same content

      registerCandidates([candidate1]);
      const result = registerCandidates([candidate2]);

      expect(getAllCandidates()).toHaveLength(1);
      expect(result[0].inferCount).toBe(2);
    });
  });

  describe("getCandidate", () => {
    it("retrieves candidate by id", () => {
      const candidate = createCandidate({ id: "lookup-id" });
      registerCandidates([candidate]);

      const result = getCandidate("lookup-id");

      expect(result).toBeDefined();
      expect(result?.content).toBe("TypeScript development");
    });

    it("returns undefined for unknown id", () => {
      registerCandidates([createCandidate()]);

      const result = getCandidate("unknown-id");

      expect(result).toBeUndefined();
    });
  });

  describe("getCandidateByContent", () => {
    it("retrieves candidate by exact content match", () => {
      const candidate = createCandidate({ content: "React development" });
      registerCandidates([candidate]);

      const result = getCandidateByContent("React development");

      expect(result).toBeDefined();
      expect(result?.id).toBe("test-id-1");
    });

    it("matches case-insensitively", () => {
      const candidate = createCandidate({ content: "TypeScript Development" });
      registerCandidates([candidate]);

      const result = getCandidateByContent("typescript development");

      expect(result).toBeDefined();
    });

    it("trims whitespace", () => {
      const candidate = createCandidate({ content: "TypeScript" });
      registerCandidates([candidate]);

      const result = getCandidateByContent("  TypeScript  ");

      expect(result).toBeDefined();
    });

    it("returns undefined for no match", () => {
      registerCandidates([createCandidate({ content: "TypeScript" })]);

      const result = getCandidateByContent("Python");

      expect(result).toBeUndefined();
    });
  });

  describe("removeCandidate", () => {
    it("removes candidate by id", () => {
      registerCandidates([createCandidate({ id: "remove-me" })]);
      expect(getAllCandidates()).toHaveLength(1);

      const removed = removeCandidate("remove-me");

      expect(removed).toBe(true);
      expect(getAllCandidates()).toHaveLength(0);
    });

    it("returns false for unknown id", () => {
      const removed = removeCandidate("unknown");
      expect(removed).toBe(false);
    });
  });

  describe("clearCandidates", () => {
    it("removes all candidates", () => {
      registerCandidates([
        createCandidate({ id: "1", content: "A" }),
        createCandidate({ id: "2", content: "B" }),
        createCandidate({ id: "3", content: "C" }),
      ]);
      expect(getAllCandidates()).toHaveLength(3);

      clearCandidates();

      expect(getAllCandidates()).toHaveLength(0);
    });

    it("also clears suppressions", () => {
      suppressContent("TypeScript");
      expect(isContentSuppressed("TypeScript")).toBe(true);

      clearCandidates();

      expect(isContentSuppressed("TypeScript")).toBe(false);
    });
  });

  describe("stale candidate suppression", () => {
    it("filters out candidates after 3 inferences", () => {
      const candidate = createCandidate({ id: "stale-test", content: "Stale topic" });

      // First two inferences - should return the candidate
      let result = registerCandidates([candidate]);
      expect(result).toHaveLength(1);

      result = registerCandidates([createCandidate({ id: "id-2", content: "Stale topic" })]);
      expect(result).toHaveLength(1);
      expect(result[0].inferCount).toBe(2);

      // Third inference - should be filtered out (stale)
      result = registerCandidates([createCandidate({ id: "id-3", content: "Stale topic" })]);
      expect(result).toHaveLength(0);
    });

    it("marks candidates as stale after 3 inferences", () => {
      const candidate = createCandidate({ content: "Will become stale" });

      registerCandidates([candidate]);
      registerCandidates([createCandidate({ id: "id-2", content: "Will become stale" })]);
      registerCandidates([createCandidate({ id: "id-3", content: "Will become stale" })]);

      const stale = getStaleCandidates();
      expect(stale).toHaveLength(1);
      expect(stale[0].inferCount).toBe(3);
    });

    it("getStaleCandidates returns only stale candidates", () => {
      registerCandidates([createCandidate({ id: "1", content: "Fresh" })]);
      registerCandidates([createCandidate({ id: "2", content: "Stale" })]);
      registerCandidates([createCandidate({ id: "3", content: "Stale" })]);
      registerCandidates([createCandidate({ id: "4", content: "Stale" })]);

      const stale = getStaleCandidates();
      expect(stale).toHaveLength(1);
      expect(stale[0].content).toBe("Stale");
    });
  });

  describe("manual suppression", () => {
    it("suppresses content manually", () => {
      suppressContent("TypeScript");

      expect(isContentSuppressed("TypeScript")).toBe(true);
    });

    it("suppression is case-insensitive", () => {
      suppressContent("TypeScript");

      expect(isContentSuppressed("typescript")).toBe(true);
      expect(isContentSuppressed("TYPESCRIPT")).toBe(true);
    });

    it("suppressed content is not returned from registerCandidates", () => {
      suppressContent("React");

      const result = registerCandidates([createCandidate({ content: "React" })]);

      expect(result).toHaveLength(0);
    });

    it("isContentSuppressed returns false for non-suppressed content", () => {
      expect(isContentSuppressed("Unknown")).toBe(false);
    });
  });
});
