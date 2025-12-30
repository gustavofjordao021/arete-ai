/**
 * Benchmark Metrics
 *
 * Functions for calculating precision, recall, F1, and accuracy.
 */

/**
 * Calculate precision: TP / (TP + FP)
 * @param tp True positives (correct predictions)
 * @param fp False positives (incorrect predictions)
 */
export function calculatePrecision(tp: number, fp: number): number {
  return tp + fp === 0 ? 0 : tp / (tp + fp);
}

/**
 * Calculate recall: TP / (TP + FN)
 * @param tp True positives (found items)
 * @param fn False negatives (missed items)
 */
export function calculateRecall(tp: number, fn: number): number {
  return tp + fn === 0 ? 0 : tp / (tp + fn);
}

/**
 * Calculate F1 score: harmonic mean of precision and recall
 * @param precision Precision score (0-1)
 * @param recall Recall score (0-1)
 */
export function calculateF1(precision: number, recall: number): number {
  return precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
}

/**
 * Calculate accuracy: correct / total
 * @param correct Number of correct predictions
 * @param total Total number of cases
 */
export function calculateAccuracy(correct: number, total: number): number {
  return total === 0 ? 0 : correct / total;
}
