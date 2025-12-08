/**
 * Tests for arete_reject_fact MCP tool
 *
 * RED-GREEN-REFACTOR: These tests are written first (RED phase)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  rejectFactHandler,
  loadBlocked,
  setConfigDir,
} from "./identity-reject.js";

const TEST_DIR = join(tmpdir(), "arete-mcp-reject-test-" + Date.now());

// Mock @arete/core
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
}));

// Types for test helpers
interface BlockedFact {
  factId: string;
  content?: string;
  reason?: string;
  blockedAt: string;
}

interface IdentityFact {
  id: string;
  category: string;
  content: string;
  confidence: number;
  lastValidated: string;
  validationCount: number;
  maturity: string;
  source: string;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

interface IdentityV2 {
  version: string;
  deviceId: string;
  userId?: string;
  facts: IdentityFact[];
  core: { name?: string; role?: string };
  settings: {
    decayHalfLifeDays: number;
    autoInfer: boolean;
    excludedDomains: string[];
  };
}

// Helper to create a v2 identity
function createTestIdentityV2(facts: IdentityFact[] = []): IdentityV2 {
  return {
    version: "2.0.0",
    deviceId: "test-device",
    facts,
    core: { name: "Test User", role: "Developer" },
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
    },
  };
}

describe("arete_reject_fact tool", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setConfigDir(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    vi.resetAllMocks();
  });

  describe("blocking by factId", () => {
    it("adds factId to blocked list", async () => {
      const result = await rejectFactHandler({
        factId: "candidate-123",
        reason: "Not accurate - I don't actually know this",
      });

      expect(result.structuredContent.success).toBe(true);

      const blocked = loadBlocked();
      expect(blocked).toContainEqual(
        expect.objectContaining({ factId: "candidate-123" })
      );
    });

    it("stores reason with blocked fact", async () => {
      await rejectFactHandler({
        factId: "candidate-456",
        reason: "Just browsing, not an expert",
      });

      const blocked = loadBlocked();
      const entry = blocked.find((b: BlockedFact) => b.factId === "candidate-456");
      expect(entry?.reason).toBe("Just browsing, not an expert");
    });

    it("stores blockedAt timestamp", async () => {
      const before = new Date().toISOString();

      await rejectFactHandler({
        factId: "candidate-789",
      });

      const blocked = loadBlocked();
      const entry = blocked.find((b: BlockedFact) => b.factId === "candidate-789");
      expect(entry?.blockedAt).toBeDefined();
      expect(new Date(entry!.blockedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime()
      );
    });
  });

  describe("blocking by content", () => {
    it("blocks by content when factId not provided", async () => {
      const result = await rejectFactHandler({
        content: "Python development",
        reason: "I don't use Python",
      });

      expect(result.structuredContent.success).toBe(true);

      const blocked = loadBlocked();
      expect(blocked).toContainEqual(
        expect.objectContaining({ content: "Python development" })
      );
    });

    it("generates factId from content hash when not provided", async () => {
      await rejectFactHandler({
        content: "Some skill I don't have",
      });

      const blocked = loadBlocked();
      expect(blocked.length).toBe(1);
      expect(blocked[0].factId).toBeDefined();
      expect(blocked[0].content).toBe("Some skill I don't have");
    });
  });

  describe("duplicate handling", () => {
    it("does not add duplicate factIds", async () => {
      await rejectFactHandler({ factId: "duplicate-test" });
      await rejectFactHandler({ factId: "duplicate-test" });
      await rejectFactHandler({ factId: "duplicate-test" });

      const blocked = loadBlocked();
      const duplicates = blocked.filter((b: BlockedFact) => b.factId === "duplicate-test");
      expect(duplicates.length).toBe(1);
    });

    it("updates reason if re-rejected with new reason", async () => {
      await rejectFactHandler({ factId: "update-reason", reason: "First reason" });
      await rejectFactHandler({ factId: "update-reason", reason: "Updated reason" });

      const blocked = loadBlocked();
      const entry = blocked.find((b: BlockedFact) => b.factId === "update-reason");
      expect(entry?.reason).toBe("Updated reason");
    });
  });

  describe("removing candidate facts", () => {
    it("removes candidate from identity if it exists", async () => {
      const candidateFact: IdentityFact = {
        id: "remove-me",
        category: "expertise",
        content: "COBOL programming",
        confidence: 0.5,
        lastValidated: new Date().toISOString(),
        validationCount: 0,
        maturity: "candidate",
        source: "inferred",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const identity = createTestIdentityV2([candidateFact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      await rejectFactHandler({ factId: "remove-me", reason: "Never used COBOL" });

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const removedFact = stored.facts.find((f: IdentityFact) => f.id === "remove-me");
      expect(removedFact).toBeUndefined();
    });

    it("does not remove established or proven facts (only blocks future inference)", async () => {
      const establishedFact: IdentityFact = {
        id: "established-fact",
        category: "expertise",
        content: "JavaScript development",
        confidence: 0.9,
        lastValidated: new Date().toISOString(),
        validationCount: 3,
        maturity: "established",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const identity = createTestIdentityV2([establishedFact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await rejectFactHandler({
        factId: "established-fact",
        reason: "I want to remove this",
      });

      // Should succeed (adds to blocked) but not remove established fact
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.removed).toBe(false);
      expect(result.content[0].text).toContain("established");

      const stored = JSON.parse(readFileSync(join(TEST_DIR, "identity.json"), "utf-8"));
      const fact = stored.facts.find((f: IdentityFact) => f.id === "established-fact");
      expect(fact).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("requires factId or content", async () => {
      const result = await rejectFactHandler({});

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("factId or content");
    });

    it("handles missing blocked.json gracefully", async () => {
      // No blocked.json file exists
      const result = await rejectFactHandler({ factId: "new-block" });

      expect(result.structuredContent.success).toBe(true);

      const blocked = loadBlocked();
      expect(blocked.length).toBe(1);
    });

    it("handles corrupt blocked.json", async () => {
      writeFileSync(join(TEST_DIR, "blocked.json"), "not valid json");

      const result = await rejectFactHandler({ factId: "after-corrupt" });

      expect(result.structuredContent.success).toBe(true);
      // Should start fresh
      const blocked = loadBlocked();
      expect(blocked.length).toBe(1);
    });
  });

  describe("response format", () => {
    it("returns success with blocked fact details", async () => {
      const result = await rejectFactHandler({
        factId: "response-test",
        content: "Test content",
        reason: "Test reason",
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.blocked).toMatchObject({
        factId: "response-test",
        content: "Test content",
        reason: "Test reason",
      });
    });

    it("includes human-readable confirmation", async () => {
      const result = await rejectFactHandler({
        content: "Ruby on Rails",
        reason: "Not my stack",
      });

      expect(result.content[0].text).toContain("Ruby on Rails");
      expect(result.content[0].text.toLowerCase()).toContain("blocked");
    });

    it("includes guidance for Claude behavior", async () => {
      const result = await rejectFactHandler({
        factId: "guidance-test",
      });

      expect(result.structuredContent.guidance).toBeDefined();
      expect(result.structuredContent.guidance).toContain("suggest");
    });
  });

  describe("offline operation", () => {
    it("works offline (local file is source of truth)", async () => {
      const result = await rejectFactHandler({ factId: "offline-test" });

      expect(result.structuredContent.success).toBe(true);

      // Verify it's stored locally
      const blocked = loadBlocked();
      expect(blocked.some(b => b.factId === "offline-test")).toBe(true);
    });
  });
});
