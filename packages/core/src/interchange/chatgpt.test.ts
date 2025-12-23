/**
 * ChatGPT Custom Instructions Import Tests - TDD RED PHASE
 */

import { describe, it, expect, vi } from "vitest";
import {
  importFromChatGPT,
  parseExtractionResponse,
  type ChatGPTImportResult,
} from "./chatgpt.js";

// Mock LLM provider that returns predictable extraction results
const createMockLLMProvider = (response: string) => {
  return vi.fn().mockResolvedValue(response);
};

// Sample ChatGPT custom instructions
const sampleInstructions = `
I'm a senior engineer at a startup working on AI products. I prefer concise, technical responses.
Skip the pleasantries and get straight to the point. I work primarily with TypeScript and React.
I'm based in San Francisco and currently learning Rust on the side.
`;

// Mock extraction response (simulating what Claude Haiku would return)
const mockExtractionResponse = JSON.stringify({
  core: {
    name: "",
    role: "Senior Engineer at startup",
    location: "San Francisco",
    background: "Working on AI products",
  },
  communication: {
    style: ["concise", "technical"],
    format: [],
    avoid: ["pleasantries"],
  },
  expertise: ["TypeScript", "React"],
  currentFocus: {
    projects: [],
    goals: ["Learning Rust"],
  },
  context: {
    personal: [],
    professional: ["AI products"],
  },
});

// ============================================================================
// IMPORT TESTS
// ============================================================================

describe("importFromChatGPT", () => {
  it("parses ChatGPT custom instructions to facts", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.success).toBe(true);
    expect(result.facts.length).toBeGreaterThan(0);
  });

  it("extracts expertise facts", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    const expertiseFacts = result.facts.filter((f) => f.category === "expertise");
    expect(expertiseFacts.length).toBeGreaterThan(0);
    expect(expertiseFacts.some((f) => f.content === "TypeScript")).toBe(true);
    expect(expertiseFacts.some((f) => f.content === "React")).toBe(true);
  });

  it("extracts preference facts from communication style", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    const prefFacts = result.facts.filter((f) => f.category === "preference");
    expect(prefFacts.some((f) => f.content.includes("concise"))).toBe(true);
  });

  it("extracts focus facts from goals", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    const focusFacts = result.facts.filter((f) => f.category === "focus");
    expect(focusFacts.some((f) => f.content.includes("Rust"))).toBe(true);
  });

  it("sets source to imported", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.facts.every((f) => f.source === "imported")).toBe(true);
  });

  it("sets maturity to established (imported = some trust)", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.facts.every((f) => f.maturity === "established")).toBe(true);
  });

  it("sets confidence to 0.8 (high but not proven)", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.facts.every((f) => f.confidence === 0.8)).toBe(true);
  });

  it("defaults visibility to trusted", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.facts.every((f) => f.visibility === "trusted")).toBe(true);
  });

  it("includes core identity in result", async () => {
    const mockProvider = createMockLLMProvider(mockExtractionResponse);
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.core?.role).toBe("Senior Engineer at startup");
    expect(result.core?.location).toBe("San Francisco");
  });

  it("handles empty instructions gracefully", async () => {
    const mockProvider = createMockLLMProvider(
      JSON.stringify({
        core: {},
        communication: { style: [], format: [], avoid: [] },
        expertise: [],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
      })
    );
    const result = await importFromChatGPT("", mockProvider);

    expect(result.success).toBe(true);
    expect(result.facts).toEqual([]);
  });

  it("handles LLM provider errors gracefully", async () => {
    const mockProvider = vi.fn().mockRejectedValue(new Error("API error"));
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.success).toBe(false);
    expect(result.error).toContain("API error");
  });

  it("handles malformed JSON response", async () => {
    const mockProvider = createMockLLMProvider("not valid json");
    const result = await importFromChatGPT(sampleInstructions, mockProvider);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// PARSE HELPER TESTS
// ============================================================================

describe("parseExtractionResponse", () => {
  it("converts v1-style extraction to facts array", () => {
    const extracted = JSON.parse(mockExtractionResponse);
    const facts = parseExtractionResponse(extracted);

    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.id)).toBe(true);
    expect(facts.every((f) => f.createdAt)).toBe(true);
  });

  it("handles all category types", () => {
    const extracted = {
      core: { role: "Developer" },
      communication: { style: ["direct"], format: ["markdown"], avoid: ["fluff"] },
      expertise: ["JavaScript"],
      currentFocus: {
        projects: [{ name: "Test", description: "A test project", status: "active" }],
        goals: ["Ship v1"],
      },
      context: { personal: ["Dog owner"], professional: ["Remote work"] },
    };

    const facts = parseExtractionResponse(extracted);

    // Check categories are present
    const categories = new Set(facts.map((f) => f.category));
    expect(categories.has("expertise")).toBe(true);
    expect(categories.has("preference")).toBe(true);
    expect(categories.has("focus")).toBe(true);
    expect(categories.has("context")).toBe(true);
  });

  it("handles missing optional fields", () => {
    const minimal = {
      core: {},
      communication: { style: [], format: [], avoid: [] },
      expertise: [],
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
    };

    const facts = parseExtractionResponse(minimal);
    expect(facts).toEqual([]);
  });
});
