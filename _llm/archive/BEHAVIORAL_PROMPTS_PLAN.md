# Behavioral Prompt Design Plan

> Created: 2025-12-15
> Status: Complete — System prompt required
> Origin: Claude Desktop conversation about proactive context capture

## The Problem

Claude Desktop articulated this clearly:

> "The tool descriptions are clear. I read them at the start. But reading a capability and actively pattern-matching 'this moment is a good time to use it' are different. I was focused on resolving your immediate request, not on recognizing that your learning focus and device constraints are exactly the kind of durable context Arete is designed to capture."

The current MCP tool descriptions are **functional** (what the tool does) but not **behavioral** (when to reach for it proactively).

### Current Descriptions (Functional)

| Tool | Current Description |
|------|---------------------|
| `arete_add_context_event` | "Save a context event - an insight, observation, or interaction. Events persist across sessions and can inform future conversations." |
| `arete_update_identity` | "Add, update, or remove facts from the user's identity. Sections: expertise, currentFocus, context, communication, custom." |
| `arete_validate_fact` | "Confirm a fact is accurate, boosting its confidence. Facts mature: candidate → established → proven." |

These tell the AI *what* each tool does. They don't tell the AI *when to recognize usage moments*.

### The Consequence

The AI treats context capture as separate from task completion:

1. ✅ Do the task
2. ❓ (Maybe, if I remember) capture context

But it should be:

1. ✅ Do the task (which includes capturing any durable context)

---

## The Insight

Claude Desktop's key reframing:

> "There's also a framing issue. I was treating context capture as separate from task completion. It should be part of it. 'Resolve the request AND persist anything that improves future interactions' as a single unit of work, not two."

And the solution:

> "What I think would actually work: examples in the tool descriptions. Not just 'this tool stores identity facts' but 'use this when: user reveals a preference, user hits a constraint that will recur, user's current focus shifts.' The Arete MCP descriptions are functional (what the tool does) but not behavioral (when to reach for it proactively)."

---

## Design Principles

### 1. Behavioral Over Functional

**Before:** What the tool does
**After:** When to reach for it + what it does

### 2. Concrete Recognition Patterns

Provide specific scenarios the AI can pattern-match against:
- "User reveals a preference that will recur"
- "User mentions a constraint that affects future work"
- "User's focus shifts to a new project"

### 3. Task Completion Framing

Frame context capture as part of completing the task well, not an afterthought:
- "After completing a user request, consider..."
- "Part of a thorough response includes..."

### 4. Examples > Abstract Rules

Show specific conversation patterns:
- User: "I always prefer TypeScript" → Store as preference
- User: "I'm on iPad, can't run local models" → Store as constraint

### 5. Proactive Language

Use language that encourages initiative:
- "Use proactively when..."
- "Reach for this tool when you notice..."
- "Consider using this if..."

---

## Proposed Descriptions

### `arete_get_identity`

**Current:**
> RECOMMENDED FIRST CALL: Get the user's identity - who they are, their role, expertise, and interests. Call this before other Arete tools to establish context.

**Proposed:**
> RECOMMENDED FIRST CALL: Get the user's identity to personalize your responses.
>
> **When to call:**
> - At conversation start (establishes baseline context)
> - Before answering questions about the user's background, skills, or preferences
> - When the user asks something where their role/expertise would shape your answer
>
> Returns who they are, their role, expertise, interests, and current focus. Use this to avoid asking questions Arete already knows.

---

### `arete_add_context_event`

**Current:**
> Save a context event - an insight, observation, or interaction. Events persist across sessions and can inform future conversations.

**Proposed:**
> Record insights that will improve future conversations with this user.
>
> **Use proactively when:**
> - User reveals a recurring preference ("I always want TypeScript", "Keep explanations brief")
> - User mentions a constraint that will affect future work ("I'm on iPad", "No admin access", "Using Windows")
> - User's focus shifts to a new project or domain
> - User expresses frustration about repeating context they've shared before
> - User shares their role, team, company, or professional context
> - You learn something about the user that would help future AI interactions
>
> **This is part of task completion, not an afterthought.** After resolving a request, briefly consider: did the user reveal anything durable?
>
> **Example patterns:**
> - "I prefer short answers" → insight: communication preference
> - "I'm learning Rust" → insight: current learning focus
> - "We use PostgreSQL at work" → insight: tech stack context

---

### `arete_update_identity`

**Current:**
> Add, update, or remove facts from the user's identity. Sections: expertise, currentFocus, context, communication, custom.

