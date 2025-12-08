# Context Rollup Plan (v2)

> Created: 2025-12-08
> Status: Planning
> Depends on: [ARETE_V2_ARCHITECTURE.md](./ARETE_V2_ARCHITECTURE.md)
> Replaces: [CONTEXT_ROLLUP_PLAN_V1.md](../archive/CONTEXT_ROLLUP_PLAN_V1.md)

## Goal

Implement tiered context storage with automatic rollup AND integration with the inference pipeline:

```
HOT (0-30 days)     → Raw events, full detail
       ↓ rollup
COLD (30+ days)     → Aggregated summaries + insights
       ↓ inference
CANDIDATES          → Proposed identity facts from patterns
```

---

## What's New in v2

| v1 | v2 | Why |
|----|-----|-----|
| Standalone rollup | Integrated with inference | Rollup insights feed candidate facts |
| LLM insights optional | LLM insights drive inference | Patterns become identity |
| No secret handling | Secret sanitization | Privacy protection |
| Simple aggregation | Aggregation + pattern extraction | Support `arete_infer` tool |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  HOT (context_events)          │  COLD (context_summaries)      │
│  - Raw page visits, etc.       │  - Weekly aggregates           │
│  - Full URLs, timestamps       │  - Top domains, topics         │
│  - ~100/day per user           │  - LLM-generated insights      │
│  - 30 day retention            │  - Permanent                   │
└─────────────────────────────────────────────────────────────────┘
                    ↓ Weekly pg_cron job
          1. Sanitize secrets
          2. Aggregate stats
          3. Extract patterns
          4. Generate insights (LLM)
          5. Propose candidate facts
          6. Delete raw events
```

---

## Secret Sanitization (NEW)

Before any aggregation, sanitize sensitive data:

```typescript
const SANITIZE_PATTERNS = [
  // API Keys
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g, replace: "[BEARER_TOKEN]" },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, replace: "[GITHUB_PAT]" },
  { pattern: /sk-[A-Za-z0-9]{48}/g, replace: "[OPENAI_KEY]" },
  { pattern: /sk_live_[A-Za-z0-9]+/g, replace: "[STRIPE_KEY]" },
  { pattern: /sk_test_[A-Za-z0-9]+/g, replace: "[STRIPE_TEST_KEY]" },

  // Credentials
  { pattern: /password[=:]\s*\S+/gi, replace: "[PASSWORD]" },
  { pattern: /secret[=:]\s*\S+/gi, replace: "[SECRET]" },

  // PII
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replace: "[EMAIL]" },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replace: "[PHONE]" },
];

function sanitizeContextEvent(event: ContextEvent): ContextEvent {
  let sanitizedData = JSON.stringify(event.data);
  for (const { pattern, replace } of SANITIZE_PATTERNS) {
    sanitizedData = sanitizedData.replace(pattern, replace);
  }
  return { ...event, data: JSON.parse(sanitizedData) };
}
```

**When to sanitize:**
1. On event creation (extension/CLI) - prevent storage of secrets
2. Before rollup aggregation - catch any that slipped through

---

## Domain Exclusions (NEW)

Some domains should never be stored or aggregated:

```typescript
const EXCLUDED_DOMAINS = [
  // Financial
  "*.bank.com", "paypal.com", "venmo.com", "chase.com", "wellsfargo.com",

  // Health
  "*.health.gov", "webmd.com", "mayoclinic.org",

  // Personal social
  "facebook.com", "instagram.com", "tiktok.com",

  // Auth pages
  "accounts.google.com", "login.*", "signin.*", "auth.*",

  // Adult content
  // ... (pattern matching)
];

function shouldExcludeDomain(url: string): boolean {
  const hostname = new URL(url).hostname;
  return EXCLUDED_DOMAINS.some(pattern => {
    if (pattern.startsWith("*.")) {
      return hostname.endsWith(pattern.slice(1));
    }
    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace("*", ".*"));
      return regex.test(hostname);
    }
    return hostname === pattern || hostname.endsWith("." + pattern);
  });
}
```

---

## Schema Updates

### context_events (unchanged)

```sql
-- No changes to hot storage
-- Events are sanitized on insert
```

### context_summaries (enhanced)

```sql
ALTER TABLE context_summaries ADD COLUMN IF NOT EXISTS
  patterns jsonb DEFAULT '[]';
-- Extracted patterns for inference
-- Example:
-- [
--   {"pattern": "frequent_domain", "value": "supabase.com", "count": 47},
--   {"pattern": "topic_cluster", "value": "database_auth", "confidence": 0.8}
-- ]

ALTER TABLE context_summaries ADD COLUMN IF NOT EXISTS
  candidate_facts jsonb DEFAULT '[]';
