/**
 * LLM Extractor
 *
 * Real Haiku extraction for live benchmarks.
 */

import type { FactCategory } from "./types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const EXTRACTION_MODEL = "claude-3-haiku-20240307";

export interface ExtractedFact {
  category: FactCategory;
  content: string;
  confidence?: number;
}

const VALID_CATEGORIES: FactCategory[] = [
  "core",
  "expertise",
  "preference",
  "context",
  "focus",
];

/**
 * Format transcript to match production prompt format
 * Converts "User: X\nAssistant: Y" to "[USER]: X\n\n[ASSISTANT]: Y"
 */
function formatTranscript(transcript: string): string {
  return transcript
    .replace(/^User:\s*/gm, "[USER]: ")
    .replace(/^Assistant:\s*/gm, "[ASSISTANT]: ")
    .replace(/\n(?!\[)/g, "\n\n"); // Add double newlines between messages
}

/**
 * Build extraction prompt for Haiku
 * EXACT copy of production prompt from extract-facts.ts
 */
export function buildExtractionPrompt(transcript: string): string {
  const conversation = formatTranscript(transcript);

  return `<task>
Extract DURABLE identity facts from this conversation. Focus on facts that would be useful in FUTURE conversations with this user.
</task>

<conversation>
${conversation}
</conversation>

<extraction_rules>
1. DURABLE facts only - things that persist beyond this conversation:
   - Role, job, company (not today's tasks)
   - Skills and expertise (not one-off code fixes)
   - Preferences and communication style (not temporary requests)
   - Location, background, constraints (not current context)
   - Learning goals and projects (ongoing, not completed)

2. SKIP ephemeral content:
   - Specific code being discussed
   - Today's bug or task
   - Temporary files or directories
   - One-off requests

3. Assign confidence based on directness:
   - 1.0: Explicitly stated ("I'm a PM at Stripe")
   - 0.8: Strongly implied ("We use PostgreSQL at work" → Uses PostgreSQL)
   - 0.6: Reasonably inferred ("TypeScript migration" → TypeScript expertise)

4. Assign visibility:
   - "public": Safe for any AI (general preferences, public skills)
   - "trusted": Needs discretion (company info, specific projects)
</extraction_rules>

<categories>
- core: Name, role, seniority, title
- expertise: Skills, technologies, domains
- preference: Communication style, format preferences
- context: Company, team, location, constraints
- focus: Current projects, learning goals
</categories>

<output_format>
Return a JSON array of extracted facts:
[
  {
    "category": "expertise",
    "content": "TypeScript development",
    "confidence": 0.8,
    "visibility": "public",
    "evidence": "Discussed TypeScript migration project"
  }
]

Return ONLY the JSON array, no other text.
If no durable facts can be extracted, return: []
</output_format>`;
}

/**
 * Parse Haiku response into facts array
 */
export function parseHaikuResponse(response: string): ExtractedFact[] {
  try {
    // Try to extract JSON from markdown code blocks
    let jsonStr = response;
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Try to find JSON array in the response
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (!arrayMatch) {
      return [];
    }

    const parsed = JSON.parse(arrayMatch[0]);

    if (!Array.isArray(parsed)) {
      return [];
    }

    // Validate and normalize each fact
    return parsed
      .filter(
        (f: any) =>
          f &&
          typeof f.category === "string" &&
          typeof f.content === "string" &&
          f.content.trim() !== ""
      )
      .map((f: any) => ({
        category: normalizeCategory(f.category),
        content: f.content.trim(),
        confidence: typeof f.confidence === "number" ? f.confidence : 0.8,
      }));
  } catch {
    return [];
  }
}

/**
 * Normalize category to valid FactCategory
 */
function normalizeCategory(category: string): FactCategory {
  const lower = category.toLowerCase();
  if (VALID_CATEGORIES.includes(lower as FactCategory)) {
    return lower as FactCategory;
  }
  return "context"; // Default fallback
}

/**
 * Extract facts from transcript using live Haiku API
 */
export async function extractFactsLive(
  transcript: string,
  apiKey: string
): Promise<ExtractedFact[]> {
  const prompt = buildExtractionPrompt(transcript);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`Haiku API error: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content?.[0]?.text;
    if (!text) {
      return [];
    }

    return parseHaikuResponse(text);
  } catch (error) {
    console.error(`Extraction error: ${error}`);
    return [];
  }
}
