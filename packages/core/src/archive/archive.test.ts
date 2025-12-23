/**
 * Archive module tests - Phase 6: Archive + Cleanup
 *
 * Tests for archiving expired facts (confidence < 0.1)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  findExpiredFacts,
  archiveFacts,
  runArchiveCleanup,
  getArchiveDir,
  setConfigDir,
} from "./archive.js";
import type { IdentityV2, IdentityFact } from "../schema/identity-v2.js";

// Use temp directory for tests
const TEST_DIR = join(tmpdir(), "arete-archive-test-" + Date.now());

// Mock identity v2 for testing
function createTestIdentity(facts: Partial<IdentityFact>[]): IdentityV2 {
  const now = new Date().toISOString();
  return {
    version: "2.0.0",
    deviceId: "test",
    facts: facts.map((f, i) => ({
      id: f.id ?? `fact-${i}`,
      category: f.category ?? "expertise",
      content: f.content ?? `Fact ${i}`,
      confidence: f.confidence ?? 0.8,
      lastValidated: f.lastValidated ?? now,
      validationCount: f.validationCount ?? 1,
      maturity: f.maturity ?? "established",
      visibility: f.visibility ?? "trusted",
      source: f.source ?? "manual",
      createdAt: f.createdAt ?? now,
      updatedAt: f.updatedAt ?? now,
    })),
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

// Create a fact with old lastValidated to simulate decay
function createExpiredFact(id: string, daysOld: number): Partial<IdentityFact> {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - daysOld);
  return {
    id,
    content: `Expired fact ${id}`,
    confidence: 0.5, // With 60-day half-life, 400+ days = <0.1
    lastValidated: pastDate.toISOString(),
    maturity: "candidate",
  };
}

describe("Archive Module", () => {
  beforeEach(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    setConfigDir(TEST_DIR);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("findExpiredFacts", () => {
    it("should identify facts with effective confidence < threshold", () => {
      // 400 days old with 0.5 confidence and 60-day half-life
      // effective = 0.5 * 0.5^(400/60) = 0.5 * 0.5^6.67 ≈ 0.005
      const identity = createTestIdentity([
        createExpiredFact("expired-1", 400),
        { id: "fresh-1", content: "Fresh fact", confidence: 0.9 },
      ]);

      const expired = findExpiredFacts(identity, 0.1);

      expect(expired).toHaveLength(1);
      expect(expired[0].id).toBe("expired-1");
    });

    it("should return empty array when no facts are expired", () => {
      const identity = createTestIdentity([
        { id: "fresh-1", confidence: 0.9 },
        { id: "fresh-2", confidence: 0.8 },
      ]);

      const expired = findExpiredFacts(identity, 0.1);

      expect(expired).toHaveLength(0);
    });

    it("should respect custom threshold", () => {
      // 120 days old with 0.5 confidence
      // effective = 0.5 * 0.5^(120/60) = 0.5 * 0.25 = 0.125
      const identity = createTestIdentity([
        createExpiredFact("borderline", 120),
      ]);

      // At 0.1 threshold, should NOT be expired (0.125 > 0.1)
      expect(findExpiredFacts(identity, 0.1)).toHaveLength(0);

      // At 0.15 threshold, SHOULD be expired (0.125 < 0.15)
      expect(findExpiredFacts(identity, 0.15)).toHaveLength(1);
    });

    it("should handle empty facts array", () => {
      const identity = createTestIdentity([]);
      const expired = findExpiredFacts(identity, 0.1);
      expect(expired).toHaveLength(0);
    });
  });

  describe("archiveFacts", () => {
    it("should create archive directory if not exists", async () => {
      const archiveDir = getArchiveDir();
      expect(existsSync(archiveDir)).toBe(false);

      const facts = [
        {
          id: "archived-1",
          category: "expertise" as const,
          content: "Old skill",
          confidence: 0.05,
          lastValidated: new Date().toISOString(),
          validationCount: 1,
          maturity: "candidate" as const,
          visibility: "trusted" as const,
          source: "inferred" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      await archiveFacts(facts);

      expect(existsSync(archiveDir)).toBe(true);
    });

    it("should write facts to timestamped archive file", async () => {
      const facts = [
        {
          id: "archived-1",
          category: "expertise" as const,
          content: "Old skill",
          confidence: 0.05,
          lastValidated: new Date().toISOString(),
          validationCount: 1,
          maturity: "candidate" as const,
          visibility: "trusted" as const,
          source: "inferred" as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const archivePath = await archiveFacts(facts);

      expect(archivePath).not.toBeNull();
      expect(archivePath).toMatch(/archived-facts-\d{4}-\d{2}-\d{2}T.*\.json$/);
      expect(existsSync(archivePath!)).toBe(true);

      const content = JSON.parse(readFileSync(archivePath!, "utf-8"));
      expect(content.facts).toHaveLength(1);
      expect(content.facts[0].id).toBe("archived-1");
      expect(content.archivedAt).toBeDefined();
    });

    it("should return null when no facts to archive", async () => {
      const result = await archiveFacts([]);
      expect(result).toBeNull();
    });
  });

  describe("runArchiveCleanup", () => {
    it("should remove expired facts from identity and archive them", async () => {
      // Setup identity file with mixed facts
      const identity = createTestIdentity([
        createExpiredFact("expired-1", 400),
        createExpiredFact("expired-2", 500),
        { id: "fresh-1", content: "Keep me", confidence: 0.9 },
      ]);

      const identityPath = join(TEST_DIR, "identity.json");
      writeFileSync(identityPath, JSON.stringify(identity, null, 2));

      const result = await runArchiveCleanup();

      expect(result.archivedCount).toBe(2);
      expect(result.remainingCount).toBe(1);
      expect(result.archivePath).toBeTruthy();

      // Verify identity was updated
      const updated = JSON.parse(readFileSync(identityPath, "utf-8"));
      expect(updated.facts).toHaveLength(1);
      expect(updated.facts[0].id).toBe("fresh-1");
    });

    it("should return zero counts when nothing to archive", async () => {
      const identity = createTestIdentity([
        { id: "fresh-1", confidence: 0.9 },
      ]);

      const identityPath = join(TEST_DIR, "identity.json");
      writeFileSync(identityPath, JSON.stringify(identity, null, 2));

      const result = await runArchiveCleanup();

      expect(result.archivedCount).toBe(0);
      expect(result.remainingCount).toBe(1);
      expect(result.archivePath).toBeNull();
    });

    it("should create identity file if not exists", async () => {
      const identityPath = join(TEST_DIR, "identity.json");
      expect(existsSync(identityPath)).toBe(false);

      const result = await runArchiveCleanup();

      expect(result.archivedCount).toBe(0);
      expect(result.remainingCount).toBe(0);
    });
  });

  describe("getArchiveDir", () => {
    it("should return path under config dir", () => {
      const archiveDir = getArchiveDir();
      expect(archiveDir).toBe(join(TEST_DIR, "archive"));
    });
  });
});
