/**
 * vector-math.test.ts - TDD tests for vector math utilities
 *
 * Tests cosine similarity and normalized similarity functions
 * used for semantic embedding comparisons.
 */

import { describe, it, expect } from "vitest";
import { cosineSimilarity, normalizedSimilarity } from "./vector-math.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("handles normalized unit vectors", () => {
    // Two normalized vectors at 60 degrees
    const a = [1, 0];
    const b = [0.5, Math.sqrt(3) / 2]; // cos(60) = 0.5
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.5, 5);
  });

  it("handles high-dimensional vectors (1536 dimensions)", () => {
    // Simulate OpenAI embedding dimensions
    const a = Array.from({ length: 1536 }, (_, i) => Math.sin(i));
    const b = Array.from({ length: 1536 }, (_, i) => Math.sin(i));
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("throws on dimension mismatch", () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow("Vector dimension mismatch");
  });

  it("returns 0 for zero vectors", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("is symmetric", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("ignores magnitude (normalized result)", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // Same direction, 2x magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });
});

describe("normalizedSimilarity", () => {
  it("maps identical vectors to 1", () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(normalizedSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("maps opposite vectors to 0", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(normalizedSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("maps orthogonal vectors to 0.5", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(normalizedSimilarity(a, b)).toBeCloseTo(0.5, 5);
  });

  it("returns values in [0, 1] range", () => {
    // Various random-ish vectors
    const vectors = [
      [[1, 2, 3], [4, 5, 6]],
      [[1, 0, -1], [0, 1, 0]],
      [[-1, -2, -3], [3, 2, 1]],
    ];

    for (const [a, b] of vectors) {
      const sim = normalizedSimilarity(a, b);
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
    }
  });
});
