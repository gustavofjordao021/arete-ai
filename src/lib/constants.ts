/**
 * Storage key prefix for all Arete data
 */
export const PREFIX = 'arete_';

/**
 * Chrome storage keys
 */
export const STORAGE_KEYS = {
  identity: 'arete_identity',
  conversation: 'arete_conversation',
  facts: 'arete_facts_learned',
  pages: 'arete_context_pages',
  preferences: 'arete_preferences',
} as const;

/**
 * Memory limits (sync with manager.js)
 */
export const LIMITS = {
  maxFacts: 50,
  maxPages: 20,
} as const;

/**
 * Chrome runtime message types
 */
export const MESSAGE_TYPES = {
  GET_AUTH_STATE: 'GET_AUTH_STATE',
  SIGN_IN_WITH_GOOGLE: 'SIGN_IN_WITH_GOOGLE',
  SIGN_OUT: 'SIGN_OUT',
  EXTRACT_IDENTITY: 'EXTRACT_IDENTITY',
  SAVE_IDENTITY_TO_CLOUD: 'SAVE_IDENTITY_TO_CLOUD',
  LOAD_IDENTITY_FROM_CLOUD: 'LOAD_IDENTITY_FROM_CLOUD',
  LOAD_CONTEXT_FROM_CLOUD: 'LOAD_CONTEXT_FROM_CLOUD',
  IDENTITY_UPDATED: 'IDENTITY_UPDATED',
} as const;
