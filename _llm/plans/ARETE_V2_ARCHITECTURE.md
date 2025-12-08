# Arete v2 Architecture

> Created: 2025-12-08
> Status: Design
> Inspiration: [CASS Memory System](https://github.com/Dicklesworthstone/cass_memory_system)

## Core Thesis

Arete is **portable AI identity**, not coding memory. Simpler scope than CASS, but steal their best patterns: confidence decay, maturity levels, and task-aware projection.

---

## Three-Layer Model

```
CONTEXT (events)     → Raw signals: browsing, conversations, manual input
       ↓
IDENTITY (facts)     → Structured facts with confidence + maturity
       ↓
PROJECTION           → Context-aware slice served to AI interactions
```

### Layer Responsibilities

| Layer | What it stores | How it changes | Who sees it |
|-------|---------------|----------------|-------------|
| **Context** | Raw events (page visits, conversations) | Append-only, auto-rollup after 30 days | AI reads patterns |
| **Identity** | Structured facts about user | AI proposes, user approves | AI reads, projects |
| **Projection** | Task-relevant slice | Generated on-demand | AI uses in system prompt |

---

## Identity Fact Schema (v2)

```typescript
interface IdentityFact {
  id: string;                           // UUID
  category: "core" | "expertise" | "preference" | "context" | "focus";
  content: string;                      // The actual fact

  // Confidence tracking (from CASS)
  confidence: number;                   // 0.0-1.0, decays over time
  lastValidated: string;                // ISO timestamp of last confirmation
  maturity: "candidate" | "established" | "proven";

  // Provenance
  source: "manual" | "inferred" | "conversation";
  sourceRef?: string;                   // conversation ID, URL, etc.

  // Metadata
  createdAt: string;
  updatedAt: string;
}

interface IdentityV2 {
  version: "2.0.0";
  userId?: string;                      // For cloud sync
  deviceId: string;

  facts: IdentityFact[];

  // Protected fields (not facts, just metadata)
  core: {
    name?: string;
    role?: string;
  };

  // Settings
  settings: {
    decayHalfLifeDays: number;          // Default: 60
    autoInfer: boolean;                 // Auto-extract candidates from context
    excludedDomains: string[];          // Privacy: don't learn from these
  };
}
```

---

## Confidence Decay

Facts naturally fade if not validated. This prevents stale identity.

```typescript
const DEFAULT_HALF_LIFE_DAYS = 60;  // Shorter than CASS (90 days)

function getEffectiveConfidence(fact: IdentityFact, halfLifeDays = 60): number {
  const daysSinceValidation = daysSince(fact.lastValidated);
  return fact.confidence * Math.pow(0.5, daysSinceValidation / halfLifeDays);
}

// Example:
// Fact validated today:     confidence * 1.0
// Fact validated 60 days ago: confidence * 0.5
// Fact validated 120 days ago: confidence * 0.25
```

### Decay Thresholds

| Effective Confidence | Display | Behavior |
|---------------------|---------|----------|
| > 0.7 | High confidence | Always included in projection |
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
           │ (ignored/rejected)             │ validation
           ▼                                ▼
       (deleted)                        [proven]
                                            │
                                            │ (decay below 0.3)
                                            ▼
                                       (demoted)
```

### Maturity Rules

| Maturity | How to reach | Trust level | In projection? |
|----------|--------------|-------------|----------------|
| `candidate` | Inferred from context | Low | Only if highly relevant |
| `established` | Validated 2+ times OR manual entry | Medium | Yes, with task relevance |
| `proven` | Validated 5+ times | High | Always included |

### Transitions

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
  };
}
```

---

## MCP Tools (v2)

### Existing (Modified)

| Tool | v1 Behavior | v2 Changes |
|------|-------------|------------|
| `arete_get_identity` | Returns flat identity | Returns facts with confidence scores |
| `arete_update_identity` | Direct write | Creates/updates facts with maturity tracking |
| `arete_get_recent_context` | Returns raw events | No change |
| `arete_add_context_event` | Stores event | No change |

### New Tools

```typescript
// Validate an existing fact (bump confidence + lastValidated)
arete_validate_fact: {
  factId: string;
  reasoning: string;  // Why this fact is still accurate
}

// Get task-aware projection (THE KILLER FEATURE)
arete_context: {
  task?: string;      // "Help me debug this React component"
  maxFacts?: number;  // Default: 10
}
// Returns: Ranked, relevant facts for this specific task

// Extract candidate facts from recent context
arete_infer: {
  lookbackDays?: number;  // Default: 7
}
// Returns: Proposed facts as candidates (not written yet)

// Reject a candidate fact (don't suggest again)
arete_reject_fact: {
  factId: string;
  reason?: string;
}
```

---

## Projection Engine

The key insight from CASS: don't dump everything, project what's relevant.

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
    relevanceScore: number;  // 0-1, how relevant to task
  }>;
  totalFacts: number;
  filteredOut: number;
}

