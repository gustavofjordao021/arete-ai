# Accept Candidate UX Improvement Plan

**Status:** ✅ Complete

## Implementation Notes

- Created `candidate-registry.ts` with in-memory storage for inference candidates
- Created `identity-accept.ts` with handler that preserves candidate metadata
- Updated `identity-infer.ts` to register candidates after inference
- Registered `arete_accept_candidate` tool in MCP server index
- Updated inference guidance to mention `arete_accept_candidate`
- All 576 tests passing (195 core + 215 MCP + 166 extension)

## Problem Statement

When `arete_infer` returns candidates, the workflow for accepting them is cumbersome:

**Current Flow:**
```
arete_infer → candidates returned → user approves
→ Claude reconstructs: { section, operation, field, value, reasoning }
→ arete_update_identity(...)
→ fact added
```

**Issue:** Candidates already have ALL metadata (id, category, content, confidence, signals, sourceRef), but Claude must:
1. Map `category` → `section` (expertise→expertise, focus→currentFocus, etc.)
2. Determine the right `operation` ("add")
3. Sometimes figure out `field` (context needs "personal" or "professional")
4. Pass `value` (just the content string)
5. Write `reasoning`

**Worse:** The current `update_identity` handler discards candidate metadata:
- Uses `source: "manual"` instead of preserving `"inferred"`
- Uses default `confidence: 0.8` instead of the calculated value (0.5-0.8)
- Ignores `sourceRef` (the signals that led to inference)

## Solution: `arete_accept_candidate` Tool

A dedicated tool that accepts a candidate by reference, preserving all its metadata.

**Ideal Flow:**
```
arete_infer → candidates returned → user approves
→ arete_accept_candidate(candidateId or content)
→ fact added with preserved metadata
```

## Implementation Phases

### Phase 1: Candidate Registry (State Management)

Store candidates from inference for later acceptance.

**File:** `packages/mcp-server/src/tools/candidate-registry.ts`

```typescript
interface StoredCandidate {
  id: string;
  category: FactCategory;
  content: string;
  confidence: number;
  sourceRef: string;
  signals: string[];
  createdAt: string;
}

// In-memory store (persists during MCP session)
const candidateRegistry = new Map<string, StoredCandidate>();

export function registerCandidates(candidates: CandidateFact[]): void;
export function getCandidate(id: string): StoredCandidate | undefined;
export function getCandidateByContent(content: string): StoredCandidate | undefined;
export function clearCandidates(): void;
```

**Update `identity-infer.ts`:**
- After generating candidates, register them in the registry
- This makes them available for `accept_candidate` to look up

### Phase 2: Accept Candidate Handler

**File:** `packages/mcp-server/src/tools/identity-accept.ts`

```typescript
interface AcceptCandidateInput {
  candidateId?: string;  // UUID from inference
  content?: string;      // Fallback to content match
  reasoning?: string;    // Optional override (we have signals)
}

interface AcceptCandidateOutput {
  success: boolean;
  fact?: IdentityFact;
  error?: string;
}
```

**Logic:**
1. Look up candidate from registry (by id or content)
2. If not found, return helpful error
3. Create `IdentityFact` preserving candidate metadata:
   - `source: "inferred"` (not "manual")
   - `confidence`: from candidate (not hardcoded 0.8)
   - `sourceRef`: from candidate signals
   - `maturity: "candidate"` → starts fresh
4. Add to identity facts array
5. Save locally + sync to cloud
6. Return success with created fact

### Phase 3: Tool Registration

**Update `packages/mcp-server/src/index.ts`:**

```typescript
server.registerTool(
  "arete_accept_candidate",
  {
    title: "Accept Inferred Candidate",
    description:
      "Accept a candidate fact from arete_infer results. " +
      "Much simpler than arete_update_identity - just pass the candidate ID or content. " +
      "Preserves inference metadata (confidence, signals, source).",
    inputSchema: {
      candidateId: z.string().optional().describe("UUID from inference"),
      content: z.string().optional().describe("Content match fallback"),
      reasoning: z.string().optional().describe("Override reason"),
    },
  },
  ...
);
```

### Phase 4: Tests

**File:** `packages/mcp-server/src/tools/identity-accept.test.ts`

```
- accepts candidate by id
- accepts candidate by content match
- preserves confidence from inference
- preserves sourceRef from inference
- sets source to "inferred"
- handles missing candidate gracefully
- handles no candidates registered
- content match is case-insensitive
- syncs to cloud when authenticated
```

## Validation Criteria

1. **Simpler API:** `accept_candidate({ candidateId })` vs reconstructing `update_identity` params
2. **Metadata preserved:** Inferred facts show their origin (source, confidence, signals)
3. **No mapping needed:** Claude doesn't need to know category→section mapping
4. **Error handling:** Helpful messages when candidate not found

## Files to Create/Modify

| File | Action |
|------|--------|
| `candidate-registry.ts` | Create - in-memory candidate storage |
| `identity-accept.ts` | Create - accept handler |
| `identity-accept.test.ts` | Create - tests |
| `identity-infer.ts` | Modify - register candidates after inference |
| `index.ts` | Modify - register new tool |

## Not In Scope

- Persisting candidates to disk (session-only is fine)
- Batch accept (one at a time is clearer)
- Auto-accept (always requires user confirmation)

## Success Metric

Claude's workflow changes from:
```
// Before (verbose, loses metadata)
arete_update_identity({
  section: "expertise",
  operation: "add",
  value: "TypeScript development",
  reasoning: "User confirmed interest"
})

// After (simple, preserves metadata)
arete_accept_candidate({
  candidateId: "abc-123"
})
```
