# Identity Synthesis Plan (v2)

> Created: 2025-12-08
> Status: Planning
> Depends on: [ARETE_V2_ARCHITECTURE.md](./ARETE_V2_ARCHITECTURE.md), [CONTEXT_ROLLUP_PLAN_V2.md](./CONTEXT_ROLLUP_PLAN_V2.md)
> Replaces: [IDENTITY_SYNTHESIS_PLAN_V1.md](../archive/IDENTITY_SYNTHESIS_PLAN_V1.md)

## Goal

Transform identity from **static document** to **living knowledge graph** with confidence-scored facts that decay without validation, mature through confirmation, and project contextually to each AI interaction.

```
v1 (static):
  Identity = { expertise: ["TypeScript", "React"], ... }
  Changes only via manual edit or AI update

v2 (dynamic):
  Identity = IdentityFact[] with confidence, maturity, decay
  Facts proposed → validated → mature → decay → archive
  Projection engine serves task-relevant slice
```

---

## What's New in v2

| v1 | v2 | Why |
|----|-----|-----|
| Direct updates | Facts with confidence | Uncertainty is valuable information |
| Manual validation | Maturity state machine | Trust builds through confirmation |
| Full dump to AI | Task-aware projection | Relevance > completeness |
| Single update tool | Infer + validate + reject tools | Separate proposal from approval |
| Last-write-wins | Confidence decay | Stale facts naturally fade |

---

## Three-Layer Model (Review)

```
CONTEXT (events)     → Raw signals: browsing, conversations, manual input
       ↓ rollup + inference
IDENTITY (facts)     → Structured facts with confidence + maturity
       ↓ projection
AI INTERACTION       → Context-aware slice served to system prompt
```

Identity Synthesis owns the **middle layer**:
- Receiving candidate facts from inference
- Managing the maturity lifecycle
- Serving projections to AI

---

## IdentityFact Schema

```typescript
interface IdentityFact {
  id: string;                           // UUID
  category: "core" | "expertise" | "preference" | "context" | "focus";
  content: string;                      // The actual fact

  // Confidence tracking
  confidence: number;                   // 0.0-1.0, decays over time
  lastValidated: string;                // ISO timestamp of last confirmation
  validationCount: number;              // How many times confirmed
  maturity: "candidate" | "established" | "proven";

  // Provenance
  source: "manual" | "inferred" | "conversation";
  sourceRef?: string;                   // conversation ID, URL, etc.

  // Metadata
  createdAt: string;
  updatedAt: string;
}
```

---

## Confidence Decay

Facts naturally fade if not validated. This prevents identity from becoming stale.

```typescript
const DEFAULT_HALF_LIFE_DAYS = 60;

function getEffectiveConfidence(fact: IdentityFact, halfLifeDays = 60): number {
  const daysSinceValidation = daysSince(fact.lastValidated);
  return fact.confidence * Math.pow(0.5, daysSinceValidation / halfLifeDays);
}

// Example decay curve:
// Day 0:   1.0 × 1.0 = 1.0
// Day 60:  1.0 × 0.5 = 0.5
// Day 120: 1.0 × 0.25 = 0.25
// Day 180: 1.0 × 0.125 = 0.125
```

### Decay Thresholds

