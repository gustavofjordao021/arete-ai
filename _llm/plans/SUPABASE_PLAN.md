# Supabase Cloud Sync Plan

> Created: 2025-12-05
> Status: In Progress

## Goal

Replace local-only storage with Supabase cloud sync, enabling:
- Identity and context sync across devices
- Real-time updates between Chrome extension, CLI, and MCP server
- User accounts with Google OAuth

---

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: UI Foundation | ✅ Complete | Tailwind light theme, resizable overlay |
| Phase 1: Supabase setup | ✅ Complete | Migrations, client module, 29 tests |
| Phase 2: Auth in extension | ✅ Complete | Google OAuth, 27 tests |
| Phase 3: Sync service | ✅ Complete | Identity sync to Supabase, 14 tests |
| Phase 4: Real-time sync | ✅ Complete | Realtime subscriptions, 10 tests |
| Phase 5: CLI/MCP migration | Pending | Update to use Supabase |

---

## Architecture

### Current (Local Only)

```
Chrome Extension ──► chrome.storage.local
                          │
                    [manual export]
                          │
                          ▼
CLI / MCP Server ──► ~/.arete/*.json
```

### Target (Cloud Sync)

```
Chrome Extension ──┐
                   │
CLI ───────────────┼──► Supabase ◄── Real-time sync
                   │    (Postgres)
MCP Server ────────┘
                   │
                   └──► Row Level Security (per-user data)
```

---

## Database Schema

### Tables

```sql
-- Users (managed by Supabase Auth, extended with profile)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Identity (one per user)
create table public.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  data jsonb not null default '{}',
  version text default '1.0.0',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Context events (many per user)
create table public.context_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('page_visit', 'selection', 'conversation', 'insight', 'file')),
  source text not null,
  data jsonb not null default '{}',
  timestamp timestamptz default now(),
  created_at timestamptz default now()
);

-- Index for efficient queries
create index context_events_user_timestamp on context_events(user_id, timestamp desc);
create index context_events_type on context_events(user_id, type);
```

### Row Level Security

```sql
-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.identities enable row level security;
alter table public.context_events enable row level security;

-- Profiles: users can only access their own
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Identities: users can only access their own
create policy "Users can view own identity"
  on identities for select
  using (auth.uid() = user_id);

create policy "Users can insert own identity"
  on identities for insert
  with check (auth.uid() = user_id);

create policy "Users can update own identity"
  on identities for update
  using (auth.uid() = user_id);

-- Context events: users can only access their own
create policy "Users can view own context"
  on context_events for select
  using (auth.uid() = user_id);

create policy "Users can insert own context"
  on context_events for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own context"
  on context_events for delete
  using (auth.uid() = user_id);
```

---

## Authentication Flow

### Chrome Extension (Google OAuth)

Using `chrome.identity` API with Supabase `signInWithIdToken`:

```javascript
// manifest.json additions
{
  "permissions": ["identity"],
  "oauth2": {
    "client_id": "<Google Cloud OAuth client ID>",
    "scopes": ["openid", "email", "profile"]
  }
}
```

