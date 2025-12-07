/**
 * @arete/core
 *
 * Core identity schema, extraction, and transforms for Arete.
 * Platform-agnostic - can be used in browser, Node, or Raycast.
 */

// Schema - Identity
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

// Type alias for backwards compatibility
export type { AreteIdentity as Identity } from "./schema/index.js";
