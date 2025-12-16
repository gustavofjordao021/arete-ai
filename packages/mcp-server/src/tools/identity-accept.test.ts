/**
 * Accept Candidate Handler Tests
 *
 * Tests for arete_accept_candidate tool.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Mock @arete/core - only cloud functions need mocking
vi.mock("@arete/core", () => ({
  loadConfig: vi.fn(() => ({})),
  createCLIClient: vi.fn(() => null),
}));

import {
  acceptCandidateHandler,
  acceptCandidatesHandler,
  setConfigDir,
  type AcceptCandidateInput,
  type AcceptCandidatesInput,
} from "./identity-accept.js";
import {
  registerCandidates,
  clearCandidates,
  type CandidateInput,
} from "./candidate-registry.js";
import type { IdentityV2 } from "@arete/core";

describe("Accept Candidate Handler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "arete-accept-test-"));
    setConfigDir(tempDir);
    clearCandidates();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const createEmptyV2Identity = (): IdentityV2 => ({
    version: "2.0.0",
    deviceId: "test-device",
    facts: [],
    core: {},
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
    },
  });

  const createCandidate = (overrides: Partial<CandidateInput> = {}): CandidateInput => ({
    id: "candidate-123",
    category: "expertise",
    content: "TypeScript development",
    confidence: 0.75,
    sourceRef: "typescriptlang.org",
    signals: ["typescriptlang.org visits", ".ts files"],
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  const writeIdentity = (identity: IdentityV2): void => {
    writeFileSync(join(tempDir, "identity.json"), JSON.stringify(identity, null, 2));
  };

  const readIdentity = (): IdentityV2 => {
    const data = readFileSync(join(tempDir, "identity.json"), "utf-8");
    return JSON.parse(data);
  };

  describe("accepts candidate by id", () => {
    it("creates fact from candidate", async () => {
      writeIdentity(createEmptyV2Identity());
      const candidate = createCandidate();
      registerCandidates([candidate]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.fact).toBeDefined();
      expect(result.structuredContent.fact?.content).toBe("TypeScript development");
    });

    it("preserves confidence from inference", async () => {
      writeIdentity(createEmptyV2Identity());
      const candidate = createCandidate({ confidence: 0.65 });
      registerCandidates([candidate]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.fact?.confidence).toBe(0.65);
    });

    it("preserves sourceRef from inference", async () => {
      writeIdentity(createEmptyV2Identity());
      const candidate = createCandidate({ sourceRef: "react.dev, nextjs.org" });
      registerCandidates([candidate]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.fact?.sourceRef).toBe("react.dev, nextjs.org");
    });

    it("sets source to inferred", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.fact?.source).toBe("inferred");
    });

    it("sets maturity to candidate", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.fact?.maturity).toBe("candidate");
    });

    it("persists fact to identity file", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      await acceptCandidateHandler(input);

      const savedIdentity = readIdentity();
      expect(savedIdentity.facts).toHaveLength(1);
      expect(savedIdentity.facts[0].content).toBe("TypeScript development");
    });

    it("removes candidate from registry after acceptance", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      await acceptCandidateHandler(input);

      // Try to accept again - should fail
      const secondResult = await acceptCandidateHandler(input);
      expect(secondResult.structuredContent.success).toBe(false);
      expect(secondResult.structuredContent.error).toContain("not found");
    });
  });

  describe("accepts candidate by content", () => {
    it("finds candidate by content match", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate({ content: "React development" })]);

      const input: AcceptCandidateInput = { content: "React development" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.fact?.content).toBe("React development");
    });

    it("matches case-insensitively", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate({ content: "TypeScript Development" })]);

      const input: AcceptCandidateInput = { content: "typescript development" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(true);
    });
  });

  describe("error handling", () => {
    it("returns error when candidate not found by id", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "wrong-id" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("not found");
    });

    it("returns error when candidate not found by content", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { content: "Unknown content" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("not found");
    });

    it("returns error when no candidates registered", async () => {
      writeIdentity(createEmptyV2Identity());
      // No candidates registered

      const input: AcceptCandidateInput = { candidateId: "any-id" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("not found");
    });

    it("returns error when neither candidateId nor content provided", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = {};
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("candidateId or content");
    });

    it("returns error for v1 identity", async () => {
      // Write a v1 identity
      writeFileSync(
        join(tempDir, "identity.json"),
        JSON.stringify({
          meta: { version: "1.0.0", deviceId: "test", lastModified: new Date().toISOString() },
          core: {},
          communication: { style: [], format: [], avoid: [] },
          expertise: [],
          currentFocus: { projects: [], goals: [] },
          context: { personal: [], professional: [] },
          privacy: { public: [], private: [], localOnly: [] },
          custom: {},
          sources: [],
        })
      );
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("v2");
    });

    it("returns error when identity file missing", async () => {
      // Don't write identity file
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("identity");
    });
  });

  describe("prevents duplicates", () => {
    it("rejects if fact with same content already exists", async () => {
      const identity = createEmptyV2Identity();
      identity.facts.push({
        id: "existing-fact",
        category: "expertise",
        content: "TypeScript development",
        confidence: 0.9,
        lastValidated: new Date().toISOString(),
        validationCount: 3,
        maturity: "established",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      writeIdentity(identity);
      registerCandidates([createCandidate()]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("already exists");
    });

    it("duplicate check is case-insensitive", async () => {
      const identity = createEmptyV2Identity();
      identity.facts.push({
        id: "existing-fact",
        category: "expertise",
        content: "typescript development",
        confidence: 0.9,
        lastValidated: new Date().toISOString(),
        validationCount: 3,
        maturity: "established",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      writeIdentity(identity);
      registerCandidates([createCandidate({ content: "TypeScript Development" })]);

      const input: AcceptCandidateInput = { candidateId: "candidate-123" };
      const result = await acceptCandidateHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("already exists");
    });
  });
});

describe("Batch Accept Candidates Handler", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "arete-batch-accept-test-"));
    setConfigDir(tempDir);
    clearCandidates();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const createEmptyV2Identity = (): IdentityV2 => ({
    version: "2.0.0",
    deviceId: "test-device",
    facts: [],
    core: {},
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
    },
  });

  const createCandidate = (overrides: Partial<CandidateInput> = {}): CandidateInput => ({
    id: "candidate-123",
    category: "expertise",
    content: "TypeScript development",
    confidence: 0.75,
    sourceRef: "typescriptlang.org",
    signals: ["typescriptlang.org visits", ".ts files"],
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  const writeIdentity = (identity: IdentityV2): void => {
    writeFileSync(join(tempDir, "identity.json"), JSON.stringify(identity, null, 2));
  };

  const readIdentity = (): IdentityV2 => {
    const data = readFileSync(join(tempDir, "identity.json"), "utf-8");
    return JSON.parse(data);
  };

  describe("accepts multiple candidates", () => {
    it("accepts all candidates with all=true", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([
        createCandidate({ id: "c1", content: "TypeScript" }),
        createCandidate({ id: "c2", content: "React" }),
        createCandidate({ id: "c3", content: "Node.js" }),
      ]);

      const input: AcceptCandidatesInput = { all: true };
      const result = await acceptCandidatesHandler(input);

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted).toHaveLength(3);
      expect(result.structuredContent.failed).toHaveLength(0);

      const identity = readIdentity();
      expect(identity.facts).toHaveLength(3);
    });

    it("accepts specific candidates by IDs", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([
        createCandidate({ id: "c1", content: "TypeScript" }),
        createCandidate({ id: "c2", content: "React" }),
        createCandidate({ id: "c3", content: "Node.js" }),
      ]);

      const input: AcceptCandidatesInput = { candidateIds: ["c1", "c3"] };
      const result = await acceptCandidatesHandler(input);

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted).toHaveLength(2);
      expect(result.structuredContent.accepted.map((f) => f.content)).toContain("TypeScript");
      expect(result.structuredContent.accepted.map((f) => f.content)).toContain("Node.js");
    });

    it("skips duplicates and reports them as failed", async () => {
      const identity = createEmptyV2Identity();
      identity.facts.push({
        id: "existing",
        category: "expertise",
        content: "TypeScript",
        confidence: 0.9,
        lastValidated: new Date().toISOString(),
        validationCount: 3,
        maturity: "established",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      writeIdentity(identity);

      registerCandidates([
        createCandidate({ id: "c1", content: "TypeScript" }), // duplicate
        createCandidate({ id: "c2", content: "React" }), // new
      ]);

      const input: AcceptCandidatesInput = { all: true };
      const result = await acceptCandidatesHandler(input);

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted).toHaveLength(1);
      expect(result.structuredContent.accepted[0].content).toBe("React");
      expect(result.structuredContent.failed).toHaveLength(1);
      expect(result.structuredContent.failed[0].content).toBe("TypeScript");
    });
  });

  describe("error handling", () => {
    it("returns error when no input provided", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate()]);

      const input: AcceptCandidatesInput = {};
      const result = await acceptCandidatesHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("candidateIds array or set all=true");
    });

    it("returns error when no candidates registered", async () => {
      writeIdentity(createEmptyV2Identity());
      // No candidates

      const input: AcceptCandidatesInput = { all: true };
      const result = await acceptCandidatesHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("No candidates found");
    });

    it("returns error when no identity exists", async () => {
      // No identity file
      registerCandidates([createCandidate()]);

      const input: AcceptCandidatesInput = { all: true };
      const result = await acceptCandidatesHandler(input);

      expect(result.structuredContent.success).toBe(false);
      expect(result.structuredContent.error).toContain("No v2 identity");
    });

    it("skips unknown candidate IDs gracefully", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([createCandidate({ id: "c1", content: "TypeScript" })]);

      const input: AcceptCandidatesInput = { candidateIds: ["c1", "unknown-id"] };
      const result = await acceptCandidatesHandler(input);

      // Should succeed with the one valid candidate
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.accepted).toHaveLength(1);
    });
  });

  describe("response text", () => {
    it("shows count and list of accepted facts", async () => {
      writeIdentity(createEmptyV2Identity());
      registerCandidates([
        createCandidate({ id: "c1", content: "TypeScript" }),
        createCandidate({ id: "c2", content: "React" }),
      ]);

      const input: AcceptCandidatesInput = { all: true };
      const result = await acceptCandidatesHandler(input);

      expect(result.content[0].text).toContain("Remembered 2 facts");
      expect(result.content[0].text).toContain("TypeScript");
      expect(result.content[0].text).toContain("React");
    });

    it("mentions skipped duplicates in text", async () => {
      const identity = createEmptyV2Identity();
      identity.facts.push({
        id: "existing",
        category: "expertise",
        content: "TypeScript",
        confidence: 0.9,
        lastValidated: new Date().toISOString(),
        validationCount: 3,
        maturity: "established",
        source: "manual",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      writeIdentity(identity);

      registerCandidates([
        createCandidate({ id: "c1", content: "TypeScript" }),
        createCandidate({ id: "c2", content: "React" }),
      ]);

      const input: AcceptCandidatesInput = { all: true };
      const result = await acceptCandidatesHandler(input);

      expect(result.content[0].text).toContain("1 skipped");
    });
  });
});