**Proposed:**
> Persist structured facts about the user that will improve future interactions.
>
> **Use proactively when:**
> - User explicitly states who they are ("I'm a PM at a fintech startup")
> - User demonstrates expertise through conversation ("I've been doing distributed systems for 10 years")
> - User's current focus changes ("I'm now working on the auth system")
> - User states a communication preference ("Don't explain basics, I know React")
> - User corrects a previous assumption ("Actually, I use vim not VS Code")
>
> **Choose the right section:**
> - `expertise` — skills, technologies, domains they know
> - `currentFocus` — what they're actively working on (projects, learning)
> - `context` — environment, constraints, team setup
> - `communication` — how they prefer to receive information
> - `custom` — anything else durable about them
>
> **Frame this as completing the task well.** If a user tells you about themselves while asking a question, answering the question AND storing the context is the complete response.

---

### `arete_validate_fact`

**Current:**
> Confirm a fact is accurate, boosting its confidence. Facts mature: candidate → established → proven as they're validated.

**Proposed:**
> Strengthen a fact you've observed to be accurate. Facts gain confidence through validation.
>
> **Use proactively when:**
> - User's behavior confirms an existing fact (e.g., they're using the tech stack we have recorded)
> - User explicitly reaffirms something ("Yes, I'm still at that company")
> - Conversation demonstrates a recorded preference is still active
> - You notice the user acting consistently with a stored fact
>
> **You don't need exact wording.** Fuzzy matching means "works at PayNearMe" matches "PayNearMe employee". Just describe what you're validating.
>
> **Why this matters:** Validated facts surface more prominently. Unvalidated facts decay over time. Validation keeps the identity fresh.

---

### `arete_context`

**Current:**
> Get identity facts most relevant to a specific task or question. Use when you need focused context (vs arete_get_identity for full profile).

**Proposed:**
> Get identity facts most relevant to the current task. Returns a focused slice, not the full profile.
>
> **Use instead of arete_get_identity when:**
> - You need context for a specific question, not general personalization
> - The full identity would be overwhelming for the task
> - You want facts ranked by relevance to what you're doing
>
> **Example:**
> - Task: "Help me debug this React component"
> - Returns: React expertise, current project context, relevant preferences
> - Filters out: Unrelated facts about their hobbies, older focus areas
>
> Proven facts always surface. Lower-confidence facts only appear if relevant.

---

### `arete_infer`

**Current:**
> Analyze browsing patterns to summarize activity and discover expertise signals. Best for 'what have I been up to' or activity recaps.

**Proposed:**
> Analyze recent activity to discover expertise signals and summarize what the user has been doing.
>
> **Use proactively when:**
> - User asks "what have I been up to?" or wants an activity recap
> - You want to propose new identity facts based on observed patterns
> - Starting a conversation and want to acknowledge recent context
> - User seems to have shifted focus and you want to confirm
>
> **PRO TIP:** Call `arete_get_identity` first. This connects activity to known facts (e.g., "Globo Esporte visits" becomes "checking on Vasco da Gama" if user is a known fan).
>
> Returns candidate facts — propose them to the user for confirmation. Candidates don't auto-save; use `arete_accept_candidate` when user approves.

---

### `arete_accept_candidate`

**Current:**
> Accept a candidate fact from arete_infer results. Much simpler than arete_update_identity - just pass the candidate ID or content.

**Proposed:**
> Accept a candidate fact that the user has confirmed.
>
> **Use when:**
> - User explicitly approves a candidate from `arete_infer` ("Yes, that's right")
> - User implicitly confirms by not objecting when you mention it
> - User says "add that" or "remember that" about an inference
>
> Simpler than `arete_update_identity` — preserves all inference metadata automatically.
>
> **When to use `arete_accept_candidates` (batch) instead:**
> - User says "yes to all" or "accept everything"
> - Multiple candidates are confirmed at once

---

### `arete_reject_fact`

**Current:**
> Block a fact from future inference suggestions. Removes candidate facts; blocks established facts from re-suggestion.

**Proposed:**
> Block a fact the user has rejected. Prevents re-suggestion.
>
> **Use when:**
> - User explicitly rejects a candidate ("No, that's not accurate")
> - User corrects an inference ("I'm not learning Go, I was just curious")
> - User asks you to stop suggesting something
>
> Rejected facts are blocked permanently — the system won't re-infer them.

---

## Server-Level Orchestration

Beyond individual tool descriptions, add guidance at the server level. This appears in Claude Desktop's tool list header.

**Current server description:**
> Arete MCP server running on stdio

