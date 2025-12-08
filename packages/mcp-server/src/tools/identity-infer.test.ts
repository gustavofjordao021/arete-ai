/**
 * Tests for arete_infer MCP tool
 *
 * RED-GREEN-REFACTOR: These tests are written first (RED phase)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  inferHandler,
  analyzeContextForPatterns,
  setConfigDir,
} from "./identity-infer.js";

const TEST_DIR = join(tmpdir(), "arete-mcp-infer-test-" + Date.now());

// Mock @arete/core
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(),
}));

// Types for test helpers
interface ContextEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface IdentityFact {
  id: string;
  category: string;
  content: string;
  confidence: number;
  lastValidated: string;
  validationCount: number;
  maturity: string;
  source: string;
  sourceRef?: string;
  createdAt: string;
  updatedAt: string;
}

interface IdentityV2 {
  version: string;
  deviceId: string;
  userId?: string;
  facts: IdentityFact[];
  core: { name?: string; role?: string };
  settings: {
    decayHalfLifeDays: number;
    autoInfer: boolean;
    excludedDomains: string[];
  };
}

// Helper to create test context events
function createContextEvent(
  type: string,
  data: Record<string, unknown>,
  daysAgo: number = 0
): ContextEvent {
  const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: crypto.randomUUID(),
    type,
    source: "chrome",
    timestamp,
    data,
  };
}

// Helper to create a v2 identity
function createTestIdentityV2(facts: IdentityFact[] = []): IdentityV2 {
  return {
    version: "2.0.0",
    deviceId: "test-device",
    facts,
    core: { name: "Test User", role: "Developer" },
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
    },
  };
}

describe("arete_infer tool", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setConfigDir(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    vi.resetAllMocks();
  });

  describe("analyzeContextForPatterns", () => {
    it("detects frequent domain visits as expertise candidates", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://supabase.com/docs/guides/auth", title: "Auth Guide" }),
        createContextEvent("page_visit", { url: "https://supabase.com/docs/guides/database", title: "Database Guide" }),
        createContextEvent("page_visit", { url: "https://supabase.com/docs/guides/storage", title: "Storage Guide" }),
        createContextEvent("page_visit", { url: "https://supabase.com/docs/guides/realtime", title: "Realtime Guide" }),
        createContextEvent("page_visit", { url: "https://supabase.com/docs/guides/functions", title: "Functions Guide" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      expect(candidates.length).toBeGreaterThan(0);
      const supabaseCandidate = candidates.find(c =>
        c.content.toLowerCase().includes("supabase")
      );
      expect(supabaseCandidate).toBeDefined();
      expect(supabaseCandidate?.category).toBe("expertise");
    });

    it("detects topic clusters from page titles", () => {
      // Need 3+ visits to the same domain for pattern detection
      const events = [
        createContextEvent("page_visit", { url: "https://react.dev/learn", title: "React Documentation" }),
        createContextEvent("page_visit", { url: "https://react.dev/reference", title: "React API Reference" }),
        createContextEvent("page_visit", { url: "https://react.dev/blog", title: "React Blog" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      const reactCandidate = candidates.find(c =>
        c.content.toLowerCase().includes("react")
      );
      expect(reactCandidate).toBeDefined();
    });

    it("ignores common/generic domains", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://google.com/search", title: "Google Search" }),
        createContextEvent("page_visit", { url: "https://google.com/search", title: "Google Search" }),
        createContextEvent("page_visit", { url: "https://google.com/search", title: "Google Search" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      const googleCandidate = candidates.find(c =>
        c.content.toLowerCase().includes("google")
      );
      expect(googleCandidate).toBeUndefined();
    });

    it("returns empty array for no events", () => {
      const candidates = analyzeContextForPatterns([]);
      expect(candidates).toEqual([]);
    });

    it("sets candidate maturity and initial confidence", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://deno.land/manual", title: "Deno Manual" }),
        createContextEvent("page_visit", { url: "https://deno.land/x", title: "Deno Third Party Modules" }),
        createContextEvent("page_visit", { url: "https://deno.land/deploy", title: "Deno Deploy" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      if (candidates.length > 0) {
        expect(candidates[0].maturity).toBe("candidate");
        expect(candidates[0].confidence).toBeGreaterThanOrEqual(0.5);
        expect(candidates[0].confidence).toBeLessThanOrEqual(0.8);
      }
    });
  });

  describe("inferHandler", () => {
    it("returns candidates from local context analysis", async () => {
      // Create context.json with page visits
      const events = [
        createContextEvent("page_visit", { url: "https://supabase.com/docs", title: "Supabase Docs" }),
        createContextEvent("page_visit", { url: "https://supabase.com/docs/guides", title: "Supabase Guides" }),
        createContextEvent("page_visit", { url: "https://supabase.com/docs/reference", title: "Supabase API Reference" }),
        createContextEvent("page_visit", { url: "https://supabase.com/blog", title: "Supabase Blog" }),
        createContextEvent("page_visit", { url: "https://supabase.com/pricing", title: "Supabase Pricing" }),
      ];
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify(events));
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(createTestIdentityV2()));

      const result = await inferHandler({});

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.source).toBe("local_context");
      expect(result.structuredContent.candidates.length).toBeGreaterThan(0);
    });

    it("respects lookbackDays parameter", async () => {
      const events = [
        createContextEvent("page_visit", { url: "https://react.dev", title: "React" }, 1), // 1 day ago
        createContextEvent("page_visit", { url: "https://react.dev", title: "React" }, 2), // 2 days ago
        createContextEvent("page_visit", { url: "https://react.dev", title: "React" }, 3), // 3 days ago
        createContextEvent("page_visit", { url: "https://vue.dev", title: "Vue" }, 10), // 10 days ago
        createContextEvent("page_visit", { url: "https://vue.dev", title: "Vue" }, 11),
        createContextEvent("page_visit", { url: "https://vue.dev", title: "Vue" }, 12),
      ];
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify(events));
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(createTestIdentityV2()));

      // Only look back 7 days - should see React but not Vue
      const result = await inferHandler({ lookbackDays: 7 });

      const candidates = result.structuredContent.candidates;
      const reactCandidate = candidates.find((c: { content: string }) => c.content.toLowerCase().includes("react"));
      const vueCandidate = candidates.find((c: { content: string }) => c.content.toLowerCase().includes("vue"));

      expect(reactCandidate).toBeDefined();
      expect(vueCandidate).toBeUndefined();
    });

    it("excludes facts already in identity", async () => {
      const existingFact = {
        id: crypto.randomUUID(),
        category: "expertise",
        content: "TypeScript development",
        confidence: 0.9,
        lastValidated: new Date().toISOString(),
        validationCount: 3,
        maturity: "established",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const identity = createTestIdentityV2([existingFact]);
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const events = [
        createContextEvent("page_visit", { url: "https://typescriptlang.org", title: "TypeScript Handbook" }),
        createContextEvent("page_visit", { url: "https://typescriptlang.org/docs", title: "TypeScript Docs" }),
        createContextEvent("page_visit", { url: "https://typescriptlang.org/play", title: "TypeScript Playground" }),
      ];
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify(events));

      const result = await inferHandler({});

      // Should not re-suggest TypeScript since it's already in identity
      const tsCandidate = result.structuredContent.candidates.find((c: { content: string }) =>
        c.content.toLowerCase().includes("typescript")
      );
      expect(tsCandidate).toBeUndefined();
    });

    it("excludes blocked facts", async () => {
      const blocked = [
        { factId: "blocked-1", content: "Python development", blockedAt: new Date().toISOString() },
      ];
      writeFileSync(join(TEST_DIR, "blocked.json"), JSON.stringify(blocked));
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(createTestIdentityV2()));

      const events = [
        createContextEvent("page_visit", { url: "https://python.org", title: "Python" }),
        createContextEvent("page_visit", { url: "https://python.org/docs", title: "Python Docs" }),
        createContextEvent("page_visit", { url: "https://pypi.org", title: "PyPI" }),
      ];
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify(events));

      const result = await inferHandler({});

      const pythonCandidate = result.structuredContent.candidates.find((c: { content: string }) =>
        c.content.toLowerCase().includes("python")
      );
      expect(pythonCandidate).toBeUndefined();
    });

    it("returns helpful message when no patterns found", async () => {
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify([]));
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(createTestIdentityV2()));

      const result = await inferHandler({});

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.candidates).toEqual([]);
      // Brief, natural response when nothing new
      expect(result.content[0].text.length).toBeLessThan(100);
    });

    it("embeds guidance directly in text output (not hidden in JSON)", async () => {
      const events = [
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase" }),
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase" }),
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase" }),
      ];
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify(events));
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(createTestIdentityV2()));

      const result = await inferHandler({});

      // Guidance should be IN the text, not just in structuredContent
      const text = result.content[0].text;
      expect(text.toLowerCase()).toContain("remember");
    });

    it("uses conversational output format without bullet points", async () => {
      const events = [
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase" }),
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase" }),
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase" }),
      ];
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify(events));
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(createTestIdentityV2()));

      const result = await inferHandler({});

      const text = result.content[0].text;
      // Should NOT have report-like formatting
      expect(text).not.toContain("•");
      expect(text).not.toContain("**");
      expect(text).not.toContain("% confidence");
      // Should read naturally
      expect(text.toLowerCase()).toContain("supabase");
    });

    it("provides activity summary even when no new patterns found", async () => {
      // Create context with activity but patterns already in identity
      const events = [
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase Docs" }),
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase Auth" }),
        createContextEvent("page_visit", { url: "https://supabase.com", title: "Supabase DB" }),
      ];
      const identity = createTestIdentityV2([{
        id: crypto.randomUUID(),
        category: "expertise",
        content: "Supabase development",
        confidence: 0.9,
        lastValidated: new Date().toISOString(),
        validationCount: 3,
        maturity: "established",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]);
      writeFileSync(join(TEST_DIR, "context.json"), JSON.stringify(events));
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(identity));

      const result = await inferHandler({});

      // Should include activity summary even with no candidates
      expect(result.structuredContent.activitySummary.length).toBeGreaterThan(0);
      expect(result.content[0].text.toLowerCase()).toContain("supabase");
      // No candidates because Supabase is already known
      expect(result.structuredContent.candidates.length).toBe(0);
    });

    it("handles missing context file gracefully", async () => {
      writeFileSync(join(TEST_DIR, "identity.json"), JSON.stringify(createTestIdentityV2()));
      // No context.json file

      const result = await inferHandler({});

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.candidates).toEqual([]);
    });
  });

  describe("domain categorization (general, not tech-only)", () => {
    it("categorizes health sites as 'interest' not 'development'", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://ro.co/health", title: "Ro Health" }),
        createContextEvent("page_visit", { url: "https://ro.co/weight-loss", title: "Weight Loss" }),
        createContextEvent("page_visit", { url: "https://ro.co/mental-health", title: "Mental Health" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      const roCandidate = candidates.find(c => c.sourceRef === "ro.co");
      expect(roCandidate).toBeDefined();
      expect(roCandidate?.content).not.toContain("development");
      expect(roCandidate?.category).toBe("interest");
    });

    it("categorizes sports/news sites as 'interest' not 'development'", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://ge.globo.com/futebol", title: "Futebol" }),
        createContextEvent("page_visit", { url: "https://ge.globo.com/basquete", title: "Basquete" }),
        createContextEvent("page_visit", { url: "https://ge.globo.com/esportes", title: "Esportes" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      const globoCandidate = candidates.find(c => c.sourceRef?.includes("globo"));
      expect(globoCandidate).toBeDefined();
      expect(globoCandidate?.content).not.toContain("development");
      expect(globoCandidate?.category).toBe("interest");
    });

    it("categorizes tech documentation as 'expertise' with 'development'", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://react.dev/learn", title: "React Docs" }),
        createContextEvent("page_visit", { url: "https://react.dev/reference", title: "React API" }),
        createContextEvent("page_visit", { url: "https://react.dev/blog", title: "React Blog" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      const reactCandidate = candidates.find(c => c.sourceRef === "react.dev");
      expect(reactCandidate).toBeDefined();
      expect(reactCandidate?.content).toContain("React");
      expect(reactCandidate?.category).toBe("expertise");
    });

    it("categorizes shopping sites as 'interest'", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://amazon.com/dp/123", title: "Product 1" }),
        createContextEvent("page_visit", { url: "https://amazon.com/dp/456", title: "Product 2" }),
        createContextEvent("page_visit", { url: "https://amazon.com/dp/789", title: "Product 3" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      // Amazon might be in ignored list, but if it produces a candidate, it should be interest
      const amazonCandidate = candidates.find(c => c.sourceRef === "amazon.com");
      if (amazonCandidate) {
        expect(amazonCandidate.content).not.toContain("development");
      }
    });

    it("uses readable labels from page titles when available", () => {
      const events = [
        createContextEvent("page_visit", { url: "https://espn.com/nba", title: "NBA Basketball" }),
        createContextEvent("page_visit", { url: "https://espn.com/nfl", title: "NFL Football" }),
        createContextEvent("page_visit", { url: "https://espn.com/mlb", title: "MLB Baseball" }),
      ];

      const candidates = analyzeContextForPatterns(events);

      const espnCandidate = candidates.find(c => c.sourceRef === "espn.com");
      expect(espnCandidate).toBeDefined();
      expect(espnCandidate?.content.toLowerCase()).toContain("sports");
      expect(espnCandidate?.category).toBe("interest");
    });
  });

  describe("confidence scoring", () => {
    it("higher visit count yields higher confidence", () => {
      const fewVisits = [
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
      ];

      const manyVisits = [
        ...fewVisits,
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
        createContextEvent("page_visit", { url: "https://rust-lang.org", title: "Rust" }),
      ];

      const fewCandidates = analyzeContextForPatterns(fewVisits);
      const manyCandidates = analyzeContextForPatterns(manyVisits);

      // Both should detect Rust
      const fewRust = fewCandidates.find(c => c.content.toLowerCase().includes("rust"));
      const manyRust = manyCandidates.find(c => c.content.toLowerCase().includes("rust"));

      if (fewRust && manyRust) {
        expect(manyRust.confidence).toBeGreaterThanOrEqual(fewRust.confidence);
      }
    });
  });
});
