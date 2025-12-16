# Cross-Type Inference Plan

> Created: 2025-12-09
> Status: ✅ Complete
> Completed: 2025-12-09
> Depends on: Identity Synthesis v2 (complete)
> Approach: Option C - Single Haiku pass for extraction + correlation

## Problem Statement

`arete_infer` currently only analyzes `page_visit` events by counting domain visits. This misses:

1. **Insights** - Claude's observations stored via `arete_add_context_event`
2. **Conversations** - Topics discussed across Claude sessions
3. **Files** - Code being written (indicates technical focus)
4. **Selections** - Text user highlighted (indicates interest)

More critically, it can't correlate signals across types:

```
Ro.com visits + "supplements" conversation + WHOOP API code
                    ↓
         "health/fitness focused" (candidate fact)
```

## Goal

Enhance `arete_infer` to:

1. Analyze ALL context event types, not just `page_visit`
2. Use Haiku to find correlations across types
3. Propose candidate facts based on signal patterns
4. Suggest reinforcing/downgrading existing identity facts

## Key Design Decision: Context Aggregator Role

The Context Aggregator is **formatting, not intelligence**:

```
Raw context.json (47 events, ~5K tokens)
         │
         ▼ Context Aggregator (dumb formatting)
         │
Structured summary (~500 tokens)
         │
         ▼ Haiku (ALL the intelligence)
         │
Candidate facts + reinforce/downgrade suggestions
```

- **Not** a pre-filter
- **Not** doing pattern detection
- **Just** formatting/compression for the prompt
- Token efficiency: 10x reduction, same information density

