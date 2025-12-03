# Arete Identity Schema

## Philosophy

- **User writes prose, system stores structure**
- Human-readable input, machine-optimized storage
- Multiple input modes, single canonical schema
- Per-model transforms for injection

---

## Input Modes

All modes parse to the same internal schema:

1. **Prose block** — User writes natural description of themselves
2. **Conversation extraction** — Facts extracted from chat over time (via Mem0)
3. **Document import** — Point at Obsidian vault or folder
4. **Q&A onboarding** — Guided questions during setup
5. **Import existing** — Paste Claude/ChatGPT preferences

---

## Token Budget Strategy

Context windows are finite. Identity injection must be strategic:

| Tier | Token Budget | Contents | Injection Rule |
|------|--------------|----------|----------------|
| Core | ~500 tokens | Name, role, communication style, key preferences | Always injected |
| Contextual | ~1-2k tokens | Current projects, domain expertise, recent focus | Injected when relevant |
| Retrieved | Variable | Specific facts, conversation history | Pulled from Mem0 per-query |

---

## Canonical Schema (TypeScript)

```typescript
interface AreteIdentity {
  meta: {
    version: string;           // Schema version (semver)
    lastModified: string;      // ISO timestamp
    deviceId: string;          // For sync conflict resolution
  };

  core: {
    name?: string;
    role?: string;             // "Senior PM at PayNearMe"
    location?: string;         // "Miami, FL"
    background?: string;       // Free-form prose, ~100 words max
  };

  communication: {
    style: string[];           // ["direct", "concise"]
    format: string[];          // ["prose", "minimal formatting"]
    avoid: string[];           // ["emojis", "excessive bullets", "fluff"]
    voice?: string;            // For specific contexts like Twitter
  };

  expertise: string[];         // ["payments", "React", "product management"]

  currentFocus: {
    projects: Array<{
      name: string;
      description: string;
      status: "active" | "paused" | "completed";
    }>;
    goals: string[];
  };

  context: {
    personal: string[];        // Interests, lifestyle
    professional: string[];    // Work context
  };

  privacy: {
    public: string[];          // Fields shareable with any app
    private: string[];         // Only authorized apps
    localOnly: string[];       // Never leaves device
  };

  custom: {
    [namespace: string]: any;  // Extensible fields
  };

  sources: Array<{
    field: string;
    source: "user_input" | "conversation" | "document" | "browser";
    confidence: "high" | "medium" | "low";
    timestamp: string;
    raw?: string;              // Original text that was extracted
  }>;
}
```

---

## Zod Schema (Implementation)

```typescript
import { z } from "zod";

const ProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  status: z.enum(["active", "paused", "completed"]),
});

const SourceSchema = z.object({
  field: z.string(),
  source: z.enum(["user_input", "conversation", "document", "browser"]),
  confidence: z.enum(["high", "medium", "low"]),
  timestamp: z.string(),
  raw: z.string().optional(),
});

export const AreteIdentitySchema = z.object({
  meta: z.object({
    version: z.string(),
    lastModified: z.string(),
    deviceId: z.string(),
  }),

  core: z.object({
    name: z.string().optional(),
    role: z.string().optional(),
    location: z.string().optional(),
    background: z.string().optional(),
  }),

  communication: z.object({
    style: z.array(z.string()),
    format: z.array(z.string()),
    avoid: z.array(z.string()),
    voice: z.string().optional(),
  }),

  expertise: z.array(z.string()),

  currentFocus: z.object({
    projects: z.array(ProjectSchema),
    goals: z.array(z.string()),
  }),

  context: z.object({
    personal: z.array(z.string()),
    professional: z.array(z.string()),
  }),

  privacy: z.object({
    public: z.array(z.string()),
    private: z.array(z.string()),
    localOnly: z.array(z.string()),
  }),

  custom: z.record(z.any()),

  sources: z.array(SourceSchema),
});

export type AreteIdentity = z.infer<typeof AreteIdentitySchema>;
```

---

## Extraction Prompt

When user provides prose input, extract to schema:

