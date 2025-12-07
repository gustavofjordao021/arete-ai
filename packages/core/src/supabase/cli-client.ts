/**
 * Arete CLI Client
 *
 * Authenticates with Supabase using API keys via Edge Functions.
 * Provides the same interface as AreteClient but for headless environments.
 *
 * @example
 * ```typescript
 * import { createCLIClient, loadConfig } from '@arete/core/supabase/cli-client';
 *
 * const config = loadConfig();
 * if (!config.apiKey) {
 *   console.log('Run: arete auth login');
 *   process.exit(1);
 * }
 *
 * const client = createCLIClient({
 *   supabaseUrl: 'https://xxx.supabase.co',
 *   apiKey: config.apiKey,
 * });
 *
 * const identity = await client.getIdentity();
 * ```
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Identity } from "../schema";

// Anon key for initial auth request (JWT verification bypass)
// This is safe to expose - anon keys are public and RLS protects data
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2amd4ZGRqbWV2bW10enFtenJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMzQ1MjAsImV4cCI6MjA4MDYxMDUyMH0.DxLL_lftNcuE1ROQigLc9xWdPiJZVVpPT2e6ZBPeyaE";

// Config file location
const CONFIG_DIR = join(homedir(), ".arete");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface CLIConfig {
  supabaseUrl?: string;
  apiKey?: string;
  userId?: string;
  email?: string;
}

export interface CLIClientOptions {
  supabaseUrl: string;
  apiKey: string;
}

export interface ContextEvent {
  id: string;
  user_id: string;
  type: "page_visit" | "selection" | "conversation" | "insight" | "file";
  source: string;
  data: Record<string, unknown>;
  timestamp: string;
  created_at: string;
}

export interface ContextEventInput {
  type: ContextEvent["type"];
  source: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface ContextQueryOptions {
  type?: ContextEvent["type"];
  source?: string;
  limit?: number;
}

export interface CLIClient {
  // Auth
  validateKey: () => Promise<{ userId: string; email?: string } | null>;

  // Identity
  getIdentity: () => Promise<Identity | null>;
  saveIdentity: (identity: Identity) => Promise<void>;

  // Context
  getRecentContext: (options?: ContextQueryOptions) => Promise<ContextEvent[]>;
  addContextEvent: (event: ContextEventInput) => Promise<ContextEvent>;
  clearContext: (type?: ContextEvent["type"]) => Promise<void>;
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load CLI configuration
 */
export function loadConfig(): CLIConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save CLI configuration
 */
export function saveConfig(config: CLIConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Clear CLI configuration (logout)
 */
export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));
  }
}

/**
 * Get Supabase URL from environment or config
 */
export function getSupabaseUrl(): string {
  const fromEnv = process.env.SUPABASE_URL;
  if (fromEnv) return fromEnv;

  const config = loadConfig();
  if (config.supabaseUrl) return config.supabaseUrl;

  throw new Error("Missing SUPABASE_URL. Set environment variable or run: arete auth login");
}

/**
 * Make authenticated request to Edge Function
 *
 * Uses dual-header approach:
 * - Authorization: Bearer <anon_key> - passes Supabase JWT verification
 * - X-API-Key: <api_key> - actual user authentication handled by function
 */
async function makeRequest(
  supabaseUrl: string,
  apiKey: string,
  functionName: string,
  method: string,
  body?: unknown,
  queryParams?: Record<string, string>
): Promise<Response> {
  let url = `${supabaseUrl}/functions/v1/${functionName}`;

  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams(queryParams);
    url += `?${params.toString()}`;
  }

  const options: RequestInit = {
    method,
    headers: {
      // Anon key for JWT verification (required by Supabase edge functions)
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      // API key for actual user authentication (validated by function)
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  return fetch(url, options);
}

/**
 * Create a CLI client with API key authentication
 */
export function createCLIClient(options: CLIClientOptions): CLIClient {
  const { supabaseUrl, apiKey } = options;

  async function validateKey(): Promise<{ userId: string; email?: string } | null> {
    // Use anon key for Authorization (passes JWT verification)
    // API key is validated by the function via request body
    const response = await makeRequest(supabaseUrl, SUPABASE_ANON_KEY, "auth-api-key", "POST", {
      api_key: apiKey,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { valid: boolean; user_id?: string; email?: string };
    if (!data.valid) {
      return null;
    }

    return { userId: data.user_id!, email: data.email };
  }

  async function getIdentity(): Promise<Identity | null> {
    const response = await makeRequest(supabaseUrl, apiKey, "cli-identity", "GET");

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorData.error || `Failed to get identity: ${response.status}`);
    }

    const data = (await response.json()) as { identity: Identity | null };
    return data.identity;
  }

  async function saveIdentity(identity: Identity): Promise<void> {
    const response = await makeRequest(supabaseUrl, apiKey, "cli-identity", "POST", {
      identity,
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorData.error || `Failed to save identity: ${response.status}`);
    }
  }

  async function getRecentContext(
    options: ContextQueryOptions = {}
  ): Promise<ContextEvent[]> {
    const queryParams: Record<string, string> = {};
    if (options.type) queryParams.type = options.type;
    if (options.source) queryParams.source = options.source;
    if (options.limit) queryParams.limit = String(options.limit);

    const response = await makeRequest(
      supabaseUrl,
      apiKey,
      "cli-context",
      "GET",
      undefined,
      queryParams
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorData.error || `Failed to get context: ${response.status}`);
    }

    const data = (await response.json()) as { events: ContextEvent[] };
    return data.events;
  }

  async function addContextEvent(event: ContextEventInput): Promise<ContextEvent> {
    const response = await makeRequest(supabaseUrl, apiKey, "cli-context", "POST", event);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorData.error || `Failed to add context: ${response.status}`);
    }

    const data = (await response.json()) as { event: ContextEvent };
    return data.event;
  }

  async function clearContext(type?: ContextEvent["type"]): Promise<void> {
    const queryParams: Record<string, string> = {};
    if (type) queryParams.type = type;

    const response = await makeRequest(
      supabaseUrl,
      apiKey,
      "cli-context",
      "DELETE",
      undefined,
      queryParams
    );

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(errorData.error || `Failed to clear context: ${response.status}`);
    }
  }

  return {
    validateKey,
    getIdentity,
    saveIdentity,
    getRecentContext,
    addContextEvent,
    clearContext,
  };
}
