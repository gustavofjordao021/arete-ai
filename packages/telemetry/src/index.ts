/**
 * @arete/telemetry - Privacy-conscious analytics for Arete
 *
 * Features:
 * - ON by default, opt-out via config
 * - Anonymous user ID (SHA-256 hashed deviceId)
 * - Typed events with Zod schemas
 * - Graceful degradation (failures don't break the app)
 *
 * Usage:
 * ```typescript
 * import { getTelemetryClient, shutdownTelemetry } from "@arete/telemetry";
 *
 * const telemetry = getTelemetryClient();
 * telemetry.setConnector("mcp-server");
 * telemetry.trackToolCall("arete_get_identity", true, 42);
 *
 * // On process exit
 * await shutdownTelemetry();
 * ```
 */

// Client exports
export {
  TelemetryClient,
  TelemetryClientOptions,
  getTelemetryClient,
  initTelemetry,
  shutdownTelemetry,
  resetTelemetryClient,
} from "./client.js";

// Event type exports
export {
  TelemetryEvent,
  TelemetryEventSchema,
  EventType,
  EVENT_TYPES,
  // Individual schemas for validation
  ToolCalledEventSchema,
  FactCreatedEventSchema,
  FactValidatedEventSchema,
  FactPromotedEventSchema,
  FactArchivedEventSchema,
  InferCalledEventSchema,
  CandidateProposedEventSchema,
  CandidateAcceptedEventSchema,
  CandidateRejectedEventSchema,
  ContextCalledEventSchema,
  FactSurfacedEventSchema,
  ContextEventAddedSchema,
  ContextEventsRetrievedSchema,
  // Enums
  FactCategorySchema,
  FactMaturitySchema,
  FactSourceSchema,
  ContextEventTypeSchema,
} from "./events.js";

// Config exports
export {
  TelemetryConfig,
  TelemetryConfigSchema,
  loadTelemetryConfig,
  saveTelemetryConfig,
  isTelemetryEnabled,
} from "./config.js";

// User ID exports
export {
  getAnonymousUserId,
  hashForAnonymity,
  setConfigDir,
  getConfigDir,
} from "./user-id.js";
