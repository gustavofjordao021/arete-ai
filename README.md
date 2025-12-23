# OpenIdentity + Arete

> ChatGPT memory only works in ChatGPT. Claude memory only works in Claude.
> **OpenIdentity works everywhere.**

---

## The Problem

Every AI tool builds its own memory silo. You repeat yourself constantly:
- "I'm a PM at a fintech startup..."
- "I prefer concise answers..."
- "We use TypeScript and PostgreSQL..."

Switch from ChatGPT to Claude? Start over. Try Cursor? Start over again.

Your context is trapped. Your investment in training AI is locked to one vendor.

---

## The Protocol

**OpenIdentity** is a portable interchange format for AI identity. One schema that works across Claude, GPT, Cursor, and any AI tool.

It defines:
- **Facts** — Categorized information about you (expertise, preferences, context)
- **Confidence** — Facts decay over time unless validated
- **Privacy tiers** — You control what's shared (`public`, `trusted`, `local`)

**[Read the full specification →](./OPENIDENTITY.md)**

```json
{
  "$schema": "https://openidentity.org/schema/v1.0.json",
  "version": "1.0.0",
  "identity": { "role": "Senior Engineer at Stripe" },
  "facts": [
    {
      "category": "expertise",
      "content": "Expert in TypeScript and React",
      "confidence": 1.0,
      "visibility": "public"
    }
  ]
}
```

---

## The Implementation

**Arete** is the reference implementation of OpenIdentity.

| Component | Description |
|-----------|-------------|
| **MCP Server** | Claude Desktop integration — identity flows into conversations |
| **Chrome Extension** | Captures browser context automatically |
| **CLI** | Identity management, export/import |

```
┌─────────────────────────────────────────────────────────┐
│                   Your OpenIdentity                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Expertise  │  │ Preferences │  │   Context   │     │
│  │  TypeScript │  │   Concise   │  │  PM @ fintech│     │
│  │  React      │  │  No emojis  │  │  Learning Go │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ Claude  │       │  GPT    │       │ Cursor  │
   │ Desktop │       │ (soon)  │       │ (soon)  │
   └─────────┘       └─────────┘       └─────────┘
```

---

## Quick Start

### For Claude Desktop Users

```bash
# 1. Sign up (just need your email)
npx arete-mcp-server setup

# 2. Add to Claude Desktop config (~/.config/claude/claude_desktop_config.json):
{
  "mcpServers": {
    "arete": {
      "command": "npx",
      "args": ["arete-mcp-server"]
    }
  }
}

# 3. Restart Claude Desktop

# 4. Ask Claude: "What do you know about me?"
```

That's it. No repo cloning needed.

### Export/Import Your Identity

```bash
# Export to OpenIdentity format
arete identity export --format oi > my-identity.oi

# Export only public facts (for sharing)
arete identity export --format oi --visibility public > public.oi

# Import from backup or another tool
arete identity import ./backup.oi
```

---

## For Tool Builders

**Why should your tool support OpenIdentity?**

| Benefit | Description |
|---------|-------------|
| **No cold start** | Users arrive with preferences and expertise already defined |
| **Reduced friction** | Skip onboarding flows — import their identity |
| **User expectation** | As adoption grows, users will expect portable identity |
| **Privacy-respecting** | Visibility tiers let users control what's shared |
| **No vendor lock-in** | Open spec, MIT license — implement it yourself |

**Integration is simple.** Parse a JSON file. The [spec](./OPENIDENTITY.md) is ~100 lines of TypeScript.

### Quick Integration

**Read (import user identity):**
```typescript
import { importFromOpenIdentity } from "@arete/core";

const file = await readFile("user-identity.oi", "utf-8");
const result = importFromOpenIdentity(JSON.parse(file));

// Inject into your system prompt
const relevantFacts = result.identity.facts
  .filter(f => f.category === "preference")
  .map(f => f.content);
```

**Write (export user identity):**
```typescript
import { exportToOpenIdentity } from "@arete/core";

const exported = exportToOpenIdentity(userIdentity, {
  visibility: "public"  // Only export public facts
});

// Let users download
downloadAsFile(exported, "my-identity.oi");
```

---

## Features

| Feature | Status |
|---------|--------|
| OpenIdentity spec (v0.1) | ✅ Live |
| MCP Server for Claude Desktop | ✅ Live |
| Chrome Extension | ✅ Beta |
| Automatic context capture | ✅ Live |
| Privacy tiers (public/trusted/local) | ✅ Live |
| Local-first storage | ✅ Live |
| Cloud sync | 🚧 Coming |
| GPT/OpenAI integration | 🚧 Planned |

---

## CLI Commands

```bash
# Identity management
arete identity get                    # Show current identity
arete identity set "I'm a PM..."      # Store identity from prose

# Export/Import (OpenIdentity format)
arete identity export --format oi > identity.oi
arete identity export --format oi --visibility public
arete identity import ./backup.oi

# Context
arete context list                    # Show recent activity
```

---

## Privacy Tiers

Facts have visibility levels you control:

| Tier | Description | Examples |
|------|-------------|----------|
| `public` | Safe for any AI tool | "Prefers concise answers", "Uses TypeScript" |
| `trusted` | Only authorized apps | "Works at Stripe", "Building stealth startup" |
| `local` | Never leaves device | "Planning to leave job", "Salary info" |

Default is `trusted`. Use `--visibility` flag to filter exports.

---

## Project Structure

```
OPENIDENTITY.md         # Protocol specification

packages/
├── core/               # Shared library (@arete/core)
├── mcp-server/         # Claude Desktop integration
└── telemetry/          # Usage analytics (opt-in)

src/                    # Chrome extension
```

---

## FAQ

**Why not just use ChatGPT/Claude memory?**

Those memories are siloed. Your investment in one tool doesn't transfer. OpenIdentity is the protocol that connects them — same you, everywhere.

**Privacy concerns?**

Local-first by design. Your identity lives in `~/.arete/` on your machine. Code is open source. You control visibility tiers.

**Why MCP?**

MCP (Model Context Protocol) is Anthropic's standard for extending Claude. As MCP adoption grows, OpenIdentity automatically works with any MCP-compatible tool.

**How do I contribute to the spec?**

Open an issue or PR. The spec is versioned (currently 0.1.0) and open for feedback.

---

## Open Beta

No invite code needed — just run `npx arete-mcp-server setup` and enter your email.

---

## Specification

**[OPENIDENTITY.md](./OPENIDENTITY.md)** — The full protocol specification.

Versioned, implementable without reading Arete code.

---

## License

MIT

## Author

**Gustavo Jordão** — [@gustavofjordao021](https://github.com/gustavofjordao021)
