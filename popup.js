const PREFIX = 'arete_';
const IDENTITY_KEY = 'arete_identity';

// Memory limits (sync with manager.js)
const LIMITS = {
  maxFacts: 50,
  maxPages: 20,
};

// Tailwind class constants for tab states
const TAB_ACTIVE_CLASSES = ['bg-white', 'shadow-sm', 'text-arete-text'];
const TAB_INACTIVE_CLASSES = ['text-arete-text-tertiary', 'hover:text-arete-text-secondary'];

// Auth state
let currentUser = null;

/**
 * Get current auth state from background script
 */
async function getAuthState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Auth state error:', chrome.runtime.lastError);
        resolve({ isAuthenticated: false, user: null });
      } else {
        resolve(response || { isAuthenticated: false, user: null });
      }
    });
  });
}

/**
 * Sign in with Google via background script
 */
async function signIn() {
  const btn = document.getElementById('auth-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SIGN_IN_WITH_GOOGLE' }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!res?.success) {
          reject(new Error(res?.error || 'Sign in failed'));
        } else {
          resolve(res);
        }
      });
    });

    currentUser = response.user;
    updateAuthUI();
  } catch (err) {
    console.error('Sign in error:', err);
    alert('Sign in failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

/**
 * Sign out via background script
 */
async function signOutUser() {
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!res?.success) {
          reject(new Error(res?.error || 'Sign out failed'));
        } else {
          resolve(res);
        }
      });
    });

    currentUser = null;
    updateAuthUI();
  } catch (err) {
    console.error('Sign out error:', err);
    alert('Sign out failed: ' + err.message);
  }
}

/**
 * Update auth button UI based on current state
 */
function updateAuthUI() {
  const btn = document.getElementById('auth-btn');

  if (currentUser) {
    const email = currentUser.email || 'User';
    const initial = email.charAt(0).toUpperCase();
    btn.innerHTML = `
      <div class="w-6 h-6 bg-arete-accent rounded-full flex items-center justify-center text-white text-xs font-medium">${initial}</div>
      <span class="max-w-[100px] truncate">${email}</span>
    `;
    btn.onclick = signOutUser;
    btn.title = 'Click to sign out';
  } else {
    btn.innerHTML = 'Sign in';
    btn.onclick = signIn;
    btn.title = 'Sign in with Google';
    btn.disabled = false;
  }
}

/**
 * Extract identity from prose using LLM via background script
 * Uses Claude Haiku for accurate natural language understanding
 */
async function extractIdentityWithLLM(prose) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'EXTRACT_IDENTITY', prose },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response) {
          reject(new Error('No response from background script'));
        } else if (!response.success) {
          reject(new Error(response.error || 'Extraction failed'));
        } else {
          // Wrap extracted data in full identity structure
          const extracted = response.identity;
          const identity = {
            meta: {
              version: "1.0.0",
              lastModified: new Date().toISOString(),
              deviceId: "browser",
            },
            core: extracted.core || {},
            communication: extracted.communication || { style: [], format: [], avoid: [] },
            expertise: extracted.expertise || [],
            currentFocus: extracted.currentFocus || { projects: [], goals: [] },
            context: extracted.context || { personal: [], professional: [] },
            privacy: { public: [], private: [], localOnly: [] },
            custom: {},
            sources: [{ field: "all", source: "user_input", confidence: "high", timestamp: new Date().toISOString() }],
          };
          resolve(identity);
        }
      }
    );
  });
}

