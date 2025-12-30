/**
 * LLM Extractor Tests (TDD - RED phase)
 *
 * Tests for real Haiku extraction in benchmarks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildExtractionPrompt,
  parseHaikuResponse,
  extractFactsLive,
} from "./llm-extractor.js";

describe("buildExtractionPrompt", () => {
  it("includes the transcript in the prompt", () => {
    const transcript = "User: I'm a PM at Stripe\nAssistant: Nice!";
    const prompt = buildExtractionPrompt(transcript);
    expect(prompt).toContain("I'm a PM at Stripe");
  });

  it("includes extraction rules", () => {
    const prompt = buildExtractionPrompt("test");
    expect(prompt).toContain("DURABLE");
    expect(prompt).toContain("category");
  });

  it("requests JSON output format", () => {
    const prompt = buildExtractionPrompt("test");
    expect(prompt).toContain("JSON");
  });

  it("includes all five categories", () => {
    const prompt = buildExtractionPrompt("test");
    expect(prompt).toContain("core");
    expect(prompt).toContain("expertise");
    expect(prompt).toContain("preference");
    expect(prompt).toContain("context");
    expect(prompt).toContain("focus");
  });
});

describe("parseHaikuResponse", () => {
  it("parses valid JSON array response", () => {
    const response = '[{"category":"core","content":"PM at Stripe"}]';
    const facts = parseHaikuResponse(response);
    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe("core");
    expect(facts[0].content).toBe("PM at Stripe");
  });

  it("handles empty array", () => {
    const facts = parseHaikuResponse("[]");
    expect(facts).toHaveLength(0);
  });

  it("handles multiple facts", () => {
    const response = JSON.stringify([
      { category: "core", content: "PM at Stripe" },
      { category: "expertise", content: "React development" },
    ]);
    const facts = parseHaikuResponse(response);
    expect(facts).toHaveLength(2);
  });

  it("extracts JSON from markdown code blocks", () => {
    const response = '```json\n[{"category":"core","content":"test"}]\n```';
    const facts = parseHaikuResponse(response);
    expect(facts).toHaveLength(1);
  });

  it("returns empty array for invalid JSON", () => {
    const facts = parseHaikuResponse("not json at all");
    expect(facts).toHaveLength(0);
  });

  it("returns empty array for non-array JSON", () => {
    const facts = parseHaikuResponse('{"not": "an array"}');
    expect(facts).toHaveLength(0);
  });

  it("filters out invalid facts (missing category)", () => {
    const response = JSON.stringify([
      { category: "core", content: "valid" },
      { content: "missing category" },
    ]);
    const facts = parseHaikuResponse(response);
    expect(facts).toHaveLength(1);
  });

  it("filters out invalid facts (missing content)", () => {
    const response = JSON.stringify([
      { category: "core", content: "valid" },
      { category: "core" },
    ]);
    const facts = parseHaikuResponse(response);
    expect(facts).toHaveLength(1);
  });

  it("normalizes unknown categories to context", () => {
    const response = JSON.stringify([
      { category: "unknown_category", content: "test" },
    ]);
    const facts = parseHaikuResponse(response);
    expect(facts[0].category).toBe("context");
  });
});

describe("extractFactsLive", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("calls Anthropic API with correct headers", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "[]" }],
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await extractFactsLive("test transcript", "test-api-key");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-api-key",
          "anthropic-version": "2023-06-01",
        }),
      })
    );
  });

  it("uses claude-3-haiku model", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "[]" }],
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await extractFactsLive("test", "key");

    const callArgs = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.model).toContain("haiku");
  });

  it("returns extracted facts from API response", async () => {
    const mockFacts = [{ category: "core", content: "PM at Stripe" }];
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: JSON.stringify(mockFacts) }],
      }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const facts = await extractFactsLive("User: I'm a PM at Stripe", "key");

    expect(facts).toHaveLength(1);
    expect(facts[0].content).toBe("PM at Stripe");
  });

  it("returns empty array on API error", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const facts = await extractFactsLive("test", "key");

    expect(facts).toHaveLength(0);
  });

  it("returns empty array on network error", async () => {
    (global.fetch as any).mockRejectedValue(new Error("Network error"));

    const facts = await extractFactsLive("test", "key");

    expect(facts).toHaveLength(0);
  });
});
