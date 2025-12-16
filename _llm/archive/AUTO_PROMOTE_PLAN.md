# Automatic Context-to-Identity Promotion Plan

> Created: 2025-12-15
> Status: ✅ Complete
> Origin: Discussion about making Arete feel like ChatGPT/Claude memory

## Problem

Current flow requires explicit user approval for every identity fact:
```
Insight → arete_infer (batch) → candidates → user approves → identity
```

Target flow (like ChatGPT/Claude memory):
```
Insight → auto-promoted to identity → user can review later
```

## Solution Overview

When Claude stores an insight via `arete_add_context_event`, automatically classify and promote high-signal insights to identity facts. Show subtle "Remembered" indicator. Use Supabase Edge Function for LLM classification (no BYOK required).

## User Decisions

- **Visibility**: Subtle tag ("Remembered: X") in response
- **API Key**: Supabase Edge Function proxy (Arete-provided)

---

## Architecture

```
arete_add_context_event(type: "insight", data: {insight: "I'm Brazilian"})
    │
    ▼
[1. Save to context.json] ← Always happens first
    │
    ▼
[2. Classify insight] ← Haiku via Edge Function (or heuristics fallback)
    │
    ├─ High-signal → [3. Check duplicates] → [4. Add to identity]
    │
    └─ Low-signal → Skip promotion
    │
    ▼
[5. Return with "Remembered: Brazilian nationality" tag]
```

---

## Implementation Phases

### Phase 1: Heuristic Classifier (No LLM)

**New file:** `packages/mcp-server/src/tools/auto-promote.ts`

```typescript
interface PromotionResult {
  promote: boolean;
  category: "core" | "expertise" | "preference" | "context" | "focus";
  confidence: number;
  content: string;  // Cleaned/normalized content for the fact
}

// Heuristic rules (no API call)
function classifyWithHeuristics(insight: string): PromotionResult;
```

**Heuristic patterns:**
| Pattern | Category | Example |
|---------|----------|---------|
| "I am/I'm [nationality/role]" | context/core | "I'm Brazilian" |
| "I work at/for" | core | "I work at PayNearMe" |
| "I prefer/like/want" | preference | "I prefer TypeScript" |
| "I know/expert in/years of" | expertise | "I'm expert in React" |
| "I'm building/learning/working on" | focus | "I'm learning Rust" |

**Test file:** `packages/mcp-server/src/tools/auto-promote.test.ts`

---

### Phase 2: Integration with Context Handler

**Modify:** `packages/mcp-server/src/tools/context.ts`

In `addContextEventHandler`:
1. Save event to context (existing)
2. If `type === "insight"`, call `autoPromoteInsight()`
3. If promoted, include fact in response with subtle tag

**Response format change:**
```typescript
// Before
{ text: "Added insight event." }

// After (when promoted)
{ text: "Remembered: Brazilian nationality" }
```

---

### Phase 3: Supabase Edge Function for Classification

**New Edge Function:** `supabase/functions/classify-insight/index.ts`

```typescript
// POST /functions/v1/classify-insight
// Body: { insight: string }
// Returns: { promote: boolean, category: string, confidence: number, content: string }

// Uses Haiku internally (key stored in Supabase secrets)
```

**Deploy via Supabase MCP:**
```
mcp__supabase__deploy_edge_function(
  project_id: "dvjgxddjmevmmtzqmzrm",
  name: "classify-insight",
  files: [...]
)
```

**Modify:** `auto-promote.ts` to call Edge Function when available

```typescript
async function classifyWithHaiku(insight: string): Promise<PromotionResult> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/classify-insight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ insight }),
  });
  return response.json();
}
```

**Fallback:** If Edge Function fails, use heuristics

---

### Phase 4: Duplicate Prevention

**Use existing:** `packages/mcp-server/src/tools/fuzzy-match.ts`

Before promoting:
1. Load existing identity facts
2. Fuzzy match new content against existing (threshold: 0.7)
3. If match found, skip promotion (already known)

---

### Phase 5: Settings & Control

**Modify:** `packages/core/src/schema/identity-v2.ts`

Add to settings:
```typescript
autoPromote: z.boolean().default(true),  // Enable/disable
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/mcp-server/src/tools/auto-promote.ts` | CREATE | Classification + promotion logic |
| `packages/mcp-server/src/tools/auto-promote.test.ts` | CREATE | Unit tests (TDD) |
| `packages/mcp-server/src/tools/context.ts` | MODIFY | Call auto-promote for insights |
| `packages/core/src/schema/identity-v2.ts` | MODIFY | Add autoPromote setting |
| Supabase Edge Function `classify-insight` | CREATE | Haiku proxy (via MCP) |

---

## Test Cases (TDD)

### Unit Tests (auto-promote.test.ts) - Write First

```
Heuristic classification:
✓ "I'm Brazilian" → { promote: true, category: "context", content: "Brazilian nationality" }
✓ "I prefer TypeScript" → { promote: true, category: "preference" }
✓ "I work at PayNearMe" → { promote: true, category: "core" }
✓ "The weather is nice" → { promote: false }
✓ "User visited supabase.com" → { promote: false } (third person)

Duplicate prevention:
✓ Skip if existing fact matches (fuzzy 0.7+)
✓ Allow if no match found

Fact creation:
✓ Sets confidence: 0.7
✓ Sets maturity: "candidate"
✓ Sets source: "conversation"

Settings:
✓ Respects autoPromote: false
```

### Integration Tests (context.test.ts)

```
✓ Insight event triggers auto-promotion
✓ Non-insight events don't trigger promotion
✓ Response includes "Remembered:" tag when promoted
✓ promotedFact included in structuredContent
```

---

## Success Criteria

1. **Auto-promotion works:** "I'm Brazilian" → appears in identity without explicit accept
2. **Subtle feedback:** Response shows "Remembered: Brazilian nationality"
3. **No duplicates:** Saying same thing twice doesn't create duplicates
4. **Graceful degradation:** Works with heuristics if Edge Function unavailable
5. **Settings respected:** Can disable via `autoPromote: false`
6. **Performance:** <500ms with Haiku, <50ms with heuristics

---

## Estimated Effort

| Phase | Time |
|-------|------|
| Phase 1: Heuristic classifier + tests | 1.5 hr |
| Phase 2: Context integration | 1 hr |
| Phase 3: Edge Function (via Supabase MCP) | 1 hr |
| Phase 4: Duplicate prevention | 30 min |
| Phase 5: Settings | 30 min |
| **Total** | **~5 hours** |

---

## Implementation Checklist

- [x] Write failing tests for heuristic classifier
- [x] Implement `classifyWithHeuristics()` to pass tests
- [x] Write failing tests for auto-promote flow
- [x] Implement `autoPromoteInsight()` to pass tests
- [x] Integrate with `addContextEventHandler`
- [x] Deploy Edge Function via Supabase MCP
- [x] Add `autoPromote` setting to schema
- [x] Set `ANTHROPIC_API_KEY` secret in Supabase (for Haiku)
- [x] Manual test in Claude Desktop

## Completion Notes

**Completed: 2025-12-16**

The auto-promote feature is now live:
- Haiku classification via Edge Function `classify-insight` (v3)
- Handles both first-person ("I prefer X") and third-person ("Prefers X") insights
- Falls back to heuristics if Edge Function unavailable
- New facts appear with `source: "conversation"` and `maturity: "candidate"`

Example auto-promoted fact:
```json
{
  "category": "context",
  "content": "Portuguese citizen planning to relocate to Portugal to start a business",
  "confidence": 0.85,
  "maturity": "candidate",
  "source": "conversation"
}
```
