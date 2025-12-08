# Identity Synthesis Plan

> Created: 2025-12-06
> Status: **Phase 1 Complete** ✅
> Depends on: MCP Server (complete), Supabase sync (Phases 1-5 complete)

## Goal

Enable AI to **synthesize patterns from context into structured identity**, closing the loop between passive observation and active personalization.

```
Current state:
  Context (page_visit, conversation, insight) → accumulates
  Identity (expertise, focus, preferences)    → static unless manually edited

Target state:
  Context patterns → AI observes → proposes identity updates → user approves
  Identity evolves naturally based on actual behavior
```

---

## Problem Statement

The MCP test revealed a critical gap:

```
Claude Desktop observation (actual quote):
"Looking at your identity file, I see it says your current focus includes
'Mem0 memory layer' but your recent context shows you're actually deep
in Supabase integration work. Your identity doesn't reflect what you're
actually doing."
```

Context captures **what happened**. Identity defines **who you are**.
Currently, nothing bridges them.

---

## Design Principles

1. **User-approved changes only** — AI proposes, human decides
2. **Conversational flow** — No separate approval UI; the chat IS the interface
3. **Additive by default** — Prefer adding to expertise over replacing
4. **Source attribution** — Track where each identity change came from
5. **Privacy-aware** — Respect localOnly flags, exclude sensitive domains

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Claude Desktop                             │
│  1. Reads identity + context via MCP                              │
│  2. Observes patterns (expertise gaps, focus drift, new skills)   │
│  3. Proposes update in conversation                               │
│  4. User approves/rejects/modifies                                │
│  5. Calls arete_update_identity tool                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                       MCP Server                                  │
│  arete_update_identity tool:                                      │
│  - Validates update against schema                                │
│  - Applies to local ~/.arete/identity.json                        │
│  - Syncs to Supabase (if authenticated)                           │
│  - Records change in history                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## MCP Tool Design

### `arete_update_identity`

```typescript
{
  name: "arete_update_identity",
  description: `Update user identity based on observed patterns.

IMPORTANT: Always ask the user for approval BEFORE calling this tool.
Present your reasoning and proposed change, wait for confirmation.

Example flow:
1. "I notice you've been researching Supabase. Add to expertise?"
2. User: "Yes"
3. Then call this tool with the change`,

  inputSchema: {
    type: "object",
    properties: {
      section: {
        type: "string",
        enum: ["expertise", "currentFocus", "context", "communication", "custom"],
        description: "Which identity section to update (core is protected)"
      },
      operation: {
        type: "string",
        enum: ["add", "set", "remove"],
        description: "add: append to array, set: replace value, remove: delete from array"
      },
      field: {
        type: "string",
        description: "Nested field path (e.g., 'projects' for currentFocus.projects)"
      },
      value: {
        description: "The value to add/set/remove"
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of why this update was made (stored in history)"
      }
    },
    required: ["section", "operation", "value", "reasoning"]
  }
}
```

### Protected Sections

| Section | Writable by AI? | Rationale |
|---------|-----------------|-----------|
| `meta` | No | System-managed |
| `core` | No | Name, role too personal |
| `expertise` | Yes | Skills can be inferred |
| `communication` | Yes | Preferences emerge from interaction |
| `currentFocus` | Yes | Projects/goals change frequently |
| `context` | Yes | Professional/personal facts |
| `privacy` | No | User must set manually |
| `custom` | Yes | Freeform, safe to update |
| `sources` | Auto-append | Track attribution |

---

## Example Interactions

### Adding expertise from browsing patterns

```
Claude: Based on your recent context, I see you've visited:
- supabase.com/docs (auth, realtime, edge-functions) - 47 times
- postgresql.org (indexes, triggers) - 12 times

It looks like you're building production database skills. Would you like
me to add "Supabase" and "PostgreSQL" to your expertise?

User: Yes, add Supabase. I already know Postgres.

Claude: [calls arete_update_identity]
  section: "expertise"
  operation: "add"
  value: "Supabase"
  reasoning: "User confirmed after observing 47 visits to supabase.com/docs"

Done! I've added Supabase to your expertise.
```

