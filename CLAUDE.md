# Arete

> **Your AI, at its best, everywhere.**

Chrome extension that makes your AI identity portable. Invoke anywhere, any model, conversation persists across pages.

## Status

**Current:** Working hackathon build + MCP server for Claude Desktop
**Next:** Cloud sync with Supabase (see `_llm/plans/`)

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
# Identity commands
npm run cli identity get                     # Show current identity
npm run cli identity set "I'm a PM at..."    # Store identity from prose
npm run cli -- identity transform --model claude # Output Claude system prompt
npm run cli -- identity transform --model openai # Output OpenAI system prompt
npm run cli identity clear                   # Reset identity
npm run cli identity json                    # Raw JSON output

# Context commands
npm run cli context list                     # Show recent context events
npm run cli -- context list --type page_visit   # Filter by event type
npm run cli -- context list --source chrome     # Filter by source
npm run cli -- context list --limit 10          # Limit results
npm run cli context clear                    # Clear all context

# NOTE: Use -- before flags to pass them to the CLI (not npm)
```

Data stored in `~/.arete/identity.json` and `~/.arete/context.json`

---

## MCP Server (Claude Desktop)

```bash
npm run build:mcp                            # Build the MCP server
npm run mcp                                  # Start server (stdio mode)
```

**Tools provided:**
- `arete_get_identity` — Get user identity for personalization
- `arete_get_recent_context` — Get recent browsing/interaction context
- `arete_add_context_event` — Record insights learned during conversation
- `arete_update_identity` — Update identity sections with user approval
- `arete_validate_fact` — Validate an identity fact (v2 identity)
- `arete_context` — Task-aware identity projection (v2 identity)
- `arete_infer` — Extract candidate facts from browsing patterns
- `arete_reject_fact` — Block a fact from future inference
- `arete_accept_candidate` — Accept a candidate fact from `arete_infer`

**Claude Desktop configuration** (`~/.config/claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "arete": {
      "command": "node",
      "args": ["/path/to/arete/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Required: System Prompt Setup

For proactive context capture, add this block to your Claude Desktop system prompt (Settings → Claude's memory & system prompt):

```xml
<arete>
You have Arete tools for persistent memory across conversations.

REQUIRED WORKFLOW:
1. Call arete_get_identity at conversation start to know who you're talking to
2. After EVERY response where the user reveals a preference, constraint, or personal fact — make a tool call to store it
3. Use arete_add_context_event for insights (type="insight", data={insight: "..."})
4. Use arete_update_identity for structured facts (section, operation, value, reasoning)

This is not optional. Storing context is part of completing the task.

Examples of what to capture:
- "I'm Brazilian" → store nationality
- "I like using the air fryer" → store cooking preference
- "I prefer short answers" → store communication preference
- "I'm learning Rust" → store current focus
- "I don't like the iron taste" → store food dislike

Do NOT skip this because "no tools are needed for the question."
These are OUTPUT tools for recording, not INPUT tools for searching.
</arete>
```

**Why this is needed:** MCP tool descriptions alone don't drive proactive behavior. Claude defaults to "tools = search" unless explicitly instructed otherwise. This system prompt block enables automatic context capture.

### Behavioral Patterns for Context Capture

**Context capture is part of task completion, not an afterthought.**

When using Arete tools, follow this workflow:

1. **Start** with `arete_get_identity` to know who you're talking to
2. **Use** that context to personalize your response
3. **After** completing a task, consider: did the user reveal anything durable?
4. **If yes**, use the appropriate tool to persist it

**Recognize these moments:**

| User says... | Action |
|--------------|--------|
| "I always prefer X" | `arete_update_identity` → communication preference |
| "I'm a PM at..." | `arete_update_identity` → context/role |
| "I'm learning Rust" | `arete_add_context_event` → current focus |
| "I'm on iPad, can't run local models" | `arete_add_context_event` → constraint |
| "We use PostgreSQL at work" | `arete_update_identity` → context/tech stack |
| Demonstrates expertise through conversation | `arete_update_identity` → expertise |
| Acts consistently with stored fact | `arete_validate_fact` → strengthen confidence |

**The framing:** Answering a question well AND storing relevant context is one unit of work, not two.

---

## Project Structure

```
packages/core/           → Shared identity library (@arete/core)
├── src/schema/          → Zod identity + context schemas
├── src/extraction/      → LLM extraction prompts
├── src/transforms/      → Claude/OpenAI formatters
└── src/cli/             → CLI commands

packages/mcp-server/     → MCP server for Claude Desktop (@arete/mcp-server)
├── src/index.ts         → Server entry, tool registration
└── src/tools/           → Tool handlers (identity, context)

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
import { callModel } from "./api.js";
const response = await callModel("claude", systemPrompt, messages);
```

### Page Context

```javascript
import { getPageContext } from "./context.js";
const ctx = getPageContext();
// Returns: { url, title, selection, pageType, content }
```

### Identity

Edit via popup UI (View/Edit tabs) or CLI. LLM extraction uses Claude Haiku.

- Popup: Click extension icon → Edit tab → Enter prose → Save
- CLI: `npm run cli identity set "your description"`
- Storage: `arete_identity` (chrome.storage) or `~/.arete/identity.json` (CLI)

### Supabase MCP

Direct database access via MCP tools. Project ID: `dvjgxddjmevmmtzqmzrm`

```bash
# List tables
mcp__supabase__list_tables(project_id: "dvjgxddjmevmmtzqmzrm")

# Apply migration (DDL)
mcp__supabase__apply_migration(project_id: "dvjgxddjmevmmtzqmzrm", name: "create_users", query: "CREATE TABLE...")

# Execute SQL (queries)
mcp__supabase__execute_sql(project_id: "dvjgxddjmevmmtzqmzrm", query: "SELECT * FROM...")

# Get logs
mcp__supabase__get_logs(project_id: "dvjgxddjmevmmtzqmzrm", service: "postgres")
```

Use `apply_migration` for schema changes (creates versioned migrations). Use `execute_sql` for data queries.

---

## Decisions

| Decision      | Choice     | Why                              |
| ------------- | ---------- | -------------------------------- |
| Build tooling | Vite       | Module imports, fast builds      |
| API keys      | Hardcoded  | Demo only, gitignored            |
| Streaming     | Skip       | Loading indicator simpler        |
| Storage       | Local only | Privacy-first, no backend needed |

---

## Scope (Current Build)

| In                           | Out                |
| ---------------------------- | ------------------ |
| Hotkey invocation (⌘⇧O)      | Backend/cloud      |
| Overlay UI + model toggle    | User onboarding    |
| Claude + GPT providers       | More than 2 models |
| Identity injection           | Auth               |
| Conversation persistence     | Mem0 integration   |
| Page context + memory        |                    |
| Settings UI + LLM extraction |                    |
| CLI commands                 |                    |

---

## Documentation

See `/_llm/` folder, organized by purpose:

```
_llm/
├── archive/              # Completed plans (reference only)
│   ├── BUILD_CYCLES.md   # Hackathon implementation cycles
│   ├── MCP_SERVER_PLAN.md # MCP server (complete ✅)
│   └── REFERENCE.md      # Demo prompts, failure modes
│
├── plans/                # Active roadmap items
│   ├── MIGRATION_PLAN.md # Monorepo evolution
│   └── SUPABASE_PLAN.md  # Cloud sync (next up)
│
├── specs/                # Technical specifications
│   ├── ARCHITECTURE.md   # System architecture
│   ├── IDENTITY_SCHEMA.md # Schema design
│   └── UI_DESIGN.md      # UI components & styling
│
└── product/              # Product direction
    ├── PRODUCT_VISION.md # Vision, target user, monetization
    └── PRODUCT_DIRECTION.md # Current priorities
```

### `_llm/` Folder Convention

The `_llm/` folder is for LLM-facing documentation — plans, specs, and context that help AI assistants understand the project.

| Folder | Purpose | Lifecycle |
|--------|---------|-----------|
| `plans/` | Implementation plans with phases, decisions, tests | Active work → move to `archive/` when done |
| `archive/` | Completed plans for reference | Permanent, read-only |
| `specs/` | Technical specifications that evolve with code | Update as architecture changes |
| `product/` | Vision, direction, priorities | Update as product evolves |

**Pattern for new plans:**
1. Create `_llm/plans/FEATURE_PLAN.md`
2. Track progress with phases and checkboxes
3. Move to `_llm/archive/` when complete
