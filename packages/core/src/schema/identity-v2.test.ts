/**
 * Tests for Identity v2 schema with confidence, maturity, and decay
 *
 * RED-GREEN-REFACTOR: These tests are written first (RED phase)
 */

import { describe, it, expect } from "vitest";
import {
  IdentityFactSchema,
  IdentityV2Schema,
  createIdentityFact,
  createEmptyIdentityV2,
  migrateV1ToV2,
  getEffectiveConfidence,
  validateFact,
  isIdentityV2,
  filterFactsByVisibility,
  type IdentityFact,
  type IdentityV2,
  type Visibility,
} from "./identity-v2.js";
import type { AreteIdentity } from "./identity.js";

describe("IdentityFact Schema", () => {
  it("validates a complete fact", () => {
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 0.8,
      lastValidated: new Date().toISOString(),
      validationCount: 2,
      maturity: "established",
      visibility: "trusted",
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = IdentityFactSchema.safeParse(fact);
    expect(result.success).toBe(true);
  });

  it("requires mandatory fields", () => {
    const incompleteFact = {
      id: "fact-123",
      category: "expertise",
      // missing: content, confidence, lastValidated, etc.
    };

    const result = IdentityFactSchema.safeParse(incompleteFact);
    expect(result.success).toBe(false);
  });

  it("validates category enum", () => {
    const validCategories = ["core", "expertise", "preference", "context", "focus"];

    for (const category of validCategories) {
      const fact = {
        id: "fact-123",
        category,
        content: "test",
        confidence: 0.5,
        lastValidated: new Date().toISOString(),
        validationCount: 0,
        maturity: "candidate",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(IdentityFactSchema.safeParse(fact).success).toBe(true);
    }

    const invalidFact = {
      id: "fact-123",
      category: "invalid_category",
      content: "test",
      confidence: 0.5,
      lastValidated: new Date().toISOString(),
      validationCount: 0,
      maturity: "candidate",
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(IdentityFactSchema.safeParse(invalidFact).success).toBe(false);
  });

  it("validates maturity enum", () => {
    const validMaturities = ["candidate", "established", "proven"];

    for (const maturity of validMaturities) {
      const fact = {
        id: "fact-123",
        category: "expertise",
        content: "test",
        confidence: 0.5,
        lastValidated: new Date().toISOString(),
        validationCount: 0,
        maturity,
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(IdentityFactSchema.safeParse(fact).success).toBe(true);
    }
  });

  it("validates confidence range (0-1)", () => {
    const baseFact = {
      id: "fact-123",
      category: "expertise",
      content: "test",
      lastValidated: new Date().toISOString(),
      validationCount: 0,
      maturity: "candidate",
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Valid: 0, 0.5, 1
    expect(IdentityFactSchema.safeParse({ ...baseFact, confidence: 0 }).success).toBe(true);
    expect(IdentityFactSchema.safeParse({ ...baseFact, confidence: 0.5 }).success).toBe(true);
    expect(IdentityFactSchema.safeParse({ ...baseFact, confidence: 1 }).success).toBe(true);

    // Invalid: negative, > 1
    expect(IdentityFactSchema.safeParse({ ...baseFact, confidence: -0.1 }).success).toBe(false);
    expect(IdentityFactSchema.safeParse({ ...baseFact, confidence: 1.1 }).success).toBe(false);
  });

  it("allows optional sourceRef", () => {
    const factWithRef = {
      id: "fact-123",
      category: "expertise",
      content: "test",
      confidence: 0.5,
      lastValidated: new Date().toISOString(),
      validationCount: 0,
      maturity: "candidate",
      source: "inferred",
      sourceRef: "browsing:supabase.com:47",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(IdentityFactSchema.safeParse(factWithRef).success).toBe(true);
  });
});

describe("createIdentityFact", () => {
  it("creates fact with defaults", () => {
    const fact = createIdentityFact({
      category: "expertise",
      content: "TypeScript",
    });

    expect(fact.id).toBeDefined();
    expect(fact.category).toBe("expertise");
    expect(fact.content).toBe("TypeScript");
    expect(fact.confidence).toBe(1.0); // Manual entry = high confidence
    expect(fact.maturity).toBe("established"); // Manual entry = established
    expect(fact.source).toBe("manual");
    expect(fact.validationCount).toBe(1);
    expect(fact.createdAt).toBeDefined();
    expect(fact.updatedAt).toBeDefined();
    expect(fact.lastValidated).toBeDefined();
  });

  it("creates candidate fact from inference", () => {
    const fact = createIdentityFact({
      category: "expertise",
      content: "Supabase",
      source: "inferred",
      confidence: 0.6,
      sourceRef: "browsing:supabase.com:47",
    });

    expect(fact.maturity).toBe("candidate");
    expect(fact.confidence).toBe(0.6);
    expect(fact.source).toBe("inferred");
    expect(fact.sourceRef).toBe("browsing:supabase.com:47");
    expect(fact.validationCount).toBe(0);
  });
});

describe("IdentityV2 Schema", () => {
  it("validates complete v2 identity", () => {
    const identity: IdentityV2 = {
      version: "2.0.0",
      deviceId: "device-123",
      facts: [],
      core: { name: "Test User", role: "Engineer" },
      settings: {
        decayHalfLifeDays: 60,
        autoInfer: false,
        excludedDomains: [],
        autoPromote: true,
        useHaikuClassification: true,
      },
    };

    const result = IdentityV2Schema.safeParse(identity);
    expect(result.success).toBe(true);
  });

  it("requires version 2.0.0", () => {
    const identity = {
      version: "1.0.0", // Wrong version
      deviceId: "device-123",
      facts: [],
      core: {},
      settings: {
        decayHalfLifeDays: 60,
        autoInfer: false,
        excludedDomains: [],
        autoPromote: true,
        useHaikuClassification: true,
      },
    };

    const result = IdentityV2Schema.safeParse(identity);
    expect(result.success).toBe(false);
  });

  it("allows optional userId", () => {
    const identity = {
      version: "2.0.0",
      deviceId: "device-123",
      userId: "user-456",
      facts: [],
      core: {},
      settings: {
        decayHalfLifeDays: 60,
        autoInfer: false,
        excludedDomains: [],
        autoPromote: true,
        useHaikuClassification: true,
      },
    };

    const result = IdentityV2Schema.safeParse(identity);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe("user-456");
    }
  });
});

describe("createEmptyIdentityV2", () => {
  it("creates empty identity with defaults", () => {
    const identity = createEmptyIdentityV2("device-123");

    expect(identity.version).toBe("2.0.0");
    expect(identity.deviceId).toBe("device-123");
    expect(identity.facts).toEqual([]);
    expect(identity.core).toEqual({});
    expect(identity.settings.decayHalfLifeDays).toBe(60);
    expect(identity.settings.autoInfer).toBe(false);
    expect(identity.settings.excludedDomains).toEqual([]);
  });
});

describe("isIdentityV2", () => {
  it("returns true for v2 identity", () => {
    const v2 = createEmptyIdentityV2("device-123");
    expect(isIdentityV2(v2)).toBe(true);
  });

  it("returns false for v1 identity", () => {
    const v1: AreteIdentity = {
      meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "device" },
      core: {},
      communication: { style: [], format: [], avoid: [] },
      expertise: [],
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };
    expect(isIdentityV2(v1)).toBe(false);
  });
});

describe("migrateV1ToV2", () => {
  const createV1Identity = (): AreteIdentity => ({
    meta: {
      version: "1.0.0",
      lastModified: "2025-01-15T10:00:00Z",
      deviceId: "device-123",
    },
    core: {
      name: "Test User",
      role: "Senior Engineer",
      location: "San Francisco",
      background: "10 years in tech",
    },
    communication: {
      style: ["concise", "technical"],
      format: ["markdown"],
      avoid: ["jargon", "emojis"],
    },
    expertise: ["TypeScript", "React", "Node.js"],
    currentFocus: {
      projects: [
        { name: "Arete", description: "AI identity", status: "active" },
      ],
      goals: ["Ship v2", "Get users"],
    },
    context: {
      personal: ["Has a dog named Max"],
      professional: ["Works at startup"],
    },
    privacy: {
      public: ["name", "role"],
      private: ["location"],
      localOnly: ["salary"],
    },
    custom: { timezone: "PST" },
    sources: [],
  });

  it("converts expertise array to facts", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    const expertiseFacts = v2.facts.filter(f => f.category === "expertise");
    expect(expertiseFacts).toHaveLength(3);
    expect(expertiseFacts.map(f => f.content)).toContain("TypeScript");
    expect(expertiseFacts.map(f => f.content)).toContain("React");
    expect(expertiseFacts.map(f => f.content)).toContain("Node.js");

    // Migrated facts should be proven (existing = trusted)
    for (const fact of expertiseFacts) {
      expect(fact.maturity).toBe("proven");
      expect(fact.confidence).toBe(1.0);
      expect(fact.source).toBe("manual");
    }
  });

  it("converts communication styles to preference facts", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    const preferenceFacts = v2.facts.filter(f => f.category === "preference");

    // Styles: concise, technical
    // Avoid: jargon, emojis
    expect(preferenceFacts.some(f => f.content.includes("concise"))).toBe(true);
    expect(preferenceFacts.some(f => f.content.includes("jargon"))).toBe(true);
  });

  it("converts currentFocus projects to focus facts", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    const focusFacts = v2.facts.filter(f => f.category === "focus");
    expect(focusFacts.some(f => f.content.includes("Arete"))).toBe(true);
  });

  it("converts currentFocus goals to focus facts", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    const focusFacts = v2.facts.filter(f => f.category === "focus");
    expect(focusFacts.some(f => f.content.includes("Ship v2"))).toBe(true);
  });

  it("converts context items to context facts", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    const contextFacts = v2.facts.filter(f => f.category === "context");
    expect(contextFacts.some(f => f.content.includes("dog"))).toBe(true);
    expect(contextFacts.some(f => f.content.includes("startup"))).toBe(true);
  });

  it("preserves core fields", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    expect(v2.core.name).toBe("Test User");
    expect(v2.core.role).toBe("Senior Engineer");
  });

  it("preserves deviceId", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    expect(v2.deviceId).toBe("device-123");
  });

  it("sets version to 2.0.0", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    expect(v2.version).toBe("2.0.0");
  });

  it("handles empty v1 identity", () => {
    const v1: AreteIdentity = {
      meta: { version: "1.0.0", lastModified: new Date().toISOString(), deviceId: "device" },
      core: {},
      communication: { style: [], format: [], avoid: [] },
      expertise: [],
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    const v2 = migrateV1ToV2(v1);

    expect(v2.version).toBe("2.0.0");
    expect(v2.facts).toEqual([]);
    expect(v2.core).toEqual({});
  });

  it("generates unique IDs for each fact", () => {
    const v1 = createV1Identity();
    const v2 = migrateV1ToV2(v1);

    const ids = v2.facts.map(f => f.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("getEffectiveConfidence", () => {
  it("returns full confidence for recently validated fact", () => {
    const fact = createIdentityFact({
      category: "expertise",
      content: "TypeScript",
    });

    const effective = getEffectiveConfidence(fact);
    expect(effective).toBeCloseTo(1.0, 1);
  });

  it("halves confidence after half-life period (60 days)", () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 1.0,
      lastValidated: sixtyDaysAgo.toISOString(),
      validationCount: 1,
      maturity: "established",
      visibility: "trusted",
      source: "manual",
      createdAt: sixtyDaysAgo.toISOString(),
      updatedAt: sixtyDaysAgo.toISOString(),
    };

    const effective = getEffectiveConfidence(fact);
    expect(effective).toBeCloseTo(0.5, 1);
  });

  it("quarters confidence after two half-life periods (120 days)", () => {
    const oneHundredTwentyDaysAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 1.0,
      lastValidated: oneHundredTwentyDaysAgo.toISOString(),
      validationCount: 1,
      maturity: "established",
      visibility: "trusted",
      source: "manual",
      createdAt: oneHundredTwentyDaysAgo.toISOString(),
      updatedAt: oneHundredTwentyDaysAgo.toISOString(),
    };

    const effective = getEffectiveConfidence(fact);
    expect(effective).toBeCloseTo(0.25, 1);
  });

  it("respects custom half-life", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 1.0,
      lastValidated: thirtyDaysAgo.toISOString(),
      validationCount: 1,
      maturity: "established",
      visibility: "trusted",
      source: "manual",
      createdAt: thirtyDaysAgo.toISOString(),
      updatedAt: thirtyDaysAgo.toISOString(),
    };

    // With 30-day half-life, 30 days = 50% decay
    const effective = getEffectiveConfidence(fact, 30);
    expect(effective).toBeCloseTo(0.5, 1);
  });

  it("applies decay to base confidence", () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 0.8, // Start at 80%
      lastValidated: sixtyDaysAgo.toISOString(),
      validationCount: 1,
      maturity: "established",
      visibility: "trusted",
      source: "manual",
      createdAt: sixtyDaysAgo.toISOString(),
      updatedAt: sixtyDaysAgo.toISOString(),
    };

    // 0.8 × 0.5 = 0.4
    const effective = getEffectiveConfidence(fact);
    expect(effective).toBeCloseTo(0.4, 1);
  });
});