-- Proposed facts generated from this period
-- [
--   {"content": "Learning Supabase auth", "confidence": 0.6, "source_pattern": "frequent_domain"}
-- ]
```

---

## Rollup Function (v2)

```sql
CREATE OR REPLACE FUNCTION rollup_user_context_v2(
  p_user_id uuid,
  p_older_than interval DEFAULT '30 days'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_stats jsonb;
  v_patterns jsonb;
  v_count int;
BEGIN
  -- Calculate period (weekly)
  v_period_end := now() - p_older_than;
  v_period_start := v_period_end - interval '7 days';

  -- Skip if already processed
  IF EXISTS (
    SELECT 1 FROM context_summaries
    WHERE user_id = p_user_id
      AND period_start = v_period_start
      AND period_type = 'weekly'
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_processed');
  END IF;

  -- Count events (skip if none)
  SELECT COUNT(*) INTO v_count FROM context_events
  WHERE user_id = p_user_id
    AND timestamp BETWEEN v_period_start AND v_period_end;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_events');
  END IF;

  -- Aggregate page visits by domain
  WITH domain_stats AS (
    SELECT
      data->>'hostname' as domain,
      COUNT(*) as visit_count,
      array_agg(DISTINCT data->>'pathname') as paths
    FROM context_events
    WHERE user_id = p_user_id
      AND type = 'page_visit'
      AND timestamp BETWEEN v_period_start AND v_period_end
      AND NOT is_excluded_domain(data->>'hostname')  -- NEW: filter excluded
    GROUP BY data->>'hostname'
    ORDER BY visit_count DESC
    LIMIT 20
  ),
  conversation_stats AS (
    SELECT COUNT(*) as total
    FROM context_events
    WHERE user_id = p_user_id
      AND type = 'conversation'
      AND timestamp BETWEEN v_period_start AND v_period_end
  )
  SELECT jsonb_build_object(
    'page_visits', jsonb_build_object(
      'total', (SELECT COALESCE(SUM(visit_count), 0) FROM domain_stats),
      'by_domain', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'domain', domain,
        'count', visit_count,
        'paths', paths
      )), '[]'::jsonb) FROM domain_stats)
    ),
    'conversations', (SELECT jsonb_build_object('total', total) FROM conversation_stats)
  ) INTO v_stats;

  -- Extract patterns for inference (NEW)
  WITH frequent_domains AS (
    SELECT domain, visit_count
    FROM domain_stats
    WHERE visit_count >= 5  -- Threshold for "frequent"
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pattern', 'frequent_domain',
    'value', domain,
    'count', visit_count,
    'confidence', LEAST(1.0, visit_count::float / 20)
  )), '[]'::jsonb)
  INTO v_patterns
  FROM frequent_domains;

  -- Insert summary with patterns
  INSERT INTO context_summaries (
    user_id, period_start, period_end, period_type,
    stats, patterns, events_processed
  ) VALUES (
    p_user_id, v_period_start, v_period_end, 'weekly',
    v_stats, v_patterns, v_count
  );

  -- Delete processed events
  DELETE FROM context_events
  WHERE user_id = p_user_id
    AND timestamp BETWEEN v_period_start AND v_period_end;

  RETURN jsonb_build_object(
    'success', true,
    'events_processed', v_count,
    'patterns_found', jsonb_array_length(v_patterns)
  );
END;
$$;
```

---

## Integration with Inference Pipeline

After rollup completes, trigger inference:

```typescript
// Edge Function: rollup-and-infer
async function rollupAndInfer(userId: string) {
  // 1. Run rollup
  const rollupResult = await supabase.rpc('rollup_user_context_v2', {
    p_user_id: userId
  });

  if (!rollupResult.data?.success) {
    return rollupResult;
  }

  // 2. Get latest summary with patterns
  const { data: summary } = await supabase
    .from('context_summaries')
    .select('patterns')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
    .limit(1)
    .single();

  // 3. Generate candidate facts from patterns
  const candidates = await generateCandidateFacts(summary.patterns);

  // 4. Store candidates (not committed to identity yet)
  await supabase.from('candidate_facts').insert(
    candidates.map(c => ({
      user_id: userId,
      ...c,
      status: 'pending',
      source_period: summary.period_start,
    }))
  );

  return {
    ...rollupResult.data,
    candidates_generated: candidates.length,
  };
}

