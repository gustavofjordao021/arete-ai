/**
 * Identity Merger Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  mergeIdentities,
  deduplicateFacts,
  areSimilarFacts,
  findMatchingFact,
} from "./identity-merger.js";
import type { IdentityV2, IdentityFact } from "../schema/identity-v2.js";
import { createEmptySyncState, trackDeletedFact } from "./sync-state.js";

// --- Test Helpers ---

function createTestFact(overrides: Partial<IdentityFact> = {}): IdentityFact {
  const now = new Date().toISOString();
  return {
    id: `fact-${Math.random().toString(36).slice(2)}`,
    category: "expertise",
    content: "Test fact content",
    confidence: 0.8,
    lastValidated: now,
    validationCount: 1,
    maturity: "established",
    visibility: "trusted",
    source: "manual",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTestIdentity(facts: IdentityFact[] = []): IdentityV2 {
  return {
    version: "2.0.0",
    deviceId: "test-device",
    facts,
    core: {},
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
      autoPromote: true,
      useHaikuClassification: true,
    },
  };
}

// --- Merge Tests ---

describe("mergeIdentities", () => {
  it("adds new cloud facts to local", () => {
    const localFact = createTestFact({ id: "local-1", content: "Local fact" });
    const cloudFact = createTestFact({ id: "cloud-1", content: "Cloud fact" });

    const local = createTestIdentity([localFact]);
    const cloud = createTestIdentity([cloudFact]);
    const syncState = createEmptySyncState();

    const result = mergeIdentities(local, cloud, syncState);

    expect(result.merged.facts).toHaveLength(2);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].id).toBe("cloud-1");
  });

  it("keeps local fact when local is newer", () => {
    const oldDate = "2024-01-01T00:00:00.000Z";
    const newDate = "2024-06-01T00:00:00.000Z";

    const localFact = createTestFact({
      id: "shared-1",
      content: "Local version",
      updatedAt: newDate,
    });
    const cloudFact = createTestFact({
      id: "shared-1",
      content: "Cloud version",
      updatedAt: oldDate,
    });

    const local = createTestIdentity([localFact]);
    const cloud = createTestIdentity([cloudFact]);
    const syncState = createEmptySyncState();

    const result = mergeIdentities(local, cloud, syncState);

    expect(result.merged.facts).toHaveLength(1);
    expect(result.merged.facts[0].content).toBe("Local version");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolution).toBe("local");
  });

  it("uses cloud fact when cloud is newer", () => {
    const oldDate = "2024-01-01T00:00:00.000Z";
    const newDate = "2024-06-01T00:00:00.000Z";

    const localFact = createTestFact({
      id: "shared-1",
      content: "Local version",
      updatedAt: oldDate,
    });
    const cloudFact = createTestFact({
      id: "shared-1",
      content: "Cloud version",
      updatedAt: newDate,
    });

    const local = createTestIdentity([localFact]);
    const cloud = createTestIdentity([cloudFact]);
    const syncState = createEmptySyncState();

    const result = mergeIdentities(local, cloud, syncState);

    expect(result.merged.facts).toHaveLength(1);
    expect(result.merged.facts[0].content).toBe("Cloud version");
    expect(result.updated).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolution).toBe("cloud");
  });

  it("handles same timestamp (local wins)", () => {
    const sameDate = "2024-06-01T00:00:00.000Z";

    const localFact = createTestFact({
      id: "shared-1",
      content: "Local version",
      updatedAt: sameDate,
    });
    const cloudFact = createTestFact({
      id: "shared-1",
      content: "Cloud version",
      updatedAt: sameDate,
    });

    const local = createTestIdentity([localFact]);
    const cloud = createTestIdentity([cloudFact]);
    const syncState = createEmptySyncState();

    const result = mergeIdentities(local, cloud, syncState);

    expect(result.merged.facts).toHaveLength(1);
    expect(result.merged.facts[0].content).toBe("Local version");
  });

  it("respects local deletions", () => {
    const cloudFact = createTestFact({
      id: "deleted-1",
      content: "Deleted fact",
      updatedAt: "2024-01-01T00:00:00.000Z",
    });

    const local = createTestIdentity([]);
    const cloud = createTestIdentity([cloudFact]);

    let syncState = createEmptySyncState();
    syncState = trackDeletedFact(syncState, "deleted-1");
    // Simulate deletion happened after cloud update
    syncState.deletedFactIds[0].deletedAt = "2024-06-01T00:00:00.000Z";

    const result = mergeIdentities(local, cloud, syncState);

    expect(result.merged.facts).toHaveLength(0);
    expect(result.deletedFromCloud).toContain("deleted-1");
  });

  it("deduplicates semantically similar facts", () => {
    const fact1 = createTestFact({
      id: "fact-1",
      content: "I know TypeScript",
      confidence: 0.8,
    });
    const fact2 = createTestFact({
      id: "fact-2",
      content: "i know typescript",
      confidence: 0.9,
    });

    const local = createTestIdentity([fact1]);
    const cloud = createTestIdentity([fact2]);
    const syncState = createEmptySyncState();

    const result = mergeIdentities(local, cloud, syncState);

    // Should deduplicate, keeping higher confidence
    expect(result.merged.facts).toHaveLength(1);
    expect(result.merged.facts[0].confidence).toBe(0.9);
  });
});

// --- Deduplication Tests ---

describe("deduplicateFacts", () => {
  it("removes exact duplicates (case-insensitive)", () => {
    const facts = [
      createTestFact({ id: "1", content: "Uses React" }),
      createTestFact({ id: "2", content: "uses react" }),
    ];

    const result = deduplicateFacts(facts);

    expect(result).toHaveLength(1);
  });

  it("keeps fact with higher confidence", () => {
    const facts = [
      createTestFact({ id: "1", content: "Uses React", confidence: 0.5 }),
      createTestFact({ id: "2", content: "uses react", confidence: 0.9 }),
    ];

    const result = deduplicateFacts(facts);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it("handles punctuation differences", () => {
    const facts = [
      createTestFact({ id: "1", content: "Prefers dark mode." }),
      createTestFact({ id: "2", content: "Prefers dark mode" }),
    ];

    const result = deduplicateFacts(facts);

    expect(result).toHaveLength(1);
  });
});

// --- Similarity Tests ---

describe("areSimilarFacts", () => {
  it("returns true for same content", () => {
    const a = createTestFact({ content: "Uses TypeScript" });
    const b = createTestFact({ content: "uses typescript" });

    expect(areSimilarFacts(a, b)).toBe(true);
  });

  it("returns false for different categories", () => {
    const a = createTestFact({ category: "expertise", content: "TypeScript" });
    const b = createTestFact({ category: "preference", content: "TypeScript" });

    expect(areSimilarFacts(a, b)).toBe(false);
  });

  it("returns true when one contains the other", () => {
    const a = createTestFact({ content: "Uses TypeScript" });
    const b = createTestFact({ content: "Uses TypeScript and React" });

    expect(areSimilarFacts(a, b)).toBe(true);
  });
});

// --- Find Matching Tests ---

describe("findMatchingFact", () => {
  it("finds exact match", () => {
    const facts = [
      createTestFact({ id: "1", content: "Uses TypeScript" }),
      createTestFact({ id: "2", content: "Prefers dark mode" }),
    ];

    const match = findMatchingFact("uses typescript", facts);

    expect(match).not.toBeNull();
    expect(match?.id).toBe("1");
  });

  it("returns null when no match", () => {
    const facts = [
      createTestFact({ id: "1", content: "Uses TypeScript" }),
    ];

    const match = findMatchingFact("loves Python", facts);

    expect(match).toBeNull();
  });

  it("finds partial match", () => {
    const facts = [
      createTestFact({ id: "1", content: "Senior software engineer" }),
    ];

    const match = findMatchingFact("software engineer", facts);

    expect(match).not.toBeNull();
    expect(match?.id).toBe("1");
  });
});
