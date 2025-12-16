import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import {
  getContextHandler,
  addContextEventHandler,
  setConfigDir,
} from "./context.js";

const TEST_DIR = join(tmpdir(), "arete-mcp-context-test-" + Date.now());

// Mock @arete/core for cloud client tests
vi.mock("@arete/core", async () => {
  const actual = await vi.importActual("@arete/core");
  return {
    ...actual,
    loadConfig: vi.fn(() => ({})),
    createCLIClient: vi.fn(),
  };
});

// Generate stable UUIDs for tests
const UUID_1 = "11111111-1111-1111-1111-111111111111";
const UUID_2 = "22222222-2222-2222-2222-222222222222";
const UUID_3 = "33333333-3333-3333-3333-333333333333";
const UUID_OLD = "00000000-0000-0000-0000-000000000001";
const UUID_NEW = "00000000-0000-0000-0000-000000000002";
const UUID_EXISTING = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

describe("arete_get_recent_context tool", () => {
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
  });

  it("returns empty events when no file exists", async () => {
    const result = await getContextHandler({});

    expect(result.structuredContent.events).toEqual([]);
    expect(result.structuredContent.count).toBe(0);
  });

  it("returns events from existing store", async () => {
    const store = {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      events: [
        {
          id: UUID_1,
          type: "page_visit",
          timestamp: new Date().toISOString(),
          source: "chrome",
          data: { url: "https://example.com", title: "Test", hostname: "example.com" },
        },
        {
          id: UUID_2,
          type: "insight",
          timestamp: new Date().toISOString(),
          source: "claude-desktop",
          data: { insight: "User likes TypeScript" },
        },
      ],
    };

    writeFileSync(
      join(TEST_DIR, "context.json"),
      JSON.stringify(store, null, 2)
    );

    const result = await getContextHandler({});

    expect(result.structuredContent.count).toBe(2);
    expect(result.structuredContent.events.length).toBe(2);
  });

  it("filters by type", async () => {
    const store = {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      events: [
        {
          id: UUID_1,
          type: "page_visit",
          timestamp: new Date().toISOString(),
          source: "chrome",
          data: { url: "https://example.com", title: "Test", hostname: "example.com" },
        },
        {
          id: UUID_2,
          type: "insight",
          timestamp: new Date().toISOString(),
          source: "claude-desktop",
          data: { insight: "User likes TypeScript" },
        },
      ],
    };

    writeFileSync(
      join(TEST_DIR, "context.json"),
      JSON.stringify(store, null, 2)
    );

    const result = await getContextHandler({ type: "page_visit" });

    expect(result.structuredContent.count).toBe(1);
    expect(result.structuredContent.events[0].type).toBe("page_visit");
  });

  it("filters by source", async () => {
    const store = {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      events: [
        {
          id: UUID_1,
          type: "page_visit",
          timestamp: new Date().toISOString(),
          source: "chrome",
          data: { url: "https://example.com", title: "Test", hostname: "example.com" },
        },
        {
          id: UUID_2,
          type: "insight",
          timestamp: new Date().toISOString(),
          source: "claude-desktop",
          data: { insight: "User likes TypeScript" },
        },
      ],
    };

    writeFileSync(
      join(TEST_DIR, "context.json"),
      JSON.stringify(store, null, 2)
    );

    const result = await getContextHandler({ source: "claude-desktop" });

    expect(result.structuredContent.count).toBe(1);
    expect(result.structuredContent.events[0].source).toBe("claude-desktop");
  });

  it("respects limit parameter", async () => {
    const store = {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      events: [
        {
          id: UUID_1,
          type: "page_visit",
          timestamp: new Date(Date.now() - 3000).toISOString(),
          source: "chrome",
          data: { url: "https://a.com", title: "A", hostname: "a.com" },
        },
        {
          id: UUID_2,
          type: "page_visit",
          timestamp: new Date(Date.now() - 2000).toISOString(),
          source: "chrome",
          data: { url: "https://b.com", title: "B", hostname: "b.com" },
        },
        {
          id: UUID_3,
          type: "page_visit",
          timestamp: new Date(Date.now() - 1000).toISOString(),
          source: "chrome",
          data: { url: "https://c.com", title: "C", hostname: "c.com" },
        },
      ],
    };

    writeFileSync(
      join(TEST_DIR, "context.json"),
      JSON.stringify(store, null, 2)
    );

    const result = await getContextHandler({ limit: 2 });

    expect(result.structuredContent.events.length).toBe(2);
  });

  it("returns events in reverse chronological order", async () => {
    const store = {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      events: [
        {
          id: UUID_OLD,
          type: "page_visit",
          timestamp: new Date(Date.now() - 10000).toISOString(),
          source: "chrome",
          data: { url: "https://old.com", title: "Old", hostname: "old.com" },
        },
        {
          id: UUID_NEW,
          type: "page_visit",
          timestamp: new Date().toISOString(),
          source: "chrome",
          data: { url: "https://new.com", title: "New", hostname: "new.com" },
        },
      ],
    };

    writeFileSync(
      join(TEST_DIR, "context.json"),
      JSON.stringify(store, null, 2)
    );

    const result = await getContextHandler({});

    expect(result.structuredContent.events[0].id).toBe(UUID_NEW);
    expect(result.structuredContent.events[1].id).toBe(UUID_OLD);
  });
});

