/**
 * Supabase integration for Arete
 *
 * @example Browser (with OAuth):
 * ```typescript
 * import { createAreteClient } from '@arete/core/supabase';
 *
 * const client = createAreteClient({
 *   url: process.env.SUPABASE_URL,
 *   anonKey: process.env.SUPABASE_ANON_KEY,
 * });
 *
 * // Get user identity
 * const identity = await client.getIdentity();
 *
 * // Subscribe to changes
 * const unsubscribe = client.subscribeToIdentityChanges((identity) => {
 *   console.log('Identity updated:', identity);
 * });
 * ```
 *
 * @example CLI (with API key):
 * ```typescript
 * import { createCLIClient, loadConfig, getSupabaseUrl } from '@arete/core/supabase';
 *
 * const config = loadConfig();
 * if (!config.apiKey) {
 *   console.log('Run: arete auth login');
 *   process.exit(1);
 * }
 *
 * const client = createCLIClient({
 *   supabaseUrl: getSupabaseUrl(),
 *   apiKey: config.apiKey,
 * });
 *
 * const identity = await client.getIdentity();
 * ```
 */

// Browser client (OAuth)
export {
  createAreteClient,
  getSupabaseConfig,
  type AreteClient,
  type AreteClientOptions,
  type StorageAdapter,
  type ContextEvent,
  type ContextEventInput,
  type ContextQueryOptions,
} from './client.js';

// CLI client (API key)
export {
  createCLIClient,
  loadConfig,
  saveConfig,
  clearConfig,
  getSupabaseUrl,
  type CLIClient,
  type CLIClientOptions,
  type CLIConfig,
  // Cloud AI types
  type ExtractedFact,
  type EmbeddingResult,
  type ExtractionResult,
} from './cli-client.js';
