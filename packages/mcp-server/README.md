# arete-mcp-server

MCP server for [Arete](https://github.com/gustavofjordao021/ai-collective-hackaton-arete) portable AI identity. Makes Claude Desktop remember who you are across conversations.

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

## Get an Invite Code

Request an invite code at: https://github.com/gustavofjordao021/ai-collective-hackaton-arete/issues

## License

MIT