describe("arete_add_context_event tool", () => {
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
  });

  it("creates event in empty store", async () => {
    const result = await addContextEventHandler({
      type: "insight",
      data: { insight: "User prefers concise code" },
    });

    expect(result.structuredContent.success).toBe(true);
    expect(result.structuredContent.event?.type).toBe("insight");
    expect(result.structuredContent.event?.source).toBe("claude-desktop");
    expect(result.structuredContent.event?.id).toBeDefined();

    // Verify persistence
    const stored = JSON.parse(
      readFileSync(join(TEST_DIR, "context.json"), "utf-8")
    );
    expect(stored.events.length).toBe(1);
  });

  it("appends event to existing store", async () => {
    const store = {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      events: [
        {
          id: UUID_EXISTING,
          type: "page_visit",
          timestamp: new Date().toISOString(),
          source: "chrome",
          data: { url: "https://example.com", title: "Test", hostname: "example.com" },
        },
      ],
    };

    writeFileSync(
      join(TEST_DIR, "context.json"),
      JSON.stringify(store, null, 2)
    );

    await addContextEventHandler({
      type: "insight",
      data: { insight: "New insight" },
    });

    const stored = JSON.parse(
      readFileSync(join(TEST_DIR, "context.json"), "utf-8")
    );
    expect(stored.events.length).toBe(2);
  });

  it("validates event type", async () => {
    const result = await addContextEventHandler({
      type: "invalid_type",
      data: { foo: "bar" },
    });

    expect(result.structuredContent.success).toBe(false);
    expect(result.structuredContent.error).toBeDefined();
  });

  it("allows custom source override", async () => {
    const result = await addContextEventHandler({
      type: "insight",
      source: "custom-source",
      data: { insight: "Test" },
    });

    expect(result.structuredContent.event?.source).toBe("custom-source");
  });
});

// Note: Cloud sync tests are skipped due to complex module mocking issues.
// The cloud sync behavior is covered by:
// 1. Unit tests in cli-client.test.ts (tests the client itself)
// 2. Integration tests should be run with actual Supabase instance
//
// The local fallback behavior is implicitly tested by the existing
// arete_get_recent_context and arete_add_context_event tests above,
// which run without cloud credentials.

describe("auto-promote integration", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setConfigDir(TEST_DIR);

    // Create v2 identity file with autoPromote enabled
    const identityV2 = {
      version: "2.0.0",
      deviceId: "test-device",
      facts: [],
      core: {},
      settings: {
        decayHalfLifeDays: 60,
        autoInfer: false,
        excludedDomains: [],
        autoPromote: true,
      },
    };
    writeFileSync(
      join(TEST_DIR, "identity.json"),
      JSON.stringify(identityV2, null, 2)
    );
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("auto-promotes high-signal insight to identity", async () => {
    const result = await addContextEventHandler({
      type: "insight",
      data: { insight: "I'm Brazilian" },
    });

    expect(result.structuredContent.success).toBe(true);
    expect(result.structuredContent.promotedFact).toBeDefined();
    expect(result.structuredContent.promotedFact?.content).toContain("Brazilian");
    expect(result.content[0].text).toContain("Remembered:");

    // Verify fact was saved to identity
    const identity = JSON.parse(
      readFileSync(join(TEST_DIR, "identity.json"), "utf-8")
    );
    expect(identity.facts.length).toBe(1);
    expect(identity.facts[0].content).toContain("Brazilian");
  });

  it("does not promote low-signal insight", async () => {
    const result = await addContextEventHandler({
      type: "insight",
      data: { insight: "The weather is nice today" },
    });

    expect(result.structuredContent.success).toBe(true);
    expect(result.structuredContent.promotedFact).toBeUndefined();
    expect(result.content[0].text).not.toContain("Remembered:");

    // Verify no fact was saved
    const identity = JSON.parse(
      readFileSync(join(TEST_DIR, "identity.json"), "utf-8")
    );
    expect(identity.facts.length).toBe(0);
  });

  it("does not auto-promote non-insight events", async () => {
    const result = await addContextEventHandler({
      type: "page_visit",
      data: { url: "https://example.com", title: "Example" },
    });

    expect(result.structuredContent.success).toBe(true);
    expect(result.structuredContent.promotedFact).toBeUndefined();
    expect(result.content[0].text).not.toContain("Remembered:");
  });

  it("skips promotion if similar fact already exists", async () => {
    // Add existing Brazilian fact
    const identityWithFact = {
      version: "2.0.0",
      deviceId: "test-device",
      facts: [
        {
          id: "existing-fact",
          category: "context",
          content: "Brazilian nationality",
          confidence: 0.8,
          maturity: "established",
          source: "manual",
          lastValidated: new Date().toISOString(),
          validationCount: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      core: {},
      settings: { autoPromote: true },
    };
    writeFileSync(
      join(TEST_DIR, "identity.json"),
      JSON.stringify(identityWithFact, null, 2)
    );

    const result = await addContextEventHandler({
      type: "insight",
      data: { insight: "I'm Brazilian" },
    });

    expect(result.structuredContent.success).toBe(true);
    expect(result.structuredContent.promotedFact).toBeUndefined();
    // Still saved the context event
    const context = JSON.parse(
      readFileSync(join(TEST_DIR, "context.json"), "utf-8")
    );
    expect(context.events.length).toBe(1);
  });
});