### Updating current focus

```
Claude: Your identity says you're focused on "Mem0 memory layer" but
I notice your recent work has been entirely on Supabase integration
and MCP server development. Should I update your current focus?

User: Yeah, the Mem0 stuff is on hold. Focus is now on Arete launch.

Claude: [calls arete_update_identity]
  section: "currentFocus"
  operation: "set"
  field: "projects"
  value: ["Arete Chrome Extension", "Arete MCP Server", "Supabase Integration"]
  reasoning: "User confirmed focus shift from Mem0 to Arete launch"

Updated! Your focus now reflects the Arete project.
```

### Recording a learned preference

```
Claude: I notice you consistently ask me to avoid jargon and keep
explanations concise. Should I add this to your communication preferences?

User: Yes please

Claude: [calls arete_update_identity]
  section: "communication"
  operation: "add"
  field: "style"
  value: "concise"
  reasoning: "Observed preference across multiple conversations"

[calls arete_update_identity]
  section: "communication"
  operation: "add"
  field: "avoid"
  value: "jargon"
  reasoning: "User explicitly requested avoiding jargon"

Got it! Future interactions will be more concise and jargon-free.
```

---

## Change History

Track all identity modifications for accountability and undo:

```typescript
interface IdentityChange {
  id: string;                  // UUID
  timestamp: string;           // ISO 8601
  section: string;             // "expertise", "currentFocus", etc.
  field?: string;              // Optional nested path
  operation: "add" | "set" | "remove";
  previousValue: unknown;      // For rollback
  newValue: unknown;
  reasoning: string;           // Why this change was made
  source: string;              // "claude-desktop", "chrome-extension", "cli"
}
```

Storage: `~/.arete/identity-history.json`

**MVP**: Store only the last change for simple undo. Future: git-style full history.

```json
{
  "version": "1.0.0",
  "lastChange": {
    "id": "abc-123",
    "timestamp": "2025-12-06T15:30:00Z",
    "section": "expertise",
    "operation": "add",
    "previousValue": ["TypeScript", "React"],
    "newValue": ["TypeScript", "React", "Supabase"],
    "reasoning": "User confirmed after observing 47 visits to supabase.com",
    "source": "claude-desktop"
  }
}
```

---

## Privacy Controls

### Domain Exclusions

Some domains should never inform identity updates:

```typescript
const EXCLUDED_DOMAINS = [
  // Financial
  "*.bank.com", "paypal.com", "venmo.com",
  // Health
  "*.health.gov", "webmd.com",
  // Personal
  "facebook.com", "instagram.com",
  // Auth
  "accounts.google.com", "login.*"
];
```

### Section Permissions

User can configure in `privacy` section:

```json
{
  "privacy": {
    "aiCanUpdate": ["expertise", "currentFocus", "custom"],
    "requireApproval": ["communication", "context"],
    "neverUpdate": ["core"]
  }
}
```

---

## Relationship to Context Rollup

These are **complementary systems** at different stages of the pipeline:

```
                    ┌─────────────────┐
Raw Events ────────▶│ Context Rollup  │────────▶ Compressed History
(hot, 30 days)      │ (storage mgmt)  │          (cold, summaries)
                    └────────┬────────┘
                             │
                             │ insights field
                             ▼
                    ┌─────────────────┐
                    │ Identity        │────────▶ Updated Profile
                    │ Synthesis       │          (expertise, focus)
                    │ (knowledge ext) │
                    └─────────────────┘
```

**Context Rollup:**
- Automatic, scheduled (pg_cron)
- Compresses old events into summaries
- Generates `insights` field via LLM
- Goal: Prevent unbounded storage growth

**Identity Synthesis:**
- Interactive, conversational
- AI observes patterns, proposes changes
- User approves before writing
- Goal: Keep identity current with behavior

The rollup's `insights` can feed synthesis:
```
Rollup insight: "User frequently researched testing frameworks"
Claude: "Your context history shows you've been learning about testing. Add 'Vitest' to expertise?"
```

But they're independently valuable. Synthesis works on raw context today; rollup enables synthesis on historical patterns later.

---

## Implementation Phases

