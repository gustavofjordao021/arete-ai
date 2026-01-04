/**
 * Tests for arete_activity - context activity tool
 *
 * Replaces: arete_get_recent_context
 * Mental model: "What have I been doing?"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock @arete/core
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
  getSyncService: vi.fn(() => ({ queueSync: vi.fn() })),
  safeParseContextStore: vi.fn((data) => data),
  createEmptyContextStore: vi.fn(() => ({ events: [], lastModified: new Date().toISOString() })),
}));

import {
  activityHandler,
  setConfigDir,
  type ActivityInput,
} from "./arete-activity.js";

describe("arete_activity", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `arete-activity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    setConfigDir(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("basic functionality", () => {
    it("returns empty array when no context exists", async () => {
      const result = await activityHandler({});

      expect(result.structuredContent.events).toEqual([]);
      expect(result.structuredContent.count).toBe(0);
    });

    it("returns recent events when context exists", async () => {
      const now = new Date().toISOString();
      const events = [
        { id: "1", type: "page_visit", source: "chrome", timestamp: now, data: { url: "https://example.com", title: "Example" } },
        { id: "2", type: "insight", source: "claude-desktop", timestamp: now, data: { insight: "User mentioned React" } },
      ];
      writeContext(testDir, { events, lastModified: now });

      const result = await activityHandler({});

      expect(result.structuredContent.events.length).toBe(2);
      expect(result.structuredContent.count).toBe(2);
    });
  });

  describe("filtering", () => {
    it("filters by event type", async () => {
      const now = new Date().toISOString();
      const events = [
        { id: "1", type: "page_visit", source: "chrome", timestamp: now, data: { url: "https://example.com" } },
        { id: "2", type: "insight", source: "claude-desktop", timestamp: now, data: { insight: "Test" } },
        { id: "3", type: "page_visit", source: "chrome", timestamp: now, data: { url: "https://other.com" } },
      ];
      writeContext(testDir, { events, lastModified: now });

      const result = await activityHandler({ type: "page_visit" });

      expect(result.structuredContent.events.length).toBe(2);
      expect(result.structuredContent.events.every(e => e.type === "page_visit")).toBe(true);
    });

    it("filters by source", async () => {
      const now = new Date().toISOString();
      const events = [
        { id: "1", type: "page_visit", source: "chrome", timestamp: now, data: {} },
        { id: "2", type: "insight", source: "claude-desktop", timestamp: now, data: {} },
        { id: "3", type: "page_visit", source: "chrome", timestamp: now, data: {} },
      ];
      writeContext(testDir, { events, lastModified: now });

      const result = await activityHandler({ source: "chrome" });

      expect(result.structuredContent.events.length).toBe(2);
      expect(result.structuredContent.events.every(e => e.source === "chrome")).toBe(true);
    });

    it("respects limit parameter", async () => {
      const now = new Date().toISOString();
      const events = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        type: "page_visit" as const,
        source: "chrome",
        timestamp: new Date(Date.now() - i * 1000).toISOString(), // Newest first
        data: { url: `https://example${i}.com` },
      }));
      writeContext(testDir, { events, lastModified: now });

      const result = await activityHandler({ limit: 5 });

      expect(result.structuredContent.events.length).toBe(5);
    });

    it("filters by since timestamp", async () => {
      const now = Date.now();
      const events = [
        { id: "1", type: "page_visit", source: "chrome", timestamp: new Date(now - 3600000).toISOString(), data: {} }, // 1 hour ago
        { id: "2", type: "page_visit", source: "chrome", timestamp: new Date(now - 1800000).toISOString(), data: {} }, // 30 min ago
        { id: "3", type: "page_visit", source: "chrome", timestamp: new Date(now - 600000).toISOString(), data: {} },  // 10 min ago
      ];
      writeContext(testDir, { events, lastModified: new Date().toISOString() });

      const sinceTime = new Date(now - 2000000).toISOString(); // ~33 min ago
      const result = await activityHandler({ since: sinceTime });

      expect(result.structuredContent.events.length).toBe(2);
    });
  });

  describe("response format", () => {
    it("includes guidance for natural presentation", async () => {
      const now = new Date().toISOString();
      const events = [
        { id: "1", type: "page_visit", source: "chrome", timestamp: now, data: { url: "https://example.com" } },
      ];
      writeContext(testDir, { events, lastModified: now });

      const result = await activityHandler({});

      expect(result.structuredContent.guidance).toBeDefined();
      expect(result.structuredContent.guidance).toContain("naturally");
    });

    it("returns human-readable summary", async () => {
      const now = new Date().toISOString();
      const events = [
        { id: "1", type: "page_visit", source: "chrome", timestamp: now, data: { url: "https://github.com/test" } },
      ];
      writeContext(testDir, { events, lastModified: now });

      const result = await activityHandler({});

      expect(result.content[0].text).toBeDefined();
      expect(result.content[0].text.length).toBeGreaterThan(0);
    });
  });
});

// --- Test Helpers ---

interface ContextEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function writeContext(dir: string, context: { events: ContextEvent[]; lastModified: string }): void {
  writeFileSync(join(dir, "context.json"), JSON.stringify(context, null, 2));
}
