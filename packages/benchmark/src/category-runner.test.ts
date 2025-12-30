/**
 * Category Runner Tests (TDD - RED phase)
 *
 * Tests for category detection benchmark runner.
 */

import { describe, it, expect } from "vitest";
import { runCategoryBenchmark } from "./category-runner.js";

describe("runCategoryBenchmark", () => {
  it("returns accuracy metric between 0 and 1", async () => {
    const report = await runCategoryBenchmark();
    expect(report.metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(report.metrics.accuracy).toBeLessThanOrEqual(1);
  });

  it("returns total cases count", async () => {
    const report = await runCategoryBenchmark();
    expect(report.metrics.totalCases).toBeGreaterThan(0);
  });

  it("includes failures array", async () => {
    const report = await runCategoryBenchmark();
    expect(Array.isArray(report.failures)).toBe(true);
  });

  it("categorizes results by category", async () => {
    const report = await runCategoryBenchmark();
    expect(report.metrics.byCategory).toBeDefined();
    // At least one category should have test cases
    const hasCategories = Object.keys(report.metrics.byCategory).length > 0;
    expect(hasCategories).toBe(true);
  });

  it("has correct component name", async () => {
    const report = await runCategoryBenchmark();
    expect(report.component).toBe("category-detection");
  });

  it("has timestamp", async () => {
    const report = await runCategoryBenchmark();
    expect(report.timestamp).toBeDefined();
    // Should be a valid ISO date
    expect(() => new Date(report.timestamp)).not.toThrow();
  });

  it("failures have required fields", async () => {
    const report = await runCategoryBenchmark();
    for (const failure of report.failures) {
      expect(failure.id).toBeDefined();
      expect(failure.input).toBeDefined();
      expect(failure.expected).toBeDefined();
      expect(failure.actual).toBeDefined();
    }
  });

  it("byCategory entries have correct/total counts", async () => {
    const report = await runCategoryBenchmark();
    for (const [_, breakdown] of Object.entries(report.metrics.byCategory)) {
      expect(breakdown.correct).toBeGreaterThanOrEqual(0);
      expect(breakdown.total).toBeGreaterThan(0);
      expect(breakdown.correct).toBeLessThanOrEqual(breakdown.total);
    }
  });
});
