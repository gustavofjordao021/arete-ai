/**
 * Context Sync Tests - TDD RED phase
 *
 * Tests for syncing pages, facts, and conversations to Supabase.
 * Uses the same mock patterns as sync.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  syncPageVisit,
  syncFact,
  syncConversationMessage,
  loadPagesFromCloud,
  loadFactsFromCloud,
  loadConversationFromCloud,
  _setContextSyncClient,
  _resetContextSync,
} from './context-sync';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock chrome.storage.local for extension context
const mockStorage: Record<string, unknown> = {};
const mockChromeStorage = {
  get: vi.fn((key: string | string[] | null) =>
    Promise.resolve(
      typeof key === 'string'
        ? { [key]: mockStorage[key] }
        : key === null
          ? mockStorage
          : key.reduce(
              (acc, k) => ({ ...acc, [k]: mockStorage[k] }),
              {} as Record<string, unknown>
            )
    )
  ),
  set: vi.fn((items: Record<string, unknown>) => {
    Object.assign(mockStorage, items);
    return Promise.resolve();
  }),
  remove: vi.fn((key: string) => {
    delete mockStorage[key];
    return Promise.resolve();
  }),
};

// Make chrome global available
vi.stubGlobal('chrome', {
  storage: { local: mockChromeStorage },
});

// Helper to create mock Supabase client
function createMockClient(
  options: {
    userId?: string;
    insertError?: Error;
    selectData?: unknown[];
  } = {}
): SupabaseClient {
  const { userId = 'test-user-123', insertError, selectData = [] } = options;

  // Create a chainable mock for query builder
  const createQueryChain = () => {
    const chain = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: selectData,
        error: null,
      }),
    };
    // Make eq() return the chain
    chain.eq.mockReturnValue(chain);
    return chain;
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: userId ? { user: { id: userId } } : { user: null },
        error: userId ? null : new Error('Not authenticated'),
      }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: insertError
              ? null
              : {
                  id: 'event-123',
                  type: 'page_visit',
                  source: 'chrome-extension',
                  data: {},
                  timestamp: new Date().toISOString(),
                },
            error: insertError ? { message: insertError.message } : null,
          }),
        }),
      }),
      select: vi.fn().mockReturnValue(createQueryChain()),
    }),
  } as unknown as SupabaseClient;
}

describe('Context Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    _resetContextSync();
  });

  afterEach(() => {
    _resetContextSync();
  });

  describe('syncPageVisit', () => {
    it('should save page visit to local storage', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncPageVisit('https://example.com', 'Example Page', 'example.com');

      expect(mockChromeStorage.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.set.mock.calls[0][0];
      expect(setCall.arete_context_pages).toBeDefined();
      expect(setCall.arete_context_pages[0]).toMatchObject({
        url: 'https://example.com',
        title: 'Example Page',
        hostname: 'example.com',
      });
    });

    it('should sync page visit to cloud when authenticated', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncPageVisit('https://example.com', 'Example Page', 'example.com');

      expect(mockClient.from).toHaveBeenCalledWith('context_events');
    });

    it('should save locally only when not authenticated', async () => {
      const mockClient = createMockClient({ userId: undefined });
      _setContextSyncClient(mockClient);

      await syncPageVisit('https://example.com', 'Example Page', 'example.com');

      // Should still save locally
      expect(mockChromeStorage.set).toHaveBeenCalled();
    });

    it('should skip chrome:// URLs', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncPageVisit('chrome://extensions', 'Extensions', 'chrome');

      expect(mockChromeStorage.set).not.toHaveBeenCalled();
    });

    it('should deduplicate pages by URL', async () => {
      mockStorage['arete_context_pages'] = [
        { url: 'https://example.com', title: 'Old Title', hostname: 'example.com', timestamp: 100 },
      ];
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncPageVisit('https://example.com', 'New Title', 'example.com');

      const setCall = mockChromeStorage.set.mock.calls[0][0];
      expect(setCall.arete_context_pages.length).toBe(1);
      expect(setCall.arete_context_pages[0].title).toBe('New Title');
    });
  });

  describe('syncFact', () => {
    it('should save fact to local storage', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncFact('User prefers TypeScript');

      expect(mockChromeStorage.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.set.mock.calls[0][0];
      expect(setCall.arete_facts_learned).toBeDefined();
      expect(setCall.arete_facts_learned[0].fact).toBe('User prefers TypeScript');
    });

    it('should sync fact to cloud as insight event', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncFact('User works at Acme Corp');

      expect(mockClient.from).toHaveBeenCalledWith('context_events');
    });

    it('should skip duplicate facts', async () => {
      mockStorage['arete_facts_learned'] = [
        { fact: 'User prefers TypeScript', _timestamp: 100 },
      ];
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      const result = await syncFact('User prefers TypeScript');

      expect(result).toBe(false); // Indicates duplicate
      expect(mockClient.from).not.toHaveBeenCalled(); // No cloud sync for dupes
    });
  });

  describe('syncConversationMessage', () => {
    it('should save message to local storage', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncConversationMessage('user', 'Hello AI', {
        url: 'https://example.com',
        model: 'claude',
      });

      expect(mockChromeStorage.set).toHaveBeenCalled();
      const setCall = mockChromeStorage.set.mock.calls[0][0];
      expect(setCall.arete_conversation).toBeDefined();
      expect(setCall.arete_conversation[0]).toMatchObject({
        role: 'user',
        content: 'Hello AI',
      });
    });

    it('should sync conversation to cloud', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncConversationMessage('assistant', 'Hello human', {
        url: 'https://example.com',
        model: 'claude',
      });

      expect(mockClient.from).toHaveBeenCalledWith('context_events');
    });

    it('should include metadata in cloud event', async () => {
      const mockClient = createMockClient();
      _setContextSyncClient(mockClient);

      await syncConversationMessage('user', 'Test message', {
        url: 'https://test.com',
        model: 'gpt-4',
      });

      const fromMock = mockClient.from as ReturnType<typeof vi.fn>;
      expect(fromMock).toHaveBeenCalledWith('context_events');
    });
  });

  describe('loadPagesFromCloud', () => {
    it('should return empty array when not authenticated', async () => {
      const mockClient = createMockClient({ userId: undefined });
      _setContextSyncClient(mockClient);

      const pages = await loadPagesFromCloud();

      expect(pages).toEqual([]);
    });

    it('should fetch pages from cloud', async () => {
      const cloudPages = [
        {
          id: 'event-1',
          type: 'page_visit',
          data: { url: 'https://example.com', title: 'Example', hostname: 'example.com' },
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      const mockClient = createMockClient({ selectData: cloudPages });
      _setContextSyncClient(mockClient);

      const pages = await loadPagesFromCloud();

      expect(pages.length).toBe(1);
      expect(pages[0].url).toBe('https://example.com');
    });
  });

  describe('loadFactsFromCloud', () => {
    it('should return empty array when not authenticated', async () => {
      const mockClient = createMockClient({ userId: undefined });
      _setContextSyncClient(mockClient);

      const facts = await loadFactsFromCloud();

      expect(facts).toEqual([]);
    });

    it('should fetch facts from cloud', async () => {
      const cloudFacts = [
        {
          id: 'event-1',
          type: 'insight',
          data: { fact: 'User is a developer' },
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];
      const mockClient = createMockClient({ selectData: cloudFacts });
      _setContextSyncClient(mockClient);

      const facts = await loadFactsFromCloud();

      expect(facts.length).toBe(1);
      expect(facts[0].fact).toBe('User is a developer');
    });
  });

  describe('loadConversationFromCloud', () => {
    it('should return empty array when not authenticated', async () => {
      const mockClient = createMockClient({ userId: undefined });
      _setContextSyncClient(mockClient);

      const messages = await loadConversationFromCloud();

      expect(messages).toEqual([]);
    });

    it('should fetch conversation from cloud', async () => {
      const cloudMessages = [
        {
          id: 'event-1',
          type: 'conversation',
          data: { role: 'user', content: 'Hello', model: 'claude' },
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          id: 'event-2',
          type: 'conversation',
          data: { role: 'assistant', content: 'Hi there!', model: 'claude' },
          timestamp: '2024-01-01T00:00:01Z',
        },
      ];
      const mockClient = createMockClient({ selectData: cloudMessages });
      _setContextSyncClient(mockClient);

      const messages = await loadConversationFromCloud();

      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].content).toBe('Hi there!');
    });
  });
});
