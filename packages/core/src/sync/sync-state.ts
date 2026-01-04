/**
 * Sync State Management
 *
 * Persists sync metadata to ~/.arete/sync-state.json
 * Tracks: last pull/push times, pending changes, deleted facts
 */

import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// --- Schema ---

export const DeletedFactSchema = z.object({
  id: z.string(),
  deletedAt: z.string(), // ISO timestamp
});

export type DeletedFact = z.infer<typeof DeletedFactSchema>;

export const SyncStateSchema = z.object({
  version: z.literal("1.0.0"),
  lastPullAt: z.string().nullable(), // ISO timestamp of last cloud pull
  lastPushAt: z.string().nullable(), // ISO timestamp of last cloud push
  pendingPush: z.boolean(), // Has local changes not yet synced
  deletedFactIds: z.array(DeletedFactSchema), // Track deletions for merge
  lastSyncError: z.string().nullable(), // Last error message if any
  consecutiveFailures: z.number().int().min(0), // For backoff calculation
});

export type SyncState = z.infer<typeof SyncStateSchema>;

// --- Config Directory ---

let CONFIG_DIR = join(homedir(), ".arete");

export function setSyncConfigDir(dir: string): void {
  CONFIG_DIR = dir;
}

export function getSyncConfigDir(): string {
  return CONFIG_DIR;
}

function getSyncStateFile(): string {
  return join(CONFIG_DIR, "sync-state.json");
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// --- Factory ---

export function createEmptySyncState(): SyncState {
  return {
    version: "1.0.0",
    lastPullAt: null,
    lastPushAt: null,
    pendingPush: false,
    deletedFactIds: [],
    lastSyncError: null,
    consecutiveFailures: 0,
  };
}

// --- Load / Save ---

export function loadSyncState(): SyncState {
  ensureConfigDir();

  const stateFile = getSyncStateFile();
  if (!existsSync(stateFile)) {
    return createEmptySyncState();
  }

  try {
    const data = readFileSync(stateFile, "utf-8");
    const parsed = SyncStateSchema.safeParse(JSON.parse(data));
    if (parsed.success) {
      return parsed.data;
    }
    // Invalid schema, return empty state
    return createEmptySyncState();
  } catch {
    // Parse error, return empty state
    return createEmptySyncState();
  }
}

export function saveSyncState(state: SyncState): void {
  ensureConfigDir();

  writeFileSync(getSyncStateFile(), JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
}

// --- Mutation Helpers ---

export function markPendingPush(state: SyncState): SyncState {
  return { ...state, pendingPush: true };
}

export function markPushComplete(state: SyncState): SyncState {
  return {
    ...state,
    pendingPush: false,
    lastPushAt: new Date().toISOString(),
    lastSyncError: null,
    consecutiveFailures: 0,
  };
}

export function markPullComplete(state: SyncState): SyncState {
  return {
    ...state,
    lastPullAt: new Date().toISOString(),
    lastSyncError: null,
    consecutiveFailures: 0,
  };
}

export function markSyncError(state: SyncState, error: string): SyncState {
  return {
    ...state,
    lastSyncError: error,
    consecutiveFailures: state.consecutiveFailures + 1,
  };
}

export function trackDeletedFact(state: SyncState, factId: string): SyncState {
  // Avoid duplicates
  if (state.deletedFactIds.some((d) => d.id === factId)) {
    return state;
  }

  return {
    ...state,
    deletedFactIds: [
      ...state.deletedFactIds,
      { id: factId, deletedAt: new Date().toISOString() },
    ],
  };
}

export function clearDeletedFacts(state: SyncState): SyncState {
  return { ...state, deletedFactIds: [] };
}

// --- Backoff Calculation ---

const BASE_BACKOFF_MS = 1000; // 1 second
const MAX_BACKOFF_MS = 300000; // 5 minutes

export function getBackoffMs(state: SyncState): number {
  if (state.consecutiveFailures === 0) return 0;

  const backoff = BASE_BACKOFF_MS * Math.pow(2, state.consecutiveFailures - 1);
  return Math.min(backoff, MAX_BACKOFF_MS);
}
