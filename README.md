# Arete

> **Aggregate memory. Synthesize identity. Eliminate cold start.**

---

## The Problem

Your AI memory is scattered:
- Mem0 knows some things about you
- Supermemory knows other things
- ChatGPT and Claude have locked-away memories you can't access
- Every new AI tool starts from zero

Meanwhile, businesses building AI products face a cold start problem: new users arrive with no context, requiring tedious onboarding before personalization kicks in.

---

## The Solution

**Arete aggregates your AI memories into one portable identity.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Memory Providers                              │
│              Mem0  |  Supermemory  |  Others                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ OAuth
┌─────────────────────────────────────────────────────────────────┐
│                         Arete                                    │
│           Aggregate → Synthesize → Authorize                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ "Connect with Arete"
┌─────────────────────────────────────────────────────────────────┐
│                        Businesses                                │
│        AI Tools  |  Apps  |  Agents  |  Enterprise              │
└─────────────────────────────────────────────────────────────────┘
```

**For users:** Connect your memory providers, get a unified identity you control and selectively share.

**For businesses:** Integrate "Connect with Arete" and skip onboarding — users arrive with context.

---

## How It Works

### 1. Aggregate

Connect your Mem0 and Supermemory accounts via OAuth. Arete fetches your raw memories from each provider.

### 2. Synthesize

An LLM transforms scattered memories into structured identity facts:
- **Core:** Role, name, background
- **Expertise:** Skills, tools, languages
- **Preferences:** Communication style, formatting
- **Context:** Current projects, company
- **Focus:** What you're actively working on

### 3. Authorize

When a business integrates "Connect with Arete," you choose what to share. They get instant personalization; you stay in control.

---

## Architecture

Arete uses a **local-first architecture** with background cloud sync:

- **Local is source of truth** — All reads are instant from `~/.arete/`
- **Background sync** — Cloud sync happens in the background (non-blocking)
- **Works offline** — Full functionality without internet
- **No API keys needed** — Cloud AI services use server-side keys

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your Device                                │
│   ~/.arete/identity.json ← Source of truth (instant reads)     │
└─────────────────────────────────────────────────────────────────┘
                              ↕ Background sync
┌─────────────────────────────────────────────────────────────────┐
│                      Arete Cloud                                │
│   • Identity sync (multi-device)                                │
│   • Embeddings API (semantic search)                            │
│   • Extraction API (fact extraction)                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### For Users (Claude Desktop)

```bash
# 1. Install
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

### For Businesses

Coming soon: "Connect with Arete" SDK for instant user personalization.

---

## The Plaid Analogy

Plaid works because it's not Chase. Banks trust a neutral aggregator that doesn't compete with them.

Arete works because it's not a memory company:
- **We don't capture memory** — Mem0 and Supermemory do that
- **We synthesize identity** — structured, portable, user-controlled
- **We're the neutral pipe** — AI tools trust us because we don't compete

---

## Current State

| Component | Status |
|-----------|--------|
| MCP Server for Claude Desktop | ✅ Live |
| Local-first architecture with cloud sync | ✅ Live |
| Chrome Extension (local capture fallback) | ✅ Beta |
| CLI | ✅ Live |
| Cloud AI services (embeddings, extraction) | ✅ Live |
| Mem0 OAuth connector | 🚧 Building |
| Supermemory OAuth connector | 🚧 Building |
| "Connect with Arete" for businesses | 🚧 Planned |

---

## OpenIdentity

Arete uses the **OpenIdentity** format — a portable interchange standard for AI identity.

```json
{
  "$schema": "https://openidentity.org/schema/v1.0.json",
  "version": "1.0.0",
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

Export your identity, import it elsewhere. Your context travels with you.

**[Read the spec →](./OPENIDENTITY.md)**

---

## Privacy

- **You control access** — businesses only see what you authorize
- **Visibility tiers** — mark facts as `public`, `trusted`, or `local`
- **Local fallback** — works entirely offline if you don't connect providers
- **Open source** — audit the code yourself

---

## CLI Commands

```bash
# Identity management
arete identity get                    # Show current identity
arete identity set "I'm a PM..."      # Store identity from prose

# Export/Import (OpenIdentity format)
arete identity export --format oi > identity.oi
arete identity import ./backup.oi

# Context
arete context list                    # Show recent activity
```

---

## Project Structure

```
packages/
├── core/               # Shared library (@arete/core)
├── mcp-server/         # Claude Desktop integration
└── telemetry/          # Usage analytics (opt-in)

src/                    # Chrome extension (fallback capture)
```

---

## FAQ

**Why not just use Mem0 or Supermemory directly?**

They're single-tool memory. Arete aggregates across providers and synthesizes a unified identity. More tools = richer context.

**What if I don't use any memory provider?**

Arete falls back to local capture (Chrome extension, CLI). You can start local and connect providers later.

**How is this different from ChatGPT/Claude memory?**

Those memories are locked. You can't export them, access them via API, or use them in other tools. Arete aggregates from open providers and gives you control.

---

## License

MIT

## Author

**Gustavo Jordão** — [@gustavofjordao021](https://github.com/gustavofjordao021)
