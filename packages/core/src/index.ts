/**
 * @arete/core
 *
 * Core identity schema, extraction, and transforms for Arete.
 * Platform-agnostic - can be used in browser, Node, or Raycast.
 */

// Schema
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

// Extraction
export {
  buildExtractionPrompt,
  buildFactExtractionPrompt,
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
