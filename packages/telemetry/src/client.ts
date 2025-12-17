/**
 * Telemetry client - PostHog wrapper with privacy controls
 *
 * Features:
 * - ON by default, opt-out via config
 * - Anonymous user ID (SHA-256 hashed deviceId)
 * - Graceful degradation (failures don't break the app)
 * - Singleton pattern for easy access
 */

import { PostHog } from "posthog-node";
import { loadTelemetryConfig, saveTelemetryConfig } from "./config.js";
import { getAnonymousUserId } from "./user-id.js";
import type { TelemetryEvent } from "./events.js";

// PostHog configuration
// TODO: Set up PostHog project and update this key
const POSTHOG_API_KEY =
  process.env.POSTHOG_API_KEY || "phc_placeholder_replace_me";
const POSTHOG_HOST =
  process.env.POSTHOG_HOST || "https://us.i.posthog.com";

const LIB_NAME = "@arete/telemetry";
const LIB_VERSION = "0.1.0";

export interface TelemetryClientOptions {
  /** Override enabled state (ignores config) */
  enabled?: boolean;
  /** Force a specific user ID (for testing) */
  forceUserId?: string;
  /** PostHog API key override */
  apiKey?: string;
  /** PostHog host override */
  host?: string;
}

export class TelemetryClient {
  private client: PostHog | null = null;
  private userId: string;
  private enabled: boolean;
  private connector: string = "unknown";

  constructor(options: TelemetryClientOptions = {}) {
    const config = loadTelemetryConfig();

    this.enabled = options.enabled ?? config.enabled;
    this.userId =
      options.forceUserId || config.anonymousId || getAnonymousUserId();

    // Save the anonymous ID for consistency across sessions
    if (!config.anonymousId && this.enabled) {
      saveTelemetryConfig({ ...config, anonymousId: this.userId });
    }

    if (this.enabled) {
      const apiKey = options.apiKey || POSTHOG_API_KEY;
      const host = options.host || POSTHOG_HOST;

      // Don't initialize if using placeholder key
      if (apiKey && !apiKey.includes("placeholder")) {
        try {
          this.client = new PostHog(apiKey, {
            host,
            flushAt: 10, // Batch events
            flushInterval: 5000, // 5 seconds
          });
        } catch (error) {
          // Graceful degradation - telemetry init failed but app continues
          console.error("[telemetry] Failed to initialize PostHog:", error);
          this.enabled = false;
        }
      }
    }
  }

  /**
   * Set the connector name (e.g., "mcp-server", "cli", "chrome")
   */
  setConnector(connector: string): void {
    this.connector = connector;
  }

