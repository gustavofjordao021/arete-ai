# OpenIdentity Specification

**Version:** 0.1.0 (Draft)
**Status:** Early development — breaking changes expected

---

## Abstract

OpenIdentity is a portable interchange format for AI identity data. It defines how to represent a user's preferences, expertise, and context in a way that any AI tool can understand.

The goal: **One identity, any AI tool.** Define yourself once, use it everywhere.

---

## Why OpenIdentity?

Every AI tool builds its own memory silo:
- ChatGPT memory only works in ChatGPT
- Claude memory only works in Claude
- Cursor knows nothing about your ChatGPT preferences

Users invest heavily in training AI to understand them. That investment shouldn't be locked to one vendor.

OpenIdentity is the protocol that connects them.

---

## For Tool Builders

**Why should your tool support OpenIdentity?**

| Benefit | Description |
|---------|-------------|
| **No cold start** | Users arrive with preferences, expertise, and context already defined |
| **Reduced friction** | Skip "tell me about yourself" flows — import their identity |
| **User expectation** | As adoption grows, users will expect tools to support their portable identity |
| **Privacy-respecting** | Visibility tiers let users control exactly what's shared with your tool |
| **No vendor lock-in** | Open spec, MIT license — implement it yourself or use existing libraries |

**Integration is simple:** Parse a JSON file. The schema is ~100 lines of TypeScript.

---

## Schema

### OpenIdentity File (`.oi`)

The top-level structure for interchange:

```typescript
interface OpenIdentityV1 {
  // Metadata
  $schema: "https://openidentity.org/schema/v1.0.json";
  version: "1.0.0";
  exportedAt: string;           // ISO 8601 timestamp
  sourceApp: string;            // e.g., "arete", "cursor", "letta"

  // Core identity
  identity: {
    name?: string;
    role?: string;              // e.g., "Senior Engineer at Stripe"
  };

  // Facts about the user
  facts: OpenIdentityFact[];

  // Export metadata
  export: {
    visibility: Visibility;     // Max visibility tier included
    factsIncluded: number;
    factsExcluded: number;      // Facts filtered by visibility
  };
}
```

### Fact

Each fact is an independent, categorized piece of information:

```typescript
interface OpenIdentityFact {
  id: string;                   // UUID
  category: FactCategory;
  content: string;              // The actual fact, e.g., "Prefers concise responses"

  // Trust signals
  confidence: number;           // 0.0 - 1.0
  maturity: Maturity;

  // Privacy
  visibility: Visibility;

  // Provenance
  source: FactSource;
  createdAt: string;            // ISO 8601
}
```

### Enumerations

```typescript
type FactCategory =
  | "core"        // Name, role, background
  | "expertise"   // Skills, technologies, domains
  | "preference"  // Communication style, format preferences
  | "context"     // Personal/professional context
  | "focus";      // Current projects, goals

type Maturity =
  | "candidate"   // Inferred, not yet validated by user
  | "established" // Validated 2+ times or explicitly entered
  | "proven";     // Validated 5+ times, high trust

type FactSource =
  | "manual"       // User directly entered
  | "inferred"     // Extracted from usage patterns
  | "conversation" // Learned during AI conversation
  | "imported";    // Imported from another tool

type Visibility =
  | "public"    // Safe to share with any AI tool
  | "trusted"   // Only apps user explicitly authorized
  | "local";    // Never leaves device, never syncs
```

---

## Confidence System

Facts aren't static. Confidence decays over time unless validated.

### Decay Formula

```
effectiveConfidence = confidence × 0.5^(daysSinceValidation / halfLifeDays)
```

Default half-life: **60 days**

| Days Since Validation | Effective Confidence |
|-----------------------|---------------------|
| 0 | 1.00 |
| 30 | 0.71 |
| 60 | 0.50 |
| 120 | 0.25 |

Facts with effective confidence below **0.1** should be archived.

### Maturity Progression

```
   inferred                validated 2x              validated 5x
      │                        │                         │
      ▼                        ▼                         ▼
┌───────────┐            ┌─────────────┐            ┌────────┐
│ candidate │  ────────▶ │ established │  ────────▶ │ proven │
│ conf: 0.5 │            │  conf: 0.9  │            │ conf: 1│
└───────────┘            └─────────────┘            └────────┘
      ▲
      │
  AI inferred
```

