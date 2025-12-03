import { describe, it, expect } from "vitest";
import { createEmptyIdentity } from "../schema/identity.js";
import { ClaudeTransform, createClaudeTransform } from "./claude.js";
import { OpenAITransform, createOpenAITransform } from "./openai.js";
import { getTransform, listTransforms } from "./index.js";

const sampleIdentity = {
  ...createEmptyIdentity("test"),
  core: {
    name: "Alex",
    role: "Engineer",
    location: "SF",
    background: "10 years experience",
  },
  communication: {
    style: ["direct", "concise"],
    format: ["markdown"],
    avoid: ["fluff"],
    voice: "technical",
  },
  expertise: ["TypeScript", "React"],
  currentFocus: {
    projects: [
      { name: "Arete", description: "AI identity layer", status: "active" as const },
    ],
    goals: ["Ship MVP"],
  },
  context: {
    personal: ["Night owl"],
    professional: ["Remote"],
  },
};

describe("ClaudeTransform", () => {
  it("uses XML tags for sections", () => {
    const transform = createClaudeTransform();
    const result = transform.transform(sampleIdentity);

    expect(result.content).toContain("<user_identity>");
    expect(result.content).toContain("</user_identity>");
    expect(result.content).toContain("<communication_preferences>");
    expect(result.content).toContain("<user_expertise>");
  });

  it("includes core identity fields", () => {
    const transform = new ClaudeTransform();
    const result = transform.transform(sampleIdentity);

    expect(result.content).toContain("Name: Alex");
    expect(result.content).toContain("Role: Engineer");
    expect(result.content).toContain("Location: SF");
  });

  it("formats expertise as bullet list", () => {
    const transform = new ClaudeTransform();
    const result = transform.transform(sampleIdentity);

    expect(result.content).toContain("- TypeScript");
    expect(result.content).toContain("- React");
  });

  it("includes projects with status", () => {
    const transform = new ClaudeTransform();
    const result = transform.transform(sampleIdentity);

    expect(result.content).toContain("Arete");
    expect(result.content).toContain("AI identity layer");
  });

  it("returns estimated token count", () => {
    const transform = new ClaudeTransform();
    const result = transform.transform(sampleIdentity);

    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBe(Math.ceil(result.content.length / 4));
  });

  it("tracks included sections", () => {
    const transform = new ClaudeTransform();
    const result = transform.transform(sampleIdentity);

    expect(result.includedSections).toContain("core");
    expect(result.includedSections).toContain("communication");
    expect(result.includedSections).toContain("expertise");
  });

  it("respects section filter options", () => {
    const transform = new ClaudeTransform();
    const result = transform.transform(sampleIdentity, {
      sections: ["core", "expertise"],
    });

    expect(result.includedSections).toContain("core");
    expect(result.includedSections).toContain("expertise");
    expect(result.includedSections).not.toContain("communication");
  });

  it("has correct modelId", () => {
    const transform = new ClaudeTransform();
    expect(transform.modelId).toBe("claude");
    expect(transform.modelName).toBe("Anthropic Claude");
  });
});

describe("OpenAITransform", () => {
  it("uses markdown headers", () => {
    const transform = createOpenAITransform();
    const result = transform.transform(sampleIdentity);

    expect(result.content).toContain("## User Profile");
    expect(result.content).toContain("### Identity");
    expect(result.content).toContain("### Communication Preferences");
  });

  it("uses bold for field labels", () => {
    const transform = new OpenAITransform();
    const result = transform.transform(sampleIdentity);

    expect(result.content).toContain("**Name:** Alex");
    expect(result.content).toContain("**Role:** Engineer");
  });

  it("formats projects with bold names", () => {
    const transform = new OpenAITransform();
    const result = transform.transform(sampleIdentity);

    expect(result.content).toContain("**Arete**");
  });

  it("has correct modelId", () => {
    const transform = new OpenAITransform();
    expect(transform.modelId).toBe("openai");
    expect(transform.modelName).toBe("OpenAI GPT");
  });
});

describe("getTransform", () => {
  it("returns ClaudeTransform for 'claude'", () => {
    const transform = getTransform("claude");
    expect(transform).toBeInstanceOf(ClaudeTransform);
  });

  it("returns OpenAITransform for 'openai'", () => {
    const transform = getTransform("openai");
    expect(transform).toBeInstanceOf(OpenAITransform);
  });

  it("returns OpenAITransform for 'gpt' alias", () => {
    const transform = getTransform("gpt");
    expect(transform).toBeInstanceOf(OpenAITransform);
  });

  it("is case insensitive", () => {
    expect(getTransform("CLAUDE")).toBeInstanceOf(ClaudeTransform);
    expect(getTransform("OpenAI")).toBeInstanceOf(OpenAITransform);
  });

  it("returns null for unknown model", () => {
    expect(getTransform("unknown")).toBeNull();
  });
});

describe("listTransforms", () => {
  it("returns available transform IDs", () => {
    const transforms = listTransforms();

    expect(transforms).toContain("claude");
    expect(transforms).toContain("openai");
    expect(transforms).toContain("gpt");
  });
});

describe("empty identity handling", () => {
  it("Claude handles empty identity gracefully", () => {
    const transform = new ClaudeTransform();
    const empty = createEmptyIdentity("test");
    const result = transform.transform(empty);

    // Should not crash, may have minimal content
    expect(result.content).toBeDefined();
    expect(result.includedSections).toEqual([]);
  });

  it("OpenAI handles empty identity gracefully", () => {
    const transform = new OpenAITransform();
    const empty = createEmptyIdentity("test");
    const result = transform.transform(empty);

    expect(result.content).toBeDefined();
    expect(result.includedSections).toEqual([]);
  });
});
