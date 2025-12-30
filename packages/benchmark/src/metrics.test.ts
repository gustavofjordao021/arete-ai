/**
 * Metrics Tests (TDD - RED phase)
 *
 * Tests for precision, recall, F1, and accuracy calculations.
 */

import { describe, it, expect } from "vitest";
import {
  calculatePrecision,
  calculateRecall,
  calculateF1,
  calculateAccuracy,
} from "./metrics.js";

describe("metrics", () => {
  describe("calculatePrecision", () => {
    it("returns 0 when no predictions", () => {
      expect(calculatePrecision(0, 0)).toBe(0);
    });

    it("returns 1 when all predictions correct", () => {
      expect(calculatePrecision(10, 0)).toBe(1);
    });

    it("returns 0.8 when 8/10 correct (2 false positives)", () => {
      expect(calculatePrecision(8, 2)).toBe(0.8);
    });

    it("returns 0 when all predictions wrong", () => {
      expect(calculatePrecision(0, 10)).toBe(0);
    });

    it("returns 0.5 when half correct", () => {
      expect(calculatePrecision(5, 5)).toBe(0.5);
    });
  });

  describe("calculateRecall", () => {
    it("returns 0 when nothing to find", () => {
      expect(calculateRecall(0, 0)).toBe(0);
    });

    it("returns 1 when all found", () => {
      expect(calculateRecall(10, 0)).toBe(1);
    });

    it("returns 0.7 when 7/10 found (3 false negatives)", () => {
      expect(calculateRecall(7, 3)).toBe(0.7);
    });

    it("returns 0 when none found", () => {
      expect(calculateRecall(0, 10)).toBe(0);
    });

    it("returns 0.5 when half found", () => {
      expect(calculateRecall(5, 5)).toBe(0.5);
    });
  });

  describe("calculateF1", () => {
    it("returns 0 when precision and recall are 0", () => {
      expect(calculateF1(0, 0)).toBe(0);
    });

    it("returns 1 when precision and recall are 1", () => {
      expect(calculateF1(1, 1)).toBe(1);
    });

    it("returns harmonic mean (0.8, 0.6 -> ~0.685)", () => {
      expect(calculateF1(0.8, 0.6)).toBeCloseTo(0.685, 2);
    });

    it("returns 0.5 when precision and recall are 0.5", () => {
      expect(calculateF1(0.5, 0.5)).toBe(0.5);
    });

    it("returns 0 when precision is 0", () => {
      expect(calculateF1(0, 0.8)).toBe(0);
    });

    it("returns 0 when recall is 0", () => {
      expect(calculateF1(0.8, 0)).toBe(0);
    });
  });

  describe("calculateAccuracy", () => {
    it("returns 0 when no cases", () => {
      expect(calculateAccuracy(0, 0)).toBe(0);
    });

    it("returns 1 when all correct", () => {
      expect(calculateAccuracy(10, 10)).toBe(1);
    });

    it("returns correct ratio (28/30 -> ~0.933)", () => {
      expect(calculateAccuracy(28, 30)).toBeCloseTo(0.933, 2);
    });

    it("returns 0 when none correct", () => {
      expect(calculateAccuracy(0, 10)).toBe(0);
    });

    it("returns 0.5 when half correct", () => {
      expect(calculateAccuracy(5, 10)).toBe(0.5);
    });
  });
});