```javascript
// src/auth/google.js
import { supabase } from './supabase.js'

export async function signInWithGoogle() {
  const manifest = chrome.runtime.getManifest()

  const url = new URL('https://accounts.google.com/o/oauth2/auth')
  url.searchParams.set('client_id', manifest.oauth2.client_id)
  url.searchParams.set('response_type', 'id_token')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('redirect_uri', `https://${chrome.runtime.id}.chromiumapp.org`)
  url.searchParams.set('scope', manifest.oauth2.scopes.join(' '))

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: url.href, interactive: true },
      async (redirectedTo) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }

        const redirectUrl = new URL(redirectedTo)
        const params = new URLSearchParams(redirectUrl.hash.slice(1))
        const idToken = params.get('id_token')

        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        })

        if (error) reject(error)
        else resolve(data)
      }
    )
  })
}
```

### CLI Authentication

For CLI, use device flow or manual token entry:

```typescript
// packages/core/src/auth/cli.ts
export async function signInCLI() {
  // Option 1: Open browser for OAuth, paste token back
  // Option 2: Email magic link
  // Option 3: Use existing session from extension export
}
```

---

## Sync Service

### Supabase Client Setup

```javascript
// src/supabase/client.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = 'your-anon-key'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: {
      // Use chrome.storage for persistence in extension
      getItem: (key) => new Promise((resolve) => {
        chrome.storage.local.get(key, (result) => resolve(result[key] || null))
      }),
      setItem: (key, value) => new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve)
      }),
      removeItem: (key) => new Promise((resolve) => {
        chrome.storage.local.remove(key, resolve)
      }),
    },
  },
})
```

### Identity Sync

```javascript
// src/supabase/identity.js
export async function saveIdentity(identity) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('identities')
    .upsert({
      user_id: user.id,
      data: identity,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function loadIdentity() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('identities')
    .select('data')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data?.data || null
}
```

### Context Sync

```javascript
// src/supabase/context.js
export async function addContextEvent(type, source, eventData) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('context_events')
    .insert({
      user_id: user.id,
      type,
      source,
      data: eventData,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getRecentContext(options = {}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('context_events')
    .select('*')
    .eq('user_id', user.id)
    .order('timestamp', { ascending: false })

  if (options.type) query = query.eq('type', options.type)
  if (options.source) query = query.eq('source', options.source)
  if (options.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw error
  return data
}
```

---

## Real-time Sync

### Subscribe to Changes

```javascript
// src/supabase/realtime.js
export function subscribeToIdentityChanges(callback) {
  const channel = supabase
    .channel('identity-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'identities' },
      (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          callback(payload.new.data)
        }
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

export function subscribeToContextChanges(callback) {
  const channel = supabase
    .channel('context-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'context_events' },
      (payload) => callback(payload.new)
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
```

---

## Extension UI Enhancements

> **See full design spec:** [`_llm/specs/UI_DESIGN.md`](../specs/UI_DESIGN.md)

### Summary of UI Changes

**Popup:**
- Header with auth state (sign in button → user avatar)
- Sync status indicator with animated dot
- Redesigned stat cards with refined typography
- Identity section with View/Edit tabs
- Settings page for account management

**Chat Overlay:**
- Glass morphism backdrop blur
- Slide-in animation from right
- Context bar showing current page + token count
- Message bubbles with AI badge
- Code blocks with syntax highlighting
- Model selector dropdown

**Design Tokens:**
- Refined dark palette (`--arete-bg-primary: #0a0a0b`)
- Luminous teal accent with glow effects
- Instrument Serif + Geist font pairing
- Staggered reveal animations
- Hover lift effects

---

## Implementation Phases

### Phase 1: Supabase Setup (Foundation)
- [ ] Create Supabase project
- [ ] Create database tables (profiles, identities, context_events)
- [ ] Configure RLS policies
- [ ] Enable Realtime for tables
- [ ] Set up Google OAuth in Supabase dashboard
- [ ] Create Google Cloud OAuth credentials

**Tests:** SQL migration scripts, RLS policy tests

### Phase 2: Extension Auth
- [ ] Add `@supabase/supabase-js` to extension
- [ ] Create Supabase client with chrome.storage adapter
- [ ] Implement Google sign-in via chrome.identity
- [ ] Add auth state management
- [ ] Update popup UI with sign-in/sign-out
- [ ] Handle session persistence

**Tests:** Auth flow tests, session persistence tests

### Phase 3: Sync Service
- [ ] Create sync service module
- [ ] Replace local identity storage with Supabase
- [ ] Replace local context storage with Supabase
- [ ] Implement offline queue for failed syncs
- [ ] Add sync status indicator to popup

**Tests:** Sync service unit tests, offline queue tests

### Phase 4: Real-time Sync
- [ ] Subscribe to identity changes
- [ ] Subscribe to context changes
- [ ] Handle conflicts (last-write-wins or merge)
- [ ] Update UI on remote changes

**Tests:** Real-time subscription tests, conflict resolution tests

### Phase 5: CLI/MCP Migration
- [ ] Add Supabase client to @arete/core
- [ ] Update CLI to use Supabase (with auth)
- [ ] Update MCP server to use Supabase
- [ ] Maintain fallback to local files for offline

**Tests:** CLI integration tests, MCP tool tests

---

## Migration Strategy

### Existing Local Data

```javascript
// One-time migration on first sign-in
async function migrateLocalData() {
  // 1. Read existing chrome.storage data
  const localIdentity = await chrome.storage.local.get('arete_identity')
  const localPages = await chrome.storage.local.get('arete_context_pages')
  const localFacts = await chrome.storage.local.get('arete_facts_learned')

  // 2. Upload to Supabase
  if (localIdentity.arete_identity) {
    await saveIdentity(localIdentity.arete_identity)
  }

  // 3. Convert pages/facts to context events
  for (const page of localPages.arete_context_pages || []) {
    await addContextEvent('page_visit', 'chrome-extension', page)
  }

  // 4. Mark migration complete
  await chrome.storage.local.set({ arete_migrated: true })
}
```

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| API key exposure | Use anon key (safe for client), RLS protects data |
| Token storage | chrome.storage.local (sandboxed per extension) |
| Data isolation | RLS ensures users only see their own data |
| Session hijacking | Auto-refresh tokens, secure cookie handling |
| Offline data | Local cache encrypted or cleared on sign-out |

---

## Environment Variables

```env
# .env (gitignored)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

---

## Dependencies

```json
{
  "@supabase/supabase-js": "^2.x",
}
```

---

## Success Criteria

1. User can sign in with Google in extension
2. Identity syncs to Supabase on save
3. Context events sync in real-time
4. Changes in one client appear in others
5. CLI can authenticate and access cloud data
6. MCP server reads from Supabase
7. Offline mode works with local fallback
8. Existing local data migrates on first sign-in

---

## Open Questions

1. **Conflict resolution:** Last-write-wins or field-level merge?
2. **Offline duration:** How long to queue offline changes?
3. **Data retention:** Auto-prune old context events? (e.g., 30 days)
4. **Rate limiting:** Batch context events or write immediately?
5. **CLI auth:** Browser flow or API key for headless?
