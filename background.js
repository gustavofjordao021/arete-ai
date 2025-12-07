/**
 * Background service worker for Arete extension
 * Handles API calls that popup.js can't make directly
 */

import { CLAUDE_API_KEY } from './src/keys.js';
import {
  signInWithGoogle,
  signOut,
  getAuthState,
  initAuth,
  saveIdentity,
  loadIdentity,
  subscribeToIdentityChanges,
  unsubscribeAll,
  syncPageVisit,
  syncFact,
  syncConversationMessage,
  loadPagesFromCloud,
  loadFactsFromCloud,
  loadConversationFromCloud,
} from './src/supabase';

// Track realtime subscription
let identityUnsubscribe = null;

/**
 * Start listening for realtime identity changes
 * Broadcasts to popup when identity updates from another device
 */
async function startRealtimeSync() {
  // Clean up existing subscription
  if (identityUnsubscribe) {
    await identityUnsubscribe();
    identityUnsubscribe = null;
  }

  try {
    identityUnsubscribe = await subscribeToIdentityChanges((identity) => {
      console.log('Arete: Identity updated from another device');
      // Broadcast to any open popup/content scripts
      chrome.runtime.sendMessage({
        type: 'IDENTITY_UPDATED',
        identity,
      }).catch(() => {
        // Ignore errors if no listeners (popup closed)
      });
    });
    console.log('Arete: Realtime sync started');
  } catch (err) {
    console.warn('Arete: Could not start realtime sync:', err.message);
  }
}

/**
 * Stop realtime sync (on sign out)
 */
async function stopRealtimeSync() {
  if (identityUnsubscribe) {
    await identityUnsubscribe();
    identityUnsubscribe = null;
  }
  await unsubscribeAll();
  console.log('Arete: Realtime sync stopped');
}

// Initialize Supabase auth with env vars (injected at build time)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  initAuth({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
  console.log('Arete: Supabase auth initialized');

  // Start realtime sync if already authenticated
  getAuthState().then((state) => {
    if (state.isAuthenticated) {
      startRealtimeSync();
    }
  });
} else {
  console.warn('Arete: Supabase credentials not configured');
}

// Optimized extraction prompt (v2 with XML tags)
const EXTRACTION_SYSTEM_PROMPT = `You are an identity extraction system. Extract structured information from user-provided text.

<instructions>
- Extract ONLY information explicitly stated or clearly implied
- Use empty strings for missing text fields, empty arrays for missing lists
- Be concise - capture essence, not verbatim quotes
- Preserve the user's voice in communication preferences
- Output ONLY valid JSON - no markdown, no explanation
- The output will be parsed with JSON.parse() so it must be valid
</instructions>

<schema>
{
  "core": {
    "name": "string - ONLY a person's actual name (e.g., 'John Smith'). Leave empty if no name given. Job titles are NOT names.",
    "role": "string - job title and company",
    "location": "string - current city/country where they LIVE or WORK. Nationality/heritage is NOT location.",
    "background": "string - brief professional/personal summary (max 50 words)"
  },
  "communication": {
    "style": ["array of preferences: direct, casual, formal, technical, friendly"],
    "format": ["array of format preferences: bullet points, code examples, detailed, concise"],
    "avoid": ["array of things to avoid: emojis, fluff, disclaimers, long explanations"]
  },
  "expertise": ["array of skills, technologies, domains"],
  "currentFocus": {
    "projects": [{"name": "string", "description": "string", "status": "active|paused|completed"}],
    "goals": ["array of current goals"]
  },
  "context": {
    "personal": ["array of personal interests, background, lifestyle"],
    "professional": ["array of professional context beyond role"]
  }
}
</schema>

<example>
<input>
I'm Alex Chen, a senior engineer at Stripe working on payment infrastructure. Based in SF. I work with Go and Python daily. I like concise, technical responses with code examples. Skip the fluff and pleasantries.
</input>
<output>
{"core":{"name":"Alex Chen","role":"Senior Engineer at Stripe","location":"San Francisco","background":"Works on payment infrastructure"},"communication":{"style":["technical","concise"],"format":["code examples"],"avoid":["fluff","pleasantries"]},"expertise":["Go","Python","payment infrastructure"],"currentFocus":{"projects":[],"goals":[]},"context":{"personal":[],"professional":["payment systems"]}}
</output>
</example>`;

/**
 * Call Claude Haiku for identity extraction
 */
async function extractIdentityWithLLM(prose) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `<input>\n${prose}\n</input>\n\nOutput valid JSON only:`
      }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Validate response structure
  if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
    throw new Error('Invalid API response: missing or empty content array');
  }
  if (!data.content[0].text) {
    throw new Error('Invalid API response: missing text in content');
  }

  const content = data.content[0].text;

  // Parse JSON from response (handle potential markdown fencing)
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  return JSON.parse(jsonStr);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_IDENTITY') {
    extractIdentityWithLLM(request.prose)
      .then(identity => sendResponse({ success: true, identity }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }

  if (request.type === 'GET_AUTH_STATE') {
    getAuthState()
      .then(state => sendResponse(state))
      .catch(error => {
        console.error('Auth state error:', error);
        sendResponse({ isAuthenticated: false, user: null, loading: false });
      });
    return true;
  }

  if (request.type === 'SIGN_IN_WITH_GOOGLE') {
    signInWithGoogle()
      .then(async (user) => {
        // Start realtime sync after sign in
        await startRealtimeSync();
        sendResponse({ success: true, user });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'SIGN_OUT') {
    // Stop realtime sync before sign out
    stopRealtimeSync()
      .then(() => signOut())
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'SAVE_IDENTITY_TO_CLOUD') {
    saveIdentity(request.identity)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'LOAD_IDENTITY_FROM_CLOUD') {
    loadIdentity()
      .then(identity => sendResponse({ success: true, identity }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Context sync handlers
  if (request.type === 'SYNC_PAGE_VISIT') {
    const { url, title, hostname } = request;
    syncPageVisit(url, title, hostname)
      .then(synced => sendResponse({ success: true, synced }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'SYNC_FACT') {
    const { fact } = request;
    syncFact(fact)
      .then(saved => sendResponse({ success: true, saved }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'SYNC_CONVERSATION') {
    const { role, content, metadata } = request;
    syncConversationMessage(role, content, metadata || {})
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.type === 'LOAD_CONTEXT_FROM_CLOUD') {
    Promise.all([
      loadPagesFromCloud(),
      loadFactsFromCloud(),
      loadConversationFromCloud(),
    ])
      .then(([pages, facts, conversation]) => {
        sendResponse({ success: true, pages, facts, conversation });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