async function projectIdentity(req: ProjectionRequest): Promise<ProjectionResult> {
  const allFacts = await loadFacts();

  // 1. Filter by effective confidence
  const activeFacts = allFacts.filter(f =>
    getEffectiveConfidence(f) >= (req.minConfidence ?? 0.3)
  );

  // 2. Score relevance to task (if provided)
  const scored = await scoreRelevance(activeFacts, req.task);

  // 3. Sort by relevance * confidence
  scored.sort((a, b) =>
    (b.relevanceScore * b.confidence) - (a.relevanceScore * a.confidence)
  );

  // 4. Take top N
  const projected = scored.slice(0, req.maxFacts ?? 10);

  return {
    facts: projected,
    totalFacts: allFacts.length,
    filteredOut: allFacts.length - projected.length,
  };
}
```

### Relevance Scoring

For MVP, use keyword matching. Later, use embeddings.

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

  return Math.min(1.0, matches / 3);  // Cap at 1.0
}
```

---

## Context → Identity Pipeline

```
Browser events (page visits, time-on-page)
              ↓
       Accumulate in context_events
              ↓
       Periodic inference (arete_infer)
              ↓
       Candidate facts proposed
              ↓
       User confirms → established fact
       User ignores  → decays away
       User rejects  → blocked (never suggest again)
```

### Inference Example

```typescript
// arete_infer looks at recent context and proposes facts

// Input: Last 7 days of page visits
[
  { url: "supabase.com/docs/auth", count: 12 },
  { url: "supabase.com/docs/realtime", count: 8 },
  { url: "react.dev/hooks", count: 15 },
]

// Output: Candidate facts
[
  {
    id: "candidate-1",
    category: "expertise",
    content: "Learning Supabase (auth, realtime)",
    confidence: 0.6,
    maturity: "candidate",
    source: "inferred",
    sourceRef: "browsing:supabase.com:20",
  },
  {
    id: "candidate-2",
    category: "expertise",
    content: "Active React development",
    confidence: 0.7,
    maturity: "candidate",
    source: "inferred",
    sourceRef: "browsing:react.dev:15",
  }
]
```

---

## Secret Sanitization

Before storing any context event, sanitize sensitive data:

```typescript
const SANITIZE_PATTERNS = [
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, replace: "[BEARER_TOKEN]" },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, replace: "[GITHUB_PAT]" },
  { pattern: /sk-[A-Za-z0-9]{48}/g, replace: "[OPENAI_KEY]" },
  { pattern: /sk_live_[A-Za-z0-9]+/g, replace: "[STRIPE_KEY]" },
  { pattern: /password[=:]\s*\S+/gi, replace: "[PASSWORD]" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replace: "[EMAIL]" },
];

function sanitize(text: string): string {
  let result = text;
  for (const { pattern, replace } of SANITIZE_PATTERNS) {
    result = result.replace(pattern, replace);
  }
  return result;
}
```

---

## File Structure

```
~/.arete/
├── identity.json      # IdentityV2 with facts array
├── context.json       # ContextEvent[] (ring buffer, max 1000)
├── blocked.json       # Rejected inferences (don't re-suggest)
├── archive/           # Expired facts (confidence < 0.1)
│   └── facts-2025-01.json
└── config.json        # Settings, decay rates, excluded domains
```