describe("validateFact", () => {
  it("increases validationCount", () => {
    const fact = createIdentityFact({
      category: "expertise",
      content: "TypeScript",
      source: "inferred",
      confidence: 0.5,
    });
    expect(fact.validationCount).toBe(0);

    const validated = validateFact(fact);
    expect(validated.validationCount).toBe(1);
  });

  it("boosts confidence by 0.2", () => {
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 0.5,
      lastValidated: new Date().toISOString(),
      validationCount: 0,
      maturity: "candidate",
      visibility: "trusted",
      source: "inferred",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validated = validateFact(fact);
    expect(validated.confidence).toBe(0.7);
  });

  it("caps confidence at 1.0", () => {
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 0.9,
      lastValidated: new Date().toISOString(),
      validationCount: 1,
      maturity: "established",
      visibility: "trusted",
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validated = validateFact(fact);
    expect(validated.confidence).toBe(1.0);
  });

  it("updates lastValidated to now", () => {
    const oldDate = new Date(Date.now() - 1000).toISOString();
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 0.8,
      lastValidated: oldDate,
      validationCount: 1,
      maturity: "established",
      visibility: "trusted",
      source: "manual",
      createdAt: oldDate,
      updatedAt: oldDate,
    };

    const validated = validateFact(fact);
    expect(new Date(validated.lastValidated).getTime()).toBeGreaterThan(
      new Date(oldDate).getTime()
    );
  });

  it("promotes candidate to established after 2 validations", () => {
    let fact = createIdentityFact({
      category: "expertise",
      content: "TypeScript",
      source: "inferred",
      confidence: 0.5,
    });
    expect(fact.maturity).toBe("candidate");

    fact = validateFact(fact);
    expect(fact.maturity).toBe("candidate"); // Still candidate after 1

    fact = validateFact(fact);
    expect(fact.maturity).toBe("established"); // Promoted after 2
  });

  it("promotes established to proven after 5 validations", () => {
    let fact = createIdentityFact({
      category: "expertise",
      content: "TypeScript",
      source: "inferred",
      confidence: 0.5,
    });

    for (let i = 0; i < 5; i++) {
      fact = validateFact(fact);
    }

    expect(fact.maturity).toBe("proven");
    expect(fact.validationCount).toBe(5);
  });

  it("does not demote proven facts", () => {
    const fact: IdentityFact = {
      id: "fact-123",
      category: "expertise",
      content: "TypeScript",
      confidence: 1.0,
      lastValidated: new Date().toISOString(),
      validationCount: 10,
      maturity: "proven",
      visibility: "trusted",
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validated = validateFact(fact);
    expect(validated.maturity).toBe("proven");
  });
});

