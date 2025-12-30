/**
 * Category Detection Benchmark Runner
 *
 * Runs the category detection benchmark against the dataset.
 */

import { calculateAccuracy } from "./metrics.js";
import dataset from "./datasets/category-detection.json" with { type: "json" };
import type {
  CategoryBenchmarkReport,
  CategoryBreakdown,
  CategoryFailure,
  FactCategory,
} from "./types.js";

/**
 * Detect category from content (copied from mcp-server for benchmark isolation)
 *
 * Categories:
 * - core: Identity basics (name, role, company)
 * - expertise: Skills and knowledge
 * - preference: Likes, dislikes, preferences
 * - context: Environment, tools, constraints
 * - focus: Current learning/projects
 */
function detectCategory(content: string): FactCategory {
  const lower = content.toLowerCase();

  // Core identity: "I'm a...", "I work at..."
  if (/\b(i'm a|i am a|i work at|my role|my job|my title|my name)\b/.test(lower)) {
    return "core";
  }

  // Expertise/skills: "I know...", "expert in...", years of experience
  if (/\b(i know|expert in|skilled|years of|proficient|experienced|expertise|specialist)\b/.test(lower)) {
    return "expertise";
  }

  // Preferences: "I prefer...", "I like...", "I hate..."
  if (/\b(i prefer|i like|i love|i hate|i dislike|i always|i never|prefer|favorite)\b/.test(lower)) {
    return "preference";
  }

  // Current focus: "I'm learning...", "I'm building...", "working on..."
  if (/\b(i'm learning|i'm building|working on|studying|researching|currently|project)\b/.test(lower)) {
    return "focus";
  }

  // Context/environment: "I'm based in...", "I use...", constraints
  if (/\b(i'm based|i live|i use|on my|running on|located|timezone|using)\b/.test(lower)) {
    return "context";
  }

  // Default to context (safe fallback)
  return "context";
}

/**
 * Run the category detection benchmark
 */
export async function runCategoryBenchmark(): Promise<CategoryBenchmarkReport> {
  const testCases = dataset.testCases;

  const results = testCases.map((tc) => ({
    ...tc,
    actual: detectCategory(tc.input),
    passed: detectCategory(tc.input) === tc.expectedCategory,
  }));

  const correct = results.filter((r) => r.passed).length;

  const failures: CategoryFailure[] = results
    .filter((r) => !r.passed)
    .map((r) => ({
      id: r.id,
      input: r.input,
      expected: r.expectedCategory as FactCategory,
      actual: r.actual,
    }));

  // Group by category
  const byCategory: Partial<Record<FactCategory, CategoryBreakdown>> = {};
  for (const r of results) {
    const cat = r.expectedCategory as FactCategory;
    if (!byCategory[cat]) {
      byCategory[cat] = { correct: 0, total: 0 };
    }
    byCategory[cat]!.total++;
    if (r.passed) {
      byCategory[cat]!.correct++;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    component: "category-detection",
    metrics: {
      accuracy: calculateAccuracy(correct, results.length),
      totalCases: results.length,
      byCategory,
    },
    failures,
  };
}
