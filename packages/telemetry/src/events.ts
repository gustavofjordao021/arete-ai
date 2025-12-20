/**
 * Telemetry event type definitions with Zod schemas
 *
 * PRIVACY: These events track metadata only, NEVER content.
 * - Tool names, not user data
 * - Categories, not fact content
 * - Counts and durations, not identifiable information
 */

import { z } from "zod";

// --- Category and maturity enums (reused across events) ---

export const FactCategorySchema = z.enum([
  "core",
  "expertise",
  "preference",
  "context",
  "focus",
]);

export const FactMaturitySchema = z.enum([
  "candidate",
  "established",
  "proven",
]);

export const FactSourceSchema = z.enum(["manual", "inferred", "conversation"]);

export const ContextEventTypeSchema = z.enum([
  "page_visit",
  "selection",
  "conversation",
  "insight",
  "file",
]);

// --- Adoption Layer Events ---

export const ToolCalledEventSchema = z.object({
  event: z.literal("mcp.tool_called"),
  properties: z.object({
    tool: z.string(),
    connector: z.string(),
    duration_ms: z.number().optional(),
    success: z.boolean(),
  }),
});

// --- Identity Building Events ---

export const FactCreatedEventSchema = z.object({
  event: z.literal("identity.fact_created"),
  properties: z.object({
    fact_id: z.string().optional(),
    category: FactCategorySchema,
    source: FactSourceSchema,
    maturity: FactMaturitySchema,
  }),
});

export const FactValidatedEventSchema = z.object({
  event: z.literal("identity.fact_validated"),
  properties: z.object({
    fact_id: z.string().optional(),
    promoted: z.boolean(),
    from_maturity: FactMaturitySchema,
    to_maturity: FactMaturitySchema,
    match_type: z.enum(["id", "exact", "fuzzy"]),
  }),
});

export const FactPromotedEventSchema = z.object({
  event: z.literal("identity.fact_promoted"),
  properties: z.object({
    fact_id: z.string().optional(),
    from: z.enum(["candidate", "established"]),
    to: z.enum(["established", "proven"]),
  }),
});

export const FactArchivedEventSchema = z.object({
  event: z.literal("identity.fact_archived"),
  properties: z.object({
    count: z.number(),
    effective_confidence_avg: z.number(),
  }),
});

// --- Inference Quality Events (Approval Rates) ---

export const InferCalledEventSchema = z.object({
  event: z.literal("identity.infer_called"),
  properties: z.object({
    lookback_days: z.number(),
    context_event_count: z.number(),
    source: z.enum(["local_context", "rollup", "haiku_analysis"]),
  }),
});

export const CandidateProposedEventSchema = z.object({
  event: z.literal("identity.candidate_proposed"),
  properties: z.object({
    candidate_id: z.string().optional(),
    category: FactCategorySchema,
    confidence: z.number(),
    batch_size: z.number(),
  }),
});

export const CandidateAcceptedEventSchema = z.object({
  event: z.literal("identity.candidate_accepted"),
  properties: z.object({
    candidate_id: z.string().optional(),
    fact_id: z.string().optional(),
    category: FactCategorySchema,
    batch: z.boolean(),
  }),
});

export const CandidateRejectedEventSchema = z.object({
  event: z.literal("identity.candidate_rejected"),
  properties: z.object({
    candidate_id: z.string().optional(),
    fact_id: z.string().optional(),
    has_reason: z.boolean(),
  }),
});

// --- Projection/Utilization Events ---

export const ContextCalledEventSchema = z.object({
  event: z.literal("projection.context_called"),
  properties: z.object({
    task_provided: z.boolean(),
    facts_returned: z.number(),
    facts_filtered: z.number(),
  }),
});

export const FactSurfacedEventSchema = z.object({
  event: z.literal("projection.fact_surfaced"),
  properties: z.object({
    category: FactCategorySchema,
    maturity: FactMaturitySchema,
    relevance_score: z.number(),
  }),
});

// --- Setup Funnel Events ---

export const SetupErrorTypeSchema = z.enum([
  "invalid_email",
  "api_error",
  "invalid_response",
  "network_error",
  "already_configured",
]);

export const SetupStepSchema = z.enum([
  "email_prompt",
  "api_call",
  "config_save",
]);

export const SetupStartedEventSchema = z.object({
  event: z.literal("setup.started"),
  properties: z.object({
    interactive: z.boolean(),
  }),
});

export const SetupEmailEnteredEventSchema = z.object({
  event: z.literal("setup.email_entered"),
  properties: z.object({
    interactive: z.boolean(),
  }),
});

export const SetupCompletedEventSchema = z.object({
  event: z.literal("setup.completed"),
  properties: z.object({
    duration_ms: z.number(),
  }),
});

export const SetupFailedEventSchema = z.object({
  event: z.literal("setup.failed"),
  properties: z.object({
    error_type: SetupErrorTypeSchema,
    step: SetupStepSchema,
  }),
});

// --- Context Flow Events ---

export const ContextEventAddedSchema = z.object({
  event: z.literal("context.event_added"),
  properties: z.object({
    type: ContextEventTypeSchema,
    source: z.string(),
    auto_promoted: z.boolean().optional(),
  }),
});

export const ContextEventsRetrievedSchema = z.object({
  event: z.literal("context.events_retrieved"),
  properties: z.object({
    count: z.number(),
    source_filter: z.string().optional(),
    type_filter: z.string().optional(),
  }),
});

// --- Union type for all events ---

export const TelemetryEventSchema = z.discriminatedUnion("event", [
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
  // Setup funnel events
  SetupStartedEventSchema,
  SetupEmailEnteredEventSchema,
  SetupCompletedEventSchema,
  SetupFailedEventSchema,
]);

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

// --- Event type literals for convenience ---

export type EventType = TelemetryEvent["event"];

export const EVENT_TYPES = {
  // Adoption
  TOOL_CALLED: "mcp.tool_called",
  // Identity
  FACT_CREATED: "identity.fact_created",
  FACT_VALIDATED: "identity.fact_validated",
  FACT_PROMOTED: "identity.fact_promoted",
  FACT_ARCHIVED: "identity.fact_archived",
  // Inference
  INFER_CALLED: "identity.infer_called",
  CANDIDATE_PROPOSED: "identity.candidate_proposed",
  CANDIDATE_ACCEPTED: "identity.candidate_accepted",
  CANDIDATE_REJECTED: "identity.candidate_rejected",
  // Projection
  CONTEXT_CALLED: "projection.context_called",
  FACT_SURFACED: "projection.fact_surfaced",
  // Context Flow
  EVENT_ADDED: "context.event_added",
  EVENTS_RETRIEVED: "context.events_retrieved",
  // Setup Funnel
  SETUP_STARTED: "setup.started",
  SETUP_EMAIL_ENTERED: "setup.email_entered",
  SETUP_COMPLETED: "setup.completed",
  SETUP_FAILED: "setup.failed",
} as const;
