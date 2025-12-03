import { AreteIdentity, AreteIdentitySchema, createEmptyIdentity } from "../schema/identity.js";
import { buildExtractionPrompt } from "./prompts.js";

/**
 * LLM provider interface for extraction
 */
export interface LLMProvider {
  complete(prompt: string): Promise<string>;
}

/**
 * Result of identity extraction
 */
export interface ExtractionResult {
  identity: AreteIdentity;
  rawResponse: string;
  success: boolean;
  error?: string;
}

/**
 * Extract identity from prose text using an LLM
 */
export async function extractIdentityFromText(
  text: string,
  provider: LLMProvider,
  deviceId: string
): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt(text);

  try {
    const response = await provider.complete(prompt);
    const parsed = parseExtractionResponse(response, deviceId);

    return {
      identity: parsed,
      rawResponse: response,
      success: true,
    };
  } catch (error) {
    return {
      identity: createEmptyIdentity(deviceId),
      rawResponse: "",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Parse the LLM response and merge into identity schema
 */
function parseExtractionResponse(
  response: string,
  deviceId: string
): AreteIdentity {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }

  const extracted = JSON.parse(jsonMatch[0]);

  // Build full identity with extracted data
  const identity: AreteIdentity = {
    meta: {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      deviceId,
    },
    core: {
      name: extracted.core?.name || undefined,
      role: extracted.core?.role || undefined,
      location: extracted.core?.location || undefined,
      background: extracted.core?.background || undefined,
    },
    communication: {
      style: extracted.communication?.style || [],
      format: extracted.communication?.format || [],
      avoid: extracted.communication?.avoid || [],
      voice: extracted.communication?.voice || undefined,
    },
    expertise: extracted.expertise || [],
    currentFocus: {
      projects: (extracted.currentFocus?.projects || []).map((p: any) => ({
        name: p.name || "",
        description: p.description || "",
        status: p.status || "active",
      })),
      goals: extracted.currentFocus?.goals || [],
    },
    context: {
      personal: extracted.context?.personal || [],
      professional: extracted.context?.professional || [],
    },
    privacy: {
      public: [],
      private: [],
      localOnly: [],
    },
    custom: {},
    sources: [
      {
        field: "all",
        source: "user_input",
        confidence: "high",
        timestamp: new Date().toISOString(),
      },
    ],
  };

  // Validate with Zod
  return AreteIdentitySchema.parse(identity);
}

/**
 * Merge new extracted data into existing identity
 */
export function mergeIdentity(
  existing: AreteIdentity,
  extracted: Partial<AreteIdentity>
): AreteIdentity {
  return {
    ...existing,
    meta: {
      ...existing.meta,
      lastModified: new Date().toISOString(),
    },
    core: {
      ...existing.core,
      ...extracted.core,
    },
    communication: {
      style: [
        ...new Set([
          ...(existing.communication.style || []),
          ...(extracted.communication?.style || []),
        ]),
      ],
      format: [
        ...new Set([
          ...(existing.communication.format || []),
          ...(extracted.communication?.format || []),
        ]),
      ],
      avoid: [
        ...new Set([
          ...(existing.communication.avoid || []),
          ...(extracted.communication?.avoid || []),
        ]),
      ],
      voice: extracted.communication?.voice || existing.communication.voice,
    },
    expertise: [
      ...new Set([
        ...existing.expertise,
        ...(extracted.expertise || []),
      ]),
    ],
    currentFocus: {
      projects: [
        ...existing.currentFocus.projects,
        ...(extracted.currentFocus?.projects || []),
      ],
      goals: [
        ...new Set([
          ...existing.currentFocus.goals,
          ...(extracted.currentFocus?.goals || []),
        ]),
      ],
    },
    context: {
      personal: [
        ...new Set([
          ...existing.context.personal,
          ...(extracted.context?.personal || []),
        ]),
      ],
      professional: [
        ...new Set([
          ...existing.context.professional,
          ...(extracted.context?.professional || []),
        ]),
      ],
    },
    privacy: existing.privacy,
    custom: {
      ...existing.custom,
      ...extracted.custom,
    },
    sources: [
      ...existing.sources,
      ...(extracted.sources || []),
    ],
  };
}
