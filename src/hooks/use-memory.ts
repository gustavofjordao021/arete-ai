import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, LIMITS } from '@/lib/constants';

export interface Fact {
  fact: string;
  timestamp?: number;
}

export interface Page {
  url: string;
  title?: string;
  timestamp?: number;
}

export interface MemoryStats {
  factsCount: number;
  factsPercent: number;
  pagesCount: number;
  pagesPercent: number;
  messagesCount: number;
  storageKb: number;
}

export interface UseMemoryResult {
  stats: MemoryStats;
  facts: Fact[];
  pages: Page[];
  loading: boolean;
  refresh: () => void;
}

/**
 * Hook for managing memory stats (facts, pages, messages)
 */
export function useMemory(): UseMemoryResult {
  const [stats, setStats] = useState<MemoryStats>({
    factsCount: 0,
    factsPercent: 0,
    pagesCount: 0,
    pagesPercent: 0,
    messagesCount: 0,
    storageKb: 0,
  });
  const [facts, setFacts] = useState<Fact[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMemory = useCallback(() => {
    chrome.storage.local.get(null, (result) => {
      // Get arrays from storage
      const storedFacts = result[STORAGE_KEYS.facts] || [];
      const storedPages = result[STORAGE_KEYS.pages] || [];
      const storedConversation = result[STORAGE_KEYS.conversation] || [];

      // Calculate storage size
      const totalBytes = JSON.stringify(result).length;
      const storageKb = parseFloat((totalBytes / 1024).toFixed(1));

      // Calculate percentages
      const factsPercent = Math.round((storedFacts.length / LIMITS.maxFacts) * 100);
      const pagesPercent = Math.round((storedPages.length / LIMITS.maxPages) * 100);

      setStats({
        factsCount: storedFacts.length,
        factsPercent,
        pagesCount: storedPages.length,
        pagesPercent,
        messagesCount: storedConversation.length,
        storageKb,
      });
      setFacts(storedFacts);
      setPages(storedPages);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  return {
    stats,
    facts,
    pages,
    loading,
    refresh: loadMemory,
  };
}
