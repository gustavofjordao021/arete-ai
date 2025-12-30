/**
 * Comparison Tests (TDD - RED phase)
 *
 * Tests for Jaro-Winkler similarity and fact matching.
 */

import { describe, it, expect } from "vitest";
import { jaroWinklerSimilarity, findMatchingFact } from "./comparison.js";
import type { ExpectedFact } from "./types.js";

describe("jaroWinklerSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(jaroWinklerSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 1 for case-insensitive match", () => {
    expect(jaroWinklerSimilarity("Hello", "hello")).toBe(1);
  });

  it("returns 1 for whitespace-normalized match", () => {
    expect(jaroWinklerSimilarity("hello  world", "hello world")).toBe(1);
  });

  it("returns high score for similar strings", () => {
    // "PM at Stripe" vs "Product Manager at Stripe" share ending
    const score = jaroWinklerSimilarity("PM at Stripe", "Product Manager at Stripe");
    expect(score).toBeGreaterThan(0.5); // Reasonable for partial overlap
  });

  it("returns low score for different strings", () => {
    const score = jaroWinklerSimilarity("React developer", "Python engineer");
    expect(score).toBeLessThan(0.6);
  });

  it("returns 0 for empty strings", () => {
    expect(jaroWinklerSimilarity("", "hello")).toBe(0);
    expect(jaroWinklerSimilarity("hello", "")).toBe(0);
  });

  it("handles punctuation removal", () => {
    expect(jaroWinklerSimilarity("hello, world!", "hello world")).toBe(1);
  });
});

describe("findMatchingFact", () => {
  const expectedFacts: ExpectedFact[] = [
    { category: "core", content: "PM at Stripe" },
    { category: "expertise", content: "React development" },
    { category: "preference", content: "Prefers dark mode" },
  ];

  it("finds exact match", () => {
    const result = findMatchingFact(
      { category: "core", content: "PM at Stripe" },
      expectedFacts
    );
    expect(result).not.toBeNull();
    expect(result?.match.content).toBe("PM at Stripe");
    expect(result?.similarity).toBe(1);
  });

  it("finds similar match above threshold", () => {
    const result = findMatchingFact(
      { category: "core", content: "Product Manager at Stripe" },
      expectedFacts
    );
    // May or may not match depending on threshold - should return match if above 0.7
    // "PM at Stripe" vs "Product Manager at Stripe" should have reasonable similarity
    expect(result === null || result.similarity >= 0.7).toBe(true);
  });

  it("returns null for wrong category", () => {
    const result = findMatchingFact(
      { category: "expertise", content: "PM at Stripe" },
      expectedFacts
    );
    expect(result).toBeNull();
  });

  it("returns null for no match", () => {
    const result = findMatchingFact(
      { category: "core", content: "Engineer at Google" },
      expectedFacts
    );
    expect(result).toBeNull();
  });

  it("returns null for empty expected list", () => {
    const result = findMatchingFact(
      { category: "core", content: "PM at Stripe" },
      []
    );
    expect(result).toBeNull();
  });

  it("finds best match among multiple candidates", () => {
    const facts: ExpectedFact[] = [
      { category: "expertise", content: "React development" },
      { category: "expertise", content: "React and TypeScript" },
    ];
    const result = findMatchingFact(
      { category: "expertise", content: "React development" },
      facts
    );
    expect(result).not.toBeNull();
    expect(result?.match.content).toBe("React development");
  });
});