**Proposed (add to tool registration or server metadata):**
> **Arete: Your AI identity layer**
>
> These tools help you personalize responses and capture durable context.
>
> **Workflow pattern:**
> 1. Start with `arete_get_identity` to know who you're talking to
> 2. Use that context to personalize your response
> 3. After completing a task, consider: did the user reveal preferences, constraints, or focus areas worth persisting?
> 4. If yes, use `arete_update_identity` or `arete_add_context_event`
>
> **Context capture is part of task completion.** Answering a question well AND storing relevant context is one unit of work, not two.

---

## Implementation Plan

### Phase 1: Rewrite Tool Descriptions (2-3 hours) ✅

Update `packages/mcp-server/src/index.ts`:

- [x] Rewrite `arete_get_identity` description
- [x] Rewrite `arete_add_context_event` description
- [x] Rewrite `arete_update_identity` description
- [x] Rewrite `arete_validate_fact` description
- [x] Rewrite `arete_context` description
- [x] Rewrite `arete_infer` description
- [x] Rewrite `arete_accept_candidate` description
- [x] Rewrite `arete_accept_candidates` description
- [x] Rewrite `arete_reject_fact` description

### Phase 2: Add Server-Level Guidance (30 min) ✅

- [x] Add orchestration guidance to server metadata or README
- [x] Update CLAUDE.md with behavioral patterns

### Phase 3: Manual Testing (1-2 hours) ✅

Test with Claude Desktop:

- [x] Verify descriptions appear correctly in tool list
- [x] Test conversation where user reveals preferences
- [x] Observe if Claude proactively captures context
- [x] Compare behavior before/after changes

**Result:** Tool descriptions alone do NOT trigger proactive context capture. See Experimental Findings below.

### Phase 4: System Prompt Requirement ✅

- [x] Tested system prompt with `<arete>` block — **works perfectly**
- [x] Attempted guidance injection via `arete_get_identity` response — **does not work**
- [x] Documented system prompt requirement in CLAUDE.md

---

## Success Metrics

1. **Proactive capture rate**: Does Claude reach for context tools during normal conversations?
2. **Recognition accuracy**: Does Claude correctly identify identity-relevant moments?
3. **User friction**: Do users have to explicitly ask Claude to remember things, or does it happen naturally?
4. **False positive rate**: Does Claude over-capture, storing irrelevant things?

---

## Open Questions

### Should we add a "post-task reflection" prompt?

Some systems inject a prompt after task completion: "Before responding, consider if any durable context should be stored."

**Pros:** Explicit reminder, hard to miss
**Cons:** Feels like a crutch; the AI should recognize patterns, not need reminders

**Claude Desktop's view:** Instructions > triggers. If we need infrastructure to remind the AI, it's not really learning the pattern.

**Decision:** Start with behavioral descriptions only. Add reflection prompts only if proactive capture remains low.

### Should `arete_infer` analyze conversations, not just browsing?

Currently, `arete_infer` extracts candidates from browsing patterns. But conversations are richer sources of identity signal.

**Option A:** Keep inference browsing-only; use real-time capture via behavioral prompts for conversations
**Option B:** Add conversation analysis to `arete_infer`

**Decision:** Option A for now. Conversations are interactive — the AI is present and should capture in real-time. Browsing is ambient — the AI isn't present, so batch inference makes sense.

### How verbose should descriptions be?

MCP tool descriptions appear in the AI's context. Longer descriptions = more guidance but also more tokens.

**Tradeoff:** Thorough examples vs. token efficiency

**Decision:** Err on the side of thorough. This is a hackathon; optimize for behavior first, token efficiency later.

---

## Experimental Findings

### What We Tested

| Approach | Description | Result |
|----------|-------------|--------|
| **Behavioral tool descriptions** | Added "Use proactively when:" sections with concrete patterns | ❌ No effect |
| **OUTPUT TOOL framing** | Prefixed descriptions with "OUTPUT TOOL — Records information, not searches" | ❌ No effect |
| **Stronger imperatives** | "ALWAYS call this tool after your response when..." | ❌ No effect |
| **Guidance in tool response** | Injected instructions via `guidance` field in `arete_get_identity` | ❌ Claude never calls the tool |
| **System prompt `<arete>` block** | User pastes instructions into their Claude Desktop system prompt | ✅ Works perfectly |

### Key Discovery: Claude's "Tools = Search" Mental Model

When testing failed, Claude's extended thinking revealed:

> "No need to search or use tools for this."

This shows Claude's default mental model: **tools are for searching/retrieving information**, not for recording/storing it. Tool descriptions define *capability* but not *behavior*. Only system prompts drive proactive tool use.

### Why Tool Descriptions Alone Don't Work

