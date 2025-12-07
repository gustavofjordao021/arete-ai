/**
 * Context Sync - Syncs pages, facts, and conversations to Supabase
 *
 * Wraps local chrome.storage operations with cloud sync.
 * Designed to be called from existing memory/pages/facts/conversation modules.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './auth';

// Storage keys (must match existing extension keys)
const PAGES_KEY = 'arete_context_pages';
const FACTS_KEY = 'arete_facts_learned';
const CONVERSATION_KEY = 'arete_conversation';

// Limits (sync with manager.js)
const MAX_PAGES = 20;
const MAX_FACTS = 50;

// Similarity threshold for fact deduplication
const SIMILARITY_THRESHOLD = 0.7;

// Allow injection for testing
let contextSyncClient: SupabaseClient | null = null;

/**
 * Set a custom Supabase client (for testing)
 * @internal
 */
export function _setContextSyncClient(client: SupabaseClient | null): void {
  contextSyncClient = client;
}

/**
 * Reset context sync state (for testing)
 * @internal
 */
export function _resetContextSync(): void {
  contextSyncClient = null;
}

/**
 * Get the Supabase client for context sync
 */
function getClient(): SupabaseClient | null {
  if (contextSyncClient) return contextSyncClient;
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

/**
 * Get current user ID, or null if not authenticated
 */
async function getUserId(): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Calculate string similarity (Jaccard index on words)
 */
function stringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// ============================================================
// Page Visit Sync
// ============================================================

interface PageVisit {
  url: string;
  title: string;
  hostname: string;
  timestamp: number;
}

/**
 * Sync a page visit to local storage AND cloud
 *
 * @param url - Page URL
 * @param title - Page title
 * @param hostname - Page hostname
 * @returns true if synced to cloud, false if local only
 */
export async function syncPageVisit(
  url: string,
  title: string,
  hostname: string
): Promise<boolean> {
  // Skip chrome:// and extension pages
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return false;
  }

  const visit: PageVisit = {
    url,
    title: title || hostname,
    hostname,
    timestamp: Date.now(),
  };

  // Save to local storage
  const storage = await chrome.storage.local.get(PAGES_KEY);
  let pages: PageVisit[] = storage[PAGES_KEY] || [];

  // Remove duplicate URLs (keep latest)
  pages = pages.filter((p) => p.url !== url);

  // Add new visit at the beginning
  pages.unshift(visit);

  // Trim to max size
  if (pages.length > MAX_PAGES) {
    pages = pages.slice(0, MAX_PAGES);
  }

  await chrome.storage.local.set({ [PAGES_KEY]: pages });

  // Sync to cloud if authenticated
  const userId = await getUserId();
  if (!userId) return false;

  const client = getClient();
  if (!client) return false;

  try {
    await client
      .from('context_events')
      .insert({
        user_id: userId,
        type: 'page_visit',
        source: 'chrome-extension',
        data: { url, title, hostname },
      })
      .select()
      .single();

    return true;
  } catch {
    // Cloud sync failed, but local save succeeded
    return false;
  }
}

// ============================================================
// Fact Sync
// ============================================================

interface Fact {
  fact: string;
  _timestamp: number;
}

/**
 * Sync a fact to local storage AND cloud
 *
 * @param factText - The fact to save
 * @returns true if saved, false if duplicate
 */
export async function syncFact(factText: string): Promise<boolean> {
  // Get existing facts
  const storage = await chrome.storage.local.get(FACTS_KEY);
  const facts: Fact[] = storage[FACTS_KEY] || [];

  // Check for duplicates
  for (const existing of facts) {
    const similarity = stringSimilarity(factText, existing.fact);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return false; // Duplicate
    }
  }

  // Add new fact
  const newFact: Fact = {
    fact: factText,
    _timestamp: Date.now(),
  };

  facts.push(newFact);

  // Trim to max size (keep most recent)
  const trimmedFacts = facts.slice(-MAX_FACTS);

  await chrome.storage.local.set({ [FACTS_KEY]: trimmedFacts });

  // Sync to cloud if authenticated
  const userId = await getUserId();
  if (!userId) return true; // Saved locally

  const client = getClient();
  if (!client) return true;

  try {
    await client
      .from('context_events')
      .insert({
        user_id: userId,
        type: 'insight',
        source: 'chrome-extension',
        data: { fact: factText },
      })
      .select()
      .single();

    return true;
  } catch {
    // Cloud sync failed, but local save succeeded
    return true;
  }
}

// ============================================================
// Conversation Sync
// ============================================================

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  url?: string;
  model?: string;
}

interface ConversationMetadata {
  url?: string;
  model?: string;
}

/**
 * Sync a conversation message to local storage AND cloud
 *
 * @param role - Message role (user, assistant, system)
 * @param content - Message content
 * @param metadata - Optional metadata (url, model)
 */
export async function syncConversationMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata: ConversationMetadata = {}
): Promise<void> {
  const message: ConversationMessage = {
    role,
    content,
    timestamp: Date.now(),
    url: metadata.url,
    model: metadata.model,
  };

  // Save to local storage
  const storage = await chrome.storage.local.get(CONVERSATION_KEY);
  const messages: ConversationMessage[] = storage[CONVERSATION_KEY] || [];

  messages.push(message);

  await chrome.storage.local.set({ [CONVERSATION_KEY]: messages });

  // Sync to cloud if authenticated
  const userId = await getUserId();
  if (!userId) return;

  const client = getClient();
  if (!client) return;

  try {
    await client
      .from('context_events')
      .insert({
        user_id: userId,
        type: 'conversation',
        source: 'chrome-extension',
        data: { role, content, model: metadata.model, url: metadata.url },
      })
      .select()
      .single();
  } catch {
    // Cloud sync failed, but local save succeeded
  }
}

// ============================================================
// Load from Cloud
// ============================================================

/**
 * Load page visits from cloud
 */
export async function loadPagesFromCloud(): Promise<PageVisit[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('context_events')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'page_visit')
      .order('timestamp', { ascending: false })
      .limit(MAX_PAGES);

    if (error) return [];

    return (data || []).map((event) => ({
      url: (event.data as { url: string }).url,
      title: (event.data as { title: string }).title,
      hostname: (event.data as { hostname: string }).hostname,
      timestamp: new Date(event.timestamp).getTime(),
    }));
  } catch {
    return [];
  }
}

/**
 * Load facts from cloud
 */
export async function loadFactsFromCloud(): Promise<Fact[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('context_events')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'insight')
      .order('timestamp', { ascending: false })
      .limit(MAX_FACTS);

    if (error) return [];

    return (data || []).map((event) => ({
      fact: (event.data as { fact: string }).fact,
      _timestamp: new Date(event.timestamp).getTime(),
    }));
  } catch {
    return [];
  }
}

/**
 * Load conversation from cloud
 */
export async function loadConversationFromCloud(): Promise<ConversationMessage[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('context_events')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'conversation')
      .order('timestamp', { ascending: true }) // Chronological order
      .limit(100);

    if (error) return [];

    return (data || []).map((event) => ({
      role: (event.data as { role: 'user' | 'assistant' | 'system' }).role,
      content: (event.data as { content: string }).content,
      timestamp: new Date(event.timestamp).getTime(),
      url: (event.data as { url?: string }).url,
      model: (event.data as { model?: string }).model,
    }));
  } catch {
    return [];
  }
}
