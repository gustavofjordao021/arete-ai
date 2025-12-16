# Invisible Operations Plan

> Created: 2025-12-09
> Status: Phase 2A Complete ✅
> Goal: Make Arete tools "invisible" to Claude - no thinking about orchestration

## North Star

> "I should never think about *whether* to call Arete tools. I just do, and the system handles idempotency, deduplication, and conflict resolution gracefully."

---

## Phase 1: Batch & Fuzzy Operations (Quick Wins)

### 1A. Batch Accept Candidates
Accept multiple candidates in one call when user says "yes to all".

```typescript
// New tool: arete_accept_candidates (plural)
interface AcceptCandidatesInput {
  candidateIds?: string[];  // Accept by IDs
  all?: boolean;            // Accept all registered candidates
}

interface AcceptCandidatesOutput {
  success: boolean;
  accepted: IdentityFact[];
  failed: Array<{ id: string; error: string }>;
}
```

### 1B. Fuzzy Content Matching in validate_fact
Find closest match instead of exact match.

```typescript
// Enhance existing arete_validate_fact
interface ValidateFactInput {
  factId?: string;
  content?: string;        // Now does fuzzy matching
  fuzzyThreshold?: number; // Default: 0.8 similarity
  reasoning: string;
}
```

### 1C. Stale Candidate Suppression
Track ignored candidates, auto-block after 3 ignores.

```typescript
// In candidate-registry.ts
interface StoredCandidate {
  // ... existing fields
  inferCount: number;  // How many times inferred
  lastInferred: string;
}

// Auto-block if inferCount >= 3 and never accepted
```

---

## Phase 2: Proactive Hints

### 2A. Validation Opportunities in get_identity
Surface facts that need validation.

```typescript
interface GetIdentityOutput {
  // ... existing fields
  validationOpportunities?: Array<{
    factId: string;
    content: string;
    daysSinceValidation: number;
    effectiveConfidence: number;
  }>;
}
```

### 2B. Enhanced Directive Guidance
More specific suggestions based on conversation context.

---

## Implementation Order

| Task | File | Effort | Status |
|------|------|--------|--------|
| Batch accept handler | `identity-accept.ts` | 30min | ✅ |
| Batch accept tests | `identity-accept.test.ts` | 20min | ✅ |
| Register batch tool | `index.ts` | 10min | ✅ |
| Fuzzy matching util | `fuzzy-match.ts` | 20min | ✅ |
| Update validate_fact | `identity-validate.ts` | 20min | ✅ |
| Stale suppression | `candidate-registry.ts` | 30min | ✅ |
| Validation hints | `identity.ts` | 30min | ✅ |
| Validation hints tests | `identity.test.ts` | 20min | ✅ |

**Phase 2A Complete!**

### What Was Implemented (Phase 2A)

1. **ValidationOpportunity interface** - Surfaces facts needing validation with:
   - `factId`, `content`, `category`
   - `daysSinceValidation` - days since last validation
   - `effectiveConfidence` - confidence after time decay
   - `reason` - why validation is recommended

2. **V2 identity detection** - Handles new v2 identity format with facts array

3. **Time decay confidence** - `confidence * 0.5^(days/halfLife)` (default 60 days)

4. **Priority-based filtering** - Returns top 3 opportunities:
   - Priority 3: Confidence decayed below 0.4
   - Priority 2: Not validated in 60+ days
   - Priority 1: Candidate facts awaiting confirmation (14+ days)

5. **Enhanced guidance** - Adds validation hint when opportunities exist:
   - Mentions `arete_validate_fact` and fuzzy matching

---

## Validation Criteria

1. **Batch accept works**: "Yes to all" → single call → all candidates become facts
2. **Fuzzy validation works**: "works at PayNearMe" finds "PayNearMe employee"
3. **Stale suppression works**: Same candidate inferred 3x without accept → stops appearing
4. **Hints surface**: Old facts appear in validationOpportunities
