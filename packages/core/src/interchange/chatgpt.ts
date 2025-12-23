/**
 * ChatGPT Custom Instructions Import
 *
 * Parses ChatGPT custom instructions (prose) into structured IdentityFacts.
 * Uses LLM extraction to understand the unstructured input.
 */

import {
  createIdentityFact,
  type IdentityFact,
  type FactCategory,
} from "../schema/identity-v2.js";
import { buildExtractionPromptV2 } from "../extraction/prompts.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * LLM provider function type
 * Takes a prompt and returns the LLM response
 */
export type LLMProvider = (prompt: string) => Promise<string>;

/**
 * Extracted identity structure (v1-style)
 * Matches the output format of IDENTITY_EXTRACTION_PROMPT_V2
 */
export interface ExtractedIdentity {
  core: {
    name?: string;
    role?: string;
    location?: string;
    background?: string;
  };
  communication: {
    style: string[];
    format: string[];
    avoid: string[];
  };
  expertise: string[];
  currentFocus: {
    projects: Array<{ name: string; description: string; status: string }>;
    goals: string[];
  };
  context: {
    personal: string[];
    professional: string[];
  };
}

/**
 * Result of ChatGPT import
 */
export interface ChatGPTImportResult {
  success: boolean;
  facts: IdentityFact[];
  core?: {
    name?: string;
    role?: string;
    location?: string;
    background?: string;
  };
  error?: string;
}

// ============================================================================
// PARSING
// ============================================================================

/**
 * Convert extracted identity (v1-style) to facts array
 */
export function parseExtractionResponse(extracted: ExtractedIdentity): IdentityFact[] {
  const facts: IdentityFact[] = [];

  // Helper to create imported fact with consistent settings
  const createImportedFact = (category: FactCategory, content: string): IdentityFact => {
    const fact = createIdentityFact({
      category,
      content,
      source: "imported",
      confidence: 0.8, // High but not proven
      visibility: "trusted",
    });
    // Override maturity to established (imported = some trust)
    return {
      ...fact,
      maturity: "established",
      validationCount: 2,
    };
  };

  // Extract expertise
  for (const skill of extracted.expertise ?? []) {
    if (skill.trim()) {
      facts.push(createImportedFact("expertise", skill));
    }
  }

  // Extract communication style as preferences
  for (const style of extracted.communication?.style ?? []) {
    if (style.trim()) {
      facts.push(createImportedFact("preference", `Communication style: ${style}`));
    }
  }

  // Extract format preferences
  for (const format of extracted.communication?.format ?? []) {
    if (format.trim()) {
      facts.push(createImportedFact("preference", `Prefers: ${format}`));
    }
  }

  // Extract avoid preferences
  for (const avoid of extracted.communication?.avoid ?? []) {
    if (avoid.trim()) {
      facts.push(createImportedFact("preference", `Avoid: ${avoid}`));
    }
  }

  // Extract projects as focus
  for (const project of extracted.currentFocus?.projects ?? []) {
    if (project.name?.trim()) {
      const desc = project.description ? ` - ${project.description}` : "";
      const status = project.status ? ` (${project.status})` : "";
      facts.push(createImportedFact("focus", `Project: ${project.name}${desc}${status}`));
    }
  }

  // Extract goals as focus
  for (const goal of extracted.currentFocus?.goals ?? []) {
    if (goal.trim()) {
      facts.push(createImportedFact("focus", `Goal: ${goal}`));
    }
  }

  // Extract personal context
  for (const item of extracted.context?.personal ?? []) {
    if (item.trim()) {
      facts.push(createImportedFact("context", item));
    }
  }

  // Extract professional context
  for (const item of extracted.context?.professional ?? []) {
    if (item.trim()) {
      facts.push(createImportedFact("context", item));
    }
  }

  return facts;
}

// ============================================================================
// IMPORT
// ============================================================================

/**
 * Import ChatGPT custom instructions to IdentityFacts
 *
 * @param instructions - ChatGPT custom instructions (prose text)
 * @param llmProvider - Function to call LLM for extraction
 * @returns Import result with facts array
 */
export async function importFromChatGPT(
  instructions: string,
  llmProvider: LLMProvider
): Promise<ChatGPTImportResult> {
  try {
    // Build extraction prompt
    const prompt = buildExtractionPromptV2(instructions);

    // Call LLM to extract structured data
    const response = await llmProvider(prompt);

    // Parse JSON response
    let extracted: ExtractedIdentity;
    try {
      extracted = JSON.parse(response);
    } catch {
      return {
        success: false,
        facts: [],
        error: `Failed to parse LLM response as JSON: ${response.slice(0, 100)}...`,
      };
    }

    // Convert to facts
    const facts = parseExtractionResponse(extracted);

    return {
      success: true,
      facts,
      core: extracted.core,
    };
  } catch (error) {
    return {
      success: false,
      facts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
