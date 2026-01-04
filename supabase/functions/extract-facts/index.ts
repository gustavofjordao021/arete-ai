/**
 * Extract Facts Edge Function
 *
 * Extracts durable identity facts from conversation transcripts using Claude Haiku.
 * Users don't need their own API keys - Arete provides this as a service.
 *
 * POST /functions/v1/extract-facts
 * Headers:
 *   Authorization: Bearer <anon_key>
 *   X-API-Key: <user_api_key>
 * Body:
 *   { transcript: string }
 * Response:
 *   { facts: ExtractedFact[], model: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HAIKU_MODEL = "claude-3-haiku-20240307";

// Rate limit: 50 extractions per user per day
const DAILY_LIMIT = 50;

interface ExtractedFact {
  category: "core" | "expertise" | "preference" | "context" | "focus";
  content: string;
  confidence: number;
  reasoning?: string;
}

interface ExtractionRequest {
  transcript: string;
}

interface ExtractionResponse {
  facts: ExtractedFact[];
  model: string;
}

interface ErrorResponse {
  error: string;
  code?: string;
}

/**
 * Validate API key and get user ID
 */
async function validateApiKey(apiKey: string): Promise<string | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("api_keys")
    .select("user_id, is_active")
    .eq("key_hash", await hashKey(apiKey))
    .single();

  if (error || !data || !data.is_active) {
    return null;
  }

  return data.user_id;
}

/**
 * Hash API key for lookup
 */
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Check and update rate limit
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().split("T")[0];

  // Get or create usage record for today
  const { data: usage } = await supabase
    .from("usage")
    .select("extraction_count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  const currentCount = usage?.extraction_count || 0;

  if (currentCount >= DAILY_LIMIT) {
    return false;
  }

  // Increment count
  await supabase.from("usage").upsert(
    {
      user_id: userId,
      date: today,
      extraction_count: currentCount + 1,
    },
    { onConflict: "user_id,date" }
  );

  return true;
}

/**
 * Extraction prompt for Haiku
 */
const EXTRACTION_PROMPT = `You are an identity extraction system. Analyze this conversation transcript and extract DURABLE facts about the user that would be useful in FUTURE conversations.

EXTRACT these categories:
- core: Name, role, company, location
- expertise: Skills, technologies, experience level
- preference: Communication style, tool preferences
- context: Work environment, constraints, team
- focus: Current projects, learning goals

RULES:
1. Only extract facts explicitly stated or strongly implied
2. Skip ephemeral information (today's task, current bug)
3. Skip generic preferences everyone has
4. Confidence: 1.0 for explicit statements, 0.7-0.9 for implied
5. Keep facts concise (under 50 characters)

Return JSON array of facts:
[
  {"category": "core", "content": "Senior engineer at Acme", "confidence": 1.0},
  {"category": "expertise", "content": "Expert in React and TypeScript", "confidence": 0.9}
]

If no durable facts found, return empty array: []

TRANSCRIPT:
`;

/**
 * Extract facts using Claude Haiku
 */
async function extractFacts(transcript: string): Promise<ExtractedFact[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("Anthropic API key not configured");
  }

  // Truncate transcript if too long
  const truncatedTranscript = transcript.slice(0, 50000);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: EXTRACTION_PROMPT + truncatedTranscript,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || "[]";

  // Parse JSON from response
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    const facts = JSON.parse(jsonMatch[0]) as ExtractedFact[];

    // Validate and filter facts
    return facts.filter(
      (f) =>
        f.category &&
        f.content &&
        typeof f.confidence === "number" &&
        ["core", "expertise", "preference", "context", "focus"].includes(f.category)
    );
  } catch {
    console.error("Failed to parse Haiku response:", content);
    return [];
  }
}

serve(async (req: Request) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" } as ErrorResponse),
      { status: 405, headers }
    );
  }

  try {
    // Validate API key
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing API key", code: "missing_api_key" } as ErrorResponse),
        { status: 401, headers }
      );
    }

    const userId = await validateApiKey(apiKey);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Invalid API key", code: "invalid_api_key" } as ErrorResponse),
        { status: 401, headers }
      );
    }

    // Check rate limit
    const withinLimit = await checkRateLimit(userId);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({
          error: `Daily limit of ${DAILY_LIMIT} extractions exceeded`,
          code: "rate_limit_exceeded",
        } as ErrorResponse),
        { status: 429, headers }
      );
    }

    // Parse request
    const body = (await req.json()) as ExtractionRequest;
    if (!body.transcript || typeof body.transcript !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'transcript' field" } as ErrorResponse),
        { status: 400, headers }
      );
    }

    // Extract facts
    const facts = await extractFacts(body.transcript);

    const response: ExtractionResponse = {
      facts,
      model: HAIKU_MODEL,
    };

    return new Response(JSON.stringify(response), { status: 200, headers });
  } catch (error) {
    console.error("Extraction error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      } as ErrorResponse),
      { status: 500, headers }
    );
  }
});