### Phase 1: Basic Update Tool (MVP) ✅
- [x] Add `arete_update_identity` MCP tool
- [x] Support add/set/remove for allowed sections
- [x] Write to local file
- [x] Sync to Supabase cloud
- [x] Return confirmation with diff
- [x] Tests for all operations (20 tests)

### Phase 2: Undo Support
- [ ] Create `identity-history.json` with lastChange only
- [ ] Record previousValue on each update
- [ ] Add `arete_undo_identity_change` tool (reverts last change)
- [ ] Sync history to cloud
- [ ] Future: git-style full history for multi-step rollback

### Phase 3: Privacy Controls
- [ ] Add domain exclusion list
- [ ] Add section-level permissions to privacy schema
- [ ] Validate permissions in update tool
- [ ] CLI command to manage permissions

### Phase 4: Smart Suggestions (Future)
- [ ] Analyze context at conversation start
- [ ] Proactive suggestions based on patterns
- [ ] Confidence thresholds (only suggest if pattern is strong)
- [ ] Weekly summary of potential updates

---

## Test Plan

### Unit Tests (`identity-update.test.ts`)

```typescript
describe("arete_update_identity tool", () => {
  it("adds item to expertise array", async () => {
    // Setup identity with expertise: ["TypeScript"]
    // Call tool with operation: "add", value: "React"
    // Verify expertise is now ["TypeScript", "React"]
  });

  it("sets currentFocus.projects array", async () => {
    // Setup identity with currentFocus.projects: ["Old Project"]
    // Call tool with operation: "set", field: "projects", value: ["New Project"]
    // Verify currentFocus.projects is ["New Project"]
  });

  it("removes item from communication.avoid", async () => {
    // Setup identity with communication.avoid: ["jargon", "emojis"]
    // Call tool with operation: "remove", value: "emojis"
    // Verify communication.avoid is ["jargon"]
  });

  it("rejects updates to core section", async () => {
    // Call tool with section: "core"
    // Expect error: "core section is protected"
  });

  it("rejects updates to meta section", async () => {
    // Similar to above
  });

  it("records change in history", async () => {
    // Make update
    // Read identity-history.json
    // Verify change is recorded with correct fields
  });

  it("syncs to cloud when authenticated", async () => {
    // Mock cloud client
    // Make update
    // Verify saveIdentity was called
  });

  it("works offline (local only)", async () => {
    // No cloud credentials
    // Make update
    // Verify local file updated
    // Verify no cloud errors
  });
});
```

### Integration Tests (Manual)

1. Start MCP server
2. Open Claude Desktop
3. Say: "Look at my context and suggest identity updates"
4. Verify Claude proposes reasonable changes
5. Approve one change
6. Verify identity.json is updated
7. Verify change appears in identity-history.json
8. Run `arete identity get` to confirm

---

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Rate limiting? | **No limit** | Identity changes are infrequent by nature. If user approves, it's valid. |
| Merge conflicts? | **Last write wins (FCFS)** | Simpler than conflict resolution. Latest change is most current. |
| Partial approval? | **Yes, supported** | User can say "yes to A, no to B". Claude makes separate tool calls. |
| Batch updates? | **One change per call** | Simpler to track, easier to undo, clearer history. |
| Undo depth? | **Last change only (MVP)** | Keep it simple. Future: git-style full history for rollback. |

---

## Success Criteria

- [ ] Claude Desktop can observe patterns in context
- [ ] Claude asks for approval before modifying identity
- [ ] User can approve/reject in conversation
- [ ] Changes persist to local file and cloud
- [ ] Change history enables undo
- [ ] Privacy controls respected
- [ ] All operations tested

---

## Estimated Effort

| Phase | Scope | Effort |
|-------|-------|--------|
| 1. Basic Update Tool | MCP tool, local + cloud sync | 2-3 hours |
| 2. Change History | Schema, history tools, undo | 2 hours |
| 3. Privacy Controls | Permissions, exclusions | 1-2 hours |
| 4. Smart Suggestions | Proactive analysis | 3-4 hours |

**MVP (Phase 1): 2-3 hours**
**Full feature: 8-11 hours**
