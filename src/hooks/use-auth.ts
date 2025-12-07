import { useState, useEffect, useCallback } from 'react';
import { MESSAGE_TYPES } from '@/lib/constants';

export interface User {
  email: string;
  id?: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Hook for managing authentication state via chrome.runtime messages
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load initial auth state
  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: MESSAGE_TYPES.GET_AUTH_STATE },
      (response) => {
        setUser(response?.user || null);
        setLoading(false);
      }
    );

    // Listen for auth state changes from background
    const handleMessage = (request: { type: string; user?: User }) => {
      if (request.type === MESSAGE_TYPES.IDENTITY_UPDATED) {
        // Could also handle auth updates here
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const signIn = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.SIGN_IN_WITH_GOOGLE },
        (response) => {
          if (response?.success) {
            setUser(response.user);
            resolve();
          } else {
            reject(new Error(response?.error || 'Sign in failed'));
          }
        }
      );
    });
  }, []);

  const signOut = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: MESSAGE_TYPES.SIGN_OUT },
        (response) => {
          if (response?.success) {
            setUser(null);
            resolve();
          } else {
            reject(new Error(response?.error || 'Sign out failed'));
          }
        }
      );
    });
  }, []);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    signIn,
    signOut,
  };
}
