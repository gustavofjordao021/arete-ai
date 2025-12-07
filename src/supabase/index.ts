/**
 * Supabase integration for Arete Chrome extension
 */

export {
  signInWithGoogle,
  signOut,
  getAuthState,
  onAuthStateChange,
  getSupabase,
  initAuth,
  type AuthState,
  type AuthUser,
  type AuthConfig,
} from './auth';

export {
  createChromeStorageAdapter,
  type StorageAdapter,
  type ChromeStorageAdapterOptions,
} from './storage-adapter';

export {
  saveIdentity,
  loadIdentity,
  addContextEvent,
  getRecentContext,
  clearContext,
  type IdentityData,
  type ContextEvent,
  type ContextEventType,
  type ContextOptions,
} from './sync';

export {
  subscribeToIdentityChanges,
  unsubscribeAll,
} from './realtime';

export {
  syncPageVisit,
  syncFact,
  syncConversationMessage,
  loadPagesFromCloud,
  loadFactsFromCloud,
  loadConversationFromCloud,
} from './context-sync';
