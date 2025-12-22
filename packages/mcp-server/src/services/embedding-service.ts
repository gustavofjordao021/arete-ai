/**
 * embedding-service.ts - OpenAI embedding service with local caching
 *
 * Manages embeddings for identity facts using OpenAI's text-embedding-3-small model.
 * Embeddings are cached locally in ~/.arete/embeddings.json for performance.
 *
 * Features:
 * - Local cache with automatic persistence
 * - Batch embedding generation
 * - Graceful fallback when API unavailable
 * - Cache invalidation on fact update/delete
 */

import OpenAI from "openai";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Model configuration
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

// Configurable cache directory (for testing)
let CACHE_DIR = join(homedir(), ".arete");

/**
 * Set custom cache directory (for testing)
 */
export function setEmbeddingCacheDir(dir: string): void {
  CACHE_DIR = dir;
}

/**
 * Get current cache directory
 */
export function getEmbeddingCacheDir(): string {
  return CACHE_DIR;
}

function getCacheFile(): string {
  return join(CACHE_DIR, "embeddings.json");
}

/**
 * Cache file structure
 */
export interface EmbeddingCache {
  version: string;
  model: string;
  embeddings: Record<string, number[]>;
  updatedAt: string;
}

/**
 * Input for batch embedding requests
 */
export interface EmbeddingInput {
  text: string;
  factId: string;
}

/**
 * EmbeddingService - Manages OpenAI embeddings with local caching
 *
 * Usage:
 * ```typescript
 * const service = new EmbeddingService(config.openaiKey);
 *
 * if (service.isAvailable()) {
 *   const embedding = await service.getEmbedding("React expertise", "fact-uuid");
 * }
 * ```
 */
export class EmbeddingService {
  private client: OpenAI | null = null;
  private cache: EmbeddingCache;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
    this.cache = this.loadCache();
  }

  /**
   * Check if embedding service is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Get cached embedding for a fact (without API call)
   */
  getCachedEmbedding(factId: string): number[] | null {
    return this.cache.embeddings[factId] || null;
  }

  /**
   * Get current cache size
   */
  getCacheSize(): number {
    return Object.keys(this.cache.embeddings).length;
  }

  /**
   * Cache an embedding directly (for pre-population)
   */
  cacheEmbedding(factId: string, embedding: number[]): void {
    this.cache.embeddings[factId] = embedding;
    this.saveCache();
  }

  /**
   * Get embedding for text (cached or generate)
   *
   * @param text - Text to embed
   * @param factId - Optional factId for caching
   * @returns Embedding vector or null if unavailable
   */
  async getEmbedding(text: string, factId?: string): Promise<number[] | null> {
    if (!this.client) return null;

    // Check cache first if factId provided
    if (factId && this.cache.embeddings[factId]) {
      return this.cache.embeddings[factId];
    }

    try {
      const response = await this.client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });

      const embedding = response.data[0].embedding;

      // Cache if factId provided
      if (factId) {
        this.cache.embeddings[factId] = embedding;
        this.saveCache();
      }

      return embedding;
    } catch (error) {
      console.error("Embedding generation failed:", error);
      return null;
    }
  }

  /**
   * Batch embed multiple texts
   *
   * Checks cache first and only generates embeddings for uncached items.
   * More efficient than individual calls due to OpenAI batch API.
   *
   * @param items - Array of {text, factId} to embed
   * @returns Map of factId -> embedding
   */
  async getEmbeddings(
    items: EmbeddingInput[]
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();

    if (!this.client) return result;

    const uncached: Array<{ text: string; factId: string; index: number }> = [];

    // Check cache first
    items.forEach((item, index) => {
      if (this.cache.embeddings[item.factId]) {
        result.set(item.factId, this.cache.embeddings[item.factId]);
      } else {
        uncached.push({ ...item, index });
      }
    });

    // Batch generate uncached
    if (uncached.length > 0) {
      try {
        const response = await this.client.embeddings.create({
          model: EMBEDDING_MODEL,
          input: uncached.map((u) => u.text),
        });

        response.data.forEach((emb, i) => {
          const factId = uncached[i].factId;
          const embedding = emb.embedding;
          result.set(factId, embedding);
          this.cache.embeddings[factId] = embedding;
        });

        this.saveCache();
      } catch (error) {
        console.error("Batch embedding failed:", error);
        // Return what we have from cache
      }
    }

    return result;
  }

  /**
   * Invalidate cache for a fact (on content update or delete)
   */
  invalidate(factId: string): void {
    delete this.cache.embeddings[factId];
    this.saveCache();
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.embeddings = {};
    this.saveCache();
  }

  /**
   * Load cache from file
   */
  private loadCache(): EmbeddingCache {
    const cacheFile = getCacheFile();

    if (existsSync(cacheFile)) {
      try {
        const data = readFileSync(cacheFile, "utf-8");
        return JSON.parse(data);
      } catch {
        // Corrupted cache, start fresh
        console.warn("Corrupted embedding cache, starting fresh");
      }
    }

    // Default empty cache
    return {
      version: "1.0.0",
      model: EMBEDDING_MODEL,
      embeddings: {},
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Save cache to file
   */
  private saveCache(): void {
    const cacheFile = getCacheFile();
    this.cache.updatedAt = new Date().toISOString();

    // Ensure directory exists
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }

    writeFileSync(cacheFile, JSON.stringify(this.cache, null, 2));
  }
}

/**
 * Singleton instance for use across tools
 * Initialized lazily when first accessed
 */
let sharedService: EmbeddingService | null = null;

/**
 * Get or create the shared embedding service
 * @param apiKey - OpenAI API key (only used on first call)
 */
export function getEmbeddingService(apiKey?: string): EmbeddingService {
  if (!sharedService) {
    sharedService = new EmbeddingService(apiKey);
  }
  return sharedService;
}

/**
 * Reset shared service (for testing)
 */
export function resetEmbeddingService(): void {
  sharedService = null;
}
