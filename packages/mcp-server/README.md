# arete-mcp-server

MCP server for [Arete](https://github.com/gustavofjordao021/arete-ai) portable AI identity. Makes Claude Desktop remember who you are across conversations.

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
npx arete-mcp-server setup              # Interactive signup (prompts for email)
npx arete-mcp-server setup EMAIL        # Non-interactive signup
npx arete-mcp-server                    # Start MCP server
npx arete-mcp-server --help             # Show help
```

## Tools Provided

| Tool | Purpose |
|------|---------|
| `arete_identity` | Get your identity for personalization (supports task-aware projection) |
| `arete_remember` | Store, validate, or remove facts (auto-detects category) |
| `arete_activity` | Get recent browsing/interaction context |
| `arete_infer` | Extract facts from activity patterns + accept/reject candidates |

## How It Works

Arete stores your identity locally (`~/.arete/`) and syncs to the cloud. The MCP server exposes this identity to Claude Desktop, so Claude knows:

- Who you are (role, background)
- What you're working on (current projects, focus areas)
- Your preferences (communication style, tools you use)
- Your expertise (skills, domains)

## Export & Import

Backup or transfer your identity using OpenIdentity format:

```bash
# Export your identity
arete identity export --format oi > my-identity.oi

# Export only public facts (for sharing)
arete identity export --format oi --visibility public > public.oi

# Import from backup
arete identity import ./my-identity.oi
```

### Privacy Tiers

Facts have visibility levels: `public` (any AI), `trusted` (authorized apps), `local` (never leaves device).

## Recommended: System Prompt

For Claude to **automatically** capture context (not just respond to manual tool calls), add this to your Claude Desktop system prompt:

**Settings → Claude's memory & system prompt → paste this:**

```
You have Arete tools for portable identity.

AT CONVERSATION START: Call arete_identity to know who you're talking to.

AFTER RESPONSES: If the user revealed a preference, constraint, or personal fact — store it with arete_remember:

Examples:
- "I'm Brazilian" → arete_remember(content: "User is Brazilian")
- "I prefer short answers" → arete_remember(content: "Prefers concise responses")
- "I'm learning Rust" → arete_remember(content: "Currently learning Rust")

Category is auto-detected (core, expertise, preference, context, focus).

This is not optional. Storing context is part of completing the task.
```

Without this, you get tools but Claude won't proactively use them.

## FAQ

**How is this different from ChatGPT memory / Claude memory?**

Those memories are siloed. ChatGPT's memory only works in ChatGPT. Claude's memory only works in Claude. Switch tools and you start from zero. Arete is a *portable* identity layer — same you, everywhere. One identity that works across Claude, GPT, Cursor, and whatever comes next.

**Privacy concerns?**

Local-first by design. Your identity lives in `~/.arete/` on your machine. The MCP server runs locally — no data leaves your computer unless you opt into cloud sync (coming later, for multi-device). Code is open source, so you can audit exactly what's captured.

**Why MCP?**

MCP (Model Context Protocol) is Anthropic's standard for extending Claude. It's the fastest path to getting identity into Claude Desktop without hacks. As MCP adoption grows, Arete automatically works with any MCP-compatible tool.

**What's the business model?**

Figuring it out. Right now we're focused on validating that portable identity actually makes AI better. The likely path: free local-first tier (what you see now), paid cloud sync for multi-device convenience.

## Open Beta

No invite code needed — just run `npx arete-mcp-server setup` and enter your email.

## License

MIT
