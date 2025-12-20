import { describe, it, expect } from "vitest";
import {
  ToolCalledEventSchema,
  FactCreatedEventSchema,
  FactValidatedEventSchema,
  CandidateProposedEventSchema,
  CandidateAcceptedEventSchema,
  CandidateRejectedEventSchema,
  ContextCalledEventSchema,
  FactSurfacedEventSchema,
  ContextEventAddedSchema,
  TelemetryEventSchema,
  EVENT_TYPES,
  // Setup funnel events
  SetupStartedEventSchema,
  SetupEmailEnteredEventSchema,
  SetupCompletedEventSchema,
  SetupFailedEventSchema,
} from "./events.js";

describe("TelemetryEvent schemas", () => {
  describe("ToolCalledEventSchema", () => {
    it("validates correct tool_called event", () => {
      const event = {
        event: "mcp.tool_called",
        properties: {
          tool: "arete_get_identity",
          connector: "mcp-server",
          success: true,
          duration_ms: 42,
        },
      };
      expect(() => ToolCalledEventSchema.parse(event)).not.toThrow();
    });

    it("accepts event without optional duration_ms", () => {
      const event = {
        event: "mcp.tool_called",
        properties: {
          tool: "arete_get_identity",
          connector: "mcp-server",
          success: false,
        },
      };
      expect(() => ToolCalledEventSchema.parse(event)).not.toThrow();
    });

    it("rejects event missing required fields", () => {
      const event = {
        event: "mcp.tool_called",
        properties: {
          tool: "arete_get_identity",
          // missing connector and success
        },
      };
      expect(() => ToolCalledEventSchema.parse(event)).toThrow();
    });
  });

  describe("FactCreatedEventSchema", () => {
    it("validates fact_created with valid category", () => {
      const event = {
        event: "identity.fact_created",
        properties: {
          category: "expertise",
          source: "conversation",
          maturity: "candidate",
        },
      };
      expect(() => FactCreatedEventSchema.parse(event)).not.toThrow();
    });

    it("accepts all valid categories", () => {
      const categories = ["core", "expertise", "preference", "context", "focus"];
      for (const category of categories) {
        const event = {
          event: "identity.fact_created",
          properties: {
            category,
            source: "manual",
            maturity: "proven",
          },
        };
        expect(() => FactCreatedEventSchema.parse(event)).not.toThrow();
      }
    });

    it("rejects invalid category", () => {
      const event = {
        event: "identity.fact_created",
        properties: {
          category: "invalid_category",
          source: "manual",
          maturity: "established",
        },
      };
      expect(() => FactCreatedEventSchema.parse(event)).toThrow();
    });
  });

  describe("FactValidatedEventSchema", () => {
    it("validates fact_validated event", () => {
      const event = {
        event: "identity.fact_validated",
        properties: {
          promoted: true,
          from_maturity: "candidate",
          to_maturity: "established",
          match_type: "fuzzy",
        },
      };
      expect(() => FactValidatedEventSchema.parse(event)).not.toThrow();
    });

    it("accepts all match types", () => {
      const matchTypes = ["id", "exact", "fuzzy"];
      for (const matchType of matchTypes) {
        const event = {
          event: "identity.fact_validated",
          properties: {
            promoted: false,
            from_maturity: "established",
            to_maturity: "established",
            match_type: matchType,
          },
        };
        expect(() => FactValidatedEventSchema.parse(event)).not.toThrow();
      }
    });
  });

  describe("CandidateProposedEventSchema", () => {
    it("validates candidate_proposed event", () => {
      const event = {
        event: "identity.candidate_proposed",
        properties: {
          category: "expertise",
          confidence: 0.75,
          batch_size: 3,
        },
      };
      expect(() => CandidateProposedEventSchema.parse(event)).not.toThrow();
    });
  });

  describe("CandidateAcceptedEventSchema", () => {
    it("validates candidate_accepted event", () => {
      const event = {
        event: "identity.candidate_accepted",
        properties: {
          category: "focus",
          batch: false,
        },
      };
      expect(() => CandidateAcceptedEventSchema.parse(event)).not.toThrow();
    });
  });

  describe("CandidateRejectedEventSchema", () => {
    it("validates candidate_rejected event", () => {
      const event = {
        event: "identity.candidate_rejected",
        properties: {
          has_reason: true,
        },
      };
      expect(() => CandidateRejectedEventSchema.parse(event)).not.toThrow();
    });
  });

  describe("ContextCalledEventSchema", () => {
    it("validates projection.context_called event", () => {
      const event = {
        event: "projection.context_called",
        properties: {
          task_provided: true,
          facts_returned: 5,
          facts_filtered: 10,
        },
      };
      expect(() => ContextCalledEventSchema.parse(event)).not.toThrow();
    });
  });

  describe("FactSurfacedEventSchema", () => {
    it("validates projection.fact_surfaced event", () => {
      const event = {
        event: "projection.fact_surfaced",
        properties: {
          category: "expertise",
          maturity: "proven",
          relevance_score: 0.85,
        },
      };
      expect(() => FactSurfacedEventSchema.parse(event)).not.toThrow();
    });
  });

  describe("ContextEventAddedSchema", () => {
    it("validates context.event_added event", () => {
      const event = {
        event: "context.event_added",
        properties: {
          type: "page_visit",
          source: "chrome",
          auto_promoted: true,
        },
      };
      expect(() => ContextEventAddedSchema.parse(event)).not.toThrow();
    });

    it("accepts event without optional auto_promoted", () => {
      const event = {
        event: "context.event_added",
        properties: {
          type: "insight",
          source: "mcp-server",
        },
      };
      expect(() => ContextEventAddedSchema.parse(event)).not.toThrow();
    });

    it("accepts all context event types", () => {
      const types = ["page_visit", "selection", "conversation", "insight", "file"];
      for (const type of types) {
        const event = {
          event: "context.event_added",
          properties: {
            type,
            source: "test",
          },
        };
        expect(() => ContextEventAddedSchema.parse(event)).not.toThrow();
      }
    });
  });

  describe("TelemetryEventSchema (union)", () => {
    it("accepts all valid event types", () => {
      const events = [
        {
          event: "mcp.tool_called",
          properties: { tool: "test", connector: "cli", success: true },
        },
        {
          event: "identity.fact_created",
          properties: { category: "core", source: "manual", maturity: "proven" },
        },
        {
          event: "identity.infer_called",
          properties: {
            lookback_days: 7,
            context_event_count: 50,
            source: "local_context",
          },
        },
        {
          event: "identity.candidate_proposed",
          properties: { category: "expertise", confidence: 0.8, batch_size: 2 },
        },
      ];

      for (const event of events) {
        expect(() => TelemetryEventSchema.parse(event)).not.toThrow();
      }
    });

    it("rejects unknown event types", () => {
      const event = {
        event: "unknown.event",
        properties: { foo: "bar" },
      };
      expect(() => TelemetryEventSchema.parse(event)).toThrow();
    });
  });

  describe("EVENT_TYPES constants", () => {
    it("has all expected event types", () => {
      expect(EVENT_TYPES.TOOL_CALLED).toBe("mcp.tool_called");
      expect(EVENT_TYPES.FACT_CREATED).toBe("identity.fact_created");
      expect(EVENT_TYPES.FACT_VALIDATED).toBe("identity.fact_validated");
      expect(EVENT_TYPES.CANDIDATE_PROPOSED).toBe("identity.candidate_proposed");
      expect(EVENT_TYPES.CANDIDATE_ACCEPTED).toBe("identity.candidate_accepted");
      expect(EVENT_TYPES.CANDIDATE_REJECTED).toBe("identity.candidate_rejected");
      expect(EVENT_TYPES.CONTEXT_CALLED).toBe("projection.context_called");
      expect(EVENT_TYPES.FACT_SURFACED).toBe("projection.fact_surfaced");
      expect(EVENT_TYPES.EVENT_ADDED).toBe("context.event_added");
    });

    it("has setup funnel event types", () => {
      expect(EVENT_TYPES.SETUP_STARTED).toBe("setup.started");
      expect(EVENT_TYPES.SETUP_EMAIL_ENTERED).toBe("setup.email_entered");
      expect(EVENT_TYPES.SETUP_COMPLETED).toBe("setup.completed");
      expect(EVENT_TYPES.SETUP_FAILED).toBe("setup.failed");
    });
  });

  // --- Setup Funnel Events ---

  describe("SetupStartedEventSchema", () => {
    it("validates setup.started event", () => {
      const event = {
        event: "setup.started",
        properties: { interactive: true },
      };
      expect(() => SetupStartedEventSchema.parse(event)).not.toThrow();
    });

    it("validates non-interactive setup", () => {
      const event = {
        event: "setup.started",
        properties: { interactive: false },
      };
      expect(() => SetupStartedEventSchema.parse(event)).not.toThrow();
    });

    it("rejects missing interactive flag", () => {
      const event = {
        event: "setup.started",
        properties: {},
      };
      expect(() => SetupStartedEventSchema.parse(event)).toThrow();
    });
  });

  describe("SetupEmailEnteredEventSchema", () => {
    it("validates setup.email_entered event", () => {
      const event = {
        event: "setup.email_entered",
        properties: { interactive: false },
      };
      expect(() => SetupEmailEnteredEventSchema.parse(event)).not.toThrow();
    });
  });

  describe("SetupCompletedEventSchema", () => {
    it("validates setup.completed event", () => {
      const event = {
        event: "setup.completed",
        properties: { duration_ms: 2500 },
      };
      expect(() => SetupCompletedEventSchema.parse(event)).not.toThrow();
    });

    it("rejects missing duration_ms", () => {
      const event = {
        event: "setup.completed",
        properties: {},
      };
      expect(() => SetupCompletedEventSchema.parse(event)).toThrow();
    });
  });

  describe("SetupFailedEventSchema", () => {
    it("validates setup.failed event", () => {
      const event = {
        event: "setup.failed",
        properties: { error_type: "api_error", step: "api_call" },
      };
      expect(() => SetupFailedEventSchema.parse(event)).not.toThrow();
    });

    it("accepts all valid error types", () => {
      const errorTypes = [
        "invalid_email",
        "api_error",
        "invalid_response",
        "network_error",
        "already_configured",
      ];
      for (const errorType of errorTypes) {
        const event = {
          event: "setup.failed",
          properties: { error_type: errorType, step: "api_call" },
        };
        expect(() => SetupFailedEventSchema.parse(event)).not.toThrow();
      }
    });

    it("accepts all valid steps", () => {
      const steps = ["email_prompt", "api_call", "config_save"];
      for (const step of steps) {
        const event = {
          event: "setup.failed",
          properties: { error_type: "api_error", step },
        };
        expect(() => SetupFailedEventSchema.parse(event)).not.toThrow();
      }
    });

    it("rejects invalid error_type", () => {
      const event = {
        event: "setup.failed",
        properties: { error_type: "unknown_error", step: "api_call" },
      };
      expect(() => SetupFailedEventSchema.parse(event)).toThrow();
    });

    it("rejects invalid step", () => {
      const event = {
        event: "setup.failed",
        properties: { error_type: "api_error", step: "invalid_step" },
      };
      expect(() => SetupFailedEventSchema.parse(event)).toThrow();
    });
  });
});
