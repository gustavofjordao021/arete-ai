/**
 * Embeddings Edge Function
 *
 * Generates text embeddings using OpenAI's API with server-side keys.
 * Users don't need their own API keys - Arete provides this as a service.
 *
 * POST /functions/v1/embeddings
 * Headers:
 *   Authorization: Bearer <anon_key>
 *   X-API-Key: <user_api_key>
 * Body:
 *   { text: string, factId?: string }
 * Response:
 *   { embedding: number[], model: string, cached: boolean }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// Rate limit: 100 embeddings per user per day
const DAILY_LIMIT = 100;

interface EmbeddingRequest {
  text: string;
  factId?: string;
}

interface EmbeddingResponse {
  embedding: number[];
  model: string;
  cached: boolean;
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
    .select("embedding_count")
    .eq("user_id", userId)
    .eq("date", today)
    .single();

  const currentCount = usage?.embedding_count || 0;

  if (currentCount >= DAILY_LIMIT) {
    return false;
  }

  // Increment count
  await supabase.from("usage").upsert(
    {
      user_id: userId,
      date: today,
      embedding_count: currentCount + 1,
    },
    { onConflict: "user_id,date" }
  );

  return true;
}

/**
 * Get embedding from OpenAI
 */
async function getEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
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
          error: `Daily limit of ${DAILY_LIMIT} embeddings exceeded`,
          code: "rate_limit_exceeded",
        } as ErrorResponse),
        { status: 429, headers }
      );
    }

    // Parse request
    const body = (await req.json()) as EmbeddingRequest;
    if (!body.text || typeof body.text !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'text' field" } as ErrorResponse),
        { status: 400, headers }
      );
    }

    // Truncate text if too long (OpenAI has token limits)
    const text = body.text.slice(0, 8000);

    // Get embedding
    const embedding = await getEmbedding(text);

    const response: EmbeddingResponse = {
      embedding,
      model: EMBEDDING_MODEL,
      cached: false,
    };

    return new Response(JSON.stringify(response), { status: 200, headers });
  } catch (error) {
    console.error("Embedding error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      } as ErrorResponse),
      { status: 500, headers }
    );
  }
});