// ============================================================================
// VISIBILITY (PRIVACY TIERS) TESTS - TDD RED PHASE
// ============================================================================

describe("IdentityFact visibility", () => {
  const baseFact = {
    id: "fact-123",
    category: "expertise" as const,
    content: "TypeScript",
    confidence: 0.8,
    lastValidated: new Date().toISOString(),
    validationCount: 1,
    maturity: "established" as const,
    source: "manual" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("accepts valid visibility values", () => {
    const validVisibilities = ["public", "trusted", "local"];

    for (const visibility of validVisibilities) {
      const fact = { ...baseFact, visibility };
      expect(IdentityFactSchema.safeParse(fact).success).toBe(true);
    }
  });

  it("rejects invalid visibility values", () => {
    const fact = { ...baseFact, visibility: "invalid" };
    expect(IdentityFactSchema.safeParse(fact).success).toBe(false);
  });

  it("defaults visibility to trusted when not provided", () => {
    // Fact without visibility should still parse (with default)
    const result = IdentityFactSchema.safeParse(baseFact);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe("trusted");
    }
  });
});

describe("createIdentityFact visibility", () => {
  it("defaults visibility to trusted", () => {
    const fact = createIdentityFact({
      category: "expertise",
      content: "TypeScript",
    });
    expect(fact.visibility).toBe("trusted");
  });

  it("allows explicit visibility override to public", () => {
    const fact = createIdentityFact({
      category: "core",
      content: "Name is Alex",
      visibility: "public",
    });
    expect(fact.visibility).toBe("public");
  });

  it("allows explicit visibility override to local", () => {
    const fact = createIdentityFact({
      category: "context",
      content: "Salary information",
      visibility: "local",
    });
    expect(fact.visibility).toBe("local");
  });
});

