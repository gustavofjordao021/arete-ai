# Arete Migration Plan

Incremental evolution from hackathon Chrome extension to multi-client monorepo.

---

## Guiding Principles

1. **Always shippable** — Each step produces working code
2. **Chrome stays primary** — Don't break the working extension
3. **Extract, don't rewrite** — Move code to packages, don't rebuild from scratch
4. **Test with real usage** — Validate each step with actual use

---

## Phase 1: Core Identity Layer

**Goal:** Implement the identity schema as a standalone package, test with CLI.

### Step 1.1: Monorepo Setup

```bash
# Initialize monorepo structure
mkdir -p packages/core apps/chrome
pnpm init
# Add workspace config
```

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Create `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

### Step 1.2: Core Package Scaffold

```bash
cd packages/core
pnpm init
pnpm add zod typescript
```

Create identity schema (`packages/core/src/schema/identity.ts`):
- Zod schema from IDENTITY_SCHEMA.md
- Type exports

### Step 1.3: Extraction Prompts

Create `packages/core/src/extraction/`:
- `prompts.ts` — The extraction prompt template
- `extractor.ts` — Call LLM to extract identity from prose

### Step 1.4: Per-Model Transforms

Create `packages/core/src/transforms/`:
- `base.ts` — Transform interface
- `claude.ts` — Claude XML-style transform
- `openai.ts` — OpenAI markdown-style transform

### Step 1.5: CLI for Testing

Create `packages/core/cli/`:
```bash
arete identity set "I'm a PM at fintech..."  # Extract and store
arete identity get                            # Show current identity
arete identity transform --model claude       # Output system prompt
```

**Milestone:** Can extract identity from prose, store it, and transform for different models via CLI.

---

## Phase 2: Mem0 Integration

**Goal:** Replace custom fact extraction with Mem0.

### Step 2.1: Memory Package

```bash
mkdir packages/memory
cd packages/memory
pnpm init
pnpm add mem0ai
```

Create `packages/memory/src/`:
- `client.ts` — Mem0 client wrapper
- `orchestrator.ts` — Decide when to use identity vs memory vs both

### Step 2.2: Mem0 Setup

```typescript
// packages/memory/src/client.ts
import { Memory } from "mem0ai";

const memory = new Memory({
  // Mem0 OSS config - runs locally
});

export async function addMemory(messages: Message[], userId: string) {
  return memory.add(messages, { user_id: userId });
}

export async function searchMemory(query: string, userId: string) {
  return memory.search(query, { user_id: userId });
}
```

### Step 2.3: Orchestrator

```typescript
// packages/memory/src/orchestrator.ts
export async function buildContext(options: ContextOptions): Promise<FullContext> {
  const identity = await getIdentity();
  const systemPrompt = transformForModel(identity, options.model);

  // Search Mem0 for relevant memories
  const memories = await searchMemory(options.query, options.userId);

  return {
    systemPrompt,
    memories,
    tokenCount: estimateTokens(systemPrompt, memories),
  };
}
```

**Milestone:** Memory extraction works via Mem0, CLI can add and search memories.

---

## Phase 3: Chrome Extension Migration

**Goal:** Chrome extension uses packages/core and packages/memory.

### Step 3.1: Move Chrome Code to apps/chrome

```bash
# Move current src/ to apps/chrome/src/
mv src apps/chrome/
mv manifest.json apps/chrome/
mv popup.* apps/chrome/
mv vite.config.js apps/chrome/
```

Update `apps/chrome/package.json`:
```json
{
  "dependencies": {
    "@arete/core": "workspace:*",
    "@arete/memory": "workspace:*"
  }
}
```

### Step 3.2: Convert to TypeScript

Rename `.js` files to `.ts`, add types gradually.

Priority order:
1. `identity.ts` — Replace hardcoded string with core package import
2. `api.ts` — Use transforms from core package
3. `memory/facts.ts` — Replace with Mem0 client
4. `context.ts` — Add types
5. `content.ts` — Add types (largest file, do last)

### Step 3.3: Wire Up Core Package

```typescript
// apps/chrome/src/identity.ts
import { Arete } from "@arete/core";

