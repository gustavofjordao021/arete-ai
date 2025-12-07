import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIdentity } from './use-identity';

// Mock chrome APIs
const mockStorageGet = vi.fn();
const mockStorageSet = vi.fn();
const mockSendMessage = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null,
  },
});

const mockIdentity = {
  meta: { version: '1.0.0', lastModified: '2025-01-01T00:00:00Z', deviceId: 'test' },
  core: {
    name: 'Test User',
    role: 'Senior PM',
    location: 'San Francisco',
    background: 'Payments expert',
  },
  communication: { style: ['direct'], format: ['bullet points'], avoid: [] },
  expertise: ['payments', 'AI'],
  currentFocus: { projects: [], goals: [] },
  context: { personal: [], professional: [] },
  privacy: { public: [], private: [], localOnly: [] },
  custom: {},
  sources: [],
};

describe('useIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading state', () => {
    mockStorageGet.mockImplementation(() => {});

    const { result } = renderHook(() => useIdentity());

    expect(result.current.loading).toBe(true);
    expect(result.current.identity).toBe(null);
  });

  it('loads identity from chrome.storage', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({ arete_identity: mockIdentity });
    });

    const { result } = renderHook(() => useIdentity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.identity).toEqual(mockIdentity);
  });

  it('handles missing identity gracefully', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({});
    });

    const { result } = renderHook(() => useIdentity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.identity).toBe(null);
  });

  it('formats identity for display', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({ arete_identity: mockIdentity });
    });

    const { result } = renderHook(() => useIdentity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.formattedIdentity).toContain('Senior PM');
    expect(result.current.formattedIdentity).toContain('Test User');
  });

  it('returns placeholder when no identity', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({});
    });

    const { result } = renderHook(() => useIdentity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.formattedIdentity).toContain('No identity');
  });

  it('saveFromProse extracts identity via background script', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({});
    });
    mockSendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'EXTRACT_IDENTITY') {
        callback({
          success: true,
          identity: mockIdentity.core,
        });
      }
    });
    mockStorageSet.mockImplementation((data, callback) => {
      callback?.();
    });

    const { result } = renderHook(() => useIdentity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.saveFromProse('I am a Senior PM at PayNearMe');
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXTRACT_IDENTITY' }),
      expect.any(Function)
    );
  });

  it('handles extraction error', async () => {
    mockStorageGet.mockImplementation((key, callback) => {
      callback({});
    });
    mockSendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'EXTRACT_IDENTITY') {
        callback({ success: false, error: 'Extraction failed' });
      }
    });

    const { result } = renderHook(() => useIdentity());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.saveFromProse('test');
      })
    ).rejects.toThrow('Extraction failed');
  });
});
