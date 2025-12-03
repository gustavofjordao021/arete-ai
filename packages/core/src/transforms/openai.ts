import { AreteIdentity } from "../schema/identity.js";
import { BaseTransform, TransformOptions, TransformResult } from "./base.js";

/**
 * OpenAI-optimized transform using markdown format
 *
 * GPT models work well with markdown-structured prompts.
 * Uses headers and lists for clear organization.
 */
export class OpenAITransform extends BaseTransform {
  readonly modelId = "openai";
  readonly modelName = "OpenAI GPT";

  transform(identity: AreteIdentity, options?: TransformOptions): TransformResult {
    const sections: string[] = [];
    const includedSections: string[] = [];

    // Header
    sections.push("## User Profile\n");

    // Core identity
    if (this.includeSection("core", options) && this.hasContent(identity.core)) {
      const coreContent = this.formatCore(identity);
      if (coreContent) {
        sections.push(`### Identity\n${coreContent}`);
        includedSections.push("core");
      }
    }

    // Communication preferences
    if (this.includeSection("communication", options) && this.hasContent(identity.communication)) {
      const commContent = this.formatCommunication(identity);
      if (commContent) {
        sections.push(`### Communication Preferences\n${commContent}`);
        includedSections.push("communication");
      }
    }

    // Expertise
    if (this.includeSection("expertise", options) && identity.expertise.length > 0) {
      sections.push(`### Areas of Expertise\n${this.formatList(identity.expertise)}`);
      includedSections.push("expertise");
    }

    // Current focus
    if (this.includeSection("focus", options) && this.hasContent(identity.currentFocus)) {
      const focusContent = this.formatFocus(identity);
      if (focusContent) {
        sections.push(`### Current Focus\n${focusContent}`);
        includedSections.push("focus");
      }
    }

    // Context
    if (this.includeSection("context", options) && this.hasContent(identity.context)) {
      const contextContent = this.formatContext(identity);
      if (contextContent) {
        sections.push(`### Context\n${contextContent}`);
        includedSections.push("context");
      }
    }

    const content = sections.join("\n\n");

    return {
      content,
      estimatedTokens: this.estimateTokens(content),
      includedSections,
    };
  }

  private formatCore(identity: AreteIdentity): string {
    const lines: string[] = [];
    const { core } = identity;

    if (core.name) lines.push(`**Name:** ${core.name}`);
    if (core.role) lines.push(`**Role:** ${core.role}`);
    if (core.location) lines.push(`**Location:** ${core.location}`);
    if (core.background) lines.push(`**Background:** ${core.background}`);

    return lines.join("\n");
  }

  private formatCommunication(identity: AreteIdentity): string {
    const sections: string[] = [];
    const { communication } = identity;

    if (communication.voice) {
      sections.push(`**Preferred voice:** ${communication.voice}`);
    }

    if (communication.style.length > 0) {
      sections.push(`**Style:**\n${this.formatList(communication.style)}`);
    }

    if (communication.format.length > 0) {
      sections.push(`**Format:**\n${this.formatList(communication.format)}`);
    }

    if (communication.avoid.length > 0) {
      sections.push(`**Avoid:**\n${this.formatList(communication.avoid)}`);
    }

    return sections.join("\n\n");
  }

  private formatFocus(identity: AreteIdentity): string {
    const sections: string[] = [];
    const { currentFocus } = identity;

    if (currentFocus.projects.length > 0) {
      const projectLines = currentFocus.projects.map(p => {
        const status = p.status !== "active" ? ` _(${p.status})_` : "";
        return `- **${p.name}**${status}: ${p.description}`;
      });
      sections.push(`**Projects:**\n${projectLines.join("\n")}`);
    }

    if (currentFocus.goals.length > 0) {
      sections.push(`**Goals:**\n${this.formatList(currentFocus.goals)}`);
    }

    return sections.join("\n\n");
  }

  private formatContext(identity: AreteIdentity): string {
    const sections: string[] = [];
    const { context } = identity;

    if (context.professional.length > 0) {
      sections.push(`**Professional:**\n${this.formatList(context.professional)}`);
    }

    if (context.personal.length > 0) {
      sections.push(`**Personal:**\n${this.formatList(context.personal)}`);
    }

    return sections.join("\n\n");
  }
}

/**
 * Create an OpenAI transform instance
 */
export function createOpenAITransform(): OpenAITransform {
  return new OpenAITransform();
}