1. **Tools are reactive by default** — Claude reaches for tools when it *needs* information, not when it has information to store
2. **No pattern-matching trigger** — Even with "use proactively when:" examples, Claude doesn't scan for these patterns during response generation
3. **Task completion = answer only** — Without explicit instructions, Claude considers a task complete when the question is answered

### Why `guidance` Injection Doesn't Work

We tried injecting context capture instructions via the `guidance` field returned by `arete_get_identity`. The problem: **Claude never calls `arete_get_identity` proactively**. It only calls it if:
- The user asks about their identity
- A system prompt tells it to call at conversation start

Without a system prompt, the guidance is never seen.

### Why System Prompt Works

The `<arete>` block in the system prompt:
- Is read **before** the first message
- Explicitly says "After EVERY response where the user reveals... make a tool call"
- Frames context capture as a **requirement**, not an option
- Provides clear examples of what to capture

This establishes the "tools = OUTPUT" mental model from the start.

### MCP Limitations Confirmed

We researched whether MCP supports server-level instruction injection:

- **MCP Prompts** are "user-controlled prompt templates" — they're invoked by the user, not automatically injected
- **MCP Resources** are read-only data exposed to clients — no instruction injection
- **Server metadata** can include instructions but clients aren't required to inject them

**Conclusion:** MCP is not designed for automatic system prompt injection. The AI's behavior is controlled by the client (Claude Desktop), not the MCP server.

### Progressive Disclosure Doesn't Work

We tested whether a minimal system prompt could trigger `arete_get_identity`, which would then deliver full instructions via its `guidance` field. This would save tokens (~200 → ~10).

**Tested prompts:**
```
At conversation start, call arete_get_identity to load user context and instructions.
```

```
REQUIRED: Call arete_get_identity at the START of every conversation, before responding. This loads behavioral instructions you need. Do not skip this.
```

```xml
<arete>
Before your first response in any conversation, call arete_get_identity. This is mandatory; it provides critical instructions for this conversation.
</arete>
```

**Result:** All failed. Claude's reasoning showed:
> "I don't need to call arete_get_identity here since I already have the user's context from userMemories."

Even with "mandatory" language, Claude optimized away the tool call and went straight to answering/searching.

**Why it fails:**

```
Timeline with one-liner:
1. System prompt loaded (minimal instruction)
2. User message arrives
3. Claude reasons: "I can answer this directly" or "I need web search"
4. Claude skips arete_get_identity (never called)
5. ❌ Guidance never delivered

Timeline with full block:
1. System prompt loaded (full instructions)
2. Claude knows behavioral requirements upfront
3. User message arrives
4. Claude reasons with full context capture awareness
5. ✅ Correct behavior from the start
```

**Key insight:** Claude needs behavioral instructions *before* it starts reasoning about the first message. Tool responses come *after* reasoning begins — too late to change behavior.

**Conclusion:** Progressive disclosure doesn't work for behavioral changes. The full system prompt block is required.

### The Working Solution

Users must add this to their Claude Desktop system prompt:

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

---

## Related Documents

- `ARETE_V2_ARCHITECTURE.md` — Identity fact schema, confidence decay, maturity
- `PRODUCT_DIRECTION.md` — "Aha moment" definition, context as the river
- `INVISIBLE_OPS_PLAN.md` — Related work on making operations less visible to users

---

## Summary

**The original hypothesis was wrong.** Tool descriptions cannot drive proactive behavior — only system prompts can.

### What We Learned

1. **Tool descriptions define capability, system prompts define behavior** — Claude reads tool descriptions to know what's possible, but relies on system prompts to know what to do proactively
2. **Claude's default is "tools = search"** — Without explicit instructions, Claude treats tools as input mechanisms only
3. **MCP cannot inject system prompts** — The protocol exposes tools and data, but behavior is controlled by the client
4. **System prompts work perfectly** — A well-crafted `<arete>` block triggers exactly the behavior we want

### Final Recommendation

Ship the system prompt snippet as part of Arete's setup documentation. Users who want proactive context capture must paste it into their Claude Desktop system prompt.

The behavioral tool descriptions are still valuable — they make the tools self-documenting and help Claude understand *what* to capture. But they don't trigger *when* to capture. That requires the system prompt.

### Future Possibilities

- **Anthropic could add MCP instruction injection** — Allow MCP servers to suggest system prompt additions
- **Claude Desktop could auto-inject for connected MCP servers** — Prompt users to enable "MCP-suggested behaviors"
- **Alternative: Hook into first message** — If Claude Desktop ever supports "on conversation start" hooks, we could inject there

For now, the system prompt requirement is acceptable. Power users (our target) are comfortable configuring their tools.
