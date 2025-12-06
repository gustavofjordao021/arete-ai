/**
 * Sync Service - Supabase cloud sync for identity and context
 *
 * Replaces local chrome.storage with Supabase database calls.
 * Requires authentication via auth.ts before use.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './auth';

// Allow injection for testing
let syncClient: SupabaseClient | null = null;

/**
 * Set a custom Supabase client (for testing)
 * @internal
 */
export function _setSyncClient(client: SupabaseClient | null): void {
  syncClient = client;
}

/**
 * Reset sync state (for testing)
 * @internal
 */
export function _resetSync(): void {
  syncClient = null;
}

/**
 * Get the Supabase client for sync operations
 */
function getClient(): SupabaseClient {
  if (syncClient) return syncClient;
  return getSupabase();
}

/**
 * Get the current authenticated user ID
 * @throws Error if not authenticated
 */
async function requireUserId(): Promise<string> {
  const client = getClient();
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error('Not authenticated');
  }

  return data.user.id;
}

/**
 * Get current user ID, or null if not authenticated
 */
async function getUserId(): Promise<string | null> {
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}

// ============================================================
// Identity Sync
// ============================================================

export interface IdentityData {
  name?: string;
  role?: string;
  company?: string;
  traits?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Save identity to Supabase
 * Creates or updates the user's identity record
 */
export async function saveIdentity(identity: IdentityData): Promise<{ id: string }> {
  const userId = await requireUserId();
  const client = getClient();

  const { data, error } = await client
    .from('identities')
    .upsert(
      {
        user_id: userId,
        data: identity,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { id: data.id };
}

/**
 * Load identity from Supabase
 * Returns null if not authenticated or no identity exists
 */
export async function loadIdentity(): Promise<IdentityData | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const client = getClient();

  const { data, error } = await client
    .from('identities')
    .select('data')
    .eq('user_id', userId)
    .single();

  // PGRST116 = no rows found, which is fine
  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message);
  }

  return data?.data || null;
}

// ============================================================
// Context Events Sync
// ============================================================

export type ContextEventType = 'page_visit' | 'selection' | 'conversation' | 'insight' | 'file';

export interface ContextEvent {
  id: string;
  type: ContextEventType;
  source: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface ContextOptions {
  type?: ContextEventType;
  source?: string;
  limit?: number;
}

/**
 * Add a context event to Supabase
 */
export async function addContextEvent(
  type: ContextEventType,
  source: string,
  data: Record<string, unknown>
): Promise<ContextEvent> {
  const userId = await requireUserId();
  const client = getClient();

  const { data: result, error } = await client
    .from('context_events')
    .insert({
      user_id: userId,
      type,
      source,
      data,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return result;
}

/**
 * Get recent context events from Supabase
 */
export async function getRecentContext(options: ContextOptions = {}): Promise<ContextEvent[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const client = getClient();
  const { type, source, limit = 50 } = options;

  let query = client
    .from('context_events')
    .select('*')
    .eq('user_id', userId);

  if (type) {
    query = query.eq('type', type);
  }

  if (source) {
    query = query.eq('source', source);
  }

  query = query.order('timestamp', { ascending: false }).limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Clear all context events for the current user
 */
export async function clearContext(): Promise<void> {
  const userId = await requireUserId();
  const client = getClient();

  const { error } = await client
    .from('context_events')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }
}
