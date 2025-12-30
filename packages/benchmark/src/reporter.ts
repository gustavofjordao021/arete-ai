/**
 * Benchmark Reporter
 *
 * Formats and prints benchmark results to console.
 */

import type {
  BenchmarkReport,
  CategoryBenchmarkReport,
  ExtractionBenchmarkReport,
} from "./types.js";

const DIVIDER = "=".repeat(50);

/**
 * Print a category detection report
 */
function printCategoryReport(report: CategoryBenchmarkReport): void {
  console.log(`\n${DIVIDER}`);
  console.log("Arete Benchmark: Category Detection");
  console.log(DIVIDER);
  console.log(
    `Accuracy: ${(report.metrics.accuracy * 100).toFixed(1)}%`
  );
  console.log(
    `Passed: ${report.metrics.totalCases - report.failures.length}/${report.metrics.totalCases}`
  );

  // Category breakdown
  console.log("\nCategory Breakdown:");
  for (const [cat, breakdown] of Object.entries(report.metrics.byCategory)) {
    const pct = ((breakdown.correct / breakdown.total) * 100).toFixed(1);
    console.log(
      `  ${cat.padEnd(12)} ${breakdown.correct}/${breakdown.total} (${pct}%)`
    );
  }

  // Failures
  if (report.failures.length > 0) {
    console.log("\nFailures:");
    for (const f of report.failures.slice(0, 5)) {
      console.log(`  - ${f.id}: Expected "${f.expected}", got "${f.actual}"`);
      console.log(`    Input: "${f.input.slice(0, 50)}..."`);
    }
    if (report.failures.length > 5) {
      console.log(`  ... and ${report.failures.length - 5} more`);
    }
  }
}

/**
 * Print a fact extraction report
 */
function printExtractionReport(report: ExtractionBenchmarkReport): void {
  console.log(`\n${DIVIDER}`);
  console.log("Arete Benchmark: Fact Extraction");
  console.log(DIVIDER);
  console.log(`Precision: ${(report.metrics.precision * 100).toFixed(1)}%`);
  console.log(`Recall:    ${(report.metrics.recall * 100).toFixed(1)}%`);
  console.log(`F1 Score:  ${(report.metrics.f1 * 100).toFixed(1)}%`);
  console.log(`Total Cases: ${report.metrics.totalCases}`);

  // Failures
  if (report.failures.length > 0) {
    console.log("\nCases with mismatches:");
    for (const f of report.failures.slice(0, 5)) {
      console.log(`  - ${f.id}: ${f.details}`);
    }
    if (report.failures.length > 5) {
      console.log(`  ... and ${report.failures.length - 5} more`);
    }
  }
}

/**
 * Print a benchmark report (auto-detects type)
 */
export function printReport(report: BenchmarkReport): void {
  if (report.component === "category-detection") {
    printCategoryReport(report as CategoryBenchmarkReport);
  } else {
    printExtractionReport(report as ExtractionBenchmarkReport);
  }
}

/**
 * Print a summary of multiple reports
 */
export function printSummary(reports: BenchmarkReport[]): void {
  console.log(`\n${DIVIDER}`);
  console.log("SUMMARY");
  console.log(DIVIDER);

  for (const report of reports) {
    if (report.component === "category-detection") {
      const r = report as CategoryBenchmarkReport;
      console.log(
        `Category Detection:  ${(r.metrics.accuracy * 100).toFixed(1)}% accuracy`
      );
    } else {
      const r = report as ExtractionBenchmarkReport;
      console.log(`Fact Extraction:     F1 = ${(r.metrics.f1 * 100).toFixed(1)}%`);
    }
  }

  console.log("");
}

/**
 * Export report as JSON (for CI)
 */
export function toJSON(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}
