const STORAGE_KEY = 'arete_conversation';

export const conversation = {
  history: [],

  async load() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    this.history = data[STORAGE_KEY] || [];
    return this.history;
  },

  async append(role, content, metadata = {}) {
    this.history.push({
      role,
      content,
      timestamp: Date.now(),
      url: metadata.url,
      model: metadata.model,
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: this.history });

    // Sync to cloud via background script
    chrome.runtime.sendMessage({
      type: 'SYNC_CONVERSATION',
      role,
      content,
      metadata: { url: metadata.url, model: metadata.model },
    }).catch(() => {
      // Ignore errors if background script not available
    });
  },

  async clear() {
    this.history = [];
    await chrome.storage.local.remove(STORAGE_KEY);
  },

  forAPI() {
    return this.history.map(m => ({ role: m.role, content: m.content }));
  },
};