```
You are an identity extraction system. Given user-provided text describing themselves,
extract structured identity information.

Extract the following categories (omit if not present):

CORE:
- name: User's name if mentioned
- role: Job title and company
- location: Where they're based
- background: Brief summary of professional/personal background

COMMUNICATION:
- style: How they prefer to communicate (e.g., direct, formal, casual)
- format: Preferred response format (e.g., prose, bullets, detailed)
- avoid: Things they don't want in responses (e.g., emojis, fluff)

EXPERTISE:
- List of domains/skills they're knowledgeable in

CURRENT FOCUS:
- Active projects with brief descriptions
- Current goals they're working toward

CONTEXT:
- Personal interests, lifestyle details
- Professional context beyond role

Preserve the user's voice when capturing communication style.
Be concise — each field should be the minimum needed to capture the essence.

User text:
"""
{user_input}
"""

Output valid JSON matching the schema.
```

---

## Per-Model Transforms

The canonical schema transforms differently for each LLM:

### Transform Interface

```typescript
interface IdentityTransformer {
  toSystemPrompt(identity: AreteIdentity, options: TransformOptions): string;
}

interface TransformOptions {
  model: "claude" | "gpt" | "other";
  includeContextual: boolean;
  maxTokens: number;
  currentContext?: {
    url?: string;
    pageContent?: string;
    selectedText?: string;
  };
}
```

### Claude Transform

```typescript
function transformForClaude(identity: AreteIdentity, options: TransformOptions): string {
  const parts: string[] = [];

  // Core (always included)
  parts.push(`<user_context>`);
  if (identity.core.role) parts.push(`Role: ${identity.core.role}`);
  if (identity.core.background) parts.push(`Background: ${identity.core.background}`);
  parts.push(`</user_context>`);

  // Communication preferences
  parts.push(`<response_preferences>`);
  if (identity.communication.style.length) {
    parts.push(`Style: ${identity.communication.style.join(", ")}`);
  }
  if (identity.communication.avoid.length) {
    parts.push(`Avoid: ${identity.communication.avoid.join(", ")}`);
  }
  parts.push(`</response_preferences>`);

  // Contextual (if relevant and budget allows)
  if (options.includeContextual && identity.currentFocus.projects.length) {
    const activeProjects = identity.currentFocus.projects
      .filter(p => p.status === "active")
      .map(p => `${p.name}: ${p.description}`)
      .join("\n");
    parts.push(`<current_projects>\n${activeProjects}\n</current_projects>`);
  }

  return parts.join("\n\n");
}
```

### OpenAI Transform

```typescript
function transformForOpenAI(identity: AreteIdentity, options: TransformOptions): string {
  const parts: string[] = [];

  // OpenAI prefers more natural system prompt format
  if (identity.core.role || identity.core.background) {
    parts.push(`## User Context`);
    if (identity.core.role) parts.push(`- Role: ${identity.core.role}`);
    if (identity.core.background) parts.push(`- Background: ${identity.core.background}`);
  }

  if (identity.communication.style.length || identity.communication.avoid.length) {
    parts.push(`\n## Response Preferences`);
    if (identity.communication.style.length) {
      parts.push(`- Communication style: ${identity.communication.style.join(", ")}`);
    }
    if (identity.communication.avoid.length) {
      parts.push(`- Avoid: ${identity.communication.avoid.join(", ")}`);
    }
  }

  return parts.join("\n");
}
```

---

## Migration from Current Identity

Current `identity.js`:
```javascript
export const identity = {
  core: `
Senior PM at fintech company.
Building side projects toward financial independence.
Technical: React, Next.js, TypeScript.
Based in Miami, planning Portugal relocation.
Style: direct, concise, no fluff.
  `.trim(),
};
```

Maps to new schema:
```json
{
  "meta": { "version": "1.0.0", "lastModified": "...", "deviceId": "..." },
  "core": {
    "role": "Senior PM at fintech company",
    "location": "Miami (planning Portugal relocation)",
    "background": "Building side projects toward financial independence"
  },
  "communication": {
    "style": ["direct", "concise"],
    "format": [],
    "avoid": ["fluff"]
  },
  "expertise": ["React", "Next.js", "TypeScript"],
  "currentFocus": { "projects": [], "goals": ["financial independence"] },
  "context": { "personal": [], "professional": ["fintech"] },
  "privacy": { "public": [], "private": [], "localOnly": [] },
  "custom": {},
  "sources": []
}
```
