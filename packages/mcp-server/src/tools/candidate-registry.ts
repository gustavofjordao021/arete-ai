/**
 * Candidate Registry - Session-scoped storage for inference candidates
 *
 * Stores candidates from arete_infer so they can be accepted later
 * via arete_accept_candidate without reconstructing parameters.
 *
 * Also tracks stale candidates - those inferred multiple times without action.
 */

import type { FactCategory } from "@arete/core";

export interface StoredCandidate {
  id: string;
  category: FactCategory;
  content: string;
  confidence: number;
  sourceRef: string;
  signals: string[];
  createdAt: string;
  /** How many times this candidate has been inferred */
  inferCount: number;
  /** When this candidate was last inferred */
  lastInferred: string;
}

/** Threshold for auto-suppression (after N inferences without action) */
const STALE_THRESHOLD = 3;

// In-memory store (persists during MCP session)
const candidateRegistry = new Map<string, StoredCandidate>();

/** Set of content hashes that have been manually suppressed */
const suppressedContents = new Set<string>();

/**
 * Normalize content for comparison/hashing
 */
function normalizeContent(content: string): string {
  return content.toLowerCase().trim();
}

/**
 * Input type for registering candidates (without inferCount/lastInferred)
 */
export type CandidateInput = Omit<StoredCandidate, "inferCount" | "lastInferred">;

/**
 * Register candidates from inference for later acceptance.
 * Updates existing candidates (incrementing inferCount) or creates new ones.
 * Returns only non-stale, non-suppressed candidates.
 */
export function registerCandidates(candidates: CandidateInput[]): StoredCandidate[] {
  const now = new Date().toISOString();
  const result: StoredCandidate[] = [];

  for (const input of candidates) {
    const normalized = normalizeContent(input.content);

    // Skip if manually suppressed
    if (suppressedContents.has(normalized)) {
      continue;
    }

    // Check if we already have this candidate (by content)
    let existing: StoredCandidate | undefined;
    for (const candidate of candidateRegistry.values()) {
      if (normalizeContent(candidate.content) === normalized) {
        existing = candidate;
        break;
      }
    }

    if (existing) {
      // Update existing candidate
      existing.inferCount++;
      existing.lastInferred = now;
      existing.confidence = input.confidence; // Use latest confidence
      existing.signals = input.signals; // Use latest signals

      // Check if now stale
      if (existing.inferCount >= STALE_THRESHOLD) {
        // Auto-suppress (but keep in registry for tracking)
        continue; // Don't include in results
      }

      result.push(existing);
    } else {
      // Create new candidate
      const candidate: StoredCandidate = {
        ...input,
        inferCount: 1,
        lastInferred: now,
      };
      candidateRegistry.set(candidate.id, candidate);
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Get a candidate by ID
 */
export function getCandidate(id: string): StoredCandidate | undefined {
  return candidateRegistry.get(id);
}

/**
 * Get a candidate by content (case-insensitive)
 */
export function getCandidateByContent(content: string): StoredCandidate | undefined {
  const normalizedContent = content.toLowerCase().trim();
  for (const candidate of candidateRegistry.values()) {
    if (candidate.content.toLowerCase().trim() === normalizedContent) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Clear all registered candidates and suppressions
 */
export function clearCandidates(): void {
  candidateRegistry.clear();
  suppressedContents.clear();
}

/**
 * Manually suppress a candidate by content (it won't appear in future inferences)
 */
export function suppressContent(content: string): void {
  suppressedContents.add(normalizeContent(content));
}

/**
 * Check if content is suppressed (either manually or stale)
 */
export function isContentSuppressed(content: string): boolean {
  const normalized = normalizeContent(content);

  // Check manual suppression
  if (suppressedContents.has(normalized)) {
    return true;
  }

  // Check stale suppression
  for (const candidate of candidateRegistry.values()) {
    if (
      normalizeContent(candidate.content) === normalized &&
      candidate.inferCount >= STALE_THRESHOLD
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get stale candidates (for debugging/reporting)
 */
export function getStaleCandidates(): StoredCandidate[] {
  return Array.from(candidateRegistry.values()).filter(
    (c) => c.inferCount >= STALE_THRESHOLD
  );
}

/**
 * Get all registered candidates (for debugging/testing)
 */
export function getAllCandidates(): StoredCandidate[] {
  return Array.from(candidateRegistry.values());
}

/**
 * Remove a candidate after it's been accepted
 */
export function removeCandidate(id: string): boolean {
  return candidateRegistry.delete(id);
}
