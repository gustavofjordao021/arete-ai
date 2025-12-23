/**
 * Identity interchange formats for import/export
 */

export {
  exportToOpenIdentity,
  importFromOpenIdentity,
  OpenIdentityV1Schema,
  OpenIdentityFactSchema,
  type OpenIdentityV1,
  type OpenIdentityFact,
  type ExportOptions,
  type ImportResult,
} from "./openidentity.js";

export {
  importFromChatGPT,
  parseExtractionResponse,
  type ChatGPTImportResult,
  type LLMProvider,
  type ExtractedIdentity,
} from "./chatgpt.js";

// Re-export Visibility type from schema for convenience
export { type Visibility } from "../schema/identity-v2.js";
