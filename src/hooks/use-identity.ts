import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, MESSAGE_TYPES } from '@/lib/constants';

export interface Identity {
  meta: {
    version: string;
    lastModified: string;
    deviceId: string;
  };
  core: {
    name?: string;
    role?: string;
    location?: string;
    background?: string;
  };
  communication: {
    style: string[];
    format: string[];
    avoid: string[];
  };
  expertise: string[];
  currentFocus: {
    projects: Array<{ name: string; description?: string }>;
    goals: string[];
  };
  context: {
    personal: string[];
    professional: string[];
  };
  privacy: {
    public: string[];
    private: string[];
    localOnly: string[];
  };
  custom: Record<string, unknown>;
  sources: Array<{
    field: string;
    source: string;
    confidence: string;
    timestamp: string;
  }>;
}

export interface UseIdentityResult {
  identity: Identity | null;
  loading: boolean;
  formattedIdentity: string;
  saveFromProse: (prose: string) => Promise<void>;
  saveIdentity: (identity: Identity) => Promise<void>;
  clearIdentity: () => Promise<void>;
}

/**
 * Format identity for display
 */
function formatIdentity(identity: Identity | null): string {
  if (!identity || !identity.core) {
    return 'No identity configured yet.\n\nClick "Edit" to set up your identity.';
  }

  const parts: string[] = [];
  const { core, expertise, communication, currentFocus } = identity;

  if (core.name) parts.push(`Name: ${core.name}`);
  if (core.role) parts.push(`Role: ${core.role}`);
  if (core.location) parts.push(`Location: ${core.location}`);
  if (core.background) parts.push(`Background: ${core.background}`);
  if (expertise?.length > 0) parts.push(`Expertise: ${expertise.join(', ')}`);
  if (communication?.style?.length > 0) {
    parts.push(`Style: ${communication.style.join(', ')}`);
  }
  if (communication?.avoid?.length > 0) {
    parts.push(`Avoid: ${communication.avoid.join(', ')}`);
  }
  if (currentFocus?.projects?.length > 0) {
    parts.push(`Projects: ${currentFocus.projects.map((p) => p.name).join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No identity details yet.';
}

/**
 * Hook for managing identity state
 */
export function useIdentity(): UseIdentityResult {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);

  // Load identity on mount
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.identity, (result) => {
      setIdentity(result[STORAGE_KEYS.identity] || null);
      setLoading(false);
    });
  }, []);

  const saveIdentity = useCallback(async (newIdentity: Identity) => {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(
        { [STORAGE_KEYS.identity]: newIdentity },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            setIdentity(newIdentity);
            resolve();
          }
        }
      );
    });
  }, []);

  const saveFromProse = useCallback(
    async (prose: string) => {
      return new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: MESSAGE_TYPES.EXTRACT_IDENTITY, prose },
          async (response) => {
            if (!response?.success) {
              reject(new Error(response?.error || 'Extraction failed'));
              return;
            }

            // Build full identity structure from extracted data
            const extracted = response.identity;
            const newIdentity: Identity = {
              meta: {
                version: '1.0.0',
                lastModified: new Date().toISOString(),
                deviceId: 'browser',
              },
              core: extracted.core || extracted || {},
              communication: extracted.communication || { style: [], format: [], avoid: [] },
              expertise: extracted.expertise || [],
              currentFocus: extracted.currentFocus || { projects: [], goals: [] },
              context: extracted.context || { personal: [], professional: [] },
              privacy: { public: [], private: [], localOnly: [] },
              custom: {},
              sources: [
                {
                  field: 'all',
                  source: 'user_input',
                  confidence: 'high',
                  timestamp: new Date().toISOString(),
                },
              ],
            };

            try {
              await saveIdentity(newIdentity);
              resolve();
            } catch (err) {
              reject(err);
            }
          }
        );
      });
    },
    [saveIdentity]
  );

  const clearIdentity = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      chrome.storage.local.remove(STORAGE_KEYS.identity, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          setIdentity(null);
          resolve();
        }
      });
    });
  }, []);

  return {
    identity,
    loading,
    formattedIdentity: formatIdentity(identity),
    saveFromProse,
    saveIdentity,
    clearIdentity,
  };
}