Haiku sees everything, just structured. All pattern recognition happens in a single Haiku pass.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Context Events (all types)                              │
│  ├── page_visit: [Ro, WHOOP docs, Supabase]             │
│  ├── insight: ["health optimization discussions"]        │
│  ├── conversation: ["supplements", "fitness tracking"]   │
│  ├── file: ["whoop-api.ts", "health-dashboard.tsx"]     │
│  └── selection: ["protein synthesis", "HRV metrics"]     │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Context Aggregator                                      │
│  - Groups events by topic/theme                          │
│  - Extracts keywords and patterns                        │
│  - Builds structured summary for Haiku                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Haiku Analysis                                          │
│  Input:                                                  │
│    - Aggregated context (all types)                      │
│    - Existing identity facts                             │
│    - Blocked facts (don't re-suggest)                    │
│  Output:                                                 │
│    - New candidate facts with reasoning                  │
│    - Reinforcement suggestions                           │
│    - Downgrade suggestions                               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Response Builder                                        │
│  - Format for conversational presentation                │
│  - Include guidance for Claude Desktop                   │
└─────────────────────────────────────────────────────────┘
```

## Haiku Prompt Design

```xml
<task>
Analyze the user's recent activity across all context types to identify
patterns that reveal expertise, interests, or focus areas.
</task>

<existing_identity>
{existing facts with confidence and maturity}
</existing_identity>

<blocked_facts>
{facts user has rejected - don't re-suggest}
</blocked_facts>

<recent_context>
<page_visits>
{domains with visit counts and page titles}
</page_visits>

<insights>
{insights recorded by Claude instances}
</insights>

<conversations>
{topics and summaries from conversations}
</conversations>

<files>
{files worked on - indicates technical focus}
</files>

<selections>
{text selections - indicates reading interest}
</selections>
</recent_context>

<instructions>
1. Look for PATTERNS across context types, not isolated signals
2. A single Ro.com visit is noise; Ro + health conversations + fitness code = pattern
3. For each candidate fact, cite the supporting signals
4. Consider reinforcing existing facts if activity supports them
5. Consider downgrading existing facts if no recent activity supports them
6. Don't suggest facts that are already in identity or blocked list
</instructions>

<output_format>
Return JSON:
{
  "candidates": [
    {
      "content": "health and fitness optimization",
      "category": "interest",
      "confidence": 0.7,
      "signals": ["3 Ro visits", "2 health conversations", "WHOOP API code"],
      "reasoning": "Multiple signals across browsing, conversations, and code"
    }
  ],
  "reinforce": [
    {
      "factId": "existing-fact-id",
      "reason": "Recent activity supports this"
    }
  ],
  "downgrade": [
    {
      "factId": "stale-fact-id",
      "reason": "No recent activity related to this"
    }
  ]
}
</output_format>
```

## Implementation Phases

### Phase 1: Context Aggregator (TDD)

**Tests first:**

```typescript
describe("Context Aggregator", () => {
  it("groups page_visit events by domain", () => {
    const events = [
      { type: "page_visit", data: { url: "https://ro.com/..." } },
      { type: "page_visit", data: { url: "https://ro.com/..." } },
    ];
    const result = aggregateContext(events);
    expect(result.pageVisits).toContainEqual({ domain: "ro.com", count: 2 });
  });

  it("extracts insights from insight events", () => {
    const events = [
      { type: "insight", data: { insight: "User interested in health" } },
    ];
    const result = aggregateContext(events);
    expect(result.insights).toContain("User interested in health");
  });

  it("extracts conversation topics", () => {
    const events = [
      { type: "conversation", data: { summary: "Discussed supplements" } },
    ];
    const result = aggregateContext(events);
    expect(result.conversations).toContain("Discussed supplements");
  });

  it("extracts file paths and infers tech focus", () => {
    const events = [
      { type: "file", data: { path: "whoop-api.ts" } },
    ];
    const result = aggregateContext(events);
    expect(result.files).toContain("whoop-api.ts");
  });

  it("extracts selection text", () => {
    const events = [
      { type: "selection", data: { text: "HRV metrics" } },
    ];
    const result = aggregateContext(events);
    expect(result.selections).toContain("HRV metrics");
  });

  it("handles mixed event types", () => {
    const events = [
      { type: "page_visit", data: { url: "https://ro.com" } },
      { type: "insight", data: { insight: "health focus" } },
      { type: "file", data: { path: "health.ts" } },
    ];
    const result = aggregateContext(events);
    expect(result.pageVisits.length).toBe(1);
    expect(result.insights.length).toBe(1);
    expect(result.files.length).toBe(1);
  });
});
```

**Implementation:**

```typescript
interface AggregatedContext {
  pageVisits: Array<{ domain: string; count: number; titles: string[] }>;
  insights: string[];
  conversations: string[];
  files: string[];
  selections: string[];
}

function aggregateContext(events: ContextEvent[]): AggregatedContext {
  // Implementation
}
```

### Phase 2: Haiku Prompt Builder (TDD)

**Tests first:**

```typescript
describe("Haiku Prompt Builder", () => {
  it("includes existing identity facts", () => {
    const prompt = buildInferencePrompt({
      context: mockContext,
      existingFacts: [{ content: "TypeScript", category: "expertise" }],
      blockedFacts: [],
    });
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("expertise");
  });

  it("includes blocked facts to avoid re-suggesting", () => {
    const prompt = buildInferencePrompt({
      context: mockContext,
      existingFacts: [],
      blockedFacts: [{ content: "COBOL" }],
    });
    expect(prompt).toContain("COBOL");
  });

  it("formats page visits with counts", () => {
    const prompt = buildInferencePrompt({
      context: {
        pageVisits: [{ domain: "ro.com", count: 5, titles: ["Ro Health"] }],
        insights: [],
        conversations: [],
        files: [],
        selections: [],
      },
      existingFacts: [],
      blockedFacts: [],
    });
    expect(prompt).toContain("ro.com");
    expect(prompt).toContain("5");
  });

  it("includes all context types in structured format", () => {
    const prompt = buildInferencePrompt({
      context: {
        pageVisits: [{ domain: "ro.com", count: 1, titles: [] }],
        insights: ["health focus"],
        conversations: ["supplements discussion"],
        files: ["whoop.ts"],
        selections: ["HRV"],
      },
      existingFacts: [],
      blockedFacts: [],
    });
    expect(prompt).toContain("<page_visits>");
    expect(prompt).toContain("<insights>");
    expect(prompt).toContain("<conversations>");
    expect(prompt).toContain("<files>");
    expect(prompt).toContain("<selections>");
  });
});
```

**Implementation:**

```typescript
interface InferencePromptInput {
  context: AggregatedContext;
  existingFacts: IdentityFact[];
  blockedFacts: BlockedFact[];
}

function buildInferencePrompt(input: InferencePromptInput): string {
  // Build XML-structured prompt for Haiku
}
```

### Phase 3: Response Parser (TDD)

**Tests first:**

```typescript
describe("Inference Response Parser", () => {
  it("parses candidate facts from JSON response", () => {
    const response = JSON.stringify({
      candidates: [
        { content: "health focus", category: "interest", confidence: 0.7, signals: ["ro.com"] }
      ],
      reinforce: [],
      downgrade: [],
    });
    const result = parseInferenceResponse(response);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].content).toBe("health focus");
  });

  it("parses reinforcement suggestions", () => {
    const response = JSON.stringify({
      candidates: [],
      reinforce: [{ factId: "123", reason: "Recent activity" }],
      downgrade: [],
    });
    const result = parseInferenceResponse(response);
    expect(result.reinforce).toHaveLength(1);
  });

  it("parses downgrade suggestions", () => {
    const response = JSON.stringify({
      candidates: [],
      reinforce: [],
      downgrade: [{ factId: "456", reason: "No activity" }],
    });
    const result = parseInferenceResponse(response);
    expect(result.downgrade).toHaveLength(1);
  });

  it("handles malformed JSON gracefully", () => {
    const response = "not json";
    const result = parseInferenceResponse(response);
    expect(result.candidates).toHaveLength(0);
    expect(result.error).toBeDefined();
  });

  it("filters out candidates that match existing facts", () => {
    const response = JSON.stringify({
      candidates: [
        { content: "TypeScript", category: "expertise", confidence: 0.8 }
      ],
      reinforce: [],
      downgrade: [],
    });
    const existing = [{ content: "TypeScript", category: "expertise" }];
    const result = parseInferenceResponse(response, existing);
    expect(result.candidates).toHaveLength(0);
  });
});
```

**Implementation:**

```typescript
interface InferenceResult {
  candidates: CandidateFact[];
  reinforce: Array<{ factId: string; reason: string }>;
  downgrade: Array<{ factId: string; reason: string }>;
  error?: string;
}