const arete = new Arete({
  storage: "chrome", // Use chrome.storage adapter
});

export async function getSystemPrompt(context: PageContext) {
  return arete.getSystemPrompt({
    model: "claude",
    currentContext: context,
    includeContextual: true,
  });
}
```

### Step 3.4: Wire Up Memory Package

```typescript
// apps/chrome/src/memory.ts
import { addMemory, searchMemory } from "@arete/memory";

// After each conversation, add to memory
await addMemory([
  { role: "user", content: userQuery },
  { role: "assistant", content: response },
], userId);
```

**Milestone:** Chrome extension works with shared packages. No user-visible changes, but code is modular.

---

## Phase 4: Raycast Plugin (Future)

**Goal:** Second client using the same core.

### Step 4.1: Raycast Scaffold

```bash
npx create-raycast-extension apps/raycast
cd apps/raycast
pnpm add @arete/core @arete/memory
```

### Step 4.2: Chat Command

- Use Raycast's built-in chat UI components
- Import identity and memory from packages
- Add file system access for Obsidian vaults

### Step 4.3: Chrome Context Bridge

- Chrome extension exposes current page context
- Raycast can request context from Chrome
- Options: native messaging, local HTTP server, or shared storage

**Milestone:** Raycast plugin works with same identity and memory as Chrome.

---

## Phase 5: Sync Backend (Future)

**Goal:** Paid tier for cross-device sync.

### Step 5.1: API Setup

```bash
mkdir apps/sync-api
cd apps/sync-api
pnpm add next @supabase/supabase-js
```

### Step 5.2: Supabase Schema

```sql
create table identities (
  id uuid primary key,
  user_id uuid references auth.users,
  identity jsonb not null,
  version integer not null,
  device_id text,
  updated_at timestamp with time zone
);
```

### Step 5.3: Sync Protocol

- Local stores `lastSyncedVersion`
- On sync: compare versions, merge or overwrite
- Conflict resolution: last-write-wins (simple start)

**Milestone:** Users can sync identity across devices.

---

## Migration Checklist

### Phase 1: Core Identity ✓ when complete
- [ ] Monorepo setup (pnpm, turbo)
- [ ] packages/core scaffold
- [ ] Zod schema implemented
- [ ] Extraction prompt working
- [ ] Claude transform working
- [ ] OpenAI transform working
- [ ] CLI testing commands

### Phase 2: Mem0 ✓ when complete
- [ ] packages/memory scaffold
- [ ] Mem0 client wrapper
- [ ] addMemory working
- [ ] searchMemory working
- [ ] Orchestrator combining identity + memory

### Phase 3: Chrome Migration ✓ when complete
- [ ] Code moved to apps/chrome
- [ ] TypeScript conversion
- [ ] Using @arete/core for identity
- [ ] Using @arete/memory for facts
- [ ] All features still working

### Phase 4: Raycast ✓ when complete
- [ ] Raycast extension scaffold
- [ ] Chat command working
- [ ] Identity editor working
- [ ] Chrome context bridge

### Phase 5: Sync ✓ when complete
- [ ] API routes
- [ ] Supabase schema
- [ ] Sync protocol
- [ ] Conflict resolution

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Mem0 extraction quality | Test with real conversations before replacing custom |
| Chrome extension breaks | Keep current code in git, feature-flag new code |
| Monorepo complexity | Start simple, add tooling as needed |
| TypeScript migration scope | Convert incrementally, JS still works in TS projects |

---

## Next Action

**Start with Phase 1, Step 1.1:** Initialize the monorepo structure. The Chrome extension continues working while we build packages/core in parallel.
