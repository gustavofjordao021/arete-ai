/**
 * Sync Module
 *
 * Local-first sync with background cloud sync.
 */

export {
  type SyncState,
  type DeletedFact,
  SyncStateSchema,
  loadSyncState,
  saveSyncState,
  createEmptySyncState,
  markPendingPush,
  markPushComplete,
  markPullComplete,
  markSyncError,
  trackDeletedFact,
  clearDeletedFacts,
  getBackoffMs,
  setSyncConfigDir,
  getSyncConfigDir,
} from "./sync-state.js";

export {
  type MergeResult,
  type FactConflict,
  mergeIdentities,
  deduplicateFacts,
  areSimilarFacts,
  findMatchingFact,
} from "./identity-merger.js";

export {
  type SyncService,
  type SyncType,
  type SyncServiceOptions,
  initSyncService,
  getSyncService,
} from "./sync-service.js";
