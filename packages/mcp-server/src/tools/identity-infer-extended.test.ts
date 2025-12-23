/**
 * Tests for arete_infer accept/reject extension
 *
 * These tests verify the new accept/reject parameters that consolidate
 * the arete_accept_candidate, arete_accept_candidates, and arete_reject_fact tools.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock @arete/core
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
}));

import {
  inferHandler,
  setConfigDir,
} from "./identity-infer.js";
import {
  registerCandidates,
  clearCandidates,
} from "./candidate-registry.js";

describe("arete_infer accept/reject extension", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `arete-infer-extended-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    setConfigDir(testDir);
    clearCandidates(); // Clear in-memory registry between tests

    // Create empty context to avoid inference running
    writeContext(testDir, { events: [], lastModified: new Date().toISOString() });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("accept parameter", () => {
    it("accepts candidates by ID before running inference", async () => {
      // Create identity
      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      // Register candidates in the registry
      const candidates = [
        { id: "cand-1", content: "Expert in React", category: "expertise" as const, confidence: 0.7 },
        { id: "cand-2", content: "Prefers dark mode", category: "preference" as const, confidence: 0.6 },
      ];
      registerCandidates(candidates.map(c => ({
        id: c.id,
        category: c.category,
        content: c.content,
        confidence: c.confidence,
        sourceRef: "test",
        signals: ["test signal"],
        createdAt: new Date().toISOString(),
      })));

      // Accept one candidate
      const result = await inferHandler({
        accept: ["cand-1"],
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted).toBeDefined();
      expect(result.structuredContent.accepted?.length).toBe(1);
      expect(result.structuredContent.accepted?.[0].content).toBe("Expert in React");

      // Verify fact was added to identity
      const updatedIdentity = readIdentity(testDir);
      expect(updatedIdentity.facts.some((f: { content: string }) => f.content === "Expert in React")).toBe(true);
    });

    it("accepts multiple candidates at once", async () => {
      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      const candidates = [
        { id: "cand-1", content: "Expert in React", category: "expertise" as const, confidence: 0.7 },
        { id: "cand-2", content: "Prefers dark mode", category: "preference" as const, confidence: 0.6 },
        { id: "cand-3", content: "Based in SF", category: "context" as const, confidence: 0.5 },
      ];
      registerCandidates(candidates.map(c => ({
        id: c.id,
        category: c.category,
        content: c.content,
        confidence: c.confidence,
        sourceRef: "test",
        signals: ["test signal"],
        createdAt: new Date().toISOString(),
      })));

      const result = await inferHandler({
        accept: ["cand-1", "cand-2"],
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted?.length).toBe(2);

      // Verify facts were added
      const updatedIdentity = readIdentity(testDir);
      expect(updatedIdentity.facts.length).toBe(2);
    });

    it("skips invalid candidate IDs gracefully", async () => {
      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      const result = await inferHandler({
        accept: ["nonexistent-id"],
      });

      expect(result.structuredContent.success).toBe(true);
      // When no candidates are found, accepted is undefined (not an empty array)
      expect(result.structuredContent.accepted).toBeUndefined();
    });
  });

  describe("reject parameter", () => {
    it("rejects candidates by ID and blocks them", async () => {
      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      const candidates = [
        { id: "cand-1", content: "Expert in Cooking", category: "expertise" as const, confidence: 0.7 },
      ];
      registerCandidates(candidates.map(c => ({
        id: c.id,
        category: c.category,
        content: c.content,
        confidence: c.confidence,
        sourceRef: "test",
        signals: ["test signal"],
        createdAt: new Date().toISOString(),
      })));

      const result = await inferHandler({
        reject: [{ id: "cand-1", reason: "Not accurate" }],
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.rejected).toBeDefined();
      expect(result.structuredContent.rejected?.length).toBe(1);

      // Verify blocked file was updated
      const blocked = readBlocked(testDir);
      expect(blocked.some((b: { content?: string }) => b.content === "Expert in Cooking")).toBe(true);
    });

    it("rejects multiple candidates at once", async () => {
      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      const candidates = [
        { id: "cand-1", content: "Expert in Cooking", category: "expertise" as const, confidence: 0.7 },
        { id: "cand-2", content: "Likes sports", category: "preference" as const, confidence: 0.6 },
      ];
      registerCandidates(candidates.map(c => ({
        id: c.id,
        category: c.category,
        content: c.content,
        confidence: c.confidence,
        sourceRef: "test",
        signals: ["test signal"],
        createdAt: new Date().toISOString(),
      })));

      const result = await inferHandler({
        reject: [
          { id: "cand-1", reason: "Not accurate" },
          { id: "cand-2", reason: "Misinterpreted" },
        ],
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.rejected?.length).toBe(2);
    });
  });

  describe("combined accept and reject", () => {
    it("processes both accept and reject in same call", async () => {
      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      const candidates = [
        { id: "cand-1", content: "Expert in React", category: "expertise" as const, confidence: 0.7 },
        { id: "cand-2", content: "Expert in Cooking", category: "expertise" as const, confidence: 0.6 },
      ];
      registerCandidates(candidates.map(c => ({
        id: c.id,
        category: c.category,
        content: c.content,
        confidence: c.confidence,
        sourceRef: "test",
        signals: ["test signal"],
        createdAt: new Date().toISOString(),
      })));

      const result = await inferHandler({
        accept: ["cand-1"],
        reject: [{ id: "cand-2", reason: "Not accurate" }],
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted?.length).toBe(1);
      expect(result.structuredContent.rejected?.length).toBe(1);

      // Verify identity was updated correctly
      const updatedIdentity = readIdentity(testDir);
      expect(updatedIdentity.facts.some((f: { content: string }) => f.content === "Expert in React")).toBe(true);
      expect(updatedIdentity.facts.some((f: { content: string }) => f.content === "Expert in Cooking")).toBe(false);
    });
  });

  describe("inference still runs after accept/reject", () => {
    it("returns candidates from inference after processing accept/reject", async () => {
      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      // Add some context events that will be analyzed
      const now = new Date().toISOString();
      const events = [
        { id: "1", type: "page_visit", source: "chrome", timestamp: now, data: { url: "https://react.dev", title: "React" } },
        { id: "2", type: "page_visit", source: "chrome", timestamp: now, data: { url: "https://react.dev/hooks", title: "Hooks" } },
      ];
      writeContext(testDir, { events, lastModified: now });

      const result = await inferHandler({
        lookbackDays: 7,
      });

      expect(result.structuredContent.success).toBe(true);
      // Should have run inference and potentially found candidates
      expect(result.structuredContent.candidates).toBeDefined();
    });
  });

  describe("cloud sync on accept", () => {
    it("syncs identity to cloud after accepting candidates", async () => {
      // Setup: Mock cloud client with config
      const mockSaveIdentity = vi.fn().mockResolvedValue(undefined);
      const { createCLIClient, loadConfig } = await import("@arete/core");
      vi.mocked(loadConfig).mockReturnValue({
        apiKey: "test-key",
        supabaseUrl: "https://test.supabase.co",
      });
      vi.mocked(createCLIClient).mockReturnValue({
        saveIdentity: mockSaveIdentity,
        getIdentity: vi.fn(),
        getRecentContext: vi.fn(),
        addContextEvent: vi.fn(),
        clearContext: vi.fn(),
        validateKey: vi.fn(),
      } as any);

      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      // Register a candidate
      registerCandidates([{
        id: "cand-cloud-1",
        category: "expertise",
        content: "Cloud sync expert",
        confidence: 0.7,
        sourceRef: "test",
        signals: ["test"],
        createdAt: new Date().toISOString(),
      }]);

      // Accept the candidate
      const result = await inferHandler({
        accept: ["cand-cloud-1"],
      });

      // Assert: Cloud sync was called
      expect(mockSaveIdentity).toHaveBeenCalledTimes(1);
      expect(result.structuredContent.accepted?.length).toBe(1);
    });

    it("continues if cloud sync fails (offline-first)", async () => {
      const mockSaveIdentity = vi.fn().mockRejectedValue(new Error("Network error"));
      const { createCLIClient, loadConfig } = await import("@arete/core");
      vi.mocked(loadConfig).mockReturnValue({
        apiKey: "test-key",
        supabaseUrl: "https://test.supabase.co",
      });
      vi.mocked(createCLIClient).mockReturnValue({
        saveIdentity: mockSaveIdentity,
        getIdentity: vi.fn(),
        getRecentContext: vi.fn(),
        addContextEvent: vi.fn(),
        clearContext: vi.fn(),
        validateKey: vi.fn(),
      } as any);

      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      registerCandidates([{
        id: "cand-cloud-2",
        category: "expertise",
        content: "Offline first test",
        confidence: 0.7,
        sourceRef: "test",
        signals: ["test"],
        createdAt: new Date().toISOString(),
      }]);

      const result = await inferHandler({
        accept: ["cand-cloud-2"],
      });

      // Assert: Operation succeeded despite cloud failure
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted?.length).toBe(1);

      // Verify local save still happened
      const updatedIdentity = readIdentity(testDir);
      expect(updatedIdentity.facts.some((f: any) => f.content === "Offline first test")).toBe(true);
    });

    it("skips cloud sync when no candidates accepted", async () => {
      const mockSaveIdentity = vi.fn();
      const { createCLIClient, loadConfig } = await import("@arete/core");
      vi.mocked(loadConfig).mockReturnValue({
        apiKey: "test-key",
        supabaseUrl: "https://test.supabase.co",
      });
      vi.mocked(createCLIClient).mockReturnValue({
        saveIdentity: mockSaveIdentity,
        getIdentity: vi.fn(),
        getRecentContext: vi.fn(),
        addContextEvent: vi.fn(),
        clearContext: vi.fn(),
        validateKey: vi.fn(),
      } as any);

      const identity = createTestIdentity([]);
      writeIdentity(testDir, identity);

      // Accept non-existent candidate
      const result = await inferHandler({
        accept: ["nonexistent"],
      });

      // Assert: No cloud sync call (nothing was accepted)
      expect(mockSaveIdentity).not.toHaveBeenCalled();
    });
  });
});

// --- Test Helpers ---

function createTestIdentity(facts: Array<{ id: string; content: string; category: string }>) {
  const now = new Date().toISOString();
  return {
    version: "2.0.0" as const,
    deviceId: "test-device",
    facts: facts.map(f => ({
      id: f.id,
      category: f.category,
      content: f.content,
      confidence: 0.8,
      maturity: "established",
      source: "manual" as const,
      createdAt: now,
      lastValidated: now,
      validationCount: 1,
      updatedAt: now,
    })),
    core: {},
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: true,
      excludedDomains: [],
    },
    createdAt: now,
    lastModified: now,
  };
}

function writeIdentity(dir: string, identity: unknown): void {
  writeFileSync(join(dir, "identity.json"), JSON.stringify(identity, null, 2));
}

function readIdentity(dir: string): any {
  return JSON.parse(readFileSync(join(dir, "identity.json"), "utf-8"));
}

function writeContext(dir: string, context: { events: unknown[]; lastModified: string }): void {
  writeFileSync(join(dir, "context.json"), JSON.stringify(context, null, 2));
}

function readBlocked(dir: string): any[] {
  const blockedFile = join(dir, "blocked.json");
  if (!existsSync(blockedFile)) return [];
  return JSON.parse(readFileSync(blockedFile, "utf-8"));
}
