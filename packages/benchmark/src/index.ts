#!/usr/bin/env node
/**
 * Arete Benchmark CLI
 *
 * Usage:
 *   npm run benchmark                     # Run all benchmarks (mock mode)
 *   npm run benchmark -- --suite category # Category detection only
 *   npm run benchmark -- --suite extraction # Fact extraction only
 *   npm run benchmark -- --live           # Use real Haiku API for extraction
 *   npm run benchmark -- --json           # Output JSON for CI
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { runCategoryBenchmark } from "./category-runner.js";
import { runExtractionBenchmark } from "./extraction-runner.js";
import { printReport, printSummary } from "./reporter.js";
import type { BenchmarkReport } from "./types.js";

type Suite = "all" | "category" | "extraction";

interface ParsedArgs {
  suite: Suite;
  json: boolean;
  live: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let suite: Suite = "all";
  let json = false;
  let live = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--suite" && args[i + 1]) {
      suite = args[i + 1] as Suite;
      i++;
    } else if (args[i] === "--json") {
      json = true;
    } else if (args[i] === "--live") {
      live = true;
    }
  }

  return { suite, json, live };
}

function loadEnvFile(): string | null {
  const envPaths = [
    join(process.cwd(), ".env"),
    join(process.cwd(), "../../.env"), // From packages/benchmark
  ];

  for (const envPath of envPaths) {
    try {
      if (existsSync(envPath)) {
        return readFileSync(envPath, "utf-8");
      }
    } catch {
      // Ignore .env errors
    }
  }

  return null;
}

function loadApiKey(keyName: string): string | undefined {
  // Check environment variable first
  if (process.env[keyName]) {
    return process.env[keyName];
  }

  // Try loading from .env
  const envContent = loadEnvFile();
  if (envContent) {
    const regex = new RegExp(`${keyName}=["']?([^"'\\n]+)["']?`);
    const match = envContent.match(regex);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

async function main(): Promise<void> {
  const { suite, json, live } = parseArgs();
  const reports: BenchmarkReport[] = [];
  const startTime = performance.now();

  // Load API keys if live mode
  let anthropicKey: string | undefined;
  let openaiKey: string | undefined;
  if (live) {
    anthropicKey = loadApiKey("ANTHROPIC_API_KEY");
    openaiKey = loadApiKey("OPENAI_API_KEY");
    if (!anthropicKey) {
      console.error("Error: --live requires ANTHROPIC_API_KEY in environment or .env file");
      process.exit(1);
    }
    if (!json) {
      console.log("🔴 LIVE MODE: Using real Haiku API calls");
      if (openaiKey) {
        console.log("📊 Semantic matching enabled (OpenAI embeddings)");
      } else {
        console.log("⚠️  No OPENAI_API_KEY - using Jaro-Winkler fallback");
      }
      console.log();
    }
  }

  if (suite === "all" || suite === "category") {
    const report = await runCategoryBenchmark();
    reports.push(report);
    if (!json) {
      printReport(report);
    }
  }

  if (suite === "all" || suite === "extraction") {
    const report = await runExtractionBenchmark({
      live,
      anthropicKey,
      openaiKey,
    });
    reports.push(report);
    if (!json) {
      printReport(report);
    }
  }

  const duration = Math.round(performance.now() - startTime);

  if (json) {
    // Output JSON for CI
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          durationMs: duration,
          live,
          reports,
        },
        null,
        2
      )
    );
  } else {
    // Print summary
    if (reports.length > 1) {
      printSummary(reports);
    }
    console.log(`Time: ${duration}ms${live ? " (live API calls)" : ""}\n`);
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
