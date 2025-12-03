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

## Related Docs

- [IDENTITY_SCHEMA.md](./IDENTITY_SCHEMA.md) — Detailed identity schema design
- [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) — Steps to evolve from current to target
- [PRODUCT_VISION.md](./PRODUCT_VISION.md) — Product positioning and strategy
