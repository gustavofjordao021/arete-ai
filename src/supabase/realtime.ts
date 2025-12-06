/**
 * Realtime Subscriptions - Live sync for identity changes
 *
 * Uses Supabase Realtime to subscribe to postgres_changes
 * and notify when identity data changes on another device.
 */

import { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './auth';
import { IdentityData } from './sync';

// Allow injection for testing
let realtimeClient: SupabaseClient | null = null;

// Track active channels for cleanup
const activeChannels: Map<string, RealtimeChannel> = new Map();

/**
 * Set a custom Supabase client (for testing)
 * @internal
 */
export function _setRealtimeClient(client: SupabaseClient | null): void {
  realtimeClient = client;
}

/**
 * Reset realtime state (for testing)
 * @internal
 */
export function _resetRealtime(): void {
  realtimeClient = null;
  activeChannels.clear();
}

/**
 * Get the Supabase client for realtime operations
 */
function getClient(): SupabaseClient {
  if (realtimeClient) return realtimeClient;
  return getSupabase();
}

/**
 * Get current user ID
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
 * Subscribe to identity changes for the current user
 *
 * Calls the callback whenever the user's identity is updated
 * from another device or client.
 *
 * @param callback - Function to call with updated identity data
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unsubscribe = await subscribeToIdentityChanges((identity) => {
 *   console.log('Identity updated:', identity);
 *   // Update UI with new identity
 * });
 *
 * // Later, to stop listening:
 * await unsubscribe();
 * ```
 */
export async function subscribeToIdentityChanges(
  callback: (identity: IdentityData) => void
): Promise<() => Promise<void>> {
  const userId = await requireUserId();
  const client = getClient();

  const channelName = `identity-changes-${userId}`;

  const channel = client
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'identities',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Only notify on INSERT or UPDATE (not DELETE)
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newData = (payload.new as { data: IdentityData }).data;
          callback(newData);
        }
      }
    )
    .subscribe();

  // Track for cleanup
  activeChannels.set(channelName, channel);

  // Return unsubscribe function
  return async () => {
    activeChannels.delete(channelName);
    await client.removeChannel(channel);
  };
}

/**
 * Unsubscribe from all active realtime channels
 *
 * Call this on sign-out or when cleaning up.
 */
export async function unsubscribeAll(): Promise<void> {
  const client = getClient();

  const removePromises = Array.from(activeChannels.values()).map((channel) =>
    client.removeChannel(channel)
  );

  await Promise.all(removePromises);
  activeChannels.clear();
}
