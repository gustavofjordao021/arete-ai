# Context Rollup Plan

> Created: 2025-12-06
> Status: Planning
> Depends on: Supabase sync (Phases 1-4)

## Goal

Implement tiered context storage with automatic rollup:
- **Hot**: Recent events (0-30 days) - full detail
- **Cold**: Historical summaries (30+ days) - aggregated + LLM insights

This prevents unbounded growth while preserving valuable historical patterns.

---

## Problem Statement

```
Current: Every page visit/conversation creates a new row
         → 100 visits/day × 365 days = 36,500 rows/user/year
         → Queries slow down, storage costs increase

Target:  Recent detail + compressed history
         → 30 days hot + 12 weekly summaries = ~150 rows max
         → AI gets "User frequently visits react.dev" not 500 raw events
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  HOT (0-30 days)           │  COLD (30+ days)           │
│  context_events            │  context_summaries         │
│  - Full event detail       │  - Aggregated stats        │
│  - Individual timestamps   │  - Weekly/monthly periods  │
│  - ~50-100 per day         │  - LLM-generated insights  │
└─────────────────────────────────────────────────────────┘
                    ↓ Weekly pg_cron job
          Aggregate → Summarize → Delete raw
```

---

## Technical Challenges

### 1. Scheduling

| Option | Pros | Cons |
|--------|------|------|
| pg_cron + Postgres function | Free, transactional | Can't call LLM |
| Edge Function + external cron | Can call LLM | 60s timeout, needs webhook |
| GitHub Actions | Full control | Separate infra, secrets |

**Recommendation**: Hybrid - pg_cron for aggregation, optional async LLM enhancement

### 2. LLM Summarization

- Can't send 5000 events to LLM (context limit)
- Pre-aggregate in Postgres first, then summarize aggregation
- Cost: ~$0.50/month for 1000 users with Haiku

### 3. Failure Handling

- Process in transaction
- Delete raw events AFTER summary confirmed
- Add watermark to prevent reprocessing

---

## Proposed Schema

```sql
CREATE TABLE context_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Time window
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('weekly', 'monthly')),

  -- Aggregated data (structured JSON)
  stats jsonb NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "page_visits": {
  --     "total": 234,
  --     "by_domain": [
  --       {"domain": "react.dev", "count": 47, "pages": ["hooks", "state"]},
  --       {"domain": "supabase.com", "count": 31, "pages": ["auth", "realtime"]}
  --     ]
  --   },
  --   "conversations": {"total": 12, "topics": ["auth", "database"]},
  --   "facts_learned": {"total": 8, "samples": ["prefers TypeScript"]}
  -- }

  -- LLM-generated insight (nullable, filled async)
  insights text,
  insights_generated_at timestamptz,

  -- Metadata
  events_processed int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),

  UNIQUE(user_id, period_start, period_type)
);

CREATE INDEX idx_summaries_user_period
  ON context_summaries(user_id, period_start DESC);

-- RLS
ALTER TABLE context_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own summaries"
  ON context_summaries FOR SELECT
  USING (auth.uid() = user_id);
```

---

## Rollup Function (Postgres)

```sql
CREATE OR REPLACE FUNCTION rollup_user_context(
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
  v_count int;
BEGIN
  -- Calculate period
  v_period_end := now() - p_older_than;
  v_period_start := v_period_end - interval '7 days';

  -- Skip if already processed
  IF EXISTS (
    SELECT 1 FROM context_summaries
    WHERE user_id = p_user_id
      AND period_start = v_period_start
      AND period_type = 'weekly'
  ) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  -- Aggregate page visits by domain
  WITH page_stats AS (
    SELECT
      data->>'hostname' as domain,
      COUNT(*) as visit_count,
      array_agg(DISTINCT data->>'title') as page_titles
    FROM context_events
    WHERE user_id = p_user_id
      AND type = 'page_visit'
      AND timestamp BETWEEN v_period_start AND v_period_end
    GROUP BY data->>'hostname'
    ORDER BY visit_count DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'page_visits', jsonb_build_object(
      'total', COALESCE((SELECT SUM(visit_count) FROM page_stats), 0),
      'by_domain', (SELECT jsonb_agg(...) FROM page_stats)
    ),
    'conversations', jsonb_build_object('total', ...),
    'facts_learned', jsonb_build_object('total', ...)
  ) INTO v_stats;

  -- Count events
  SELECT COUNT(*) INTO v_count FROM context_events
  WHERE user_id = p_user_id
    AND timestamp BETWEEN v_period_start AND v_period_end;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_events');
  END IF;

  -- Insert summary
  INSERT INTO context_summaries (...) VALUES (...);

  -- Delete processed events
  DELETE FROM context_events
  WHERE user_id = p_user_id
    AND timestamp BETWEEN v_period_start AND v_period_end;

  RETURN jsonb_build_object('success', true, 'events_processed', v_count);
END;
$$;
```

---

## Scheduling (pg_cron)

```sql
-- Run every Sunday at 3 AM UTC
SELECT cron.schedule(
  'weekly-context-rollup',
  '0 3 * * 0',
  $$
  SELECT rollup_user_context(id)
  FROM auth.users
  WHERE id IN (
    SELECT DISTINCT user_id FROM context_events
    WHERE timestamp < now() - interval '30 days'
  );
  $$
);
```

---

## Query Integration

```typescript
async function getFullContext(userId: string) {
  const [recentEvents, summaries] = await Promise.all([
    // Hot: recent raw events
    supabase.from('context_events')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(100),

    // Cold: historical summaries
    supabase.from('context_summaries')
      .select('*')
      .eq('user_id', userId)
      .order('period_start', { ascending: false })
      .limit(12)
  ]);

  return {
    recent: recentEvents.data,
    historical: summaries.data
  };
}
```

---

## Implementation Phases

| Phase | Scope | Effort |
|-------|-------|--------|
| 1. Schema | Create context_summaries table, RLS, indexes | 1 hour |
| 2. Rollup Function | Postgres aggregation logic | 2-3 hours |
| 3. pg_cron Setup | Schedule weekly job | 30 min |
| 4. Query Integration | Update extension to load summaries | 1-2 hours |
| 5. LLM Enhancement | Edge Function for insights (optional) | 2-3 hours |

**Total: ~8-10 hours**

---

## Open Questions

1. **Rollup window**: 7 days or 30 days before compacting?
2. **Keep originals**: Archive to S3 before deleting?
3. **User control**: Manual rollup trigger? Opt-out?
4. **Granularity**: Per-domain or global weekly summary?

---

## What AI Sees (After Rollup)

```json
{
  "recent_context": [
    {"type": "page_visit", "url": "react.dev/hooks", "timestamp": "2024-03-15"},
    {"type": "conversation", "content": "Asked about auth", "timestamp": "2024-03-14"}
  ],
  "historical_patterns": [
    {
      "period": "March 1-7, 2024",
      "top_domains": ["react.dev (47)", "supabase.com (31)"],
      "insights": "Actively building a Next.js app with Supabase auth."
    },
    {
      "period": "Feb 22-28, 2024",
      "top_domains": ["typescript-eslint.io (23)", "github.com (18)"],
      "insights": "Setting up TypeScript tooling for a new project."
    }
  ]
}
```

Compact, useful, and bounded.