  /**
   * Track a telemetry event
   */
  track(event: TelemetryEvent): void {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      this.client.capture({
        distinctId: this.userId,
        event: event.event,
        properties: {
          ...event.properties,
          $lib: LIB_NAME,
          $lib_version: LIB_VERSION,
          connector: this.connector,
        },
      });
    } catch (error) {
      // Graceful degradation - don't break the app
      console.error("[telemetry] Failed to track event:", error);
    }
  }

  /**
   * Track a tool call with timing (convenience method)
   */
  trackToolCall(
    tool: string,
    success: boolean,
    durationMs?: number
  ): void {
    this.track({
      event: "mcp.tool_called",
      properties: {
        tool,
        connector: this.connector,
        success,
        duration_ms: durationMs,
      },
    });
  }

  /**
   * Track fact creation
   */
  trackFactCreated(
    category: "core" | "expertise" | "preference" | "context" | "focus",
    source: "manual" | "inferred" | "conversation",
    maturity: "candidate" | "established" | "proven",
    factId?: string
  ): void {
    this.track({
      event: "identity.fact_created",
      properties: { fact_id: factId, category, source, maturity },
    });
  }

  /**
   * Track fact validation
   */
  trackFactValidated(
    promoted: boolean,
    fromMaturity: "candidate" | "established" | "proven",
    toMaturity: "candidate" | "established" | "proven",
    matchType: "id" | "exact" | "fuzzy",
    factId?: string
  ): void {
    this.track({
      event: "identity.fact_validated",
      properties: {
        fact_id: factId,
        promoted,
        from_maturity: fromMaturity,
        to_maturity: toMaturity,
        match_type: matchType,
      },
    });
  }

  /**
   * Track candidate proposal (inference)
   */
  trackCandidateProposed(
    category: "core" | "expertise" | "preference" | "context" | "focus",
    confidence: number,
    batchSize: number,
    candidateId?: string
  ): void {
    this.track({
      event: "identity.candidate_proposed",
      properties: { candidate_id: candidateId, category, confidence, batch_size: batchSize },
    });
  }

  /**
   * Track candidate acceptance
   */
  trackCandidateAccepted(
    category: "core" | "expertise" | "preference" | "context" | "focus",
    batch: boolean,
    candidateId?: string,
    factId?: string
  ): void {
    this.track({
      event: "identity.candidate_accepted",
      properties: { candidate_id: candidateId, fact_id: factId, category, batch },
    });
  }

  /**
   * Track candidate rejection
   */
  trackCandidateRejected(
    hasReason: boolean,
    candidateId?: string,
    factId?: string
  ): void {
    this.track({
      event: "identity.candidate_rejected",
      properties: { candidate_id: candidateId, fact_id: factId, has_reason: hasReason },
    });
  }

  /**
   * Track context event addition
   */
  trackContextEventAdded(
    type: "page_visit" | "selection" | "conversation" | "insight" | "file",
    source: string,
    autoPromoted?: boolean
  ): void {
    this.track({
      event: "context.event_added",
      properties: { type, source, auto_promoted: autoPromoted },
    });
  }

  /**
   * Track projection/context call
   */
  trackProjectionCalled(
    taskProvided: boolean,
    factsReturned: number,
    factsFiltered: number
  ): void {
    this.track({
      event: "projection.context_called",
      properties: {
        task_provided: taskProvided,
        facts_returned: factsReturned,
        facts_filtered: factsFiltered,
      },
    });
  }

  /**
   * Track fact surfacing (utilization)
   */
  trackFactSurfaced(
    category: "core" | "expertise" | "preference" | "context" | "focus",
    maturity: "candidate" | "established" | "proven",
    relevanceScore: number
  ): void {
    this.track({
      event: "projection.fact_surfaced",
      properties: { category, maturity, relevance_score: relevanceScore },
    });
  }

  /**
   * Set user properties (for cohort analysis)
   */
  identify(properties: Record<string, unknown>): void {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      this.client.identify({
        distinctId: this.userId,
        properties,
      });
    } catch (error) {
      console.error("[telemetry] Failed to identify:", error);
    }
  }

  /**
   * Opt out of telemetry
   */
  disable(): void {
    this.enabled = false;
    saveTelemetryConfig({ enabled: false, anonymousId: this.userId });
    this.shutdown();
  }

  /**
   * Opt back into telemetry
   */
  enable(): void {
    this.enabled = true;
    saveTelemetryConfig({ enabled: true, anonymousId: this.userId });

    if (!this.client) {
      const apiKey = POSTHOG_API_KEY;
      if (apiKey && !apiKey.includes("placeholder")) {
        try {
          this.client = new PostHog(apiKey, {
            host: POSTHOG_HOST,
            flushAt: 10,
            flushInterval: 5000,
          });
        } catch (error) {
          console.error("[telemetry] Failed to re-initialize PostHog:", error);
          this.enabled = false;
        }
      }
    }
  }

  /**
   * Check if telemetry is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the anonymous user ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Flush pending events and close client
   * MUST be called before process exit
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      try {
        await this.client.shutdown();
      } catch (error) {
        console.error("[telemetry] Failed to shutdown:", error);
      }
      this.client = null;
    }
  }
}

// --- Singleton instance for convenience ---

let globalClient: TelemetryClient | null = null;

/**
 * Get the global telemetry client (singleton)
 */
export function getTelemetryClient(): TelemetryClient {
  if (!globalClient) {
    globalClient = new TelemetryClient();
  }
  return globalClient;
}

/**
 * Initialize telemetry with options
 * Call this early in your app to configure the client
 */
export function initTelemetry(options: TelemetryClientOptions = {}): TelemetryClient {
  globalClient = new TelemetryClient(options);
  return globalClient;
}

/**
 * Shutdown global telemetry client
 * Call before process exit to flush pending events
 */
export async function shutdownTelemetry(): Promise<void> {
  if (globalClient) {
    await globalClient.shutdown();
    globalClient = null;
  }
}

/**
 * Reset global client (for testing)
 */
export function resetTelemetryClient(): void {
  globalClient = null;
}
