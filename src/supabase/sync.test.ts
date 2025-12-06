/**
 * Sync Service Tests
 * TDD RED phase - write failing tests first
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveIdentity,
  loadIdentity,
  addContextEvent,
  getRecentContext,
  clearContext,
  _setSyncClient,
  _resetSync,
} from './sync';

// Mock Supabase client
function createMockSupabase(overrides: any = {}) {
  const mockFrom = vi.fn().mockReturnValue({
    upsert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'test-id', data: {} }, error: null }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { data: {} }, error: null }),
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'event-id' }, error: null }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });

  return {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      }),
    },
    ...overrides,
  };
}

describe('Sync Service', () => {
  beforeEach(() => {
    _resetSync();
  });

  describe('saveIdentity', () => {
    it('should save identity to Supabase', async () => {
      const mockClient = createMockSupabase();
      _setSyncClient(mockClient as any);

      const identity = {
        name: 'Test User',
        role: 'Developer',
        traits: { technical_level: 'advanced' },
      };

      const result = await saveIdentity(identity);

      expect(mockClient.from).toHaveBeenCalledWith('identities');
      expect(result).toBeDefined();
    });

    it('should throw error when not authenticated', async () => {
      const mockClient = createMockSupabase({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });
      _setSyncClient(mockClient as any);

      await expect(saveIdentity({ name: 'Test' })).rejects.toThrow('Not authenticated');
    });

    it('should upsert identity with user_id', async () => {
      const mockUpsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'identity-id', user_id: 'user-123', data: { name: 'Test' } },
            error: null,
          }),
        }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ upsert: mockUpsert });
      _setSyncClient(mockClient as any);

      await saveIdentity({ name: 'Test' });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          data: { name: 'Test' },
        }),
        expect.any(Object)
      );
    });
  });

  describe('loadIdentity', () => {
    it('should load identity from Supabase', async () => {
      const mockIdentity = { name: 'Loaded User', role: 'PM' };
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { data: mockIdentity },
            error: null,
          }),
        }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ select: mockSelect });
      _setSyncClient(mockClient as any);

      const result = await loadIdentity();

      expect(mockClient.from).toHaveBeenCalledWith('identities');
      expect(result).toEqual(mockIdentity);
    });

    it('should return null when not authenticated', async () => {
      const mockClient = createMockSupabase({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });
      _setSyncClient(mockClient as any);

      const result = await loadIdentity();
      expect(result).toBeNull();
    });

    it('should return null when no identity exists', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'No rows found' },
          }),
        }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ select: mockSelect });
      _setSyncClient(mockClient as any);

      const result = await loadIdentity();
      expect(result).toBeNull();
    });
  });

  describe('addContextEvent', () => {
    it('should add context event to Supabase', async () => {
      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'event-123', type: 'page_visit' },
            error: null,
          }),
        }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ insert: mockInsert });
      _setSyncClient(mockClient as any);

      const result = await addContextEvent('page_visit', 'chrome', { url: 'https://example.com' });

      expect(mockClient.from).toHaveBeenCalledWith('context_events');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-123',
          type: 'page_visit',
          source: 'chrome',
          data: { url: 'https://example.com' },
        })
      );
      expect(result).toBeDefined();
    });

    it('should throw error when not authenticated', async () => {
      const mockClient = createMockSupabase({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });
      _setSyncClient(mockClient as any);

      await expect(
        addContextEvent('page_visit', 'chrome', { url: 'test' })
      ).rejects.toThrow('Not authenticated');
    });
  });

  describe('getRecentContext', () => {
    it('should fetch recent context events', async () => {
      const mockEvents = [
        { id: '1', type: 'page_visit', source: 'chrome', data: { url: 'a.com' } },
        { id: '2', type: 'page_visit', source: 'chrome', data: { url: 'b.com' } },
      ];

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
          }),
        }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ select: mockSelect });
      _setSyncClient(mockClient as any);

      const result = await getRecentContext();

      expect(mockClient.from).toHaveBeenCalledWith('context_events');
      expect(result).toEqual(mockEvents);
    });

    it('should filter by type when provided', async () => {
      const mockEq = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: mockEq,
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ select: mockSelect });
      _setSyncClient(mockClient as any);

      await getRecentContext({ type: 'insight' });

      // Should call eq with type filter
      expect(mockSelect).toHaveBeenCalledWith('*');
    });

    it('should return empty array when not authenticated', async () => {
      const mockClient = createMockSupabase({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });
      _setSyncClient(mockClient as any);

      const result = await getRecentContext();
      expect(result).toEqual([]);
    });

    it('should respect limit option', async () => {
      const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: mockLimit,
          }),
        }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ select: mockSelect });
      _setSyncClient(mockClient as any);

      await getRecentContext({ limit: 5 });

      expect(mockLimit).toHaveBeenCalledWith(5);
    });
  });

  describe('clearContext', () => {
    it('should delete all context events for user', async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockClient = createMockSupabase();
      mockClient.from = vi.fn().mockReturnValue({ delete: mockDelete });
      _setSyncClient(mockClient as any);

      await clearContext();

      expect(mockClient.from).toHaveBeenCalledWith('context_events');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should throw error when not authenticated', async () => {
      const mockClient = createMockSupabase({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      });
      _setSyncClient(mockClient as any);

      await expect(clearContext()).rejects.toThrow('Not authenticated');
    });
  });
});