async function generateCandidateFacts(patterns: Pattern[]): Promise<CandidateFact[]> {
  const candidates: CandidateFact[] = [];

  for (const pattern of patterns) {
    if (pattern.pattern === 'frequent_domain') {
      // Map domains to expertise candidates
      const domainMapping: Record<string, string> = {
        'supabase.com': 'Supabase',
        'react.dev': 'React',
        'typescriptlang.org': 'TypeScript',
        'nextjs.org': 'Next.js',
        'tailwindcss.com': 'Tailwind CSS',
        // ... extensible
      };

      const skill = domainMapping[pattern.value];
      if (skill && pattern.confidence >= 0.5) {
        candidates.push({
          category: 'expertise',
          content: skill,
          confidence: pattern.confidence * 0.8,  // Discount for inference
          maturity: 'candidate',
          source: 'inferred',
          sourceRef: `rollup:${pattern.value}:${pattern.count}`,
        });
      }
    }
  }

  return candidates;
}
```

---

## Candidate Facts Table (NEW)

```sql
CREATE TABLE candidate_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Fact content
  category text NOT NULL,
  content text NOT NULL,
  confidence float NOT NULL DEFAULT 0.5,

  -- Status
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),

  -- Provenance
  source text NOT NULL DEFAULT 'inferred',
  source_ref text,
  source_period timestamptz,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,

  -- Prevent duplicates
  UNIQUE(user_id, category, content)
);

CREATE INDEX idx_candidate_facts_pending
  ON candidate_facts(user_id, status)
  WHERE status = 'pending';

-- RLS
ALTER TABLE candidate_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own candidates"
  ON candidate_facts FOR ALL
  USING (auth.uid() = user_id);
```

---

## MCP Integration

### `arete_infer` tool reads candidates

```typescript
async function areteInferHandler(): Promise<InferResult> {
  const config = loadConfig();
  if (!config.apiKey) {
    // Local-only mode: analyze local context.json
    return inferFromLocalContext();
  }

  // Cloud mode: fetch pending candidates
  const { data: candidates } = await supabase
    .from('candidate_facts')
    .select('*')
    .eq('status', 'pending')
    .order('confidence', { ascending: false })
    .limit(10);

  return {
    candidates: candidates || [],
    message: candidates?.length
      ? `Found ${candidates.length} potential updates to your identity based on recent activity.`
      : 'No new patterns detected.',
  };
}
```

### `arete_validate_fact` accepts/rejects candidates

```typescript
async function areteValidateFactHandler(input: {
  factId: string;
  accept: boolean;
  reasoning?: string;
}): Promise<void> {
  const { factId, accept, reasoning } = input;

  if (accept) {
    // Move to identity facts
    const { data: candidate } = await supabase
      .from('candidate_facts')
      .select('*')
      .eq('id', factId)
      .single();

    // Create identity fact with "established" maturity
    await addIdentityFact({
      ...candidate,
      maturity: 'established',
      lastValidated: new Date().toISOString(),
    });
  }

  // Update candidate status
  await supabase
    .from('candidate_facts')
    .update({
      status: accept ? 'accepted' : 'rejected',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', factId);

  // If rejected, add to blocked list (don't suggest again)
  if (!accept) {
    await supabase.from('blocked_inferences').insert({
      user_id: candidate.user_id,
      content: candidate.content,
      reason: reasoning,
    });
  }
}
```

---

## Implementation Phases

### Phase 1: Secret Sanitization (1 hour)
- [ ] Add `sanitizeContextEvent()` function to core
- [ ] Apply on event creation in extension
- [ ] Apply on event creation in CLI
- [ ] Tests for sanitization patterns

### Phase 2: Domain Exclusions (1 hour)
- [ ] Add `shouldExcludeDomain()` function
- [ ] Filter on event creation
- [ ] Filter in rollup query
- [ ] User-configurable exclusions

### Phase 3: Schema Updates (1 hour)
- [ ] Add `patterns` column to context_summaries
- [ ] Add `candidate_facts` column to context_summaries
- [ ] Create `candidate_facts` table
- [ ] Create `blocked_inferences` table

### Phase 4: Rollup Function v2 (2 hours)
- [ ] Update `rollup_user_context` with pattern extraction
- [ ] Add `is_excluded_domain()` SQL function
- [ ] Test rollup with real data

### Phase 5: Inference Integration (2-3 hours)
- [ ] Create `rollup-and-infer` edge function
- [ ] Implement `generateCandidateFacts()`
- [ ] Update `arete_infer` to read candidates
- [ ] Implement `arete_validate_fact`

### Phase 6: Testing (1 hour)
- [ ] Unit tests for sanitization
- [ ] Unit tests for pattern extraction
- [ ] Integration test: rollup → candidates → validation

**Total: ~8-10 hours**

---

## Success Criteria

1. **Secrets never stored**: API keys, passwords sanitized before storage
2. **Excluded domains filtered**: Banking, health, auth pages never stored
3. **Patterns extracted**: Rollup identifies frequent domains, topics
4. **Candidates generated**: Patterns become proposed identity facts
5. **User controls acceptance**: Candidates require explicit approval
6. **Rejections remembered**: Blocked inferences never re-suggested
