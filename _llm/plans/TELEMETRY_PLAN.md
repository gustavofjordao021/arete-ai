# Arete MCP Telemetry Plan

> PostHog analytics for measuring MCP effectiveness
> Created: 2025-12-16
> Status: **COMPLETE**

---

## North Star Metric

**Weekly cross-interface context retrievals per user** — measures the "aha moment" (context from Chrome appearing in Claude Desktop).

---

## Key Metrics

| Category | Metric | Event |
|----------|--------|-------|
| **Adoption** | Tool usage | `mcp.tool_called {tool, success, duration_ms}` |
| **Identity** | Fact lifecycle | `identity.fact_created`, `identity.fact_validated`, `identity.fact_promoted` |
| **Approval Rates** | Inference quality | `identity.candidate_proposed` / `identity.candidate_accepted` / `identity.candidate_rejected` |
| **Fact Utilization** | What's surfaced | `projection.fact_surfaced {category, maturity, relevance_score}` |
| **Context Flow** | Cross-interface | `context.event_added {source}`, `context.events_retrieved {source_filter}` |

---

## Architecture

```
packages/telemetry/           <- NEW PACKAGE
├── src/
│   ├── index.ts              <- Exports
│   ├── client.ts             <- PostHog wrapper (singleton)
│   ├── events.ts             <- Typed events + Zod schemas (13 event types)
│   ├── config.ts             <- Telemetry settings from ~/.arete/config.json
│   ├── user-id.ts            <- Anonymous ID generation (SHA-256 hash)
│   ├── events.test.ts        <- Event schema tests (19 tests)
│   └── client.test.ts        <- Client tests (23 tests)
├── package.json
└── tsconfig.json

packages/mcp-server/
└── src/
    └── index.ts              <- MODIFIED: Init telemetry, instrument all 10 tools
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default state | ON | Learning is critical for hackathon validation |
| Opt-out mechanism | `~/.arete/config.json` | Power users can edit JSON, no UI needed |
| User ID | SHA-256(deviceId) | Stable, anonymous, consistent across sessions |
| Backend | Direct to PostHog | PostHog SDK handles batching/retry, no relay needed |
| Content tracking | NEVER | Only metadata (category, counts, maturity), privacy-first |

---

## Implementation Summary

### Phase 1: Telemetry Package ✅

Created `packages/telemetry/` with:

1. **events.ts** — 13 event schemas with Zod validation:
   - `mcp.tool_called`
   - `identity.fact_created`, `identity.fact_validated`, `identity.fact_promoted`, `identity.fact_archived`
   - `identity.infer_called`, `identity.candidate_proposed`, `identity.candidate_accepted`, `identity.candidate_rejected`
   - `projection.context_called`, `projection.fact_surfaced`
   - `context.event_added`, `context.events_retrieved`

2. **client.ts** — TelemetryClient class:
   - Singleton pattern via `getTelemetryClient()`
   - Convenience methods: `trackToolCall()`, `trackFactCreated()`, `trackFactValidated()`, etc.
   - `disable()`, `enable()`, `isEnabled()` for opt-out
   - `shutdown()` for graceful exit

3. **config.ts** — Config loading:
   - Reads `telemetry.enabled` from `~/.arete/config.json`
   - Default: `{ enabled: true }`

4. **user-id.ts** — Anonymous ID:
   - `getAnonymousUserId()` returns SHA-256 hash of deviceId (16 chars)

**Tests:** 42 tests passing (events + client)

### Phase 2: MCP Server Integration ✅

1. Added `@arete/telemetry` dependency
2. Initialized telemetry with `initTelemetry()` and `setConnector("mcp-server")`
3. Added graceful shutdown handlers for SIGINT/SIGTERM

### Phase 3: Tool Instrumentation ✅

All 10 tools instrumented with `withTelemetry()` wrapper:

| Tool | Events Tracked |
|------|----------------|
| `arete_get_identity` | `mcp.tool_called` |
| `arete_get_recent_context` | `mcp.tool_called`, `context.events_retrieved` |
| `arete_add_context_event` | `mcp.tool_called`, `context.event_added` |
| `arete_update_identity` | `mcp.tool_called`, `identity.fact_created` |
| `arete_validate_fact` | `mcp.tool_called`, `identity.fact_validated` |
| `arete_context` | `mcp.tool_called`, `projection.context_called`, `projection.fact_surfaced` |
| `arete_infer` | `mcp.tool_called`, `identity.infer_called`, `identity.candidate_proposed` |
| `arete_reject_fact` | `mcp.tool_called`, `identity.candidate_rejected` |
| `arete_accept_candidate` | `mcp.tool_called`, `identity.candidate_accepted` |
| `arete_accept_candidates` | `mcp.tool_called`, `identity.candidate_accepted` (batch) |

**Tests:** 292 tests passing (MCP server)

---

## Privacy Guarantees

**We track:**
- Tool names and success/failure
- Fact categories (expertise, preference, etc.)
- Maturity levels (candidate, established, proven)
- Counts and durations
- Anonymous user ID (hashed)

**We NEVER track:**
- Fact content (your actual expertise, preferences)
- URLs or page titles
- Conversation content
- Any PII

---

## Opt-Out Instructions

Add to `~/.arete/config.json`:

```json
{
  "telemetry": {
    "enabled": false
  }
}
```

---

## PostHog Setup Required

To enable telemetry collection:

1. Create PostHog project at [app.posthog.com](https://app.posthog.com)
2. Get project API key
3. Set `POSTHOG_API_KEY` environment variable, or update `packages/telemetry/src/client.ts`:
   ```typescript
   const POSTHOG_API_KEY = "phc_your_key_here";
   ```

---

## Files Changed

| File | Change |
|------|--------|
| `packages/telemetry/*` | NEW - entire package |
| `packages/mcp-server/package.json` | Added `@arete/telemetry` dependency |
| `packages/mcp-server/src/index.ts` | Added telemetry initialization and tool instrumentation |
| `package.json` | Added `build:telemetry` and `test:telemetry` scripts |

---

## Success Criteria

- [x] Telemetry ON by default
- [x] Opt-out works via config.json
- [x] No content leaked (only metadata)
- [x] Stable anonymous ID across sessions
- [x] Graceful degradation (failures don't break tools)
- [x] Clean shutdown (events flush before exit)
- [x] Events visible in PostHog dashboard ✅ Verified 2025-12-16