function parseInferenceResponse(
  response: string,
  existingFacts?: IdentityFact[]
): InferenceResult {
  // Parse and validate JSON response
}
```

### Phase 4: Integration (TDD)

**Tests first:**

```typescript
describe("Enhanced arete_infer", () => {
  it("uses Haiku when API key is available", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    // Mock Haiku response
    const result = await inferHandler({ lookbackDays: 7 });
    expect(result.structuredContent.source).toBe("haiku_analysis");
  });

  it("falls back to domain-only analysis without API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await inferHandler({ lookbackDays: 7 });
    expect(result.structuredContent.source).toBe("local_context");
  });

  it("includes reinforce suggestions in output", async () => {
    // Setup existing fact + activity that supports it
    const result = await inferHandler({ lookbackDays: 7 });
    expect(result.structuredContent.reinforce).toBeDefined();
  });

  it("includes downgrade suggestions in output", async () => {
    // Setup existing fact + no supporting activity
    const result = await inferHandler({ lookbackDays: 7 });
    expect(result.structuredContent.downgrade).toBeDefined();
  });

  it("respects blocked facts", async () => {
    // Setup blocked fact + activity that would suggest it
    const result = await inferHandler({ lookbackDays: 7 });
    const contents = result.structuredContent.candidates.map(c => c.content);
    expect(contents).not.toContain("blocked-fact-content");
  });
});
```

### Phase 5: Bug Fix - Stringified JSON in Facts

**Tests first:**

```typescript
describe("arete_update_identity value handling", () => {
  it("unwraps single-element arrays to string", async () => {
    const result = await updateIdentityHandler({
      section: "currentFocus",
      operation: "add",
      value: ["My vision statement"],
      reasoning: "test",
    });
    // Check the stored fact content is a string, not "[\"My vision statement\"]"
    const identity = loadIdentity();
    const focusFacts = identity.facts.filter(f => f.category === "focus");
    expect(focusFacts[0].content).toBe("My vision statement");
    expect(focusFacts[0].content).not.toContain("[");
  });

  it("joins multi-element arrays with semicolons", async () => {
    const result = await updateIdentityHandler({
      section: "currentFocus",
      operation: "add",
      value: ["Point one", "Point two"],
      reasoning: "test",
    });
    const identity = loadIdentity();
    const focusFacts = identity.facts.filter(f => f.category === "focus");
    expect(focusFacts[0].content).toBe("Point one; Point two");
  });

  it("handles string values directly", async () => {
    const result = await updateIdentityHandler({
      section: "currentFocus",
      operation: "add",
      value: "Simple string",
      reasoning: "test",
    });
    const identity = loadIdentity();
    const focusFacts = identity.facts.filter(f => f.category === "focus");
    expect(focusFacts[0].content).toBe("Simple string");
  });
});
```

## Success Criteria

1. **Cross-type correlation works** - Ro visits + health conversations = health interest
2. **Existing facts reinforced** - Activity matching existing facts suggests validation
3. **Stale facts identified** - Lack of activity suggests downgrade
4. **Graceful fallback** - Works without API key (domain-only mode)
5. **Bug fixed** - Array values stored as clean strings, not stringified JSON
6. **Tests pass** - All new tests green before merge

## Estimated vs Actual

| Phase | Est. Effort | Est. Tests | Actual Tests |
|-------|-------------|------------|--------------|
| Context Aggregator | 1 hour | ~6 | 24 |
| Prompt Builder | 1 hour | ~5 | 16 |
| Response Parser | 1 hour | ~5 | 19 |
| Integration | 2 hours | ~5 | 30 |
| Bug Fix | 30 min | ~3 | 26 (5 new) |
| **Total** | **~5.5 hours** | **~24** | **186** |

## Out of Scope

- Automatic reinforcement/downgrade (user must approve via validate/reject tools)
- Cloud `candidate_facts` table integration (deferred to Context Rollup plan)
- UI changes (this is MCP server only)

## Questions to Resolve

1. **Conversation events** - What data structure should we expect? `{ summary: string }` or `{ messages: [...] }`?
2. **File events** - Do we have these yet? What's the schema?
3. **Selection events** - Are these being captured by the extension?

**Resolution**: Handle whatever data shapes exist gracefully. Extract what's available, skip what's missing.

---

## Outcome

**Goal**: `arete_infer` correlates signals across ALL context types to propose intelligent identity updates.

**Success looks like**:
```
User activity:
- 5 visits to ro.com
- Claude conversation about supplements
- Working on whoop-api.ts

