# Beads: Inspiration & Ideas to Steal

> Created: 2025-12-08
> Status: Reference / Future Ideas
> Source: https://github.com/steveyegge/beads

---

## What is Beads?

**Beads** is Steve Yegge's "memory upgrade for coding agents" — a git-backed issue tracker that lets AI agents autonomously manage work across sessions.

- **Author:** Steve Yegge (ex-Google, ex-Amazon engineer, respected voice)
- **Traction:** 1000 GitHub stars in 6 days
- **Core problem:** "Agent amnesia" — AI loses track of work between sessions

### Key Architecture

| Component | How it works |
|-----------|--------------|
| **Storage** | JSONL files in git (source of truth) + SQLite cache (fast queries) |
| **IDs** | Hash-based (`bd-a1b2`) instead of sequential, scales progressively |
| **Relationships** | 4 edge types: blocks, related, parent-child, discovered-from |
| **Sync** | Git as transport layer — free multi-device without cloud |
| **Agent UX** | `--json` everywhere, `bd ready` for unblocked work |

### Design Philosophy

- **Agent-driven:** Humans configure once, agents manage issues independently
- **Zero infrastructure:** Uses git, no hosted database needed
- **Local-first:** Data lives in repo, no external dependencies

---

## How Beads Relates to Arete

### They Solve Adjacent Problems

| Dimension | **Beads** | **Arete** |
|-----------|-----------|-----------|
| **Problem** | Agent amnesia (losing work/tasks) | Identity fragmentation (repeating who you are) |
| **Domain** | Task management for coding agents | User identity + context across AI interfaces |
| **Who drives** | Agent-autonomous | Human-in-loop (AI proposes, user approves) |
| **Data model** | Issues, dependencies, work hierarchy | Facts with confidence decay + maturity |
| **Target** | Developers using AI coding agents | Power users across multiple AI tools |

### Overlap

1. Both solve "AI statelessness"
2. Both are infrastructure, not UI
3. Both are local-first
4. Both use decay/pruning mechanisms

### Verdict: Complementary, Not Competing

- Beads = *work memory* (what to do)
- Arete = *identity memory* (who is doing it)

Could theoretically integrate: Beads for task tracking, Arete for user context.

---

## Techniques to Steal

### 1. Hash-Based IDs with Progressive Scaling

**Beads approach:**
```
0-500 issues:    4-char hashes (bd-a1b2)
500-1500:        5-char hashes (bd-f14c3)
1500-10000:      6-char hashes (bd-3e7a5b)
```

**Apply to Arete:**
```typescript
// Instead of UUID: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
// Use: "ar-7f3a" (readable, scalable)

function generateFactId(existingCount: number): string {
  const length = existingCount < 500 ? 4 : existingCount < 1500 ? 5 : 6;
  const hash = crypto.randomBytes(length / 2).toString('hex');
  return `ar-${hash}`;
}
```

**Priority:** Medium

---

### 2. "Ready Work" Detection → "Facts Needing Attention"

**Beads:** `bd ready` finds unblocked work.

**Apply to Arete:**
```typescript
// New MCP tool
arete_facts_needing_attention: {
  type: "decayed" | "candidate" | "conflicting" | "stale";
  limit?: number;
}

// Returns facts the agent should validate or ask about
// - decayed: confidence < 0.3
// - candidate: maturity === "candidate"
// - conflicting: facts that contradict each other
// - stale: not validated in 30+ days
```

**CLI equivalent:**
```bash
npm run cli facts ready           # All facts needing attention
npm run cli facts candidates      # Unvalidated inferences
npm run cli facts stale           # Not validated in 30+ days
```

**Priority:** HIGH

---

### 3. "discovered-from" Relationship → Fact Provenance

**Beads:** Tracks *why* work exists with `discovered-from` edges.

**Apply to Arete:**
```typescript
interface IdentityFact {
  // ... existing fields

  // NEW: Provenance chain
  discoveredFrom?: {
    type: "browsing" | "conversation" | "inference" | "manual";
    ref: string;           // URL, conversation ID, etc.
    parentFactId?: string; // If this fact refined another
  };
}
```

**Example:**
```json
{
  "id": "ar-7f3a",
  "content": "Expert in Supabase realtime",
  "discoveredFrom": {
    "type": "inference",
    "ref": "browsing:supabase.com/docs/realtime:15visits",
    "parentFactId": "ar-2b1c"
  }
}
```

**Priority:** HIGH

---

### 4. Agent-Driven Compaction → Validation Workflow

**Beads:** Agent runs `--analyze`, processes externally, runs `--apply`.

**Apply to Arete:**
```bash
# Agent asks: "What needs my attention?"
npm run cli facts analyze --json

# Agent validates externally (conversation with user)
# Then applies:
npm run cli facts validate ar-7f3a --reason "User confirmed"
npm run cli facts reject ar-2b1c --reason "User said outdated"
```

