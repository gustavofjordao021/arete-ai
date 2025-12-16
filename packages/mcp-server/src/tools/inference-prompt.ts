/**
 * Inference Prompt Builder - Phase 2
 *
 * Builds the Haiku prompt for cross-type context analysis.
 * Haiku does ALL the intelligence - pattern detection, correlation, suggestions.
 */

import type { AggregatedContext, PageVisitSummary } from "./context-aggregator.js";
import type { IdentityFact } from "@arete/core";

// --- Types ---

export interface BlockedFact {
  factId: string;
  content?: string;
  reason?: string;
  blockedAt: string;
}

export interface InferencePromptInput {
  context: AggregatedContext;
  existingFacts: IdentityFact[];
  blockedFacts: BlockedFact[];
}

// --- Formatters ---

function formatPageVisits(visits: PageVisitSummary[]): string {
  if (visits.length === 0) {
    return "None";
  }

  return visits
    .map((v) => {
      const titles = v.titles.length > 0 ? ` - Pages: ${v.titles.slice(0, 3).join(", ")}` : "";
      return `- ${v.domain} (${v.count} visits)${titles}`;
    })
    .join("\n");
}

function formatStringList(items: string[], label?: string): string {
  if (items.length === 0) {
    return "None";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function formatExistingFacts(facts: IdentityFact[]): string {
  if (facts.length === 0) {
    return "No existing identity facts.";
  }

  return facts
    .map((f) => `- [${f.category}] "${f.content}" (confidence: ${f.confidence}, maturity: ${f.maturity}, id: ${f.id})`)
    .join("\n");
}

function formatBlockedFacts(blocked: BlockedFact[]): string {
  if (blocked.length === 0) {
    return "None";
  }

  return blocked
    .map((b) => `- "${b.content || b.factId}"${b.reason ? ` (reason: ${b.reason})` : ""}`)
    .join("\n");
}

// --- Main Builder ---

/**
 * Build the Haiku prompt for cross-type inference
 */
export function buildInferencePrompt(input: InferencePromptInput): string {
  const { context, existingFacts, blockedFacts } = input;

  return `<task>
Analyze the user's recent activity across ALL context types to identify patterns that reveal expertise, interests, or focus areas. Look for CORRELATIONS across different signal types.
</task>

<existing_identity>
${formatExistingFacts(existingFacts)}
</existing_identity>

<blocked_facts>
${formatBlockedFacts(blockedFacts)}
</blocked_facts>

<recent_context>
<page_visits>
${formatPageVisits(context.pageVisits)}
</page_visits>

<insights>
${formatStringList(context.insights)}
</insights>

<conversations>
${formatStringList(context.conversations)}
</conversations>

<files>
${formatStringList(context.files)}
</files>

<selections>
${formatStringList(context.selections)}
</selections>
</recent_context>

<instructions>
1. Look for PATTERNS across context types, not isolated signals
2. A single site visit is noise; multiple signals pointing to the same theme = pattern
   Example: ro.com visits + health conversations + fitness code = "health/fitness focus"
3. For each candidate fact, cite the supporting signals from different context types
4. Consider reinforcing existing facts if recent activity supports them
5. Consider downgrading existing facts if NO recent activity supports them
6. Do NOT suggest facts that are already in identity (check existing_identity)
7. Do NOT suggest facts that are blocked (check blocked_facts)
8. Categories: "expertise" (skills/tech), "focus" (current projects/hobbies), "preference" (communication style), "context" (personal context)
9. Confidence should reflect signal strength: 0.5-0.6 (weak pattern), 0.7-0.8 (clear pattern), 0.9+ (very strong)
</instructions>

<output_format>
Return ONLY valid JSON with this structure:
{
  "candidates": [
    {
      "content": "descriptive fact about user",
      "category": "expertise|focus|preference|context",
      "confidence": 0.7,
      "signals": ["signal 1 from page_visits", "signal 2 from conversations", "signal 3 from files"],
      "reasoning": "Brief explanation of why these signals indicate this fact"
    }
  ],
  "reinforce": [
    {
      "factId": "existing-fact-id",
      "reason": "Recent activity that supports this existing fact"
    }
  ],
  "downgrade": [
    {
      "factId": "stale-fact-id",
      "reason": "No recent activity related to this fact"
    }
  ]
}

If no candidates/reinforcements/downgrades, return empty arrays.
Return ONLY the JSON, no other text.
</output_format>

<example>
Given:
- page_visits: ro.com (5 visits), whoop.com (3 visits)
- conversations: "discussed supplements", "talked about sleep optimization"
- files: whoop-api.ts, health-tracker.tsx
- existing_identity: "TypeScript" (expertise, 0.9)

Good response:
{
  "candidates": [
    {
      "content": "health and fitness optimization",
      "category": "focus",
      "confidence": 0.75,
      "signals": ["ro.com visits", "whoop.com visits", "supplements conversation", "whoop-api.ts file"],
      "reasoning": "Strong cross-type pattern: health sites + health conversations + health-related code"
    }
  ],
  "reinforce": [
    {
      "factId": "typescript-fact-id",
      "reason": "Recent .ts and .tsx files indicate continued TypeScript usage"
    }
  ],
  "downgrade": []
}
</example>`;
}
