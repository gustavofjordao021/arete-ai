/**
 * vector-math.ts - Vector math utilities for semantic embeddings
 *
 * Provides cosine similarity and normalized similarity functions
 * for comparing OpenAI text-embedding-3-small vectors (1536 dimensions).
 */

/**
 * Compute cosine similarity between two vectors
 *
 * Formula: dot(a, b) / (||a|| * ||b||)
 *
 * Returns value in range [-1, 1]:
 * - 1 = identical direction
 * - 0 = orthogonal (unrelated)
 * - -1 = opposite direction
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in range [-1, 1]
 * @throws Error if vectors have different dimensions
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  // Handle zero vectors
  if (magnitude === 0) return 0;

  return dot / magnitude;
}

/**
 * Normalize similarity to [0, 1] range
 *
 * Maps cosine similarity from [-1, 1] to [0, 1]:
 * - 1 = identical
 * - 0.5 = orthogonal
 * - 0 = opposite
 *
 * Note: For text embeddings, similarity is typically already in [0, 1]
 * since text is rarely semantically "opposite". This function handles
 * edge cases where negative similarities might occur.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Normalized similarity in range [0, 1]
 */
export function normalizedSimilarity(a: number[], b: number[]): number {
  const sim = cosineSimilarity(a, b);
  return (sim + 1) / 2;
}