describe("filterFactsByVisibility", () => {
  const createFactWithVisibility = (content: string, visibility: Visibility) =>
    createIdentityFact({ category: "expertise", content, visibility });

  const createTestFacts = () => [
    createFactWithVisibility("public fact", "public"),
    createFactWithVisibility("trusted fact", "trusted"),
    createFactWithVisibility("local fact", "local"),
  ];

  it("returns only public facts for public filter", () => {
    const testFacts = createTestFacts();
    const filtered = filterFactsByVisibility(testFacts, "public");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("public fact");
  });

  it("returns public + trusted facts for trusted filter", () => {
    const testFacts = createTestFacts();
    const filtered = filterFactsByVisibility(testFacts, "trusted");
    expect(filtered).toHaveLength(2);
    expect(filtered.map(f => f.content)).toContain("public fact");
    expect(filtered.map(f => f.content)).toContain("trusted fact");
    expect(filtered.map(f => f.content)).not.toContain("local fact");
  });

  it("returns all facts for local filter", () => {
    const testFacts = createTestFacts();
    const filtered = filterFactsByVisibility(testFacts, "local");
    expect(filtered).toHaveLength(3);
  });

  it("handles empty facts array", () => {
    const filtered = filterFactsByVisibility([], "public");
    expect(filtered).toEqual([]);
  });

  it("handles facts without explicit visibility (defaults to trusted)", () => {
    const factWithoutVisibility = createIdentityFact({
      category: "expertise",
      content: "no visibility set",
    });
    // Should be included in trusted filter (default visibility)
    const filtered = filterFactsByVisibility([factWithoutVisibility], "trusted");
    expect(filtered).toHaveLength(1);
  });
});
