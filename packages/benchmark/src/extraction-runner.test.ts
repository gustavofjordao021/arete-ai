/**
 * Extraction Runner Tests (TDD - RED phase)
 *
 * Tests for fact extraction benchmark runner.
 */

import { describe, it, expect } from "vitest";
import {
  runExtractionBenchmark,
  compareExtraction,
} from "./extraction-runner.js";

describe("compareExtraction", () => {
  it("counts true positives for matching facts", async () => {
    const extracted = [{ category: "core", content: "PM at Stripe" }];
    const expected = [{ category: "core", content: "PM at Stripe" }];
    const result = await compareExtraction(extracted, expected);
    expect(result.tp).toBe(1);
    expect(result.fp).toBe(0);
    expect(result.fn).toBe(0);
  });

  it("counts false positives for extra facts", async () => {
    const extracted = [
      { category: "core", content: "PM at Stripe" },
      { category: "context", content: "Likes coffee" },
    ];
    const expected = [{ category: "core", content: "PM at Stripe" }];
    const result = await compareExtraction(extracted, expected);
    expect(result.tp).toBe(1);
    expect(result.fp).toBe(1);
    expect(result.fn).toBe(0);
  });

  it("counts false negatives for missed facts", async () => {
    const extracted: { category: string; content: string }[] = [];
    const expected = [{ category: "core", content: "PM at Stripe" }];
    const result = await compareExtraction(extracted, expected);
    expect(result.tp).toBe(0);
    expect(result.fp).toBe(0);
    expect(result.fn).toBe(1);
  });

  it("handles multiple matches correctly", async () => {
    const extracted = [
      { category: "core", content: "PM at Stripe" },
      { category: "expertise", content: "Knows React" },
    ];
    const expected = [
      { category: "core", content: "PM at Stripe" },
      { category: "expertise", content: "Knows React" },
    ];
    const result = await compareExtraction(extracted, expected);
    expect(result.tp).toBe(2);
    expect(result.fp).toBe(0);
    expect(result.fn).toBe(0);
  });

  it("handles partial matches", async () => {
    const extracted = [
      { category: "core", content: "PM" },
      { category: "expertise", content: "Knows React" },
    ];
    const expected = [
      { category: "core", content: "PM at Stripe" },
      { category: "expertise", content: "Knows React" },
      { category: "focus", content: "Learning Rust" },
    ];
    const result = await compareExtraction(extracted, expected);
    // "PM" vs "PM at Stripe" may not match depending on threshold
    expect(result.tp).toBeGreaterThanOrEqual(1);
    expect(result.fn).toBeGreaterThanOrEqual(1);
  });

  it("handles empty inputs", async () => {
    const result = await compareExtraction([], []);
    expect(result.tp).toBe(0);
    expect(result.fp).toBe(0);
    expect(result.fn).toBe(0);
  });
});

describe("runExtractionBenchmark", () => {
  it("returns precision between 0 and 1", async () => {
    const report = await runExtractionBenchmark();
    expect(report.metrics.precision).toBeGreaterThanOrEqual(0);
    expect(report.metrics.precision).toBeLessThanOrEqual(1);
  });

  it("returns recall between 0 and 1", async () => {
    const report = await runExtractionBenchmark();
    expect(report.metrics.recall).toBeGreaterThanOrEqual(0);
    expect(report.metrics.recall).toBeLessThanOrEqual(1);
  });

  it("returns f1 between 0 and 1", async () => {
    const report = await runExtractionBenchmark();
    expect(report.metrics.f1).toBeGreaterThanOrEqual(0);
    expect(report.metrics.f1).toBeLessThanOrEqual(1);
  });

  it("returns total cases count", async () => {
    const report = await runExtractionBenchmark();
    expect(report.metrics.totalCases).toBeGreaterThan(0);
  });

  it("has correct component name", async () => {
    const report = await runExtractionBenchmark();
    expect(report.component).toBe("fact-extraction");
  });

  it("has timestamp", async () => {
    const report = await runExtractionBenchmark();
    expect(report.timestamp).toBeDefined();
    expect(() => new Date(report.timestamp)).not.toThrow();
  });

  it("includes failures array", async () => {
    const report = await runExtractionBenchmark();
    expect(Array.isArray(report.failures)).toBe(true);
  });
});
