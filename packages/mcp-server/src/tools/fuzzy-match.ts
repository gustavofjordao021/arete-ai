/**
 * Fuzzy string matching utilities
 *
 * Used for finding facts when exact content match isn't available.
 * Helps Claude validate facts without needing the exact wording.
 */

/**
 * Calculate similarity between two strings using Jaro-Winkler algorithm
 * Returns a value between 0 (no match) and 1 (exact match)
 */
export function similarity(s1: string, s2: string): number {
  // Normalize strings: lowercase, trim, collapse whitespace
  const a = normalize(s1);
  const b = normalize(s2);

  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Use Jaro-Winkler for better prefix weighting
  return jaroWinkler(a, b);
}

/**
 * Normalize a string for comparison
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, ""); // Remove punctuation
}

/**
 * Jaro similarity
 */
function jaro(s1: string, s2: string): number {
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
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

  // Count transpositions
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

/**
 * Jaro-Winkler similarity (gives bonus for common prefix)
 */
function jaroWinkler(s1: string, s2: string): number {
  const jaroSim = jaro(s1, s2);

  // Find common prefix length (max 4)
  let prefixLength = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  // Standard scaling factor is 0.1
  return jaroSim + prefixLength * 0.1 * (1 - jaroSim);
}

/**
 * Find the best matching string from an array
 * Returns the match and its similarity score, or undefined if none meet threshold
 */
export interface FuzzyMatch<T> {
  item: T;
  score: number;
}

export function findBestMatch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  threshold: number = 0.8
): FuzzyMatch<T> | undefined {
  let bestMatch: FuzzyMatch<T> | undefined;

  for (const item of items) {
    const text = getText(item);
    const score = similarity(query, text);

    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { item, score };
    }
  }

  return bestMatch;
}
