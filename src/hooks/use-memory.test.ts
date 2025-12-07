import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMemory } from './use-memory';

// Mock chrome.storage
const mockStorageGet = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: mockStorageGet,
    },
  },
  runtime: {
    lastError: null,
  },
});

describe('useMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading state', () => {
    mockStorageGet.mockImplementation(() => {});

    const { result } = renderHook(() => useMemory());

    expect(result.current.loading).toBe(true);
  });

  it('loads stats from chrome.storage', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({
        arete_facts_learned: [{ fact: 'fact1' }, { fact: 'fact2' }],
        arete_context_pages: [{ url: 'http://example.com' }],
        arete_conversation: [{ role: 'user', content: 'hi' }],
      });
    });

    const { result } = renderHook(() => useMemory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats.factsCount).toBe(2);
    expect(result.current.stats.pagesCount).toBe(1);
    expect(result.current.stats.messagesCount).toBe(1);
  });

  it('calculates storage size', async () => {
    const data = {
      arete_facts_learned: [{ fact: 'test fact' }],
      arete_context_pages: [],
      arete_conversation: [],
    };
    mockStorageGet.mockImplementation((key, callback) => {
      callback(data);
    });

    const { result } = renderHook(() => useMemory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats.storageKb).toBeGreaterThan(0);
  });

  it('returns facts array', async () => {
    const facts = [{ fact: 'fact1' }, { fact: 'fact2' }];
    mockStorageGet.mockImplementation((key, callback) => {
      callback({
        arete_facts_learned: facts,
        arete_context_pages: [],
        arete_conversation: [],
      });
    });

    const { result } = renderHook(() => useMemory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.facts).toEqual(facts);
  });

  it('returns pages array', async () => {
    const pages = [{ url: 'http://example.com', title: 'Example' }];
    mockStorageGet.mockImplementation((key, callback) => {
      callback({
        arete_facts_learned: [],
        arete_context_pages: pages,
        arete_conversation: [],
      });
    });

    const { result } = renderHook(() => useMemory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.pages).toEqual(pages);
  });

  it('calculates percentages based on limits', async () => {
    // 25 facts = 50% of limit (50)
    const facts = Array(25).fill({ fact: 'test' });
    // 10 pages = 50% of limit (20)
    const pages = Array(10).fill({ url: 'http://test.com' });

    mockStorageGet.mockImplementation((key, callback) => {
      callback({
        arete_facts_learned: facts,
        arete_context_pages: pages,
        arete_conversation: [],
      });
    });

    const { result } = renderHook(() => useMemory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats.factsPercent).toBe(50);
    expect(result.current.stats.pagesPercent).toBe(50);
  });

  it('handles empty storage', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({});
    });

    const { result } = renderHook(() => useMemory());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats.factsCount).toBe(0);
    expect(result.current.stats.pagesCount).toBe(0);
    expect(result.current.stats.messagesCount).toBe(0);
    expect(result.current.facts).toEqual([]);
    expect(result.current.pages).toEqual([]);
  });
});
