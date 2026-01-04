/**
 * Sync Service
 *
 * Orchestrates background sync between local and cloud storage.
 * Provides non-blocking sync operations with debouncing.
 *
 * Usage:
 *   const syncService = getSyncService();
 *   syncService.queueSync('identity'); // Non-blocking
 */

import type { IdentityV2 } from "../schema/identity-v2.js";
import type { CLIClient } from "../supabase/cli-client.js";
import {
  loadSyncState,
  saveSyncState,
  markPendingPush,
  markPushComplete,
  markPullComplete,
  markSyncError,
  getBackoffMs,
  type SyncState,
} from "./sync-state.js";
import { mergeIdentities, type MergeResult } from "./identity-merger.js";

// --- Types ---

export type SyncType = "identity" | "context";

export interface SyncServiceOptions {
  client: CLIClient | null;
  debounceMs?: number;
  loadLocalIdentity: () => IdentityV2 | null;
  saveLocalIdentity: (identity: IdentityV2) => void;
}

export interface SyncService {
  initialize: () => Promise<void>;
  queueSync: (type: SyncType) => void;
  isOnline: () => boolean;
  getPendingCount: () => number;
  getLastMergeResult: () => MergeResult | null;
  shutdown: () => void;
}

// --- Singleton ---

let _syncService: SyncService | null = null;
let _options: SyncServiceOptions | null = null;

export function initSyncService(options: SyncServiceOptions): SyncService {
  if (_syncService) {
    _syncService.shutdown();
  }
  _options = options;
  _syncService = createSyncService(options);
  return _syncService;
}

export function getSyncService(): SyncService | null {
  return _syncService;
}

// --- Implementation ---

function createSyncService(options: SyncServiceOptions): SyncService {
  const { client, debounceMs = 2000, loadLocalIdentity, saveLocalIdentity } = options;

  let pendingTypes = new Set<SyncType>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isInitialized = false;
  let lastMergeResult: MergeResult | null = null;

  /**
   * Pull from cloud and merge with local on startup.
   */
  async function initialize(): Promise<void> {
    if (isInitialized) return;
    isInitialized = true;

    if (!client) {
      console.log("[SyncService] No cloud client, running in local-only mode");
      return;
    }

    try {
      await pullAndMerge();
    } catch (err) {
      console.error("[SyncService] Initialize failed:", err);
      const state = loadSyncState();
      saveSyncState(markSyncError(state, String(err)));
    }
  }

  /**
   * Queue a sync operation. Non-blocking, debounced.
   */
  function queueSync(type: SyncType): void {
    if (!client) return; // Local-only mode

    pendingTypes.add(type);

    // Mark as pending
    const state = loadSyncState();
    saveSyncState(markPendingPush(state));

    // Debounce - wait for more changes before syncing
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      processPendingSync();
    }, debounceMs);
  }

  /**
   * Process all pending sync operations.
   */
  async function processPendingSync(): Promise<void> {
    if (!client || pendingTypes.size === 0) return;

    const types = Array.from(pendingTypes);
    pendingTypes.clear();
    debounceTimer = null;

    const state = loadSyncState();

    // Check backoff
    const backoffMs = getBackoffMs(state);
    if (backoffMs > 0) {
      console.log(`[SyncService] Backing off for ${backoffMs}ms`);
      setTimeout(() => {
        types.forEach((t) => pendingTypes.add(t));
        processPendingSync();
      }, backoffMs);
      return;
    }

    for (const type of types) {
      try {
        if (type === "identity") {
          await pushIdentity();
        }
        // TODO: Add context sync when needed
      } catch (err) {
        console.error(`[SyncService] Push ${type} failed:`, err);
        saveSyncState(markSyncError(loadSyncState(), String(err)));
      }
    }
  }

  /**
   * Pull identity from cloud and merge with local.
   */
  async function pullAndMerge(): Promise<void> {
    if (!client) return;

    const local = loadLocalIdentity();
    if (!local) {
      // No local identity, pull from cloud
      try {
        const cloud = await client.getIdentityV2();
        if (cloud && isIdentityV2(cloud)) {
          saveLocalIdentity(cloud);
          const state = loadSyncState();
          saveSyncState(markPullComplete(state));
        }
      } catch (err) {
        console.error("[SyncService] Pull failed:", err);
      }
      return;
    }

    try {
      const cloud = await client.getIdentityV2();
      if (!cloud || !isIdentityV2(cloud)) {
        // No cloud identity, push local
        await client.saveIdentityV2(local);
        const state = loadSyncState();
        saveSyncState(markPushComplete(state));
        return;
      }

      // Merge cloud into local
      const syncState = loadSyncState();
      const result = mergeIdentities(local, cloud, syncState);
      lastMergeResult = result;

      // Save merged identity locally
      saveLocalIdentity(result.merged);

      // Push merged identity to cloud
      await client.saveIdentityV2(result.merged);

      // Update sync state
      let newState = markPullComplete(syncState);
      newState = markPushComplete(newState);
      saveSyncState(newState);

      if (result.added.length > 0 || result.updated.length > 0) {
        console.log(
          `[SyncService] Merged: ${result.added.length} added, ${result.updated.length} updated`
        );
      }
    } catch (err) {
      console.error("[SyncService] Pull and merge failed:", err);
      saveSyncState(markSyncError(loadSyncState(), String(err)));
    }
  }

  /**
   * Push local identity to cloud.
   */
  async function pushIdentity(): Promise<void> {
    if (!client) return;

    const local = loadLocalIdentity();
    if (!local) return;

    await client.saveIdentityV2(local);

    const state = loadSyncState();
    saveSyncState(markPushComplete(state));
  }

  function isOnline(): boolean {
    return client !== null;
  }

  function getPendingCount(): number {
    return pendingTypes.size;
  }

  function getLastMergeResult(): MergeResult | null {
    return lastMergeResult;
  }

  function shutdown(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingTypes.clear();
    isInitialized = false;
  }

  return {
    initialize,
    queueSync,
    isOnline,
    getPendingCount,
    getLastMergeResult,
    shutdown,
  };
}

// --- Helpers ---

function isIdentityV2(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}