function formatIdentityForDisplay(identity) {
  if (!identity || !identity.core) {
    return 'No identity configured yet.\n\nClick "Edit" to set up your identity.';
  }

  const parts = [];

  if (identity.core.name) parts.push(`Name: ${identity.core.name}`);
  if (identity.core.role) parts.push(`Role: ${identity.core.role}`);
  if (identity.core.location) parts.push(`Location: ${identity.core.location}`);
  if (identity.core.background) parts.push(`Background: ${identity.core.background}`);
  if (identity.expertise?.length > 0) parts.push(`Expertise: ${identity.expertise.join(', ')}`);
  if (identity.communication?.style?.length > 0) parts.push(`Style: ${identity.communication.style.join(', ')}`);
  if (identity.communication?.avoid?.length > 0) parts.push(`Avoid: ${identity.communication.avoid.join(', ')}`);
  if (identity.currentFocus?.projects?.length > 0) {
    parts.push(`Projects: ${identity.currentFocus.projects.map(p => p.name).join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No identity details yet.';
}

async function getAllStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

async function clearStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

async function loadStats() {
  try {
    const all = await getAllStorage();
    console.log('Popup storage:', all);

    // Count facts
    const facts = all[`${PREFIX}facts_learned`] || [];
    const factsPercent = Math.round((facts.length / LIMITS.maxFacts) * 100);
    document.getElementById('facts-count').textContent = facts.length;
    document.getElementById('facts-limit').textContent = `/${LIMITS.maxFacts}`;
    updateProgressBar('facts-bar', factsPercent);

    // Count pages
    const pages = all[`${PREFIX}context_pages`] || [];
    const pagesPercent = Math.round((pages.length / LIMITS.maxPages) * 100);
    document.getElementById('pages-count').textContent = pages.length;
    document.getElementById('pages-limit').textContent = `/${LIMITS.maxPages}`;
    updateProgressBar('pages-bar', pagesPercent);

    // Count messages
    const conversation = all['arete_conversation'] || [];
    document.getElementById('messages-count').textContent = conversation.length;

    // Calculate total storage size
    const totalBytes = JSON.stringify(all).length;
    const totalKb = (totalBytes / 1024).toFixed(1);
    document.getElementById('storage-size').textContent = `${totalKb} KB`;

    // Show facts with Tailwind classes
    const factsList = document.getElementById('facts-list');
    if (facts.length > 0) {
      factsList.innerHTML = '<div class="divide-y divide-arete-border">' +
        facts
          .slice(-10)
          .reverse()
          .map(f => `<div class="px-4 py-3 text-sm text-arete-text">${f.fact || f}</div>`)
          .join('') +
        '</div>';
    } else {
      factsList.innerHTML = '<p class="px-4 py-8 text-center text-sm text-arete-text-tertiary italic">No facts learned yet. Chat with the AI to build your memory!</p>';
    }

    // Show identity - prefer cloud if authenticated
    let identity = all[IDENTITY_KEY];

    if (currentUser) {
      try {
        const cloudIdentity = await loadIdentityFromCloud();
        if (cloudIdentity) {
          identity = cloudIdentity;
          // Update local cache with cloud data
          await chrome.storage.local.set({ [IDENTITY_KEY]: identity });
        }
      } catch (cloudErr) {
        console.warn('Failed to load from cloud, using local:', cloudErr);
      }
    }

    document.getElementById('identity-preview').textContent = formatIdentityForDisplay(identity);
  } catch (err) {
    console.error('Arete popup error:', err);
  }
}

function updateProgressBar(id, percent) {
  const bar = document.getElementById(id);
  if (bar) {
    bar.style.width = `${Math.min(percent, 100)}%`;
    // Change color based on usage using Tailwind color classes
    bar.classList.remove('bg-arete-accent', 'bg-amber-500', 'bg-red-500');
    if (percent >= 90) {
      bar.classList.add('bg-red-500');
    } else if (percent >= 70) {
      bar.classList.add('bg-amber-500');
    } else {
      bar.classList.add('bg-arete-accent');
    }
  }
}

async function exportData() {
  const all = await getAllStorage();

  // Format for CLI import compatibility
  const exportPayload = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    source: 'chrome-extension',
    data: {
      context_pages: all[`${PREFIX}context_pages`] || [],
      facts_learned: all[`${PREFIX}facts_learned`] || [],
      conversation: all['arete_conversation'] || [],
      identity: all[IDENTITY_KEY] || null,
    },
  };

  const data = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `arete-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    try {
      const data = JSON.parse(text);
      await chrome.storage.local.set(data);
      loadStats();
      alert('Import successful!');
    } catch (err) {
      alert('Import failed: Invalid JSON');
    }
  };

  input.click();
}

async function clearAll() {
  if (confirm('Clear all Arete memory? This cannot be undone.')) {
    await clearStorage();
    loadStats();
  }
}

// Tab switching with Tailwind classes
function setupTabs() {
  const tabView = document.getElementById('tab-view');
  const tabEdit = document.getElementById('tab-edit');
  const viewPanel = document.getElementById('view-panel');
  const editPanel = document.getElementById('edit-panel');

  function setActiveTab(activeTab, inactiveTab) {
    // Remove all classes first
    activeTab.classList.remove(...TAB_INACTIVE_CLASSES);
    inactiveTab.classList.remove(...TAB_ACTIVE_CLASSES);

    // Add appropriate classes
    activeTab.classList.add(...TAB_ACTIVE_CLASSES);
    inactiveTab.classList.add(...TAB_INACTIVE_CLASSES);
  }

  tabView.addEventListener('click', () => {
    setActiveTab(tabView, tabEdit);
    viewPanel.classList.remove('hidden');
    editPanel.classList.add('hidden');
  });

  tabEdit.addEventListener('click', () => {
    setActiveTab(tabEdit, tabView);
    editPanel.classList.remove('hidden');
    viewPanel.classList.add('hidden');
  });
}

/**
 * Save identity to cloud via background script
 */
async function saveIdentityToCloud(identity) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_IDENTITY_TO_CLOUD', identity },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response?.success) {
          reject(new Error(response?.error || 'Cloud save failed'));
        } else {
          resolve(response.result);
        }
      }
    );
  });
}

