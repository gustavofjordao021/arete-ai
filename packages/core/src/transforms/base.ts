import { AreteIdentity } from "../schema/identity.js";

/**
 * Transform options for controlling output
 */
export interface TransformOptions {
  /** Maximum token budget for the transform output */
  maxTokens?: number;
  /** Which sections to include */
  sections?: ("core" | "communication" | "expertise" | "focus" | "context")[];
  /** Include source attribution */
  includeSources?: boolean;
}

/**
 * Result of a transform operation
 */
export interface TransformResult {
  /** The formatted system prompt content */
  content: string;
  /** Estimated token count */
  estimatedTokens: number;
  /** Which sections were included */
  includedSections: string[];
}

/**
 * Base interface for model-specific transforms
 */
export interface IdentityTransform {
  /** Unique identifier for this transform */
  readonly modelId: string;
  /** Human-readable name */
  readonly modelName: string;

  /**
   * Transform identity into model-specific system prompt format
   */
  transform(identity: AreteIdentity, options?: TransformOptions): TransformResult;

  /**
   * Estimate token count for the transformed output
   */
  estimateTokens(content: string): number;
}

/**
 * Base class with shared transform utilities
 */
export abstract class BaseTransform implements IdentityTransform {
  abstract readonly modelId: string;
  abstract readonly modelName: string;

  abstract transform(identity: AreteIdentity, options?: TransformOptions): TransformResult;

  /**
   * Simple token estimation (roughly 4 chars per token)
   * Override in subclasses for model-specific tokenization
   */
  estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Filter identity sections based on options
   */
  protected getSections(options?: TransformOptions): string[] {
    return options?.sections || ["core", "communication", "expertise", "focus", "context"];
  }

  /**
   * Check if a section should be included
   */
  protected includeSection(section: string, options?: TransformOptions): boolean {
    const sections = this.getSections(options);
    return sections.includes(section as any);
  }

  /**
   * Format an array of strings as a list
   */
  protected formatList(items: string[], bullet = "-"): string {
    if (!items || items.length === 0) return "";
    return items.map(item => `${bullet} ${item}`).join("\n");
  }

  /**
   * Check if identity has meaningful content in a section
   */
  protected hasContent(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") {
      return Object.values(value).some(v => this.hasContent(v));
    }
    return true;
  }
}