---

## Migration Path (v1 → v2)

```typescript
function migrateV1ToV2(v1: AreteIdentity): IdentityV2 {
  const facts: IdentityFact[] = [];
  const now = new Date().toISOString();

  // Migrate expertise array → individual facts
  for (const skill of v1.expertise ?? []) {
    facts.push({
      id: crypto.randomUUID(),
      category: "expertise",
      content: skill,
      confidence: 1.0,           // Manual = high confidence
      lastValidated: now,
      maturity: "proven",        // Existing = proven
      source: "manual",
      createdAt: v1.meta.lastModified,
      updatedAt: now,
    });
  }

  // Migrate currentFocus.projects → focus facts
  for (const project of v1.currentFocus?.projects ?? []) {
    facts.push({
      id: crypto.randomUUID(),
      category: "focus",
      content: typeof project === "string" ? project : project.name,
      confidence: 1.0,
      lastValidated: now,
      maturity: "established",
      source: "manual",
      createdAt: v1.meta.lastModified,
      updatedAt: now,
    });
  }

  // Migrate communication preferences
  for (const style of v1.communication?.style ?? []) {
    facts.push({
      id: crypto.randomUUID(),
      category: "preference",
      content: `Communication style: ${style}`,
      confidence: 1.0,
      lastValidated: now,
      maturity: "proven",
      source: "manual",
      createdAt: v1.meta.lastModified,
      updatedAt: now,
    });
  }

  return {
    version: "2.0.0",
    userId: undefined,  // Set on cloud sync
    deviceId: v1.meta.deviceId,
    facts,
    core: v1.core,
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: false,
      excludedDomains: [],
    },
  };
}
```

---

## What to Skip (vs CASS)

| CASS Feature | Skip? | Rationale |
|--------------|-------|-----------|
| Dual storage (SQLite + Tantivy) | Yes | Overkill for <1000 facts |
| Edge n-gram indexing | Yes | No full-text search needed |
| Rust implementation | Yes | Node/Bun is fine for this scale |
| Anti-pattern inversion | Yes | Identity facts aren't "harmful" |
| MCP HTTP server mode | Maybe | stdio is simpler for hackathon |
| Playbook YAML config | Yes | JSON is fine |
| Embedding-based search | Later | Start with keyword matching |

---

## Implementation Phases

### Phase 1: Schema + Migration (2-3 hours)
- [ ] Define `IdentityFact` and `IdentityV2` types
- [ ] Write migration function
- [ ] Update file read/write to handle both versions
- [ ] Tests for migration

### Phase 2: Confidence Decay (1-2 hours)
- [ ] Implement `getEffectiveConfidence()`
- [ ] Add decay calculation to fact retrieval
- [ ] CLI command to show facts with confidence

### Phase 3: Maturity Tracking (1-2 hours)
- [ ] Implement `validateFact()` transitions
- [ ] Update `arete_update_identity` to track maturity
- [ ] Add `arete_validate_fact` tool

### Phase 4: Projection Engine (2-3 hours)
- [ ] Implement `projectIdentity()` with relevance scoring
- [ ] Add `arete_context` tool
- [ ] Test with various task queries

### Phase 5: Inference Pipeline (3-4 hours)
- [ ] Implement `arete_infer` tool
- [ ] Add `blocked.json` for rejected candidates
- [ ] Integration with context rollup

**Total: ~10-14 hours**

---

## Success Metrics

1. **Confidence decay works**: Untouched facts fade, validated facts stay strong
2. **Maturity promotes correctly**: candidate → established → proven
3. **Projection is relevant**: `arete_context` returns task-appropriate facts
4. **Inference is useful**: Candidates match actual user behavior
5. **Migration is seamless**: v1 users upgrade without data loss

---

## One-Liner Pitch

> Arete is your AI identity layer: structured facts about who you are, with confidence that decays and maturity that grows, projected contextually to any AI interaction.
