# Arete

> **Your AI, at its best, everywhere.**

Chrome extension that makes your AI identity portable. Invoke anywhere, any model, conversation persists across pages.

## Status

**Current:** Working hackathon build (Chrome extension with overlay UI)
**Next:** Evolving to monorepo with shared identity layer (see `_llm/MIGRATION_PLAN.md`)

---

## Quick Start

```bash
npm install
npm run build
# Load dist/ folder in Chrome as unpacked extension
```

**Hotkey:** `Cmd+Shift+O` to open overlay, `ESC` to close

---

## CLI

```bash
npm run cli identity get                     # Show current identity
npm run cli identity set "I'm a PM at..."    # Store identity from prose
npm run cli identity transform --model claude # Output Claude system prompt
npm run cli identity transform --model openai # Output OpenAI system prompt
npm run cli identity clear                   # Reset identity
npm run cli identity json                    # Raw JSON output
```

Identity stored in `~/.arete/identity.json`

---

## Project Structure

```
packages/core/           → Shared identity library (@arete/core)
├── src/schema/          → Zod identity schema
├── src/extraction/      → LLM extraction prompts
├── src/transforms/      → Claude/OpenAI formatters
└── src/cli/             → CLI commands

src/                     → Chrome extension
├── content.js           → Overlay UI, hotkey handler
├── context.js           → Page content extraction
├── identity/            → Identity manager (uses @arete/core)
├── conversation.js      → Message persistence
├── api.js               → Model router (Claude/GPT)
├── providers/           → API implementations
└── memory/              → Facts, pages, preferences

background.js            → Service worker (LLM extraction API)
popup.js                 → Settings UI with identity editor
```

---

## Conventions

### Development Approach: RED-GREEN-REFACTOR
All new features follow TDD:
1. **RED** - Write a failing test first
2. **GREEN** - Write minimal code to pass
3. **REFACTOR** - Clean up while tests stay green

No implementation without a test. Tests live alongside code in `*.test.ts` files.

### Storage Keys
All chrome.storage keys prefixed with `arete_`:
- `arete_conversation` - Chat history
- `arete_facts_learned` - Extracted facts
- `arete_context_pages` - Page visits
- `arete_preferences` - User preferences

### Memory Limits
- 50 facts max
- 20 pages max
- Auto-prunes oldest when over limit

### API Pattern
```javascript
// All model calls go through api.js
import { callModel } from './api.js';
const response = await callModel('claude', systemPrompt, messages);
```

### Page Context
```javascript
import { getPageContext } from './context.js';
const ctx = getPageContext();
// Returns: { url, title, selection, pageType, content }
```

### Identity
Edit via popup UI (View/Edit tabs) or CLI. LLM extraction uses Claude Haiku.
- Popup: Click extension icon → Edit tab → Enter prose → Save
- CLI: `npm run cli identity set "your description"`
- Storage: `arete_identity` (chrome.storage) or `~/.arete/identity.json` (CLI)

---

## Decisions

| Decision      | Choice        | Why                                       |
| ------------- | ------------- | ----------------------------------------- |
| Build tooling | Vite          | Module imports, fast builds               |
| API keys      | Hardcoded     | Demo only, gitignored                     |
| Streaming     | Skip          | Loading indicator simpler                 |
| Storage       | Local only    | Privacy-first, no backend needed          |

---

## Scope (Current Build)

| In                            | Out               |
| ----------------------------- | ----------------- |
| Hotkey invocation (⌘⇧O)       | Backend/cloud     |
| Overlay UI + model toggle     | User onboarding   |
| Claude + GPT providers        | More than 2 models|
| Identity injection            | Auth              |
| Conversation persistence      | Mem0 integration  |
| Page context + memory         |                   |
| Settings UI + LLM extraction  |                   |
| CLI commands                  |                   |

---

## Documentation

See `/_llm/` folder:

### Current Build
- `BUILD_CYCLES.md` - Detailed implementation cycles (hackathon)
- `REFERENCE.md` - Demo prompts, failure modes, checklists

### Evolution
- `PRODUCT_VISION.md` - Product positioning, target user, monetization
- `IDENTITY_SCHEMA.md` - TypeScript schema design, transforms
- `ARCHITECTURE.md` - Current → target architecture mapping
- `MIGRATION_PLAN.md` - Incremental steps to evolve the codebase
