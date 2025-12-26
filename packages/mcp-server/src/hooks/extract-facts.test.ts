/**
 * Tests for extract-facts hook script
 *
 * TDD approach - testing transcript parsing and fact extraction logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We'll import the functions after they're exported
import {
  parseTranscript,
  buildConversationExtractionPrompt,
  jaroWinklerSimilarity,
  isDuplicate,
} from "./extract-facts.js";

describe("extract-facts", () => {
  describe("parseTranscript", () => {
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `arete-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    it("should parse user and assistant messages from JSONL", () => {
      const transcriptPath = join(testDir, "transcript.jsonl");
      const transcript = [
        { type: "user", content: "Hello, I'm a PM at Stripe" },
        { type: "assistant", content: "Nice to meet you!" },
        { type: "user", content: "I work on payments infrastructure" },
      ];
      writeFileSync(transcriptPath, transcript.map(t => JSON.stringify(t)).join("\n"));

      const messages = parseTranscript(transcriptPath);

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: "user", content: "Hello, I'm a PM at Stripe" });
      expect(messages[1]).toEqual({ role: "assistant", content: "Nice to meet you!" });
      expect(messages[2]).toEqual({ role: "user", content: "I work on payments infrastructure" });
    });

    it("should handle message object format", () => {
      const transcriptPath = join(testDir, "transcript.jsonl");
      const transcript = [
        { message: { role: "user", content: "I prefer dark mode" } },
        { message: { role: "assistant", content: "Noted!" } },
      ];
      writeFileSync(transcriptPath, transcript.map(t => JSON.stringify(t)).join("\n"));

      const messages = parseTranscript(transcriptPath);

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe("I prefer dark mode");
    });

    it("should handle content as array of text blocks", () => {
      const transcriptPath = join(testDir, "transcript.jsonl");
      const transcript = [
        {
          type: "user",
          content: [
            { type: "text", text: "I'm learning Rust" },
            { type: "text", text: " and TypeScript" },
          ],
        },
      ];
      writeFileSync(transcriptPath, transcript.map(t => JSON.stringify(t)).join("\n"));

      const messages = parseTranscript(transcriptPath);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("I'm learning Rust\n and TypeScript");
    });

    it("should skip malformed lines", () => {
      const transcriptPath = join(testDir, "transcript.jsonl");
      writeFileSync(transcriptPath, [
        JSON.stringify({ type: "user", content: "Valid message" }),
        "not valid json",
        JSON.stringify({ type: "assistant", content: "Also valid" }),
      ].join("\n"));

      const messages = parseTranscript(transcriptPath);

      expect(messages).toHaveLength(2);
    });

    it("should return empty array for missing file", () => {
      const messages = parseTranscript("/nonexistent/path.jsonl");
      expect(messages).toEqual([]);
    });
  });

  describe("buildConversationExtractionPrompt", () => {
    it("should build a prompt with conversation context", () => {
      const messages = [
        { role: "user" as const, content: "I'm a senior PM at a fintech startup" },
        { role: "assistant" as const, content: "Great! What are you working on?" },
        { role: "user" as const, content: "Voice AI for lending" },
      ];

      const prompt = buildConversationExtractionPrompt(messages);

      expect(prompt).toContain("[USER]: I'm a senior PM at a fintech startup");
      expect(prompt).toContain("[ASSISTANT]: Great! What are you working on?");
      expect(prompt).toContain("[USER]: Voice AI for lending");
      expect(prompt).toContain("<extraction_rules>");
      expect(prompt).toContain("DURABLE facts only");
    });
  });

  describe("jaroWinklerSimilarity", () => {
    it("should return 1 for identical strings", () => {
      expect(jaroWinklerSimilarity("hello", "hello")).toBe(1);
    });

    it("should return 0 for completely different strings", () => {
      expect(jaroWinklerSimilarity("abc", "xyz")).toBe(0);
    });

    it("should return high similarity for similar strings", () => {
      const score = jaroWinklerSimilarity(
        "Prefers concise responses",
        "Prefers direct, concise responses"
      );
      expect(score).toBeGreaterThan(0.8);
    });

    it("should be case insensitive", () => {
      expect(jaroWinklerSimilarity("Hello", "hello")).toBe(1);
    });

    it("should handle empty strings", () => {
      // Two empty strings are identical
      expect(jaroWinklerSimilarity("", "")).toBe(1);
      // One empty string means no similarity
      expect(jaroWinklerSimilarity("hello", "")).toBe(0);
    });
  });

  describe("isDuplicate", () => {
    it("should detect duplicate facts in same category", () => {
      const newFact = { category: "preference" as const, content: "Prefers concise responses", confidence: 0.8, visibility: "public" as const };
      const existingFacts = [
        {
          id: "1",
          category: "preference" as const,
          content: "Prefers direct, concise responses",
          confidence: 0.9,
          source: "manual" as const,
          createdAt: new Date().toISOString(),
          validationCount: 0,
          maturity: "candidate" as const,
        },
      ];

      expect(isDuplicate(newFact, existingFacts)).toBe(true);
    });

    it("should not detect duplicate across different categories", () => {
      const newFact = { category: "preference" as const, content: "TypeScript development", confidence: 0.8, visibility: "public" as const };
      const existingFacts = [
        {
          id: "1",
          category: "expertise" as const,
          content: "TypeScript development",
          confidence: 0.9,
          source: "manual" as const,
          createdAt: new Date().toISOString(),
          validationCount: 0,
          maturity: "candidate" as const,
        },
      ];

      expect(isDuplicate(newFact, existingFacts)).toBe(false);
    });

    it("should not flag different facts as duplicates", () => {
      const newFact = { category: "expertise" as const, content: "React development", confidence: 0.8, visibility: "public" as const };
      const existingFacts = [
        {
          id: "1",
          category: "expertise" as const,
          content: "Python development",
          confidence: 0.9,
          source: "manual" as const,
          createdAt: new Date().toISOString(),
          validationCount: 0,
          maturity: "candidate" as const,
        },
      ];

      expect(isDuplicate(newFact, existingFacts)).toBe(false);
    });
  });
});
