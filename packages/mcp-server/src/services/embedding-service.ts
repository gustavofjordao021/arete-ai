/**
 * embedding-service.ts - Embedding service with cloud API and local caching
 *
 * Manages embeddings for identity facts using Arete's cloud API (server-side OpenAI keys).
 * Falls back to local OpenAI API if cloud unavailable and user has their own key.
 * Embeddings are cached locally in ~/.arete/embeddings.json for performance.
 *
 * Features:
 * - Cloud API with server-side keys (no user API key needed)
 * - Local cache with automatic persistence
 * - Batch embedding generation
 * - Graceful fallback to local API
 * - Cache invalidation on fact update/delete
 */

import OpenAI from "openai";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { loadConfig, createCLIClient, type CLIClient } from "@arete/core";

// Model configuration
const EMBEDDING_MODEL = "text-embedding-3-small";

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
 * EmbeddingService - Manages embeddings with cloud API and local caching
 *
 * Usage:
 * ```typescript
 * const service = getEmbeddingService();
 *
 * if (service.isAvailable()) {
 *   const embedding = await service.getEmbedding("React expertise", "fact-uuid");
 * }
 * ```
 */
export class EmbeddingService {
  private cloudClient: CLIClient | null = null;
  private localClient: OpenAI | null = null;
  private cache: EmbeddingCache;
  private useCloud: boolean = false;

  constructor(localApiKey?: string) {
    // Try to initialize cloud client first (preferred)
    const config = loadConfig();
    if (config?.apiKey && config?.supabaseUrl) {
      this.cloudClient = createCLIClient({
        supabaseUrl: config.supabaseUrl,
        apiKey: config.apiKey,
      });
      this.useCloud = true;
    }

    // Fallback to local OpenAI client
    if (localApiKey) {
      this.localClient = new OpenAI({ apiKey: localApiKey });
    }

    this.cache = this.loadCache();
  }

  /**
   * Check if embedding service is available (cloud or local)
   */
  isAvailable(): boolean {
    return this.cloudClient !== null || this.localClient !== null;
  }

  /**
   * Check if using cloud API
   */
  isUsingCloud(): boolean {
    return this.useCloud && this.cloudClient !== null;
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
    // Check cache first if factId provided
    if (factId && this.cache.embeddings[factId]) {
      return this.cache.embeddings[factId];
    }

    let embedding: number[] | null = null;

    // Try cloud first
    if (this.cloudClient) {
      try {
        const result = await this.cloudClient.getEmbedding(text, factId);
        embedding = result.embedding;
      } catch (error) {
        console.error("Cloud embedding failed, trying local:", error);
      }
    }

    // Fallback to local
    if (!embedding && this.localClient) {
      try {
        const response = await this.localClient.embeddings.create({
          model: EMBEDDING_MODEL,
          input: text,
        });
        embedding = response.data[0].embedding;
      } catch (error) {
        console.error("Local embedding failed:", error);
        return null;
      }
    }

    // Cache if successful and factId provided
    if (embedding && factId) {
      this.cache.embeddings[factId] = embedding;
      this.saveCache();
    }

    return embedding;
  }

  /**
   * Batch embed multiple texts
   *
   * Checks cache first and only generates embeddings for uncached items.
   * Uses cloud API for batch when available.
   *
   * @param items - Array of {text, factId} to embed
   * @returns Map of factId -> embedding
   */
  async getEmbeddings(
    items: EmbeddingInput[]
  ): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();

    if (!this.isAvailable()) return result;

    const uncached: Array<{ text: string; factId: string; index: number }> = [];

    // Check cache first
    items.forEach((item, index) => {
      if (this.cache.embeddings[item.factId]) {
        result.set(item.factId, this.cache.embeddings[item.factId]);
      } else {
        uncached.push({ ...item, index });
      }
    });

    // Generate uncached (one at a time for cloud, batch for local)
    if (uncached.length > 0) {
      if (this.cloudClient) {
        // Cloud: one at a time (rate limit friendly)
        for (const item of uncached) {
          try {
            const res = await this.cloudClient.getEmbedding(item.text, item.factId);
            result.set(item.factId, res.embedding);
            this.cache.embeddings[item.factId] = res.embedding;
          } catch (error) {
            console.error(`Cloud embedding failed for ${item.factId}:`, error);
          }
        }
        this.saveCache();
      } else if (this.localClient) {
        // Local: batch API
        try {
          const response = await this.localClient.embeddings.create({
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
        }
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
 * @param localApiKey - Local OpenAI API key (fallback, only used if cloud unavailable)
 */
export function getEmbeddingService(localApiKey?: string): EmbeddingService {
  if (!sharedService) {
    sharedService = new EmbeddingService(localApiKey);
  }
  return sharedService;
}

/**
 * Reset shared service (for testing)
 */
export function resetEmbeddingService(): void {
  sharedService = null;
}
