/**
 * OpenIdentity v1.0 Import/Export Tests - TDD RED PHASE
 */

import { describe, it, expect } from "vitest";
import {
  exportToOpenIdentity,
  importFromOpenIdentity,
  OpenIdentityV1Schema,
  type OpenIdentityV1,
} from "./openidentity.js";
import {
  createIdentityFact,
  createEmptyIdentityV2,
  type IdentityV2,
  type Visibility,
} from "../schema/identity-v2.js";

// Test helpers
function createTestIdentityV2(): IdentityV2 {
  const identity = createEmptyIdentityV2("test-device");
  identity.core = { name: "Alex", role: "Engineer" };
  identity.facts = [
    createIdentityFact({ category: "expertise", content: "TypeScript", visibility: "public" }),
    createIdentityFact({ category: "expertise", content: "React", visibility: "trusted" }),
    createIdentityFact({ category: "context", content: "Works at startup", visibility: "trusted" }),
    createIdentityFact({ category: "preference", content: "Salary info", visibility: "local" }),
  ];
  return identity;
}

function createIdentityWithCandidates(): IdentityV2 {
  const identity = createEmptyIdentityV2("test-device");
  identity.facts = [
    createIdentityFact({ category: "expertise", content: "Proven skill", visibility: "public" }),
    {
      ...createIdentityFact({ category: "expertise", content: "Candidate skill", visibility: "public" }),
      maturity: "candidate",
      validationCount: 0,
      confidence: 0.5,
    },
  ];
  return identity;
}

function createTestOpenIdentity(): OpenIdentityV1 {
  return {
    $schema: "https://openidentity.org/schema/v1.0.json",
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    sourceApp: "test",
    identity: { name: "Imported User", role: "Developer" },
    facts: [
      {
        id: "imported-1",
        category: "expertise",
        content: "Python",
        confidence: 0.9,
        maturity: "established",
        visibility: "public",
        source: "manual",
        createdAt: new Date().toISOString(),
      },
    ],
    export: {
      visibility: "public",
      factsIncluded: 1,
      factsExcluded: 0,
    },
  };
}

// ============================================================================
// EXPORT TESTS
// ============================================================================