/**
 * Load identity from cloud via background script
 */
async function loadIdentityFromCloud() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'LOAD_IDENTITY_FROM_CLOUD' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response?.success) {
          reject(new Error(response?.error || 'Cloud load failed'));
        } else {
          resolve(response.identity);
        }
      }
    );
  });
}

// Save identity from prose
async function saveIdentity() {
  const input = document.getElementById('identity-input');
  const status = document.getElementById('save-status');
  const btn = document.getElementById('save-identity-btn');

  const prose = input.value.trim();
  if (!prose) {
    status.textContent = 'Please enter something about yourself';
    status.className = 'text-xs text-center mt-2 text-red-500';
    return;
  }

  btn.disabled = true;
  status.textContent = 'Analyzing with AI...';
  status.className = 'text-xs text-center mt-2 text-arete-text-tertiary';

  try {
    // Extract identity using LLM (Claude Haiku)
    const identity = await extractIdentityWithLLM(prose);

    // Save to local storage (always)
    await chrome.storage.local.set({ [IDENTITY_KEY]: identity });

    // Sync to cloud if authenticated
    if (currentUser) {
      status.textContent = 'Syncing to cloud...';
      try {
        await saveIdentityToCloud(identity);
        status.textContent = 'Identity saved & synced to cloud!';
      } catch (cloudErr) {
        console.warn('Cloud sync failed:', cloudErr);
        status.textContent = 'Saved locally (cloud sync failed)';
      }
    } else {
      status.textContent = 'Identity saved! Sign in to sync across devices.';
    }

    // Update display
    document.getElementById('identity-preview').textContent = formatIdentityForDisplay(identity);
    status.className = 'text-xs text-center mt-2 text-arete-accent';

    // Switch back to view tab after 1.5s
    setTimeout(() => {
      document.getElementById('tab-view').click();
    }, 1500);
  } catch (err) {
    console.error('Save error:', err);
    status.textContent = 'Failed to save: ' + err.message;
    status.className = 'text-xs text-center mt-2 text-red-500';
  } finally {
    btn.disabled = false;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load auth state first
  const authState = await getAuthState();
  currentUser = authState.user;
  updateAuthUI();

  // Load stats and setup UI
  await loadStats();
  setupTabs();
  document.getElementById('save-identity-btn').addEventListener('click', saveIdentity);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
});
