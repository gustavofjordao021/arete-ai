import { describe, it, expect } from 'vitest';
import { PREFIX, STORAGE_KEYS, LIMITS, MESSAGE_TYPES } from './constants';

describe('constants', () => {
  describe('PREFIX', () => {
    it('has correct value', () => {
      expect(PREFIX).toBe('arete_');
    });
  });

  describe('STORAGE_KEYS', () => {
    it('has identity key', () => {
      expect(STORAGE_KEYS.identity).toBe('arete_identity');
    });

    it('has conversation key', () => {
      expect(STORAGE_KEYS.conversation).toBe('arete_conversation');
    });

    it('has facts key', () => {
      expect(STORAGE_KEYS.facts).toBe('arete_facts_learned');
    });

    it('has pages key', () => {
      expect(STORAGE_KEYS.pages).toBe('arete_context_pages');
    });

    it('has preferences key', () => {
      expect(STORAGE_KEYS.preferences).toBe('arete_preferences');
    });

    it('all keys start with prefix', () => {
      Object.values(STORAGE_KEYS).forEach((key) => {
        expect(key.startsWith('arete_')).toBe(true);
      });
    });
  });

  describe('LIMITS', () => {
    it('has maxFacts limit', () => {
      expect(LIMITS.maxFacts).toBe(50);
    });

    it('has maxPages limit', () => {
      expect(LIMITS.maxPages).toBe(20);
    });
  });

  describe('MESSAGE_TYPES', () => {
    it('has all required message types', () => {
      expect(MESSAGE_TYPES.GET_AUTH_STATE).toBe('GET_AUTH_STATE');
      expect(MESSAGE_TYPES.SIGN_IN_WITH_GOOGLE).toBe('SIGN_IN_WITH_GOOGLE');
      expect(MESSAGE_TYPES.SIGN_OUT).toBe('SIGN_OUT');
      expect(MESSAGE_TYPES.EXTRACT_IDENTITY).toBe('EXTRACT_IDENTITY');
      expect(MESSAGE_TYPES.SAVE_IDENTITY_TO_CLOUD).toBe('SAVE_IDENTITY_TO_CLOUD');
      expect(MESSAGE_TYPES.LOAD_IDENTITY_FROM_CLOUD).toBe('LOAD_IDENTITY_FROM_CLOUD');
      expect(MESSAGE_TYPES.LOAD_CONTEXT_FROM_CLOUD).toBe('LOAD_CONTEXT_FROM_CLOUD');
      expect(MESSAGE_TYPES.IDENTITY_UPDATED).toBe('IDENTITY_UPDATED');
    });
  });
});
