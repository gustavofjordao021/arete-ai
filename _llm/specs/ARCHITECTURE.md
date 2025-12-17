# Arete Architecture

## Current State (Hackathon Build)

Working Chrome extension with overlay UI, multi-model support, and memory.

```
Chrome Extension (Manifest V3) + Vite
├── manifest.json
├── vite.config.js
├── popup.html/js           → Extension popup (stats, export/import)
├── src/
│   ├── content.js          → Overlay UI, hotkey handler
│   ├── context.js          → Page content extraction
│   ├── identity.js         → Hardcoded user context (simple string)
│   ├── conversation.js     → chrome.storage.local persistence
│   ├── api.js              → Model router (Claude/GPT)
│   ├── injector.js         → ChatGPT/Claude.ai injection
│   ├── keys.js             → API keys (gitignored)
│   ├── providers/
│   │   ├── claude.js       → Anthropic API
│   │   └── openai.js       → OpenAI API
│   └── memory/
│       ├── store.js        → chrome.storage.local wrapper
│       ├── facts.js        → Custom fact extraction
│       ├── preferences.js  → Learned preferences
│       ├── pages.js        → Page visit tracking
│       └── manager.js      → Limits, pruning, deduplication
└── dist/                   → Build output
```

---

## Target State (Monorepo)

Multi-client architecture with shared core identity layer.

