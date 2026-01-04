/**
 * Sync State Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createEmptySyncState,
  loadSyncState,
  saveSyncState,
  markPendingPush,
  markPushComplete,
  markPullComplete,
  markSyncError,
  trackDeletedFact,
  clearDeletedFacts,
  getBackoffMs,
  setSyncConfigDir,
} from "./sync-state.js";

// --- Test Setup ---

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `arete-sync-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  setSyncConfigDir(testDir);
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
});

// --- Factory Tests ---

describe("createEmptySyncState", () => {
  it("creates valid empty state", () => {
    const state = createEmptySyncState();

    expect(state.version).toBe("1.0.0");
    expect(state.lastPullAt).toBeNull();
    expect(state.lastPushAt).toBeNull();
    expect(state.pendingPush).toBe(false);
    expect(state.deletedFactIds).toEqual([]);
    expect(state.lastSyncError).toBeNull();
    expect(state.consecutiveFailures).toBe(0);
  });
});

// --- Persistence Tests ---

describe("loadSyncState / saveSyncState", () => {
  it("returns empty state when file doesn't exist", () => {
    const state = loadSyncState();

    expect(state.version).toBe("1.0.0");
    expect(state.pendingPush).toBe(false);
  });

  it("persists and loads state", () => {
    const state = createEmptySyncState();
    state.pendingPush = true;
    state.lastPullAt = "2024-01-01T00:00:00.000Z";

    saveSyncState(state);
    const loaded = loadSyncState();

    expect(loaded.pendingPush).toBe(true);
    expect(loaded.lastPullAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("handles corrupted file gracefully", () => {
    const { writeFileSync } = require("fs");
    writeFileSync(join(testDir, "sync-state.json"), "invalid json{{{");

    const state = loadSyncState();

    expect(state.version).toBe("1.0.0");
    expect(state.pendingPush).toBe(false);
  });
});

// --- Mutation Tests ---

describe("state mutations", () => {
  it("markPendingPush sets flag", () => {
    const state = createEmptySyncState();
    const updated = markPendingPush(state);

    expect(updated.pendingPush).toBe(true);
    expect(state.pendingPush).toBe(false); // Original unchanged
  });

  it("markPushComplete clears flag and updates timestamp", () => {
    let state = createEmptySyncState();
    state = markPendingPush(state);
    state = markSyncError(state, "test error");

    const updated = markPushComplete(state);

    expect(updated.pendingPush).toBe(false);
    expect(updated.lastPushAt).not.toBeNull();
    expect(updated.lastSyncError).toBeNull();
    expect(updated.consecutiveFailures).toBe(0);
  });

  it("markPullComplete updates timestamp", () => {
    const state = createEmptySyncState();
    const updated = markPullComplete(state);

    expect(updated.lastPullAt).not.toBeNull();
  });

  it("markSyncError tracks failures", () => {
    let state = createEmptySyncState();

    state = markSyncError(state, "Error 1");
    expect(state.consecutiveFailures).toBe(1);
    expect(state.lastSyncError).toBe("Error 1");

    state = markSyncError(state, "Error 2");
    expect(state.consecutiveFailures).toBe(2);
  });
});

// --- Deletion Tracking Tests ---

describe("deletion tracking", () => {
  it("trackDeletedFact adds to list", () => {
    const state = createEmptySyncState();
    const updated = trackDeletedFact(state, "fact-123");

    expect(updated.deletedFactIds).toHaveLength(1);
    expect(updated.deletedFactIds[0].id).toBe("fact-123");
    expect(updated.deletedFactIds[0].deletedAt).toBeDefined();
  });

  it("trackDeletedFact avoids duplicates", () => {
    let state = createEmptySyncState();
    state = trackDeletedFact(state, "fact-123");
    state = trackDeletedFact(state, "fact-123");

    expect(state.deletedFactIds).toHaveLength(1);
  });

  it("clearDeletedFacts empties list", () => {
    let state = createEmptySyncState();
    state = trackDeletedFact(state, "fact-1");
    state = trackDeletedFact(state, "fact-2");
    state = clearDeletedFacts(state);

    expect(state.deletedFactIds).toHaveLength(0);
  });
});

// --- Backoff Tests ---

describe("getBackoffMs", () => {
  it("returns 0 for no failures", () => {
    const state = createEmptySyncState();
    expect(getBackoffMs(state)).toBe(0);
  });

  it("returns 1s for first failure", () => {
    let state = createEmptySyncState();
    state = markSyncError(state, "error");

    expect(getBackoffMs(state)).toBe(1000);
  });

  it("doubles with each failure", () => {
    let state = createEmptySyncState();
    state = markSyncError(state, "error");
    state = markSyncError(state, "error");

    expect(getBackoffMs(state)).toBe(2000);

    state = markSyncError(state, "error");
    expect(getBackoffMs(state)).toBe(4000);
  });

  it("caps at 5 minutes", () => {
    let state = createEmptySyncState();
    for (let i = 0; i < 20; i++) {
      state = markSyncError(state, "error");
    }

    expect(getBackoffMs(state)).toBe(300000); // 5 minutes
  });
});
