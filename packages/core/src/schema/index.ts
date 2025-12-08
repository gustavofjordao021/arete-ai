// Identity schema
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
} from "./identity.js";

// Type alias for convenience
export type { AreteIdentity as Identity } from "./identity.js";

// Identity v2 schema (facts with confidence + maturity)
export {
  IdentityFactSchema,
  IdentityV2Schema,
  IdentitySettingsSchema,
  IdentityCoreSchema,
  FactCategorySchema,
  MaturitySchema,
  FactSourceSchema,
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
} from "./identity-v2.js";

// Context schema
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
} from "./context.js";
