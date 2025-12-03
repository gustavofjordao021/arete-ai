export { BaseTransform, type IdentityTransform, type TransformOptions, type TransformResult } from "./base.js";
export { ClaudeTransform, createClaudeTransform } from "./claude.js";
export { OpenAITransform, createOpenAITransform } from "./openai.js";

import { IdentityTransform } from "./base.js";
import { ClaudeTransform } from "./claude.js";
import { OpenAITransform } from "./openai.js";

/**
 * Registry of available transforms
 */
const transforms = new Map<string, () => IdentityTransform>();
transforms.set("claude", () => new ClaudeTransform());
transforms.set("openai", () => new OpenAITransform());
transforms.set("gpt", () => new OpenAITransform()); // Alias

/**
 * Get a transform by model ID
 */
export function getTransform(modelId: string): IdentityTransform | null {
  const factory = transforms.get(modelId.toLowerCase());
  return factory ? factory() : null;
}

/**
 * List available transform IDs
 */
export function listTransforms(): string[] {
  return Array.from(transforms.keys());
}
