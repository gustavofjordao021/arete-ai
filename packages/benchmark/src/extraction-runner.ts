/**
 * Fact Extraction Benchmark Runner
 *
 * Runs the fact extraction benchmark against the dataset.
 * Uses semantic similarity (embeddings) for fact matching.
 */

import {
  initEmbeddings,
  hasEmbeddings,
  findMatchingFactSemantic,
} from "./comparison.js";
import { calculatePrecision, calculateRecall, calculateF1 } from "./metrics.js";
import { extractFactsLive } from "./llm-extractor.js";
import dataset from "./datasets/fact-extraction.json" with { type: "json" };
import type {
  ExtractionBenchmarkReport,
  ExtractionFailure,
  ExpectedFact,
} from "./types.js";

interface Fact {
  category: string;
  content: string;
}

export interface ExtractionBenchmarkOptions {
  live?: boolean;
  anthropicKey?: string;
  openaiKey?: string;
}

/**
 * Compare extracted facts against expected facts (async for embeddings)
 * Returns counts of true positives, false positives, and false negatives
 */
export async function compareExtraction(
  extracted: Fact[],
  expected: ExpectedFact[]
): Promise<{ tp: number; fp: number; fn: number }> {
  let tp = 0;
  let fp = 0;
  const matchedIndices = new Set<number>();

  for (const fact of extracted) {
    const match = await findMatchingFactSemantic(fact, expected);
    if (match) {
      const idx = expected.indexOf(match.match);
      if (!matchedIndices.has(idx)) {
        tp++;
        matchedIndices.add(idx);
      } else {
        // Already matched this expected fact, count as FP
        fp++;
      }
    } else {
      fp++;
    }
  }

  const fn = expected.length - matchedIndices.size;
  return { tp, fp, fn };
}

/**
 * Run the fact extraction benchmark
 *
 * @param options.live - If true, use real Haiku API calls instead of mock responses
 * @param options.apiKey - Required when live=true
 */
export async function runExtractionBenchmark(
  options: ExtractionBenchmarkOptions = {}
): Promise<ExtractionBenchmarkReport> {
  const { live = false, anthropicKey, openaiKey } = options;

  if (live && !anthropicKey) {
    throw new Error("Anthropic API key required for live extraction benchmark");
  }

  // Initialize embeddings if OpenAI key provided
  if (openaiKey) {
    initEmbeddings(openaiKey);
  }

  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  const failures: ExtractionFailure[] = [];

  for (const tc of dataset.testCases) {
    let extracted: Fact[];

    if (live && anthropicKey) {
      // Live mode: call Haiku API
      extracted = await extractFactsLive(tc.transcript, anthropicKey);
    } else {
      // Mock mode: use pre-defined response
      extracted = JSON.parse(tc.mockResponse).facts as Fact[];
    }

    const expected = tc.expectedFacts as ExpectedFact[];

    const { tp, fp, fn } = await compareExtraction(extracted, expected);
    totalTp += tp;
    totalFp += fp;
    totalFn += fn;

    if (fp > 0 || fn > 0) {
      const extractedStr = extracted.map((f) => `${f.category}:${f.content}`).join(", ");
      const expectedStr = expected.map((f) => `${f.category}:${f.content}`).join(", ");
      failures.push({
        id: tc.id,
        details: live
          ? `TP=${tp}, FP=${fp}, FN=${fn} | Got: [${extractedStr}] | Want: [${expectedStr}]`
          : `TP=${tp}, FP=${fp}, FN=${fn}`,
      });
    }
  }

  const precision = calculatePrecision(totalTp, totalFp);
  const recall = calculateRecall(totalTp, totalFn);
  const f1 = calculateF1(precision, recall);

  return {
    timestamp: new Date().toISOString(),
    component: "fact-extraction",
    metrics: {
      precision,
      recall,
      f1,
      totalCases: dataset.testCases.length,
    },
    failures,
  };
}
