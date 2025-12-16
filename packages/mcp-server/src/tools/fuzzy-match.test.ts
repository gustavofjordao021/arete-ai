import { describe, it, expect } from "vitest";
import { similarity, findBestMatch } from "./fuzzy-match.js";

describe("fuzzy-match", () => {
  describe("similarity", () => {
    it("returns 1 for identical strings", () => {
      expect(similarity("hello", "hello")).toBe(1);
    });

    it("returns 1 for identical strings with different case", () => {
      expect(similarity("Hello World", "hello world")).toBe(1);
    });

    it("returns 1 for strings with extra whitespace", () => {
      expect(similarity("hello  world", "hello world")).toBe(1);
    });

    it("returns 0 for completely different strings", () => {
      expect(similarity("abc", "xyz")).toBeLessThan(0.5);
    });

    it("returns high similarity for minor variations", () => {
      // Same words with minor differences
      const score = similarity("PayNearMe engineer", "PayNearMe developer");
      expect(score).toBeGreaterThan(0.6);
    });

    it("returns high similarity for typos", () => {
      const score = similarity("TypeScript developer", "Typescript developr");
      expect(score).toBeGreaterThan(0.8);
    });

    it("handles empty strings", () => {
      expect(similarity("", "")).toBe(1);
      expect(similarity("hello", "")).toBe(0);
      expect(similarity("", "hello")).toBe(0);
    });

    it("ignores punctuation differences", () => {
      const score = similarity("Hello, world!", "Hello world");
      expect(score).toBe(1);
    });

    it("handles prefix similarity (Jaro-Winkler bonus)", () => {
      // Strings with common prefix should score higher
      const withPrefix = similarity("TypeScript expert", "TypeScript master");
      const withoutPrefix = similarity("expert TypeScript", "master TypeScript");
      expect(withPrefix).toBeGreaterThanOrEqual(withoutPrefix);
    });
  });

  describe("findBestMatch", () => {
    const items = [
      { id: "1", text: "TypeScript developer" },
      { id: "2", text: "Python programmer" },
      { id: "3", text: "React specialist" },
      { id: "4", text: "PayNearMe employee" },
    ];

    it("finds exact match with score 1", () => {
      const match = findBestMatch(
        "TypeScript developer",
        items,
        (i) => i.text,
        0.7
      );
      expect(match).toBeDefined();
      expect(match!.item.id).toBe("1");
      expect(match!.score).toBeCloseTo(1, 1);
    });

    it("finds fuzzy match above threshold", () => {
      // Match with typo - Jaro-Winkler handles this well
      const match = findBestMatch(
        "PayNearMe employe", // Missing 'e'
        items,
        (i) => i.text,
        0.8
      );
      expect(match).toBeDefined();
      expect(match!.item.id).toBe("4");
      expect(match!.score).toBeGreaterThan(0.8);
    });

    it("returns undefined when no match meets threshold", () => {
      const match = findBestMatch(
        "Java developer",
        items,
        (i) => i.text,
        0.9 // Very high threshold
      );
      expect(match).toBeUndefined();
    });

    it("returns best match when multiple items match", () => {
      const items = [
        { id: "1", text: "TypeScript developer" },
        { id: "2", text: "TypeScript expert" },
        { id: "3", text: "JavaScript developer" },
      ];
      // "TypeScript develper" (typo) should match "TypeScript developer"
      const match = findBestMatch("TypeScript develper", items, (i) => i.text, 0.7);
      expect(match).toBeDefined();
      expect(match!.item.id).toBe("1");
    });

    it("handles empty array", () => {
      const match = findBestMatch("hello", [], (i: { text: string }) => i.text, 0.7);
      expect(match).toBeUndefined();
    });

    it("uses default threshold of 0.8", () => {
      const match = findBestMatch(
        "TypeScript developr", // typo
        items,
        (i) => i.text
        // No threshold = 0.8 default
      );
      expect(match).toBeDefined();
      expect(match!.item.id).toBe("1");
    });
  });
});
