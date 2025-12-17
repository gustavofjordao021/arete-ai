# arete-mcp-server

MCP server for [Arete](https://github.com/gustavofjordao021/arete-ai) portable AI identity. Makes Claude Desktop remember who you are across conversations.

## Quick Start

```bash
# 1. Sign up (get invite code from Arete team)
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
npx arete-mcp-server setup              # Interactive signup
npx arete-mcp-server setup CODE EMAIL   # Non-interactive signup
npx arete-mcp-server                    # Start MCP server
npx arete-mcp-server --help             # Show help
```

## Tools Provided

| Tool | Purpose |
|------|---------|
| `arete_get_identity` | Get your identity for personalization |
| `arete_get_recent_context` | Get recent browsing/interaction context |
| `arete_add_context_event` | Record insights from conversations |
| `arete_update_identity` | Update identity facts |
| `arete_validate_fact` | Strengthen fact confidence |
| `arete_context` | Task-aware identity projection |
| `arete_infer` | Extract facts from activity patterns |
| `arete_reject_fact` | Block incorrect inferences |
| `arete_accept_candidate` | Accept inferred facts |

## How It Works

Arete stores your identity locally (`~/.arete/`) and syncs to the cloud. The MCP server exposes this identity to Claude Desktop, so Claude knows:

- Who you are (role, background)
- What you're working on (current projects, focus areas)
- Your preferences (communication style, tools you use)
- Your expertise (skills, domains)

## Recommended: System Prompt

For Claude to **automatically** capture context (not just respond to manual tool calls), add this to your Claude Desktop system prompt:

**Settings → Claude's memory & system prompt → paste this:**

```
You have Arete tools for portable identity.

AT CONVERSATION START: Call arete_get_identity to know who you're talking to.

AFTER RESPONSES: If the user revealed a preference, constraint, or personal fact — store it:
- Use arete_add_context_event for insights (type="insight", data={insight: "..."})
- Use arete_update_identity for structured facts (section, operation, value, reasoning)

Examples:
- "I'm Brazilian" → store nationality
- "I prefer short answers" → store communication preference
- "I'm learning Rust" → store current focus

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

## Get an Invite Code

Request an invite code at: https://github.com/gustavofjordao021/arete-ai/issues

## License

MIT