**Validation rules:**
- Each validation: `confidence += 0.2` (capped at 1.0)
- Manual entry starts as `established` with `confidence: 1.0`
- Inferred facts start as `candidate` with `confidence: 0.5`

---

## Privacy Model

### Visibility Tiers

| Tier | Description | Example Facts |
|------|-------------|---------------|
| `public` | Safe for any AI tool | "Prefers concise answers", "Uses TypeScript" |
| `trusted` | Only authorized apps | "Works at Stripe", "Building stealth startup" |
| `local` | Never leaves device | "Planning to leave job", "Salary expectations" |

**Default:** `trusted` (safe but not promiscuous)

### Filtering Rules

When exporting or sharing:

```typescript
function filterByVisibility(facts: Fact[], maxTier: Visibility): Fact[] {
  const levels = { public: 0, trusted: 1, local: 2 };
  return facts.filter(f => levels[f.visibility] <= levels[maxTier]);
}
```

- Export with `visibility: "public"` → only public facts
- Export with `visibility: "trusted"` → public + trusted facts
- `local` facts never export, never sync

---

## File Format

### Extension

`.oi` (OpenIdentity)

### MIME Type

`application/vnd.openidentity+json`

### Example File

```json
{
  "$schema": "https://openidentity.org/schema/v1.0.json",
  "version": "1.0.0",
  "exportedAt": "2025-01-15T10:30:00Z",
  "sourceApp": "arete",

  "identity": {
    "name": "Alex",
    "role": "Senior Engineer at Stripe"
  },

  "facts": [
    {
      "id": "f1a2b3c4-5678-90ab-cdef-1234567890ab",
      "category": "expertise",
      "content": "Expert in TypeScript and React",
      "confidence": 1.0,
      "maturity": "proven",
      "visibility": "public",
      "source": "manual",
      "createdAt": "2024-06-01T00:00:00Z"
    },
    {
      "id": "a9b8c7d6-5432-10fe-dcba-0987654321fe",
      "category": "preference",
      "content": "Prefers concise, technical responses without pleasantries",
      "confidence": 0.9,
      "maturity": "established",
      "visibility": "public",
      "source": "conversation",
      "createdAt": "2024-12-01T00:00:00Z"
    },
    {
      "id": "12345678-abcd-ef00-1234-567890abcdef",
      "category": "focus",
      "content": "Building payments infrastructure for Latin America",
      "confidence": 0.8,
      "maturity": "established",
      "visibility": "trusted",
      "source": "inferred",
      "createdAt": "2025-01-10T00:00:00Z"
    }
  ],

  "export": {
    "visibility": "trusted",
    "factsIncluded": 3,
    "factsExcluded": 2
  }
}
```

---

## Import Behavior

When importing an `.oi` file:

1. **Generate new IDs** — Prevents collisions with existing facts
2. **Set source to `imported`** — Preserves provenance
3. **Preserve visibility** — Respect the exporter's privacy choices
4. **Set maturity to `established`** — Imported = some trust, but not proven

---

## Implementations

### Reference Implementation

**[Arete](https://github.com/gustavofjordao021/arete-ai)** — Local-first identity store with MCP server for Claude Desktop.

```bash
# Install
npx arete-mcp-server setup

# Export
arete identity export --format oi > my-identity.oi

# Import
arete identity import ./backup.oi
```

### Integrate OpenIdentity

To add OpenIdentity support to your tool:

**Read (import user identity):**
1. Accept `.oi` file upload or API endpoint
2. Parse JSON, validate against schema
3. Filter facts by your app's trust level
4. Inject relevant facts into system prompt or context

**Write (export user identity):**
1. Collect facts learned during usage
2. Assign appropriate visibility tiers
3. Export in OpenIdentity format
4. Let users download or sync

**Libraries:**
- TypeScript: `@arete/core` (MIT) — includes schema validation, export/import functions

---

## Versioning

This specification follows [Semantic Versioning](https://semver.org/).

- **0.x.x** — Draft, breaking changes expected
- **1.0.0** — Stable, breaking changes require major version bump

Current version: **0.1.0**

---

## Contributing

OpenIdentity is open for feedback and contributions.

- **GitHub:** [github.com/gustavofjordao021/arete-ai](https://github.com/gustavofjordao021/arete-ai)
- **Issues:** Report bugs, propose changes
- **Discussions:** Schema design, adoption strategies

The goal is eventual community governance as adoption grows.

---

## License

MIT
