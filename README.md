# Arete

> **Your AI, at its best, everywhere.**

Portable AI identity that follows you across models and tools. Your context, preferences, and expertise — remembered and applied consistently, whether you're using Claude, GPT, or any other AI.

## The Problem

Every AI conversation starts from zero. You repeat yourself constantly:
- "I'm a PM at a fintech startup..."
- "I prefer concise answers..."
- "We use TypeScript and PostgreSQL..."

Your context is trapped in each tool's silo. Switch from ChatGPT to Claude? Start over.

## The Solution

Arete creates a portable identity layer that works across AI tools:

- **One identity, everywhere** — Define yourself once, use it anywhere
- **Automatic context capture** — AI learns your preferences as you chat
- **Cross-model portability** — Same "you" whether using Claude, GPT, or others
- **Privacy-first** — Your data stays local (with optional cloud sync)

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

### For Developers

```bash
git clone https://github.com/gustavofjordao021/arete-ai.git
cd arete-ai
npm install
npm run build
```

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                     Your Identity                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Expertise  │  │ Preferences │  │   Context   │     │
│  │  TypeScript │  │   Concise   │  │  PM @ fintech│     │
│  │  React      │  │  No emojis  │  │  Learning Go │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ Claude  │       │   GPT   │       │  Other  │
   │ Desktop │       │  (soon) │       │   AIs   │
   └─────────┘       └─────────┘       └─────────┘
```

Arete stores structured facts about you:
- **Who you are** — Role, background, location
- **What you know** — Skills, expertise levels, domains
- **How you work** — Preferences, constraints, tools
- **What you're doing** — Current projects, learning goals

## Features

| Feature | Status |
|---------|--------|
| MCP Server for Claude Desktop | ✅ Live |
| Chrome Extension | ✅ Beta |
| Automatic context capture | ✅ Live |
| Local-first storage | ✅ Live |
| Cloud sync | 🚧 Coming |
| GPT/OpenAI integration | 🚧 Planned |
| API for custom integrations | 🚧 Planned |

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| `arete-mcp-server` | MCP server for Claude Desktop | [![npm](https://img.shields.io/npm/v/arete-mcp-server)](https://www.npmjs.com/package/arete-mcp-server) |

## Project Structure

```
packages/
├── core/           # Shared identity library
├── mcp-server/     # Claude Desktop integration
└── telemetry/      # Usage analytics (opt-in)

src/                # Chrome extension
```

## FAQ

**How is this different from ChatGPT memory / Claude memory?**

Those memories are siloed. ChatGPT's memory only works in ChatGPT. Claude's memory only works in Claude. Switch tools and you start from zero. Arete is a *portable* identity layer — same you, everywhere. One identity that works across Claude, GPT, Cursor, and whatever comes next.

**Privacy concerns?**

Local-first by design. Your identity lives in `~/.arete/` on your machine. The MCP server runs locally — no data leaves your computer unless you opt into cloud sync (coming later, for multi-device). Code is open source, so you can audit exactly what's captured.

**Why MCP?**

MCP (Model Context Protocol) is Anthropic's standard for extending Claude. It's the fastest path to getting identity into Claude Desktop without hacks. As MCP adoption grows, Arete automatically works with any MCP-compatible tool. Distribution for free.

**What's the business model?**

Figuring it out. Right now we're focused on validating that portable identity actually makes AI better. The likely path: free local-first tier (what you see now), paid cloud sync for multi-device convenience. Similar to Obsidian's model.

## Open Beta

No invite code needed — just run `npx arete-mcp-server setup` and enter your email to get started.

## License

MIT

## Author

**Gustavo Jordão** — [@gustavofjordao021](https://github.com/gustavofjordao021)
