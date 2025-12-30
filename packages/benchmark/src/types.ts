/**
 * Arete Benchmark Types
 *
 * Core interfaces for benchmark test cases and results.
 */

import type { FactCategory } from "@arete/core";

// Re-export for convenience
export type { FactCategory };

/**
 * A single category detection test case
 */
export interface CategoryTestCase {
  id: string;
  input: string;
  expectedCategory: FactCategory;
  tags?: string[];
}

/**
 * A single fact for extraction testing
 */
export interface ExpectedFact {
  category: FactCategory;
  content: string;
}

/**
 * A single fact extraction test case
 */
export interface ExtractionTestCase {
  id: string;
  transcript: string;
  mockResponse: string; // JSON string of { facts: ExpectedFact[] }
  expectedFacts: ExpectedFact[];
  tags?: string[];
}

/**
 * Category detection dataset format
 */
export interface CategoryDataset {
  version: string;
  description: string;
  testCases: CategoryTestCase[];
}

/**
 * Fact extraction dataset format
 */
export interface ExtractionDataset {
  version: string;
  description?: string;
  testCases: ExtractionTestCase[];
}

/**
 * Per-category breakdown
 */
export interface CategoryBreakdown {
  correct: number;
  total: number;
}

/**
 * Metrics for category detection benchmark
 */
export interface CategoryMetrics {
  accuracy: number;
  totalCases: number;
  byCategory: Partial<Record<FactCategory, CategoryBreakdown>>;
}

/**
 * Metrics for fact extraction benchmark
 */
export interface ExtractionMetrics {
  precision: number;
  recall: number;
  f1: number;
  totalCases: number;
}

/**
 * A failure in category detection
 */
export interface CategoryFailure {
  id: string;
  input: string;
  expected: FactCategory;
  actual: FactCategory;
}

/**
 * A failure in fact extraction
 */
export interface ExtractionFailure {
  id: string;
  details: string;
}

/**
 * Benchmark report for category detection
 */
export interface CategoryBenchmarkReport {
  timestamp: string;
  component: "category-detection";
  metrics: CategoryMetrics;
  failures: CategoryFailure[];
}

/**
 * Benchmark report for fact extraction
 */
export interface ExtractionBenchmarkReport {
  timestamp: string;
  component: "fact-extraction";
  metrics: ExtractionMetrics;
  failures: ExtractionFailure[];
}

/**
 * Union type for all benchmark reports
 */
export type BenchmarkReport = CategoryBenchmarkReport | ExtractionBenchmarkReport;
