/**
 * Comparison Utilities
 *
 * Semantic similarity using OpenAI embeddings for fact matching.
 * Falls back to Jaro-Winkler if embeddings unavailable.
 */

import OpenAI from "openai";
import type { ExpectedFact } from "./types.js";

const EMBEDDING_MODEL = "text-embedding-3-small";
const SEMANTIC_THRESHOLD = 0.60; // Cosine similarity threshold (lowered for phrasing variance)
const JARO_THRESHOLD = 0.7; // Fallback string similarity threshold

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;
let embeddingCache: Map<string, number[]> = new Map();

/**
 * Initialize embedding service with API key
 */
export function initEmbeddings(apiKey: string): void {
  openaiClient = new OpenAI({ apiKey });
  embeddingCache.clear();
}

/**
 * Check if embeddings are available
 */
export function hasEmbeddings(): boolean {
  return openaiClient !== null;
}

/**
 * Get embedding for text (cached)
 */
async function getEmbedding(text: string): Promise<number[] | null> {
  if (!openaiClient) return null;

  const cacheKey = text.toLowerCase().trim();
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  try {
    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    const embedding = response.data[0].embedding;
    embeddingCache.set(cacheKey, embedding);
    return embedding;
  } catch (error) {
    console.error("Embedding failed:", error);
    return null;
  }
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

/**
 * Calculate semantic similarity using embeddings
 */
export async function semanticSimilarity(
  s1: string,
  s2: string
): Promise<number> {
  const [emb1, emb2] = await Promise.all([getEmbedding(s1), getEmbedding(s2)]);

  if (!emb1 || !emb2) {
    // Fallback to Jaro-Winkler
    return jaroWinklerSimilarity(s1, s2);
  }

  return cosineSimilarity(emb1, emb2);
}

// ============================================================================
// Jaro-Winkler fallback (when embeddings unavailable)
// ============================================================================

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

function jaro(s1: string, s2: string): number {
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const a = normalize(s1);
  const b = normalize(s2);

  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const jaroSim = jaro(a, b);

  let prefixLength = 0;
  for (let i = 0; i < Math.min(a.length, b.length, 4); i++) {
    if (a[i] === b[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  return jaroSim + prefixLength * 0.1 * (1 - jaroSim);
}

// ============================================================================
// Fact matching
// ============================================================================

/**
 * Find a matching fact using semantic similarity (async)
 */
export async function findMatchingFactSemantic(
  predicted: { category: string; content: string },
  expected: ExpectedFact[],
  options: { requireCategoryMatch?: boolean } = {}
): Promise<{ match: ExpectedFact; similarity: number } | null> {
  const { requireCategoryMatch = false } = options;
  let bestMatch: { match: ExpectedFact; similarity: number } | null = null;
  const threshold = hasEmbeddings() ? SEMANTIC_THRESHOLD : JARO_THRESHOLD;

  for (const exp of expected) {
    // Skip category mismatch if required
    if (requireCategoryMatch && exp.category !== predicted.category) continue;

    const sim = await semanticSimilarity(predicted.content, exp.content);

    // Bonus for matching category (helps disambiguation)
    const adjustedSim = exp.category === predicted.category ? sim : sim * 0.95;

    if (adjustedSim >= threshold) {
      if (!bestMatch || adjustedSim > bestMatch.similarity) {
        bestMatch = { match: exp, similarity: adjustedSim };
      }
    }
  }

  return bestMatch;
}

/**
 * Find a matching fact using Jaro-Winkler (sync, for backwards compat)
 */
export function findMatchingFact(
  predicted: { category: string; content: string },
  expected: ExpectedFact[]
): { match: ExpectedFact; similarity: number } | null {
  let bestMatch: { match: ExpectedFact; similarity: number } | null = null;

  for (const exp of expected) {
    if (exp.category !== predicted.category) continue;

    const sim = jaroWinklerSimilarity(predicted.content, exp.content);

    if (sim >= JARO_THRESHOLD) {
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { match: exp, similarity: sim };
      }
    }
  }

  return bestMatch;
}
