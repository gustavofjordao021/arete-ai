# E2E Testing Checklist

> Manual validation of full-stack identity sync across all interfaces
> **Updated:** Now includes v2 identity tools (inference, validation, projection)

## Prerequisites

- [ ] Chrome browser installed
- [ ] Claude Desktop installed
- [ ] Supabase project running (ID: `dvjgxddjmevmmtzqmzrm`)
- [ ] Extension built: `npm run build`
- [ ] MCP server built: `npm run build:mcp`
- [ ] Local identity migrated to v2: Check `~/.arete/identity.json` has `"version": "2.0.0"`

---

## Phase 1: Extension Setup

### 1.1 Install Extension
- [ ] Open `chrome://extensions`
- [ ] Enable "Developer mode"
- [ ] Click "Load unpacked" → select `dist/` folder
- [ ] Verify extension icon appears in toolbar

### 1.2 Sign In (Google OAuth)
- [ ] Click extension icon → popup opens
- [ ] Click "Sign in with Google"
- [ ] Complete Google OAuth flow
- [ ] Verify: Popup shows "Signed in as [email]"

### 1.3 Set Initial Identity
- [ ] Click "Edit" tab in popup
- [ ] Enter prose: "I'm a senior engineer at Acme Corp, expert in TypeScript and React"
- [ ] Click "Save"
- [ ] Click "View" tab
- [ ] Verify: Identity shows parsed fields (name, role, expertise)

### 1.4 Verify Cloud Sync
- [ ] Open Supabase dashboard → Table Editor → `identities`
- [ ] Verify: Row exists with your user_id and identity data

---

## Phase 2: Context Collection

### 2.1 Browse Test Pages
- [ ] Visit: `https://supabase.com/docs`
- [ ] Visit: `https://www.typescriptlang.org/docs`
- [ ] Visit: `https://stripe.com/docs/api`

### 2.2 Verify Context Events
- [ ] Open Supabase dashboard → `context_events` table
- [ ] Verify: `page_visit` events exist for each URL
- [ ] Verify: `source` = "chrome-extension"

### 2.3 Test Overlay (Optional)
- [ ] Press `Cmd+Shift+O` on any page
- [ ] Verify: Overlay appears
- [ ] Type a question, verify response
- [ ] Press `ESC` to close

---

## Phase 3: CLI Authentication

### 3.1 Generate API Key
- [ ] In Supabase dashboard, go to your user profile
- [ ] Generate a new API key (or use existing)
- [ ] Copy the key: `sk_live_...`

### 3.2 CLI Login
```bash
npm run cli auth login
```
- [ ] Enter API key when prompted
- [ ] Verify: "Login successful" message

### 3.3 Verify CLI Can Read Identity
```bash
npm run cli identity get
```
- [ ] Verify: Shows same identity as extension
- [ ] Verify: Includes expertise from Phase 1

### 3.4 Verify CLI Can Read Context
```bash
npm run cli context list --limit 5
```
- [ ] Verify: Shows page_visit events from Phase 2

---

## Phase 4: MCP Server + Claude Desktop

### 4.1 Configure Claude Desktop
Add to `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "arete": {
      "command": "node",
      "args": ["/FULL/PATH/TO/arete/packages/mcp-server/dist/index.js"]
    }
  }
}
```
- [ ] Restart Claude Desktop
- [ ] Verify: Arete tools appear in Claude's tool list (should see 8 tools)

### 4.2 Available MCP Tools
Verify all tools are registered:
| Tool | Purpose |
|------|---------|
| `arete_get_identity` | Get v1 identity (full dump) |
| `arete_get_recent_context` | Get recent browsing context |
| `arete_add_context_event` | Record insights from conversation |
| `arete_update_identity` | Update v1 identity sections |
| `arete_validate_fact` | Validate a v2 fact (bump confidence) |
| `arete_context` | **v2: Task-aware projection** |
| `arete_infer` | **v2: Extract candidate facts from patterns** |
| `arete_reject_fact` | **v2: Block a fact from inference** |

### 4.3 Test Identity Reading
In Claude Desktop, ask:
> "Use the arete tools to tell me about my identity"