arete_infer returns:
- Candidate: "health/fitness optimization" (confidence: 0.7)
  - Signals: ro.com visits, health conversation, WHOOP code
- Reinforce: existing "TypeScript" fact (recent .ts file activity)
- No downgrades (all existing facts have supporting activity)
```

**Measurable criteria**:
1. Cross-type correlation works (multiple signal types → single candidate)
2. Reinforce/downgrade suggestions generated
3. Graceful fallback without API key
4. Stringified JSON bug fixed
5. All 24+ tests pass

---

## Implementation Notes

### Category Schema Deviation

The plan originally used `"interest"` as a category, but the actual `FactCategory` schema in `@arete/core` only supports:
- `"core"` - Name, role, background
- `"expertise"` - Skills, technologies, domains
- `"preference"` - Communication style, format preferences
- `"context"` - Personal/professional context
- `"focus"` - Current projects, goals

**Resolution**: Mapped `"interest"` → `"focus"` since it best captures "current projects/hobbies/topics of interest".

### Files Created/Modified

**New files:**
- `packages/mcp-server/src/tools/context-aggregator.ts` - Aggregates events by type
- `packages/mcp-server/src/tools/context-aggregator.test.ts` - 24 tests
- `packages/mcp-server/src/tools/inference-prompt.ts` - Builds Haiku prompt
- `packages/mcp-server/src/tools/inference-prompt.test.ts` - 16 tests
- `packages/mcp-server/src/tools/inference-response.ts` - Parses Haiku response
- `packages/mcp-server/src/tools/inference-response.test.ts` - 19 tests

**Modified files:**
- `packages/mcp-server/src/tools/identity-infer.ts` - Added `performCrossTypeInference`, updated `InferOutput`
- `packages/mcp-server/src/tools/identity-infer.test.ts` - Added 8 cross-type inference tests
- `packages/mcp-server/src/tools/identity-update.ts` - Added `normalizeValueToString`
- `packages/mcp-server/src/tools/identity-update.test.ts` - Added 5 array handling tests

### All Success Criteria Met ✅

1. ✅ Cross-type correlation works - Haiku analyzes page_visit + insight + conversation + file + selection
2. ✅ Existing facts reinforced - `reinforce` array in output with factId + reason
3. ✅ Stale facts identified - `downgrade` array in output with factId + reason
4. ✅ Graceful fallback - Returns `source: "local_context"` without API key
5. ✅ Bug fixed - `normalizeValueToString` handles arrays cleanly
6. ✅ Tests pass - 186 tests passing (far exceeds ~24 estimated)