| Effective Confidence | Status | Behavior |
|---------------------|--------|----------|
| > 0.7 | High | Always included in projection |
| 0.3 - 0.7 | Medium | Included if relevant to task |
| < 0.3 | Low / Faded | Suggest re-validation or removal |
| < 0.1 | Expired | Auto-archive (don't delete) |

---

## Maturity State Machine

```
           ┌──────────────────────────────────────┐
           │                                      │
           ▼                                      │
      [candidate] ─────validation────▶ [established]
           │                                │
           │ (rejected)                     │ validation
           ▼                                ▼
       (blocked)                        [proven]
                                            │
                                            │ (decay below 0.3)
                                            ▼
                                       (demoted)
```

### Maturity Rules

| Maturity | How to reach | Confidence boost | In projection? |
|----------|--------------|------------------|----------------|
| `candidate` | Inferred from context | +0.0 (starts at 0.5-0.7) | Only if highly relevant |
| `established` | Validated 2+ times OR manual entry | +0.2 per validation | Yes, with task relevance |
| `proven` | Validated 5+ times | +0.1 per validation (cap 1.0) | Always included |

### Transition Logic

```typescript
function validateFact(fact: IdentityFact): IdentityFact {
  const validationCount = (fact.validationCount ?? 0) + 1;

  let maturity = fact.maturity;
  if (validationCount >= 5) maturity = "proven";
  else if (validationCount >= 2) maturity = "established";

  return {
    ...fact,
    confidence: Math.min(1.0, fact.confidence + 0.2),  // Boost on validation
    lastValidated: new Date().toISOString(),
    maturity,
    validationCount,
    updatedAt: new Date().toISOString(),
  };
}

function demoteFact(fact: IdentityFact): IdentityFact {
  // When effective confidence drops below threshold
  let maturity = fact.maturity;
  if (fact.maturity === "proven") maturity = "established";
  else if (fact.maturity === "established") maturity = "candidate";

  return {
    ...fact,
    maturity,
    updatedAt: new Date().toISOString(),
  };
}
```

---

## MCP Tools (v2)

### Existing Tools (Modified)

| Tool | v1 Behavior | v2 Changes |
|------|-------------|------------|
| `arete_get_identity` | Returns flat identity | Returns facts with confidence scores |
| `arete_update_identity` | Direct write | Creates facts with maturity tracking |

### New Tools

```typescript
// 1. Get task-aware projection (THE KILLER FEATURE)
arete_context: {
  task?: string;      // "Help me debug this React component"
  maxFacts?: number;  // Default: 10
  minConfidence?: number;  // Default: 0.3
}
// Returns: Ranked, relevant facts for this specific task

// 2. Validate an existing fact (bump confidence + maturity)
arete_validate_fact: {
  factId: string;     // Or content match
  reasoning: string;  // Why this fact is still accurate
}
// Effect: Increases confidence, advances maturity state

// 3. Extract candidate facts from context (or rollup)
arete_infer: {
  lookbackDays?: number;  // Default: 7
}
// Returns: Proposed facts as candidates (not written yet)
// Source: Recent context + rollup candidate_facts table

// 4. Reject a candidate fact (don't suggest again)
arete_reject_fact: {
  factId: string;
  reason?: string;
}
// Effect: Adds to blocked list, never re-suggest
```

---

## Projection Engine

The key insight: **don't dump everything, project what's relevant**.

```typescript
interface ProjectionRequest {
  task?: string;           // Current task/question
  maxFacts?: number;       // Limit output
  minConfidence?: number;  // Filter threshold
}

interface ProjectionResult {
  facts: Array<{
    content: string;
    category: string;
    confidence: number;
    maturity: string;
    relevanceScore: number;  // 0-1, how relevant to task
  }>;
  totalFacts: number;
  filteredOut: number;
}

async function projectIdentity(req: ProjectionRequest): Promise<ProjectionResult> {
  const allFacts = await loadFacts();

  // 1. Calculate effective confidence (with decay)
  const withDecay = allFacts.map(f => ({
    ...f,
    effectiveConfidence: getEffectiveConfidence(f),
  }));

  // 2. Filter by minimum confidence
  const activeFacts = withDecay.filter(f =>
    f.effectiveConfidence >= (req.minConfidence ?? 0.3)
  );

  // 3. Score relevance to task (if provided)
  const scored = await scoreRelevance(activeFacts, req.task);

  // 4. Sort by relevance × confidence
  scored.sort((a, b) =>
    (b.relevanceScore * b.effectiveConfidence) -
    (a.relevanceScore * a.effectiveConfidence)
  );

  // 5. Take top N
  const projected = scored.slice(0, req.maxFacts ?? 10);

  return {
    facts: projected,
    totalFacts: allFacts.length,
    filteredOut: allFacts.length - projected.length,
  };
}
```

### Relevance Scoring (MVP: Keywords)

```typescript
function scoreRelevance(fact: IdentityFact, task?: string): number {
  if (!task) return 0.5;  // No task = medium relevance for all

  const taskLower = task.toLowerCase();
  const contentLower = fact.content.toLowerCase();

  // Simple keyword overlap
  const taskWords = new Set(taskLower.split(/\s+/));
  const factWords = contentLower.split(/\s+/);

  let matches = 0;
  for (const word of factWords) {
    if (taskWords.has(word)) matches++;
  }

  // Category boost
  let categoryBoost = 0;
  if (task.includes("debug") && fact.category === "expertise") categoryBoost = 0.2;
  if (task.includes("write") && fact.category === "preference") categoryBoost = 0.2;

  return Math.min(1.0, (matches / 3) + categoryBoost);
}
```

---

## Integration with Inference Pipeline

Context Rollup generates candidate facts. Identity Synthesis manages them.

```
┌─────────────────────────────────────────────────────────────┐
│  Context Rollup (CONTEXT_ROLLUP_PLAN_V2)                    │
│  1. Aggregate old events                                    │
│  2. Extract patterns (frequent_domain, topic_cluster)       │
│  3. Generate candidate_facts                                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Identity Synthesis (this plan)                             │
│  1. arete_infer reads candidate_facts                       │
│  2. Claude presents to user for approval                    │
│  3. User validates → fact promoted to established           │
│  4. User rejects → fact blocked (never re-suggest)          │
└─────────────────────────────────────────────────────────────┘
```

### `arete_infer` Implementation

```typescript
async function areteInferHandler(input: { lookbackDays?: number }): Promise<InferResult> {
  const config = loadConfig();

  // Source 1: Cloud candidate_facts table
  if (config.apiKey) {
    const { data: cloudCandidates } = await supabase
      .from('candidate_facts')
      .select('*')
      .eq('status', 'pending')
      .order('confidence', { ascending: false })
      .limit(10);

    if (cloudCandidates?.length) {
      return {
        candidates: cloudCandidates,
        source: 'rollup',
        message: `Found ${cloudCandidates.length} potential updates from your browsing patterns.`,
      };
    }
  }

  // Source 2: Local context analysis (offline fallback)
  const context = await loadLocalContext();
  const recentEvents = context.filter(e =>
    daysSince(e.timestamp) <= (input.lookbackDays ?? 7)
  );

  const localCandidates = analyzeContextForPatterns(recentEvents);

  return {
    candidates: localCandidates,
    source: 'local_context',
    message: localCandidates.length
      ? `Found ${localCandidates.length} potential updates from recent activity.`
      : 'No new patterns detected.',
  };
}
```

---

## Conversational Flow

### Example: Inference + Validation

```
User: What have I been working on lately?

Claude: [calls arete_infer]

I found some patterns in your recent activity:

1. **Supabase** (confidence: 0.7)
   - Source: 47 visits to supabase.com/docs over the past week
   - Proposed: Add to expertise

2. **Edge Functions** (confidence: 0.6)
   - Source: 12 visits to Deno Deploy and Supabase edge-functions docs
   - Proposed: Add to expertise

3. **MCP Protocol** (confidence: 0.5)
   - Source: 8 visits to modelcontextprotocol.io
   - Proposed: Add to expertise

Would you like me to add any of these to your identity?

User: Yes to Supabase and Edge Functions. I'm just reading about MCP, not really an expert.

Claude: [calls arete_validate_fact for Supabase]
[calls arete_validate_fact for Edge Functions]
[calls arete_reject_fact for MCP Protocol]

Done! I've added Supabase and Edge Functions to your expertise.
MCP Protocol won't be suggested again.
```

### Example: Task-Aware Projection

```
User: Help me debug this React hook

Claude: [calls arete_context with task="debug React hook"]

Based on your expertise in React and TypeScript, and your preference
for concise explanations, let me help you debug this.

[Claude uses the projected facts to personalize response]
```

---

## Storage

### Local Files

```
~/.arete/
├── identity.json      # IdentityV2 with facts array
├── blocked.json       # Rejected inferences (don't re-suggest)
├── archive/           # Expired facts (confidence < 0.1)
│   └── facts-2025-01.json
└── config.json        # Settings, decay rates
```

### Cloud Tables

```sql
-- Main identity facts (synced from local)
identities.data.facts[]  -- JSONB array of IdentityFact

-- Candidate facts (from rollup)
candidate_facts          -- See CONTEXT_ROLLUP_PLAN_V2

-- Blocked inferences
blocked_inferences       -- Facts user rejected
```

---

## Implementation Phases

### Phase 1: Schema + Migration (2-3 hours)
- [ ] Define `IdentityFact` interface in schema
- [ ] Define `IdentityV2` interface
- [ ] Write `migrateV1ToV2()` function
- [ ] Update file read/write to handle both versions
- [ ] Tests for migration (v1 → v2 preserves all data)

### Phase 2: Confidence Decay (1-2 hours)
- [ ] Implement `getEffectiveConfidence()` function
- [ ] Implement `daysSince()` helper
- [ ] Add decay calculation to fact retrieval
- [ ] CLI command: `arete identity list --show-confidence`
- [ ] Tests for decay math

### Phase 3: Maturity Tracking (1-2 hours)
- [ ] Implement `validateFact()` transitions
- [ ] Implement `demoteFact()` for low confidence
- [ ] Update `arete_update_identity` to create facts with maturity
- [ ] Add `arete_validate_fact` tool
- [ ] Tests for maturity state machine

### Phase 4: Projection Engine (2-3 hours)
- [ ] Implement `projectIdentity()` function
- [ ] Implement `scoreRelevance()` (keyword matching)
- [ ] Add `arete_context` tool
- [ ] Test with various task queries
- [ ] Compare projection vs full dump

### Phase 5: Inference Integration (2-3 hours)
- [ ] Implement `arete_infer` tool
- [ ] Connect to `candidate_facts` table (cloud)
- [ ] Implement local context analysis (offline)
- [ ] Add `arete_reject_fact` tool
- [ ] Create `blocked.json` storage
- [ ] Tests for inference pipeline

### Phase 6: Archive + Cleanup (1 hour)
- [ ] Implement fact archival (confidence < 0.1)
- [ ] Create `~/.arete/archive/` structure
- [ ] Periodic cleanup function
- [ ] CLI command: `arete identity archive`

**Total: ~10-14 hours**

---

## Test Plan

### Unit Tests

```typescript
describe("Confidence Decay", () => {
  it("returns full confidence for recently validated fact", () => {
    const fact = { confidence: 1.0, lastValidated: new Date().toISOString() };
    expect(getEffectiveConfidence(fact)).toBeCloseTo(1.0);
  });

  it("halves confidence after half-life period", () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const fact = { confidence: 1.0, lastValidated: sixtyDaysAgo.toISOString() };
    expect(getEffectiveConfidence(fact)).toBeCloseTo(0.5);
  });

  it("quarters confidence after two half-life periods", () => {
    const oneHundredTwentyDaysAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const fact = { confidence: 1.0, lastValidated: oneHundredTwentyDaysAgo.toISOString() };
    expect(getEffectiveConfidence(fact)).toBeCloseTo(0.25);
  });
});

describe("Maturity State Machine", () => {
  it("candidate → established after 2 validations", () => {
    let fact = createCandidateFact("TypeScript");
    fact = validateFact(fact);
    expect(fact.maturity).toBe("candidate");
    fact = validateFact(fact);
    expect(fact.maturity).toBe("established");
  });

  it("established → proven after 5 validations", () => {
    let fact = createCandidateFact("TypeScript");
    for (let i = 0; i < 5; i++) {
      fact = validateFact(fact);
    }
    expect(fact.maturity).toBe("proven");
  });

  it("validation boosts confidence by 0.2", () => {
    const fact = { ...createCandidateFact("TypeScript"), confidence: 0.5 };
    const validated = validateFact(fact);
    expect(validated.confidence).toBe(0.7);
  });

  it("confidence caps at 1.0", () => {
    const fact = { ...createCandidateFact("TypeScript"), confidence: 0.9 };
    const validated = validateFact(fact);
    expect(validated.confidence).toBe(1.0);
  });
});

describe("Projection Engine", () => {
  it("filters out low confidence facts", async () => {
    const facts = [
      { content: "TypeScript", confidence: 0.8, lastValidated: now() },
      { content: "COBOL", confidence: 0.1, lastValidated: longAgo() },
    ];
    const result = await projectIdentity({ minConfidence: 0.3 });
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].content).toBe("TypeScript");
  });

  it("ranks by relevance × confidence", async () => {
    // TypeScript (high confidence, relevant to task)
    // React (medium confidence, relevant to task)
    // Cooking (high confidence, not relevant)
    const result = await projectIdentity({ task: "debug React component" });
    expect(result.facts[0].content).toContain("React");
  });

  it("respects maxFacts limit", async () => {
    const result = await projectIdentity({ maxFacts: 3 });
    expect(result.facts.length).toBeLessThanOrEqual(3);
  });
});

describe("arete_infer tool", () => {
  it("returns candidates from rollup", async () => {
    // Mock cloud candidates
    const result = await areteInferHandler({});
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.source).toBe("rollup");
  });

  it("falls back to local analysis when offline", async () => {
    // No cloud config
    const result = await areteInferHandler({});
    expect(result.source).toBe("local_context");
  });
});

describe("arete_reject_fact tool", () => {
  it("adds fact to blocked list", async () => {
    await areteRejectFactHandler({ factId: "123", reason: "Not accurate" });
    const blocked = loadBlocked();
    expect(blocked).toContainEqual(expect.objectContaining({ factId: "123" }));
  });

  it("blocked facts are not re-suggested", async () => {
    await areteRejectFactHandler({ factId: "123" });
    const candidates = await areteInferHandler({});
    expect(candidates.candidates.map(c => c.id)).not.toContain("123");
  });
});
```

### Integration Tests (Manual)

1. **Inference flow**
   - Browse several tech sites
   - Run `arete_infer` in Claude Desktop
   - Verify candidates match browsing patterns
   - Approve some, reject others
   - Verify facts updated correctly

2. **Projection accuracy**
   - Add diverse facts (tech, hobbies, preferences)
   - Ask Claude task-specific questions
   - Verify projected facts are relevant

3. **Decay behavior**
   - Create facts with old lastValidated dates
   - Verify they show lower effective confidence
   - Verify they're filtered from projections

---

## Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Decay half-life | 60 days | Shorter than CASS (90 days) - identity changes faster |
| Min validations for established | 2 | Low barrier to graduate from candidate |
| Min validations for proven | 5 | High bar for permanent trust |
| Projection default limit | 10 facts | Balance between context and token cost |
| Relevance scoring | Keywords (MVP) | Simple, fast. Embeddings later if needed |
| Archive threshold | 0.1 confidence | Don't delete, just hide |

---

## Success Criteria

1. **Confidence decay works**: Untouched facts fade over time
2. **Maturity promotes correctly**: candidate → established → proven
3. **Projection is relevant**: `arete_context` returns task-appropriate facts
4. **Inference connects to rollup**: Candidate facts flow from context patterns
5. **Rejection is permanent**: Blocked facts never re-suggested
6. **Migration is seamless**: v1 users upgrade without data loss

---

## Relationship to Other Plans

```
CONTEXT_ROLLUP_PLAN_V2          IDENTITY_SYNTHESIS_PLAN_V2
┌─────────────────────┐         ┌─────────────────────┐
│ Raw events          │         │ Facts with          │
│       ↓             │         │ confidence + maturity│
│ Aggregation         │         │       ↓             │
│       ↓             │         │ Validation cycle    │
│ Pattern extraction  │─────────│       ↓             │
│       ↓             │ feeds   │ Projection engine   │
│ Candidate facts     │─────────│       ↓             │
└─────────────────────┘         │ AI interactions     │
                                └─────────────────────┘
```

Context Rollup handles **storage management** and **pattern extraction**.
Identity Synthesis handles **knowledge lifecycle** and **AI projection**.

They meet at `candidate_facts` - rollup creates them, synthesis validates them.
