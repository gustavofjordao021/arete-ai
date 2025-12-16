/**
 * Context Aggregator Tests - Phase 1
 *
 * Tests for aggregating ALL context event types into structured format for Haiku.
 * The aggregator is formatting only - no intelligence, no filtering.
 */

import { describe, it, expect } from "vitest";
import {
  aggregateContext,
  type AggregatedContext,
  type ContextEvent,
} from "./context-aggregator.js";

// Helper to create test events
function createEvent(
  type: string,
  data: Record<string, unknown>,
  timestamp?: string
): ContextEvent {
  return {
    id: crypto.randomUUID(),
    type,
    source: "test",
    timestamp: timestamp ?? new Date().toISOString(),
    data,
  };
}

describe("Context Aggregator", () => {
  describe("page_visit events", () => {
    it("groups page_visit events by domain", () => {
      const events = [
        createEvent("page_visit", { url: "https://ro.com/products", title: "Ro Products" }),
        createEvent("page_visit", { url: "https://ro.com/about", title: "About Ro" }),
        createEvent("page_visit", { url: "https://supabase.com/docs", title: "Supabase Docs" }),
      ];

      const result = aggregateContext(events);

      expect(result.pageVisits).toHaveLength(2);

      const roDomain = result.pageVisits.find(p => p.domain === "ro.com");
      expect(roDomain).toBeDefined();
      expect(roDomain!.count).toBe(2);
      expect(roDomain!.titles).toContain("Ro Products");
      expect(roDomain!.titles).toContain("About Ro");

      const supabaseDomain = result.pageVisits.find(p => p.domain === "supabase.com");
      expect(supabaseDomain).toBeDefined();
      expect(supabaseDomain!.count).toBe(1);
    });

    it("strips www. prefix from domains", () => {
      const events = [
        createEvent("page_visit", { url: "https://www.example.com/page" }),
      ];

      const result = aggregateContext(events);

      expect(result.pageVisits[0].domain).toBe("example.com");
    });

    it("handles malformed URLs gracefully", () => {
      const events = [
        createEvent("page_visit", { url: "not-a-valid-url" }),
        createEvent("page_visit", { url: "https://valid.com" }),
      ];

      const result = aggregateContext(events);

      // Should only include the valid one
      expect(result.pageVisits).toHaveLength(1);
      expect(result.pageVisits[0].domain).toBe("valid.com");
    });

    it("deduplicates titles per domain", () => {
      const events = [
        createEvent("page_visit", { url: "https://ro.com/page1", title: "Ro Health" }),
        createEvent("page_visit", { url: "https://ro.com/page2", title: "Ro Health" }), // same title
        createEvent("page_visit", { url: "https://ro.com/page3", title: "Ro Products" }),
      ];

      const result = aggregateContext(events);

      const roDomain = result.pageVisits.find(p => p.domain === "ro.com");
      expect(roDomain!.titles).toHaveLength(2); // deduplicated
      expect(roDomain!.count).toBe(3); // but count is still 3
    });

    it("handles missing title field", () => {
      const events = [
        createEvent("page_visit", { url: "https://example.com" }), // no title
      ];

      const result = aggregateContext(events);

      expect(result.pageVisits[0].titles).toHaveLength(0);
    });
  });

  describe("insight events", () => {
    it("extracts insight strings from insight events", () => {
      const events = [
        createEvent("insight", { insight: "User interested in health optimization" }),
        createEvent("insight", { insight: "Prefers TypeScript over JavaScript" }),
      ];

      const result = aggregateContext(events);

      expect(result.insights).toHaveLength(2);
      expect(result.insights).toContain("User interested in health optimization");
      expect(result.insights).toContain("Prefers TypeScript over JavaScript");
    });

    it("handles insight events with summary field instead", () => {
      const events = [
        createEvent("insight", { summary: "Health discussions", insights: ["point 1", "point 2"] }),
      ];

      const result = aggregateContext(events);

      // Should extract from summary or insights array
      expect(result.insights.length).toBeGreaterThan(0);
    });

    it("handles insight events with nested insights array", () => {
      const events = [
        createEvent("insight", {
          summary: "Strategic direction",
          insights: ["Vision statement", "Key priorities"],
        }),
      ];

      const result = aggregateContext(events);

      expect(result.insights).toContain("Vision statement");
      expect(result.insights).toContain("Key priorities");
    });

    it("skips insight events with missing data", () => {
      const events = [
        createEvent("insight", {}), // empty data
        createEvent("insight", { insight: "Valid insight" }),
      ];

      const result = aggregateContext(events);

      expect(result.insights).toHaveLength(1);
      expect(result.insights[0]).toBe("Valid insight");
    });
  });

  describe("conversation events", () => {
    it("extracts conversation summaries", () => {
      const events = [
        createEvent("conversation", { summary: "Discussed supplement optimization" }),
        createEvent("conversation", { summary: "Talked about fitness tracking" }),
      ];

      const result = aggregateContext(events);

      expect(result.conversations).toHaveLength(2);
      expect(result.conversations).toContain("Discussed supplement optimization");
    });

    it("handles conversation events with topic field", () => {
      const events = [
        createEvent("conversation", { topic: "Health optimization" }),
      ];

      const result = aggregateContext(events);

      expect(result.conversations).toContain("Health optimization");
    });

    it("handles conversation events with content field", () => {
      const events = [
        createEvent("conversation", { content: "User asked about protein synthesis" }),
      ];

      const result = aggregateContext(events);

      expect(result.conversations.length).toBeGreaterThan(0);
    });
  });

  describe("file events", () => {
    it("extracts file paths", () => {
      const events = [
        createEvent("file", { path: "src/whoop-api.ts" }),
        createEvent("file", { path: "src/health-dashboard.tsx" }),
      ];

      const result = aggregateContext(events);

      expect(result.files).toHaveLength(2);
      expect(result.files).toContain("src/whoop-api.ts");
      expect(result.files).toContain("src/health-dashboard.tsx");
    });

    it("handles file events with filename field", () => {
      const events = [
        createEvent("file", { filename: "api.ts" }),
      ];

      const result = aggregateContext(events);

      expect(result.files).toContain("api.ts");
    });

    it("deduplicates file paths", () => {
      const events = [
        createEvent("file", { path: "src/api.ts" }),
        createEvent("file", { path: "src/api.ts" }), // duplicate
        createEvent("file", { path: "src/other.ts" }),
      ];

      const result = aggregateContext(events);

      expect(result.files).toHaveLength(2);
    });
  });

  describe("selection events", () => {
    it("extracts selection text", () => {
      const events = [
        createEvent("selection", { text: "HRV metrics and recovery" }),
        createEvent("selection", { text: "Protein synthesis pathway" }),
      ];

      const result = aggregateContext(events);

      expect(result.selections).toHaveLength(2);
      expect(result.selections).toContain("HRV metrics and recovery");
    });

    it("handles selection events with content field", () => {
      const events = [
        createEvent("selection", { content: "Selected text here" }),
      ];

      const result = aggregateContext(events);

      expect(result.selections).toContain("Selected text here");
    });

    it("truncates very long selections", () => {
      const longText = "a".repeat(500);
      const events = [
        createEvent("selection", { text: longText }),
      ];

      const result = aggregateContext(events);

      // Should truncate to reasonable length
      expect(result.selections[0].length).toBeLessThanOrEqual(200);
    });
  });

  describe("mixed event types", () => {
    it("handles all event types together", () => {
      const events = [
        createEvent("page_visit", { url: "https://ro.com", title: "Ro" }),
        createEvent("page_visit", { url: "https://ro.com/2", title: "Ro 2" }),
        createEvent("insight", { insight: "Health focus" }),
        createEvent("conversation", { summary: "Supplements discussion" }),
        createEvent("file", { path: "whoop.ts" }),
        createEvent("selection", { text: "HRV metrics" }),
      ];

      const result = aggregateContext(events);

      expect(result.pageVisits).toHaveLength(1); // grouped by domain
      expect(result.pageVisits[0].count).toBe(2);
      expect(result.insights).toHaveLength(1);
      expect(result.conversations).toHaveLength(1);
      expect(result.files).toHaveLength(1);
      expect(result.selections).toHaveLength(1);
    });

    it("ignores unknown event types", () => {
      const events = [
        createEvent("page_visit", { url: "https://example.com" }),
        createEvent("unknown_type", { data: "something" }),
      ];

      const result = aggregateContext(events);

      expect(result.pageVisits).toHaveLength(1);
      // Should not throw, just ignore unknown
    });

    it("returns empty arrays for missing event types", () => {
      const events: ContextEvent[] = [];

      const result = aggregateContext(events);

      expect(result.pageVisits).toEqual([]);
      expect(result.insights).toEqual([]);
      expect(result.conversations).toEqual([]);
      expect(result.files).toEqual([]);
      expect(result.selections).toEqual([]);
    });
  });

  describe("sorting and limits", () => {
    it("sorts page visits by count descending", () => {
      const events = [
        createEvent("page_visit", { url: "https://rare.com" }),
        createEvent("page_visit", { url: "https://common.com" }),
        createEvent("page_visit", { url: "https://common.com" }),
        createEvent("page_visit", { url: "https://common.com" }),
      ];

      const result = aggregateContext(events);

      expect(result.pageVisits[0].domain).toBe("common.com");
      expect(result.pageVisits[0].count).toBe(3);
    });

    it("limits page visits to top N domains", () => {
      // Create events for 20 different domains
      const events = Array.from({ length: 20 }, (_, i) =>
        createEvent("page_visit", { url: `https://domain${i}.com` })
      );

      const result = aggregateContext(events, { maxDomains: 10 });

      expect(result.pageVisits.length).toBeLessThanOrEqual(10);
    });

    it("limits insights to most recent N", () => {
      const events = Array.from({ length: 20 }, (_, i) =>
        createEvent("insight", { insight: `Insight ${i}` })
      );

      const result = aggregateContext(events, { maxInsights: 5 });

      expect(result.insights.length).toBeLessThanOrEqual(5);
    });
  });
});
