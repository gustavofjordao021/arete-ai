/**
 * Identity Merger
 *
 * Merges local and cloud identities using last-write-wins strategy.
 * Handles:
 * - New facts from cloud
 * - Updated facts (cloud vs local)
 * - Deleted facts (tracked via sync-state)
 * - Semantic deduplication
 */

import type { IdentityV2, IdentityFact } from "../schema/identity-v2.js";
import type { SyncState, DeletedFact } from "./sync-state.js";

// --- Types ---

export interface FactConflict {
  factId: string;
  localFact: IdentityFact | null;
  cloudFact: IdentityFact | null;
  resolution: "local" | "cloud" | "deleted";
  reason: string;
}

export interface MergeResult {
  merged: IdentityV2;
  added: IdentityFact[];
  updated: IdentityFact[];
  conflicts: FactConflict[];
  deletedFromCloud: string[];
}

// --- Merge Algorithm ---

/**
 * Merge local and cloud identities.
 * Local is source of truth, cloud facts are merged in.
 *
 * Strategy:
 * 1. Start with local identity
 * 2. For each cloud fact:
 *    - If not in local: add it (new from another device)
 *    - If in local: use newer version (last-write-wins)
 * 3. Apply deletions tracked in sync-state
 */
export function mergeIdentities(
  local: IdentityV2,
  cloud: IdentityV2,
  syncState: SyncState
): MergeResult {
  const result: MergeResult = {
    merged: structuredClone(local),
    added: [],
    updated: [],
    conflicts: [],
    deletedFromCloud: [],
  };

  // Build lookup maps
  const localFactsById = new Map(local.facts.map((f) => [f.id, f]));
  const deletedIds = new Set(syncState.deletedFactIds.map((d) => d.id));

  // Process cloud facts
  for (const cloudFact of cloud.facts) {
    // Skip if locally deleted
    if (deletedIds.has(cloudFact.id)) {
      const deletion = syncState.deletedFactIds.find(
        (d) => d.id === cloudFact.id
      );
      // Only skip if deletion happened after cloud update
      if (deletion && deletion.deletedAt > cloudFact.updatedAt) {
        result.deletedFromCloud.push(cloudFact.id);
        result.conflicts.push({
          factId: cloudFact.id,
          localFact: null,
          cloudFact,
          resolution: "deleted",
          reason: "Locally deleted after cloud update",
        });
        continue;
      }
    }

    const localFact = localFactsById.get(cloudFact.id);

    if (!localFact) {
      // New fact from cloud - add it
      result.merged.facts.push(cloudFact);
      result.added.push(cloudFact);
    } else {
      // Fact exists in both - compare timestamps
      const cloudTime = new Date(cloudFact.updatedAt).getTime();
      const localTime = new Date(localFact.updatedAt).getTime();

      if (cloudTime > localTime) {
        // Cloud is newer - use cloud version
        const index = result.merged.facts.findIndex(
          (f) => f.id === cloudFact.id
        );
        if (index !== -1) {
          result.merged.facts[index] = cloudFact;
          result.updated.push(cloudFact);
          result.conflicts.push({
            factId: cloudFact.id,
            localFact,
            cloudFact,
            resolution: "cloud",
            reason: `Cloud has newer updatedAt (${cloudFact.updatedAt} > ${localFact.updatedAt})`,
          });
        }
      } else if (cloudTime < localTime) {
        // Local is newer - keep local (already in merged)
        result.conflicts.push({
          factId: cloudFact.id,
          localFact,
          cloudFact,
          resolution: "local",
          reason: `Local has newer updatedAt (${localFact.updatedAt} > ${cloudFact.updatedAt})`,
        });
      }
      // If equal timestamps, keep local (already in merged)
    }
  }

  // Deduplicate by content (fuzzy match)
  result.merged.facts = deduplicateFacts(result.merged.facts);

  return result;
}

// --- Deduplication ---

/**
 * Remove duplicate facts based on semantic similarity.
 * Keeps the fact with higher confidence or more recent validation.
 */
export function deduplicateFacts(facts: IdentityFact[]): IdentityFact[] {
  const seen = new Map<string, IdentityFact>();

  for (const fact of facts) {
    const normalized = normalizeContent(fact.content);
    const existing = seen.get(normalized);

    if (!existing) {
      seen.set(normalized, fact);
    } else {
      // Keep the one with higher confidence, or if equal, more recent
      const keepExisting =
        existing.confidence > fact.confidence ||
        (existing.confidence === fact.confidence &&
          existing.lastValidated >= fact.lastValidated);

      if (!keepExisting) {
        seen.set(normalized, fact);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Normalize content for comparison.
 * - Lowercase
 * - Remove extra whitespace
 * - Remove punctuation at end
 */
function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/, "");
}

// --- Utilities ---

/**
 * Check if two facts are semantically similar.
 * Uses simple string similarity for now.
 */
export function areSimilarFacts(a: IdentityFact, b: IdentityFact): boolean {
  if (a.category !== b.category) return false;

  const normA = normalizeContent(a.content);
  const normB = normalizeContent(b.content);

  // Exact match after normalization
  if (normA === normB) return true;

  // One contains the other
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Simple word overlap (Jaccard similarity > 0.7)
  const wordsA = new Set(normA.split(" "));
  const wordsB = new Set(normB.split(" "));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  const jaccard = intersection.size / union.size;

  return jaccard > 0.7;
}

/**
 * Find the best matching fact by content similarity.
 */
export function findMatchingFact(
  content: string,
  facts: IdentityFact[],
  threshold = 0.7
): IdentityFact | null {
  const normalized = normalizeContent(content);

  for (const fact of facts) {
    const factNorm = normalizeContent(fact.content);

    // Exact match
    if (factNorm === normalized) return fact;

    // Substring match
    if (factNorm.includes(normalized) || normalized.includes(factNorm)) {
      return fact;
    }

    // Jaccard similarity
    const wordsA = new Set(normalized.split(" "));
    const wordsB = new Set(factNorm.split(" "));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    const jaccard = intersection.size / union.size;

    if (jaccard >= threshold) return fact;
  }

  return null;
}
