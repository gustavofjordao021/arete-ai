import { describe, it, expect } from "vitest";
import {
  buildExtractionPrompt,
  buildFactExtractionPrompt,
  IDENTITY_EXTRACTION_PROMPT,
} from "./prompts.js";
import {
  extractIdentityFromText,
  mergeIdentity,
  type LLMProvider,
} from "./extractor.js";
import { createEmptyIdentity } from "../schema/identity.js";

describe("buildExtractionPrompt", () => {
  it("inserts user input into prompt template", () => {
    const result = buildExtractionPrompt("I am a developer in NYC");

    expect(result).toContain("I am a developer in NYC");
    expect(result).toContain("CORE:");
    expect(result).toContain("COMMUNICATION:");
  });

  it("preserves prompt structure", () => {
    const result = buildExtractionPrompt("test input");

    expect(result).toContain("identity extraction system");
    expect(result).toContain("Output valid JSON");
  });
});

describe("buildFactExtractionPrompt", () => {
  it("inserts user and assistant messages", () => {
    const result = buildFactExtractionPrompt(
      "I prefer TypeScript",
      "Great choice!"
    );

    expect(result).toContain("I prefer TypeScript");
    expect(result).toContain("Great choice!");
    expect(result).toContain("User:");
    expect(result).toContain("Assistant:");
  });

  it("includes fact extraction instructions", () => {
    const result = buildFactExtractionPrompt("msg1", "msg2");

    expect(result).toContain("fact extractor");
    expect(result).toContain("CONCRETE facts");
    expect(result).toContain("JSON array");
  });
});

describe("extractIdentityFromText", () => {
  it("extracts identity from valid LLM response", async () => {
    const mockProvider: LLMProvider = {
      complete: async () =>
        JSON.stringify({
          core: {
            name: "Alex",
            role: "Developer",
            location: "San Francisco",
          },
          communication: {
            style: ["direct"],
          },
          expertise: ["TypeScript", "React"],
        }),
    };

    const result = await extractIdentityFromText(
      "I'm Alex, a developer in SF",
      mockProvider,
      "test-device"
    );

    expect(result.success).toBe(true);
    expect(result.identity.core.name).toBe("Alex");
    expect(result.identity.core.role).toBe("Developer");
    expect(result.identity.expertise).toContain("TypeScript");
  });

  it("handles JSON embedded in text response", async () => {
    const mockProvider: LLMProvider = {
      complete: async () =>
        `Here's the extracted identity:

        {
          "core": { "name": "Test User" },
          "expertise": ["JavaScript"]
        }

        Let me know if you need changes.`,
    };

    const result = await extractIdentityFromText(
      "test input",
      mockProvider,
      "device"
    );

    expect(result.success).toBe(true);
    expect(result.identity.core.name).toBe("Test User");
  });

  it("returns empty identity on error", async () => {
    const mockProvider: LLMProvider = {
      complete: async () => {
        throw new Error("API error");
      },
    };

    const result = await extractIdentityFromText("test", mockProvider, "device");

    expect(result.success).toBe(false);
    expect(result.error).toBe("API error");
    expect(result.identity.meta.deviceId).toBe("device");
  });

  it("returns error when no JSON in response", async () => {
    const mockProvider: LLMProvider = {
      complete: async () => "No JSON here, just plain text response",
    };

    const result = await extractIdentityFromText("test", mockProvider, "device");

    expect(result.success).toBe(false);
    expect(result.error).toContain("No JSON found");
  });

  it("sets source metadata", async () => {
    const mockProvider: LLMProvider = {
      complete: async () => JSON.stringify({ core: { name: "Test" } }),
    };

    const result = await extractIdentityFromText("test", mockProvider, "device");

    expect(result.identity.sources.length).toBe(1);
    expect(result.identity.sources[0].source).toBe("user_input");
    expect(result.identity.sources[0].confidence).toBe("high");
  });
});