describe("exportToOpenIdentity", () => {
  it("exports v2 identity to OpenIdentity format", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity);

    expect(exported.$schema).toBe("https://openidentity.org/schema/v1.0.json");
    expect(exported.version).toBe("1.0.0");
    expect(exported.sourceApp).toBe("arete");
    expect(exported.exportedAt).toBeDefined();
  });

  it("includes core identity", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity);

    expect(exported.identity.name).toBe("Alex");
    expect(exported.identity.role).toBe("Engineer");
  });

  it("filters facts by visibility tier - public only", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity, { visibility: "public" });

    expect(exported.facts.every(f => f.visibility === "public")).toBe(true);
    expect(exported.facts).toHaveLength(1);
    expect(exported.facts[0].content).toBe("TypeScript");
    expect(exported.export.visibility).toBe("public");
  });

  it("filters facts by visibility tier - trusted includes public", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity, { visibility: "trusted" });

    expect(exported.facts.some(f => f.visibility === "public")).toBe(true);
    expect(exported.facts.some(f => f.visibility === "trusted")).toBe(true);
    expect(exported.facts.every(f => f.visibility !== "local")).toBe(true);
    expect(exported.facts).toHaveLength(3);
  });

  it("includes local facts when visibility=local", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity, { visibility: "local" });

    expect(exported.facts).toHaveLength(4);
    expect(exported.facts.some(f => f.visibility === "local")).toBe(true);
  });

  it("excludes candidates by default", () => {
    const identity = createIdentityWithCandidates();
    const exported = exportToOpenIdentity(identity);

    expect(exported.facts.every(f => f.maturity !== "candidate")).toBe(true);
    expect(exported.facts).toHaveLength(1);
  });

  it("includes candidates when includeCandidates=true", () => {
    const identity = createIdentityWithCandidates();
    const exported = exportToOpenIdentity(identity, { includeCandidates: true });

    expect(exported.facts.some(f => f.maturity === "candidate")).toBe(true);
    expect(exported.facts).toHaveLength(2);
  });

  it("tracks factsIncluded and factsExcluded", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity, { visibility: "public" });

    expect(exported.export.factsIncluded).toBe(1);
    expect(exported.export.factsExcluded).toBe(3);
  });

  it("defaults to trusted visibility", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity);

    expect(exported.export.visibility).toBe("trusted");
  });

  it("produces valid OpenIdentityV1 schema", () => {
    const identity = createTestIdentityV2();
    const exported = exportToOpenIdentity(identity);

    const result = OpenIdentityV1Schema.safeParse(exported);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// IMPORT TESTS
// ============================================================================

describe("importFromOpenIdentity", () => {
  it("imports OpenIdentity file to v2 format", () => {
    const oi = createTestOpenIdentity();
    const result = importFromOpenIdentity(oi);

    expect(result.success).toBe(true);
    expect(result.identity?.version).toBe("2.0.0");
  });

  it("preserves core identity fields", () => {
    const oi = createTestOpenIdentity();
    const result = importFromOpenIdentity(oi);

    expect(result.identity?.core.name).toBe("Imported User");
    expect(result.identity?.core.role).toBe("Developer");
  });

  it("converts OpenIdentityFacts to IdentityFacts", () => {
    const oi = createTestOpenIdentity();
    const result = importFromOpenIdentity(oi);

    expect(result.identity?.facts).toHaveLength(1);
    expect(result.identity?.facts[0].content).toBe("Python");
  });

  it("sets source to imported", () => {
    const oi = createTestOpenIdentity();
    const result = importFromOpenIdentity(oi);

    expect(result.identity?.facts.every(f => f.source === "imported")).toBe(true);
  });

  it("generates new UUIDs for imported facts", () => {
    const oi = createTestOpenIdentity();
    const result = importFromOpenIdentity(oi);

    // New ID should be different from original
    expect(result.identity?.facts[0].id).not.toBe("imported-1");
    // But should be a valid UUID format
    expect(result.identity?.facts[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("preserves visibility tiers", () => {
    const oi = createTestOpenIdentity();
    const result = importFromOpenIdentity(oi);

    expect(result.identity?.facts[0].visibility).toBe("public");
  });

  it("preserves confidence and maturity", () => {
    const oi = createTestOpenIdentity();
    const result = importFromOpenIdentity(oi);

    expect(result.identity?.facts[0].confidence).toBe(0.9);
    expect(result.identity?.facts[0].maturity).toBe("established");
  });

  it("returns error for invalid input", () => {
    const invalid = { invalid: "data" };
    const result = importFromOpenIdentity(invalid as unknown as OpenIdentityV1);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("handles empty facts array", () => {
    const oi: OpenIdentityV1 = {
      ...createTestOpenIdentity(),
      facts: [],
      export: { visibility: "public", factsIncluded: 0, factsExcluded: 0 },
    };
    const result = importFromOpenIdentity(oi);

    expect(result.success).toBe(true);
    expect(result.identity?.facts).toEqual([]);
  });
});

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

describe("OpenIdentityV1Schema", () => {
  it("validates correct OpenIdentity structure", () => {
    const oi = createTestOpenIdentity();
    const result = OpenIdentityV1Schema.safeParse(oi);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const invalid = {
      version: "1.0.0",
      // missing: $schema, exportedAt, sourceApp, identity, facts, export
    };
    const result = OpenIdentityV1Schema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("validates fact structure", () => {
    const oiWithInvalidFact = {
      ...createTestOpenIdentity(),
      facts: [{ invalid: "fact" }],
    };
    const result = OpenIdentityV1Schema.safeParse(oiWithInvalidFact);
    expect(result.success).toBe(false);
  });
});
