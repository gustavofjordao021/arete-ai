import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './use-auth';

// Mock chrome.runtime
const mockSendMessage = vi.fn();
const mockAddListener = vi.fn();

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: mockAddListener,
      removeListener: vi.fn(),
    },
  },
});

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading state', () => {
    mockSendMessage.mockImplementation((_, callback) => {
      // Don't call callback immediately to test loading state
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBe(null);
  });

  it('loads user from auth state', async () => {
    const mockUser = { email: 'test@example.com' };
    mockSendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'GET_AUTH_STATE') {
        callback({ isAuthenticated: true, user: mockUser });
      }
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('handles unauthenticated state', async () => {
    mockSendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'GET_AUTH_STATE') {
        callback({ isAuthenticated: false, user: null });
      }
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBe(null);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('signIn sends SIGN_IN_WITH_GOOGLE message', async () => {
    const mockUser = { email: 'test@example.com' };
    mockSendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'GET_AUTH_STATE') {
        callback({ isAuthenticated: false, user: null });
      }
      if (msg.type === 'SIGN_IN_WITH_GOOGLE') {
        callback({ success: true, user: mockUser });
      }
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signIn();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      { type: 'SIGN_IN_WITH_GOOGLE' },
      expect.any(Function)
    );
  });

  it('signOut sends SIGN_OUT message', async () => {
    const mockUser = { email: 'test@example.com' };
    mockSendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'GET_AUTH_STATE') {
        callback({ isAuthenticated: true, user: mockUser });
      }
      if (msg.type === 'SIGN_OUT') {
        callback({ success: true });
      }
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      { type: 'SIGN_OUT' },
      expect.any(Function)
    );
  });

  it('handles signIn error', async () => {
    mockSendMessage.mockImplementation((msg, callback) => {
      if (msg.type === 'GET_AUTH_STATE') {
        callback({ isAuthenticated: false, user: null });
      }
      if (msg.type === 'SIGN_IN_WITH_GOOGLE') {
        callback({ success: false, error: 'Auth failed' });
      }
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.signIn();
      })
    ).rejects.toThrow('Auth failed');
  });
});