describe("mergeIdentity", () => {
  it("merges core fields", () => {
    const existing = createEmptyIdentity("device");
    existing.core.name = "Old Name";

    const extracted = {
      core: { name: "New Name", role: "Developer" },
    };

    const merged = mergeIdentity(existing, extracted);

    expect(merged.core.name).toBe("New Name");
    expect(merged.core.role).toBe("Developer");
  });

  it("preserves existing values when not overwritten", () => {
    const existing = createEmptyIdentity("device");
    existing.core.name = "Keep This";
    existing.core.location = "NYC";

    const extracted = {
      core: { role: "Engineer" },
    };

    const merged = mergeIdentity(existing, extracted);

    expect(merged.core.name).toBe("Keep This");
    expect(merged.core.location).toBe("NYC");
    expect(merged.core.role).toBe("Engineer");
  });

  it("merges arrays with deduplication", () => {
    const existing = createEmptyIdentity("device");
    existing.expertise = ["TypeScript", "React"];

    const extracted = {
      expertise: ["React", "Node.js"],
    };

    const merged = mergeIdentity(existing, extracted);

    expect(merged.expertise).toHaveLength(3);
    expect(merged.expertise).toContain("TypeScript");
    expect(merged.expertise).toContain("React");
    expect(merged.expertise).toContain("Node.js");
  });

  it("appends projects without deduplication", () => {
    const existing = createEmptyIdentity("device");
    existing.currentFocus.projects = [
      { name: "Project A", description: "First", status: "active" },
    ];

    const extracted = {
      currentFocus: {
        projects: [{ name: "Project B", description: "Second", status: "active" as const }],
        goals: [],
      },
    };

    const merged = mergeIdentity(existing, extracted);

    expect(merged.currentFocus.projects).toHaveLength(2);
    expect(merged.currentFocus.projects[0].name).toBe("Project A");
    expect(merged.currentFocus.projects[1].name).toBe("Project B");
  });

  it("updates lastModified timestamp", () => {
    const existing = createEmptyIdentity("device");
    // Set an old timestamp
    existing.meta.lastModified = "2020-01-01T00:00:00.000Z";

    const merged = mergeIdentity(existing, {});

    expect(merged.meta.lastModified).not.toBe("2020-01-01T00:00:00.000Z");
    expect(new Date(merged.meta.lastModified).getFullYear()).toBeGreaterThan(2020);
  });

  it("preserves deviceId", () => {
    const existing = createEmptyIdentity("my-device");

    const merged = mergeIdentity(existing, { core: { name: "New" } });

    expect(merged.meta.deviceId).toBe("my-device");
  });

  it("preserves privacy settings", () => {
    const existing = createEmptyIdentity("device");
    existing.privacy.private = ["secret"];

    const merged = mergeIdentity(existing, {});

    expect(merged.privacy.private).toContain("secret");
  });

  it("merges communication arrays", () => {
    const existing = createEmptyIdentity("device");
    existing.communication.style = ["direct"];
    existing.communication.avoid = ["fluff"];

    const extracted = {
      communication: {
        style: ["concise"],
        format: ["markdown"],
        avoid: [],
      },
    };

    const merged = mergeIdentity(existing, extracted);

    expect(merged.communication.style).toContain("direct");
    expect(merged.communication.style).toContain("concise");
    expect(merged.communication.avoid).toContain("fluff");
    expect(merged.communication.format).toContain("markdown");
  });

  it("appends sources", () => {
    const existing = createEmptyIdentity("device");
    existing.sources = [
      { field: "core", source: "user_input", confidence: "high", timestamp: "t1" },
    ];

    const extracted = {
      sources: [
        { field: "expertise", source: "conversation" as const, confidence: "medium" as const, timestamp: "t2" },
      ],
    };

    const merged = mergeIdentity(existing, extracted);

    expect(merged.sources).toHaveLength(2);
  });
});
