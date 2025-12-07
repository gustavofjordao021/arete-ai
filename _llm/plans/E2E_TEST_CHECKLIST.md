# E2E Testing Checklist

> Manual validation of full-stack identity sync across all interfaces

## Prerequisites

- [ ] Chrome browser installed
- [ ] Claude Desktop installed
- [ ] Supabase project running (ID: `dvjgxddjmevmmtzqmzrm`)
- [ ] Extension built: `npm run build`
- [ ] MCP server built: `npm run build:mcp`

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
- [ ] Verify: Arete tools appear in Claude's tool list

### 4.2 Test Identity Reading
In Claude Desktop, ask:
> "Use the arete tools to tell me about my identity"

- [ ] Verify: Claude calls `arete_get_identity`
- [ ] Verify: Response includes your name, role, expertise

### 4.3 Test Context Reading
Ask Claude:
> "What pages have I been browsing recently?"

- [ ] Verify: Claude calls `arete_get_recent_context`
- [ ] Verify: Shows Supabase, TypeScript, Stripe docs from Phase 2

### 4.4 Test Identity Update (THE AHA MOMENT!)
Ask Claude:
> "Based on my recent browsing, should you update my expertise?"

Expected flow:
1. [ ] Claude reads context (sees Supabase, Stripe, TypeScript docs)
2. [ ] Claude proposes: "I see you've been researching Supabase and Stripe. Add these to expertise?"
3. [ ] You respond: "Yes"
4. [ ] Claude calls `arete_update_identity` with:
   - section: "expertise"
   - operation: "add"
   - value: "Supabase"
5. [ ] Verify: Claude confirms update

### 4.5 Verify Sync Back to Extension
- [ ] Open Chrome extension popup
- [ ] Click "View" tab
- [ ] Verify: Expertise now includes "Supabase" (added by Claude!)

### 4.6 Verify in Supabase
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
