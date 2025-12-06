/**
 * Realtime Subscription Tests
 * TDD RED phase - write failing tests first
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribeToIdentityChanges,
  unsubscribeAll,
  _setRealtimeClient,
  _resetRealtime,
} from './realtime';

// Mock channel object
function createMockChannel() {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ status: 'SUBSCRIBED' }),
  };
  return channel;
}

// Mock Supabase client with realtime
function createMockSupabase(channelOverrides = {}) {
  const mockChannel = { ...createMockChannel(), ...channelOverrides };

  return {
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: vi.fn().mockResolvedValue('ok'),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      }),
    },
  };
}

describe('Realtime Subscriptions', () => {
  beforeEach(() => {
    _resetRealtime();
  });

  describe('subscribeToIdentityChanges', () => {
    it('should create a channel subscription', async () => {
      const mockClient = createMockSupabase();
      _setRealtimeClient(mockClient as any);

      const callback = vi.fn();
      const unsubscribe = await subscribeToIdentityChanges(callback);

      expect(mockClient.channel).toHaveBeenCalledWith('identity-changes-user-123');
      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should subscribe to postgres_changes on identities table', async () => {
      const mockChannel = createMockChannel();
      const mockClient = createMockSupabase();
      mockClient.channel = vi.fn().mockReturnValue(mockChannel);
      _setRealtimeClient(mockClient as any);

      const callback = vi.fn();
      await subscribeToIdentityChanges(callback);

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'identities',
        }),
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should filter changes by user_id', async () => {
      const mockChannel = createMockChannel();
      const mockClient = createMockSupabase();
      mockClient.channel = vi.fn().mockReturnValue(mockChannel);
      _setRealtimeClient(mockClient as any);

      await subscribeToIdentityChanges(vi.fn());

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          filter: 'user_id=eq.user-123',
        }),
        expect.any(Function)
      );
    });

    it('should call callback with identity data on UPDATE', async () => {
      const mockChannel = createMockChannel();
      let capturedHandler: ((payload: any) => void) | null = null;

      mockChannel.on = vi.fn().mockImplementation((event, config, handler) => {
        capturedHandler = handler;
        return mockChannel;
      });

      const mockClient = createMockSupabase();
      mockClient.channel = vi.fn().mockReturnValue(mockChannel);
      _setRealtimeClient(mockClient as any);

      const callback = vi.fn();
      await subscribeToIdentityChanges(callback);

      // Simulate an UPDATE event
      capturedHandler!({
        eventType: 'UPDATE',
        new: { data: { name: 'Updated Name' } },
      });

      expect(callback).toHaveBeenCalledWith({ name: 'Updated Name' });
    });

    it('should call callback with identity data on INSERT', async () => {
      const mockChannel = createMockChannel();
      let capturedHandler: ((payload: any) => void) | null = null;

      mockChannel.on = vi.fn().mockImplementation((event, config, handler) => {
        capturedHandler = handler;
        return mockChannel;
      });

      const mockClient = createMockSupabase();
      mockClient.channel = vi.fn().mockReturnValue(mockChannel);
      _setRealtimeClient(mockClient as any);

      const callback = vi.fn();
      await subscribeToIdentityChanges(callback);

      // Simulate an INSERT event
      capturedHandler!({
        eventType: 'INSERT',
        new: { data: { name: 'New Identity' } },
      });

      expect(callback).toHaveBeenCalledWith({ name: 'New Identity' });
    });

    it('should not call callback on DELETE', async () => {
      const mockChannel = createMockChannel();
      let capturedHandler: ((payload: any) => void) | null = null;

      mockChannel.on = vi.fn().mockImplementation((event, config, handler) => {
        capturedHandler = handler;
        return mockChannel;
      });

      const mockClient = createMockSupabase();
      mockClient.channel = vi.fn().mockReturnValue(mockChannel);
      _setRealtimeClient(mockClient as any);

      const callback = vi.fn();
      await subscribeToIdentityChanges(callback);

      // Simulate a DELETE event
      capturedHandler!({
        eventType: 'DELETE',
        old: { data: { name: 'Deleted' } },
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function that removes channel', async () => {
      const mockClient = createMockSupabase();
      _setRealtimeClient(mockClient as any);

      const unsubscribe = await subscribeToIdentityChanges(vi.fn());
      await unsubscribe();

      expect(mockClient.removeChannel).toHaveBeenCalled();
    });

    it('should throw error when not authenticated', async () => {
      const mockClient = createMockSupabase();
      mockClient.auth.getUser = vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      });
      _setRealtimeClient(mockClient as any);

      await expect(subscribeToIdentityChanges(vi.fn())).rejects.toThrow('Not authenticated');
    });
  });

  describe('unsubscribeAll', () => {
    it('should remove all active channels', async () => {
      const mockClient = createMockSupabase();
      _setRealtimeClient(mockClient as any);

      // Create a subscription
      await subscribeToIdentityChanges(vi.fn());

      // Unsubscribe all
      await unsubscribeAll();

      expect(mockClient.removeChannel).toHaveBeenCalled();
    });

    it('should handle no active subscriptions gracefully', async () => {
      const mockClient = createMockSupabase();
      _setRealtimeClient(mockClient as any);

      // Should not throw
      await expect(unsubscribeAll()).resolves.not.toThrow();
    });
  });
});
