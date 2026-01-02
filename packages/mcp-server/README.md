# arete-mcp-server

OpenIdentity-compatible MCP server for Claude Desktop. Makes Claude remember who you are — across conversations, across tools.

## What is OpenIdentity?

[OpenIdentity](https://github.com/gustavofjordao021/arete-ai/blob/main/OPENIDENTITY.md) is a portable identity protocol for AI. One schema that works across Claude, GPT, Cursor, and any AI tool.

Arete is the reference implementation.

## Quick Start

```bash
# 1. Sign up (just need your email)
npx arete-mcp-server setup

# 2. Configure Claude Desktop (~/.config/claude/claude_desktop_config.json):
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

That's it. No repo cloning, no building.

## Commands

```bash
npx arete-mcp-server setup              # Interactive signup + install Claude Code hooks
npx arete-mcp-server setup EMAIL        # Non-interactive signup
npx arete-mcp-server                    # Start MCP server
npx arete-mcp-server extract PATH       # Extract facts from transcript (used by hooks)
npx arete-mcp-server --help             # Show help
```

## Tools Provided

| Tool | Purpose |
|------|---------|
| `arete_identity` | Get your identity for personalization (supports task-aware projection) |
| `arete_remember` | Store, validate, or remove facts (auto-detects category) |
| `arete_activity` | Get recent browsing/interaction context |
| `arete_infer` | Extract facts from activity patterns + accept/reject candidates |
| `arete_onboard` | Interactive interview to build identity (3-5 min) |

## How It Works

Your identity is stored locally (`~/.arete/`) in OpenIdentity format. The MCP server exposes it to Claude Desktop, so Claude knows:

- Who you are (role, background)
- What you're working on (current projects, focus areas)
- Your preferences (communication style, tools you use)
- Your expertise (skills, domains)

## Export & Import

Your identity is portable. Backup, transfer, or share:

```bash
# Export your identity
arete identity export --format oi > my-identity.oi

# Export only public facts (for sharing)
arete identity export --format oi --visibility public > public.oi

# Import from backup or another tool
arete identity import ./my-identity.oi
```

### Privacy Tiers

Facts have visibility levels you control:

| Tier | Description |
|------|-------------|
| `public` | Safe for any AI tool |
| `trusted` | Only authorized apps (default) |
| `local` | Never leaves device |

## Recommended: System Prompt

For Claude to **automatically** capture context (not just respond to manual tool calls), add this to your Claude Desktop system prompt:

**Settings → Claude's memory & system prompt → paste this:**

```
You have Arete tools for portable identity.

AT CONVERSATION START: Call arete_identity to know who you're talking to.

AFTER RESPONSES: If the user revealed something DURABLE — useful in future conversations — store it with arete_remember:

Personal examples:
- "I'm Brazilian" → arete_remember(content: "User is Brazilian")
- "I prefer short answers" → arete_remember(content: "Prefers concise responses")
- "I'm learning Rust" → arete_remember(content: "Currently learning Rust")

Project/strategic examples (equally important!):
- Strategic pivot discovered → arete_remember(content: "Project shifting to X approach")
- Architecture decision → arete_remember(content: "Uses Y pattern for Z reason")

Category is auto-detected (core, expertise, preference, context, focus).

Test: Would a future AI benefit from knowing this? If yes, store it.
```

Without this, you get tools but Claude won't proactively use them.

## Claude Code: Automatic Context Capture

For **Claude Code** users, setup auto-installs hooks that make context capture automatic — no system prompt needed:

```bash
npx arete-mcp-server setup
# ✅ Detects Claude Code and installs hooks to ~/.claude/settings.json
```

**Hooks installed:**

| Hook | When | What |
|------|------|------|
| `SessionStart` | New conversation | Injects "call arete_identity" instruction |
| `PreCompact` | Before context compression | Extracts facts via Haiku |
| `SessionEnd` | Session ends | Final extraction of durable facts |

**How it works:**
1. Hooks read the conversation transcript (JSONL)
2. Call Claude Haiku to extract durable facts (role, skills, preferences)
3. Merge into `~/.arete/identity.json` with semantic deduplication

**Check extraction logs:** `cat ~/.arete/extraction.log`

## FAQ

**How is this different from ChatGPT/Claude memory?**

Those memories are siloed. OpenIdentity is the protocol that connects them — same you, everywhere. One identity that works across Claude, GPT, Cursor, and whatever comes next.

**Privacy concerns?**

Local-first by design. Your identity lives in `~/.arete/` on your machine. Code is open source. You control visibility tiers.

**Why MCP?**

MCP (Model Context Protocol) is Anthropic's standard for extending Claude. As MCP adoption grows, OpenIdentity automatically works with any MCP-compatible tool.

## Specification

Full protocol spec: [OPENIDENTITY.md](https://github.com/gustavofjordao021/arete-ai/blob/main/OPENIDENTITY.md)

## Open Beta

No invite code needed — just run `npx arete-mcp-server setup` and enter your email.

## License

MIT
