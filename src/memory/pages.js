import { memory } from './store.js';
import { MEMORY_LIMITS, getOptimizedPages } from './manager.js';

const MAX_PAGES = MEMORY_LIMITS.maxPages; // Keep last N pages

/**
 * Record a page visit
 */
export async function recordPageVisit(url, title) {
  // Skip chrome:// and extension pages
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }

  try {
    const hostname = new URL(url).hostname;
    const visit = {
      url,
      title: title || hostname,
      hostname,
      timestamp: Date.now(),
    };

    // Get existing pages
    let pages = await memory.get('context', 'pages') || [];

    // Remove duplicate URLs (keep latest)
    pages = pages.filter(p => p.url !== url);

    // Add new visit at the beginning
    pages.unshift(visit);

    // Trim to max size
    if (pages.length > MAX_PAGES) {
      pages = pages.slice(0, MAX_PAGES);
    }

    await memory.set('context', 'pages', pages);
    console.log('Arete: Recorded page visit:', hostname);

    // Sync to cloud via background script
    chrome.runtime.sendMessage({
      type: 'SYNC_PAGE_VISIT',
      url,
      title: title || hostname,
      hostname,
    }).catch(() => {
      // Ignore errors if background script not available
    });
  } catch (err) {
    console.warn('Arete: Failed to record page visit:', err.message);
  }
}

/**
 * Get recent page visits
 */
export async function getRecentPages(limit = 5) {
  const pages = await memory.get('context', 'pages') || [];
  return pages.slice(0, limit);
}

/**
 * Get browsing context for prompts (token-optimized)
 */
export async function getBrowsingContext() {
  const pages = await getOptimizedPages();
  if (pages.length === 0) return '';

  const sites = [...new Set(pages.map(p => p.hostname))].slice(0, 5);
  return `\n\nRecent browsing: ${sites.join(', ')}`;
}

/**
 * Get domain frequency (which sites user visits most)
 */
export async function getDomainFrequency() {
  const pages = await memory.get('context', 'pages') || [];
  const counts = {};

  for (const page of pages) {
    counts[page.hostname] = (counts[page.hostname] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

/**
 * Clear page history
 */
export async function clearPageHistory() {
  await memory.remove('context', 'pages');
}