**MCP workflow:**
```typescript
// 1. Agent gets candidates
arete_facts_needing_attention({ type: "candidate" })

// 2. Agent asks user in conversation
"I noticed you've been browsing Supabase docs. Add 'Learning Supabase' to your identity?"

// 3. Based on response
arete_validate_fact({ factId: "ar-7f3a", reasoning: "User confirmed" })
// or
arete_reject_fact({ factId: "ar-7f3a", reason: "User declined" })
```

**Priority:** Medium

---

### 5. SQLite Cache + JSONL Source of Truth

**Beads:** JSONL in git (portable), SQLite for fast queries (local).

**Apply to Arete:**
```
~/.arete/
├── identity.jsonl       # Append-only source of truth (git-friendly)
├── context.jsonl        # Context events
├── cache.db             # SQLite for fast queries (gitignored)
└── .git/                # Optional: git init for free sync
```

**Benefits:**
- JSONL is append-only, merge-friendly
- SQLite enables: `SELECT * FROM facts WHERE confidence < 0.3`
- Git provides free multi-device sync without cloud

**Priority:** Low (implement when scale matters)

---

### 6. `onboard` Command for Agents

**Beads:** `bd onboard` gives agents integration instructions.

**Apply to Arete:**
```typescript
// New MCP tool
arete_onboard: {}

// Returns:
{
  "capabilities": ["get_identity", "add_context", "validate_facts"],
  "protocol": {
    "start_session": "Call arete_context with current task",
    "during_session": "Call arete_add_context_event for insights",
    "end_session": "Call arete_validate_fact for confirmed info"
  },
  "current_state": {
    "total_facts": 42,
    "facts_needing_attention": 3,
    "last_sync": "2025-12-08T10:00:00Z"
  }
}
```

**Priority:** Medium

---

### 7. Hierarchical Fact IDs

**Beads:** `bd-a3f8e9.1` for child tasks.

**Apply to Arete:**
```json
{
  "id": "ar-7f3a",
  "content": "Full-stack developer",
  "children": ["ar-7f3a.1", "ar-7f3a.2"]
}

{
  "id": "ar-7f3a.1",
  "content": "Frontend: React, TypeScript",
  "parentId": "ar-7f3a"
}
```

**Benefit:** Projection can include parent fact or expand to children based on task relevance.

**Priority:** Low

---

### 8. Session Protocol for Agents

**Beads:** Clear start/during/end pattern for agent sessions.

**Apply to Arete:**
```markdown
## Arete Agent Protocol

### Session Start
1. Call `arete_context({ task: "user's question" })`
2. Use returned facts to personalize response

### During Session
3. If you learn something new → `arete_add_context_event`
4. If user confirms existing fact → `arete_validate_fact`

### Session End
5. Check `arete_facts_needing_attention` for candidates
6. Ask user to confirm/reject 1-2 candidates if appropriate
```

**Priority:** HIGH

---

## Priority Summary

| Technique | Priority | Why |
|-----------|----------|-----|
| `arete_facts_needing_attention` tool | **HIGH** | Enables agent-driven validation |
| Fact provenance (discoveredFrom) | **HIGH** | Know *why* each fact exists |
| Session protocol | **HIGH** | Defines agent behavior |
| Hash-based short IDs | Medium | Readability improvement |
| Agent-driven compaction | Medium | Better than automatic decay |
| `arete_onboard` tool | Medium | Self-documenting for agents |
| SQLite + JSONL hybrid | Low | Scale optimization |
| Hierarchical IDs | Low | Nice-to-have |
| Git as sync | Low | Alternative to cloud sync |

---

## Community Feedback on Beads

From [Hacker News](https://news.ycombinator.com/item?id=46075616) and [Tildes](https://tildes.net/~comp/1qpe/introducing_beads_a_coding_agent_memory_system):

### Positive
- "Superior to spec kit or any other form of structured workflow"
- Elegant JSONL + SQLite design praised
- "Agent doesn't need to hold so much context"

### Critiques
- README confusion about what problem it solves
- Marketing language ("agents enjoy working with Beads") questioned
- Some prefer simpler approaches (markdown notes, GitHub Issues)

### Insight for Arete
> "Tools designed specifically for AI" represents emerging "Agent Experience" (AX) discipline

Both Beads and Arete are AX tools. The stack is forming:
- Task execution: Beads
- User context: Arete
- Model routing: (open)
- Tool orchestration: (open)

---

## Integration Opportunity

Beads + Arete could integrate in future:

```typescript
// Claude Desktop receives:
// - "Here's who the user is" (Arete)
// - "Here's what they're working on" (Beads)

const identity = await arete_context({ task: currentTask });
const work = await beads_ready({ limit: 5 });

// Agent has full context: WHO + WHAT
```

---

## Links

- [GitHub: steveyegge/beads](https://github.com/steveyegge/beads)
- [Hacker News discussion](https://news.ycombinator.com/item?id=46075616)
- [Steve Yegge's LinkedIn post](https://www.linkedin.com/posts/steveyegge_github-steveyeggebeads-beads-a-memory-activity-7383408928665042944-tkcj)
- [Tildes discussion](https://tildes.net/~comp/1qpe/introducing_beads_a_coding_agent_memory_system)
- [Beads Viewer (companion tool)](https://github.com/Dicklesworthstone/beads_viewer)