- [ ] Verify: Claude calls `arete_get_identity`
- [ ] Verify: Response includes your name, role, expertise
- [ ] Verify: Claude uses identity naturally (doesn't say "your profile shows")

### 4.4 Test Context Reading
Ask Claude:
> "What pages have I been browsing recently?"

- [ ] Verify: Claude calls `arete_get_recent_context`
- [ ] Verify: Shows Supabase, TypeScript, Stripe docs from Phase 2

---

## Phase 4.5: THE "AHA" MOMENT (v2 Inference Flow)

This is the killer feature - Claude notices patterns and proposes identity updates!

### 4.5.1 Trigger Inference
Ask Claude:
> "What have I been working on lately? Any patterns you notice?"

Expected flow:
1. [ ] Claude calls `arete_infer`
2. [ ] Claude presents candidates naturally:
   > "I noticed you've been spending time on:
   > - **Supabase** (5 visits to docs)
   > - **Stripe API** (3 visits)
   > Would you like me to add any of these to your expertise?"

### 4.5.2 Accept a Candidate
Respond:
> "Yes, add Supabase - I'm actively using it"

- [ ] Claude calls `arete_validate_fact` with the Supabase candidate
- [ ] Claude confirms: "Added Supabase to your expertise"
- [ ] Verify: Fact now has `maturity: "candidate"` → `"established"` after validation

### 4.5.3 Reject a Candidate
Respond:
> "No to Stripe - I'm just reading about it, not an expert"

- [ ] Claude calls `arete_reject_fact` for Stripe
- [ ] Claude acknowledges naturally (doesn't dwell on it)
- [ ] Verify: `~/.arete/blocked.json` now contains Stripe

### 4.5.4 Verify Rejection Works
Ask Claude again:
> "Any other patterns in my browsing?"

- [ ] Verify: Stripe is NOT suggested again (it's blocked)

### 4.5.5 Test Task-Aware Projection
Ask Claude:
> "Help me debug this React component that uses Supabase"

- [ ] Claude calls `arete_context` with task="debug React Supabase"
- [ ] Claude's response assumes your expertise naturally
- [ ] Claude doesn't say "based on your profile" - just knows you

---

## Phase 4.6: Validation & Maturity Progression

### 4.6.1 Validate Facts Multiple Times
Have several conversations where Claude confirms your Supabase expertise:
1. Ask about Supabase RLS policies
2. Ask about Supabase Edge Functions
3. Ask about Supabase Auth

Each time Claude confirms you know something:
- [ ] Claude can call `arete_validate_fact`
- [ ] Check `~/.arete/identity.json`:
  - `validationCount` increases
  - `confidence` increases (caps at 1.0)
  - `maturity` progresses: `candidate` → `established` (2+) → `proven` (5+)

### 4.6.2 Verify Proven Facts Always Included
Once a fact reaches `maturity: "proven"`:
- [ ] It appears in every `arete_context` response
- [ ] Even for unrelated tasks (proven facts are core identity)

---

## Phase 4.7: Legacy Flow (v1 Identity Update)

The original flow still works for v1 identities:

Ask Claude:
> "Based on my recent browsing, should you update my expertise?"

Expected flow:
1. [ ] Claude reads context (sees browsing history)
2. [ ] Claude proposes: "I see you've been researching X. Add to expertise?"
3. [ ] You respond: "Yes"
4. [ ] Claude calls `arete_update_identity` with:
   - section: "expertise"
   - operation: "add"
   - value: "X"
5. [ ] Verify: Claude confirms update

### 4.7.1 Verify Sync Back to Extension
- [ ] Open Chrome extension popup
- [ ] Click "View" tab
- [ ] Verify: Expertise now includes item added by Claude!

### 4.7.2 Verify in Supabase
- [ ] Check `identities` table
- [ ] Verify: `data.expertise` array includes new items

---

## Phase 5: Cross-Interface Verification

### 5.1 CLI Sees Claude's Changes
```bash
npm run cli identity get
```
- [ ] Verify: Shows expertise added by Claude Desktop

### 5.2 Extension Sees CLI Changes
```bash
npm run cli identity set "I also know Python and machine learning"
```
- [ ] Refresh extension popup
- [ ] Verify: New expertise appears

### 5.3 Claude Sees Extension Changes
- [ ] In extension popup, edit identity to add "Kubernetes"
- [ ] In Claude Desktop: "What's my expertise?"
- [ ] Verify: Includes "Kubernetes"

---

## Success Criteria

### Identity Sync (All Interfaces)
All interfaces show consistent identity:
- [ ] Chrome Extension
- [ ] CLI (`npm run cli identity get`)
- [ ] Claude Desktop (via MCP tools)
- [ ] Supabase dashboard (raw data)

Changes made in ANY interface sync to ALL others:
- [ ] Extension → CLI ✓
- [ ] Extension → Claude ✓
- [ ] CLI → Extension ✓
- [ ] CLI → Claude ✓
- [ ] Claude → Extension ✓
- [ ] Claude → CLI ✓

### v2 Identity Features (THE "AHA" MOMENT)
- [ ] **Inference works**: `arete_infer` detects patterns from browsing
- [ ] **Candidates presented naturally**: Claude doesn't say "the tool returned..."
- [ ] **Validation works**: Accepted candidates become facts
- [ ] **Rejection works**: Declined candidates go to blocked.json
- [ ] **Blocked facts stay blocked**: Never re-suggested
- [ ] **Task projection works**: `arete_context` returns relevant facts only
- [ ] **Confidence decay works**: Old facts have lower effective confidence
- [ ] **Maturity progression works**: candidate → established → proven
- [ ] **Invisible behavior**: Claude knows you without being explicit about it

---

## Troubleshooting

### Extension not syncing
1. Check console for errors: Right-click icon → "Inspect popup"
2. Verify auth: Should show "Signed in as..."
3. Check network tab for failed Supabase requests

### CLI auth issues
```bash
npm run cli auth status
npm run cli auth logout
npm run cli auth login
```

### MCP tools not appearing in Claude
1. Check config path is absolute
2. Restart Claude Desktop completely
3. Check MCP server logs: `npm run mcp` (should output to stderr)

### Data not syncing
1. Check Supabase dashboard for errors in logs
2. Verify RLS policies allow your user
3. Check that user_id matches across tables

### v2 Identity Issues

#### arete_infer returns no candidates
1. Check `~/.arete/context.json` has page_visit events
2. Verify events are within lookbackDays (default: 7)
3. Need 3+ visits to same domain for pattern detection
4. Common domains (google, github) are ignored

#### Fact not being blocked
1. Check `~/.arete/blocked.json` exists and contains the fact
2. Blocked facts match by `factId` or `content` (fuzzy)

#### Task projection not working
1. Identity must be v2 format (`"version": "2.0.0"`)
2. Check `~/.arete/identity.json` has `facts` array
3. Use `arete_get_identity` for v1, `arete_context` for v2

#### Confidence not decaying
1. Check `lastValidated` timestamp on the fact
2. Default half-life is 60 days
3. Recently validated facts will have high effective confidence

### Quick Debug Commands
```bash
# Check local identity
cat ~/.arete/identity.json | jq '.version, .facts | length'

# Check blocked facts
cat ~/.arete/blocked.json | jq '.'

# Check context events
cat ~/.arete/context.json | jq 'length'

# Test MCP server directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run mcp
```
