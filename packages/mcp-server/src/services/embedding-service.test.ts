/**
 * embedding-service.test.ts - TDD tests for embedding service
 *
 * Tests the EmbeddingService class that manages OpenAI embeddings
 * with local caching.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync, readFileSync, mkdirSync, rmdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  EmbeddingService,
  type EmbeddingCache,
  setEmbeddingCacheDir,
  getEmbeddingCacheDir,
} from "./embedding-service.js";

// Test cache directory
const TEST_CACHE_DIR = join(tmpdir(), "arete-embedding-test-" + Date.now());
const TEST_CACHE_FILE = join(TEST_CACHE_DIR, "embeddings.json");

describe("EmbeddingService", () => {
  beforeEach(() => {
    // Use test directory instead of ~/.arete
    mkdirSync(TEST_CACHE_DIR, { recursive: true });
    setEmbeddingCacheDir(TEST_CACHE_DIR);
  });

  afterEach(() => {
    // Clean up test files
    try {
      if (existsSync(TEST_CACHE_FILE)) {
        unlinkSync(TEST_CACHE_FILE);
      }
      if (existsSync(TEST_CACHE_DIR)) {
        rmdirSync(TEST_CACHE_DIR, { recursive: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("isAvailable", () => {
    it("returns false when no API key provided", () => {
      const service = new EmbeddingService();
      expect(service.isAvailable()).toBe(false);
    });

    it("returns true when API key provided", () => {
      const service = new EmbeddingService("sk-test-key");
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe("cache management", () => {
    it("creates empty cache when file does not exist", () => {
      const service = new EmbeddingService("sk-test-key");
      // Cache should be empty initially
      expect(service.getCacheSize()).toBe(0);
    });

    it("loads existing cache from file", () => {
      // Pre-create a cache file
      const existingCache: EmbeddingCache = {
        version: "1.0.0",
        model: "text-embedding-3-small",
        embeddings: {
          "fact-1": [0.1, 0.2, 0.3],
          "fact-2": [0.4, 0.5, 0.6],
        },
        updatedAt: new Date().toISOString(),
      };

      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify(existingCache)
      );

      const service = new EmbeddingService("sk-test-key");
      expect(service.getCacheSize()).toBe(2);
      expect(service.getCachedEmbedding("fact-1")).toEqual([0.1, 0.2, 0.3]);
    });

    it("handles corrupted cache file gracefully", () => {
      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(TEST_CACHE_FILE, "{ invalid json");

      // Should not throw, should start with empty cache
      const service = new EmbeddingService("sk-test-key");
      expect(service.getCacheSize()).toBe(0);
    });
  });

  describe("getCachedEmbedding", () => {
    it("returns null for uncached factId", () => {
      const service = new EmbeddingService("sk-test-key");
      expect(service.getCachedEmbedding("nonexistent")).toBeNull();
    });

    it("returns cached embedding for known factId", () => {
      const existingCache: EmbeddingCache = {
        version: "1.0.0",
        model: "text-embedding-3-small",
        embeddings: {
          "fact-1": [0.1, 0.2, 0.3],
        },
        updatedAt: new Date().toISOString(),
      };

      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify(existingCache)
      );

      const service = new EmbeddingService("sk-test-key");
      expect(service.getCachedEmbedding("fact-1")).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe("invalidate", () => {
    it("removes cached embedding for factId", () => {
      const existingCache: EmbeddingCache = {
        version: "1.0.0",
        model: "text-embedding-3-small",
        embeddings: {
          "fact-1": [0.1, 0.2, 0.3],
          "fact-2": [0.4, 0.5, 0.6],
        },
        updatedAt: new Date().toISOString(),
      };

      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify(existingCache)
      );

      const service = new EmbeddingService("sk-test-key");
      service.invalidate("fact-1");

      expect(service.getCachedEmbedding("fact-1")).toBeNull();
      expect(service.getCachedEmbedding("fact-2")).toEqual([0.4, 0.5, 0.6]);
    });

    it("persists invalidation to file", () => {
      const existingCache: EmbeddingCache = {
        version: "1.0.0",
        model: "text-embedding-3-small",
        embeddings: {
          "fact-1": [0.1, 0.2, 0.3],
        },
        updatedAt: new Date().toISOString(),
      };

      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify(existingCache)
      );

      const service = new EmbeddingService("sk-test-key");
      service.invalidate("fact-1");

      // Re-read from file
      const savedCache = JSON.parse(readFileSync(TEST_CACHE_FILE, "utf-8"));
      expect(savedCache.embeddings["fact-1"]).toBeUndefined();
    });
  });

  describe("clearCache", () => {
    it("removes all cached embeddings", () => {
      const existingCache: EmbeddingCache = {
        version: "1.0.0",
        model: "text-embedding-3-small",
        embeddings: {
          "fact-1": [0.1, 0.2, 0.3],
          "fact-2": [0.4, 0.5, 0.6],
        },
        updatedAt: new Date().toISOString(),
      };

      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify(existingCache)
      );

      const service = new EmbeddingService("sk-test-key");
      service.clearCache();

      expect(service.getCacheSize()).toBe(0);
    });
  });

  describe("getEmbedding (mocked)", () => {
    it("returns null when service is unavailable", async () => {
      const service = new EmbeddingService(); // No API key
      const result = await service.getEmbedding("test text");
      expect(result).toBeNull();
    });

    it("returns cached embedding when available", async () => {
      const existingCache: EmbeddingCache = {
        version: "1.0.0",
        model: "text-embedding-3-small",
        embeddings: {
          "fact-1": [0.1, 0.2, 0.3],
        },
        updatedAt: new Date().toISOString(),
      };

      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify(existingCache)
      );

      const service = new EmbeddingService("sk-test-key");
      // Should return cached without calling API
      const result = await service.getEmbedding("test text", "fact-1");
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe("getEmbeddings batch (mocked)", () => {
    it("returns empty map when service is unavailable", async () => {
      const service = new EmbeddingService(); // No API key
      const result = await service.getEmbeddings([
        { text: "test", factId: "fact-1" },
      ]);
      expect(result.size).toBe(0);
    });

    it("uses cache for known embeddings", async () => {
      const existingCache: EmbeddingCache = {
        version: "1.0.0",
        model: "text-embedding-3-small",
        embeddings: {
          "fact-1": [0.1, 0.2, 0.3],
          "fact-2": [0.4, 0.5, 0.6],
        },
        updatedAt: new Date().toISOString(),
      };

      mkdirSync(TEST_CACHE_DIR, { recursive: true });
      require("fs").writeFileSync(
        TEST_CACHE_FILE,
        JSON.stringify(existingCache)
      );

      const service = new EmbeddingService("sk-test-key");
      const result = await service.getEmbeddings([
        { text: "text1", factId: "fact-1" },
        { text: "text2", factId: "fact-2" },
      ]);

      expect(result.get("fact-1")).toEqual([0.1, 0.2, 0.3]);
      expect(result.get("fact-2")).toEqual([0.4, 0.5, 0.6]);
    });
  });

  describe("cacheEmbedding (direct cache write)", () => {
    it("adds embedding to cache", () => {
      const service = new EmbeddingService("sk-test-key");
      service.cacheEmbedding("fact-1", [0.7, 0.8, 0.9]);

      expect(service.getCachedEmbedding("fact-1")).toEqual([0.7, 0.8, 0.9]);
    });

    it("persists to file", () => {
      const service = new EmbeddingService("sk-test-key");
      service.cacheEmbedding("fact-1", [0.7, 0.8, 0.9]);

      const savedCache = JSON.parse(readFileSync(TEST_CACHE_FILE, "utf-8"));
      expect(savedCache.embeddings["fact-1"]).toEqual([0.7, 0.8, 0.9]);
    });
  });
});

describe("cache directory configuration", () => {
  it("allows setting custom cache directory", () => {
    const customDir = "/tmp/custom-arete-cache";
    setEmbeddingCacheDir(customDir);
    expect(getEmbeddingCacheDir()).toBe(customDir);
  });
});
