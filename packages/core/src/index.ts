/**
 * @arete/core
 *
 * Core identity schema, extraction, and transforms for Arete.
 * Platform-agnostic - can be used in browser, Node, or Raycast.
 */

// Schema - Identity (v1)
export {
  AreteIdentitySchema,
  ProjectSchema,
  SourceSchema,
  createEmptyIdentity,
  parseIdentity,
  safeParseIdentity,
  type AreteIdentity,
  type Project,
  type Source,
} from "./schema/index.js";

// Schema - Identity v2 (facts with confidence + maturity)
export {
  IdentityFactSchema,
  IdentityV2Schema,
  IdentitySettingsSchema,
  IdentityCoreSchema,
  FactCategorySchema,
  MaturitySchema,
  FactSourceSchema,
  VisibilitySchema,
  filterFactsByVisibility,
  createIdentityFact,
  createEmptyIdentityV2,
  migrateV1ToV2,
  getEffectiveConfidence,
  validateFact,
  isIdentityV2,
  DEFAULT_HALF_LIFE_DAYS,
  type IdentityFact,
  type IdentityV2,
  type IdentitySettings,
  type IdentityCore,
  type FactCategory,
  type Maturity,
  type FactSource,
  type Visibility,
} from "./schema/index.js";

// Schema - Context
export {
  ContextEventSchema,
  ContextStoreSchema,
  PageVisitDataSchema,
  SelectionDataSchema,
  ConversationDataSchema,
  InsightDataSchema,
  FileDataSchema,
  ContextEventType,
  PageType,
  createContextEvent,
  createEmptyContextStore,
  parseContextStore,
  safeParseContextStore,
  parseContextEvent,
  safeParseContextEvent,
  type ContextEvent,
  type ContextStore,
  type PageVisitData,
  type SelectionData,
  type ConversationData,
  type InsightData,
  type FileData,
  type ContextEventTypeValue,
} from "./schema/index.js";

// Extraction
export {
  buildExtractionPrompt,
  buildExtractionPromptV2,
  buildFactExtractionPrompt,
  IDENTITY_EXTRACTION_PROMPT_V2,
  extractIdentityFromText,
  mergeIdentity,
  type LLMProvider,
  type ExtractionResult,
} from "./extraction/index.js";

// Transforms
export {
  BaseTransform,
  ClaudeTransform,
  OpenAITransform,
  createClaudeTransform,
  createOpenAITransform,
  getTransform,
  listTransforms,
  type IdentityTransform,
  type TransformOptions,
  type TransformResult,
} from "./transforms/index.js";

// Supabase integration (Browser - OAuth)
export {
  createAreteClient,
  getSupabaseConfig,
  type AreteClient,
  type AreteClientOptions,
  type StorageAdapter,
  type ContextEvent as SupabaseContextEvent,
  type ContextEventInput,
  type ContextQueryOptions,
} from "./supabase/index.js";

// Supabase integration (CLI/MCP - API key)
export {
  createCLIClient,
  loadConfig,
  saveConfig,
  clearConfig,
  getSupabaseUrl,
  type CLIClient,
  type CLIClientOptions,
  type CLIConfig,
} from "./supabase/index.js";

// Archive (Phase 6: cleanup expired facts)
export {
  findExpiredFacts,
  archiveFacts,
  runArchiveCleanup,
  getArchiveDir,
  getConfigDir,
  setConfigDir,
  DEFAULT_ARCHIVE_THRESHOLD,
  type CleanupResult,
} from "./archive/index.js";

// Sync (local-first with background cloud sync)
export {
  // Sync state
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
  // Identity merger
  type MergeResult,
  type FactConflict,
  mergeIdentities,
  deduplicateFacts,
  areSimilarFacts,
  findMatchingFact,
  // Sync service
  type SyncService,
  type SyncType,
  type SyncServiceOptions,
  initSyncService,
  getSyncService,
} from "./sync/index.js";

// Type alias for backwards compatibility
export type { AreteIdentity as Identity } from "./schema/index.js";