```
arete/
├── packages/
│   ├── core/                  → Identity schema, extraction, transforms
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── identity.ts      → Zod schema definitions
│   │   │   │   └── validation.ts
│   │   │   ├── extraction/
│   │   │   │   ├── prompts.ts       → Extraction prompts
│   │   │   │   └── extractor.ts     → LLM-based extraction
│   │   │   ├── transforms/
│   │   │   │   ├── base.ts          → Transform interface
│   │   │   │   ├── claude.ts        → Claude-specific
│   │   │   │   └── openai.ts        → OpenAI-specific
│   │   │   └── storage/
│   │   │       └── local.ts         → Local storage adapter
│   │   └── package.json
│   │
│   ├── memory/                → Mem0 integration
│   │   ├── src/
│   │   │   ├── client.ts          → Mem0 client wrapper
│   │   │   ├── orchestrator.ts    → Identity + Memory orchestration
│   │   │   └── budget.ts          → Token budget management
│   │   └── package.json
│   │
│   └── shared/                → Shared types, utilities
│
├── apps/
│   ├── chrome/                → Chrome extension (current code migrated)
│   │   ├── src/
│   │   │   ├── content.ts
│   │   │   ├── context.ts
│   │   │   ├── injector.ts
│   │   │   └── overlay/
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   ├── raycast/               → Raycast plugin (future)
│   │   └── ...
│   │
│   └── sync-api/              → Sync backend (future, paid tier)
│       └── ...
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Arete Sync Backend (Paid)                    │
│            Cross-device sync, backup, conflict resolution       │
└─────────────────────────────────────────────────────────────────┘
                               ↑ (optional)
┌─────────────────────────────────────────────────────────────────┐
│                    Arete Identity Layer                         │
│   Schema management, extraction, transforms, orchestration      │
│                      (packages/core)                            │
└─────────────────────────────────────────────────────────────────┘
          ↑              ↑              ↑              ↑
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Raycast    │ │   Chrome     │ │   Local      │ │   Mem0 OSS   │
│   Plugin     │ │   Extension  │ │   Files      │ │   (Memory)   │
│  (Future)    │ │  (Primary)   │ │  (Obsidian)  │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
       ↓                ↓                                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Providers                                │
│              Claude API  |  OpenAI API  |  Others               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Mapping: Current → Target

| Current Code | Target Location | Notes |
|--------------|-----------------|-------|
| `src/identity.js` | `packages/core/src/schema/` | Simple string → Zod schema |
| `src/memory/facts.js` | `packages/memory/` | Replace with Mem0 |
| `src/memory/store.js` | `packages/core/src/storage/` | Keep adapter pattern |
| `src/context.js` | `apps/chrome/src/context.ts` | Chrome-specific |
| `src/content.js` | `apps/chrome/src/overlay/` | Chrome-specific |
| `src/injector.js` | `apps/chrome/src/injector.ts` | Chrome-specific |
| `src/api.js` | `packages/core/src/providers/` | Shared across clients |
| `src/providers/*` | `packages/core/src/providers/` | Shared across clients |
| `src/conversation.js` | `packages/core/src/storage/` | Shared persistence |

---

## Tech Stack

### Current
| Layer | Technology |
|-------|------------|
| Build | Vite |
| Package Manager | npm |
| Storage | chrome.storage.local |
| Memory | Custom LLM extraction |
| Validation | None |

### Target
| Layer | Technology | Rationale |
|-------|------------|-----------|
| Monorepo | Turborepo | Multi-package builds |
| Package Manager | pnpm | Faster, disk efficient |
| Storage | SQLite (better-sqlite3) | Fast, queryable |
| Memory | Mem0 OSS (mem0ai) | Proven extraction quality |
| Validation | Zod | Runtime + TypeScript inference |
| Language | TypeScript | Type safety across packages |

---

## Architecture Principles

1. **Local-first** — All data in local storage, no backend required
2. **Graceful degradation** — If memory unavailable, fall back to core identity
3. **Token-aware** — Always stay under context limits
4. **Privacy-preserving** — User owns all data, can export/delete anytime
5. **Provider-agnostic** — Same identity works across Claude, GPT, and future models
6. **Shared core** — Identity layer is shared across all clients (Chrome, Raycast, etc.)

---

## Key Dependencies

```json
{
  "dependencies": {
    "mem0ai": "latest",
    "zod": "^3.x",
    "better-sqlite3": "^9.x",
    "@anthropic-ai/sdk": "latest",
    "openai": "^4.x"
  }
}
```

---

## Identity System (v2)

The identity layer uses a three-tier model inspired by [CASS Memory System](https://github.com/Dicklesworthstone/cass_memory_system).

### Three-Layer Model

```
CONTEXT (events)     → Raw signals: browsing, conversations, manual input
       ↓
IDENTITY (facts)     → Structured facts with confidence + maturity
       ↓
PROJECTION           → Context-aware slice served to AI interactions
```

| Layer | What it stores | How it changes | Who sees it |
|-------|---------------|----------------|-------------|
| **Context** | Raw events (page visits, conversations) | Append-only, auto-rollup | AI reads patterns |
| **Identity** | Structured facts about user | AI proposes, user approves | AI reads, projects |
| **Projection** | Task-relevant slice | Generated on-demand | AI uses in system prompt |

### Identity Fact Schema

```typescript
interface IdentityFact {
  id: string;                           // UUID
  category: "core" | "expertise" | "preference" | "context" | "focus";
  content: string;                      // The actual fact

  // Confidence tracking
  confidence: number;                   // 0.0-1.0, decays over time
  lastValidated: string;                // ISO timestamp
  maturity: "candidate" | "established" | "proven";

  // Provenance
  source: "manual" | "inferred" | "conversation";
  sourceRef?: string;                   // conversation ID, URL, etc.
}
```

### Confidence Decay

Facts naturally fade if not validated (half-life: 60 days).

```typescript
function getEffectiveConfidence(fact: IdentityFact, halfLifeDays = 60): number {
  const daysSinceValidation = daysSince(fact.lastValidated);
  return fact.confidence * Math.pow(0.5, daysSinceValidation / halfLifeDays);
}
```

| Effective Confidence | Behavior |
|---------------------|----------|
| > 0.7 | Always included in projection |
| 0.3 - 0.7 | Included if relevant to task |
| < 0.3 | Suggest re-validation or removal |
| < 0.1 | Auto-archive |

### Maturity State Machine

```
      [candidate] ─────validation────▶ [established] ────validation────▶ [proven]
           │                                                                 │
           │ (ignored/rejected)                                              │ (decay)
           ▼                                                                 ▼
       (deleted)                                                         (demoted)
```

| Maturity | How to reach | In projection? |
|----------|--------------|----------------|
| `candidate` | Inferred from context | Only if highly relevant |
| `established` | Validated 2+ times OR manual | Yes, with task relevance |
| `proven` | Validated 5+ times | Always included |

### MCP Tools

| Tool | Purpose |
|------|---------|
| `arete_get_identity` | Get identity with confidence scores |
| `arete_update_identity` | Create/update facts with maturity tracking |
| `arete_validate_fact` | Bump confidence + lastValidated |
| `arete_context` | Task-aware projection (ranked, relevant facts) |
| `arete_infer` | Extract candidate facts from browsing patterns |
| `arete_reject_fact` | Block a fact from future inference |
| `arete_accept_candidate` | Accept a candidate from `arete_infer` |
| `arete_get_recent_context` | Get raw context events |
| `arete_add_context_event` | Record new context event |

### File Structure

```
~/.arete/
├── identity.json      # IdentityV2 with facts array
├── context.json       # ContextEvent[] (ring buffer)
├── blocked.json       # Rejected inferences
└── archive/           # Expired facts (confidence < 0.1)
```

---

## Related Docs

- [IDENTITY_SCHEMA.md](./IDENTITY_SCHEMA.md) — Detailed identity schema design
- [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) — Steps to evolve from current to target
- [PRODUCT_VISION.md](./PRODUCT_VISION.md) — Product positioning and strategy
