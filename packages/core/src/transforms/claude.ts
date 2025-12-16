import { AreteIdentity } from "../schema/identity.js";
import { BaseTransform, TransformOptions, TransformResult } from "./base.js";

/**
 * Claude-optimized transform using XML tags
 *
 * Claude performs well with structured XML-style context blocks.
 * Uses clear section delimiters for reliable parsing.
 */
export class ClaudeTransform extends BaseTransform {
  readonly modelId = "claude";
  readonly modelName = "Anthropic Claude";

  transform(identity: AreteIdentity, options?: TransformOptions): TransformResult {
    const sections: string[] = [];
    const includedSections: string[] = [];

    // Core identity
    if (this.includeSection("core", options) && this.hasContent(identity.core)) {
      const coreContent = this.formatCore(identity);
      if (coreContent) {
        sections.push(`<user_identity>\n${coreContent}\n</user_identity>`);
        includedSections.push("core");
      }
    }

    // Communication preferences
    if (this.includeSection("communication", options) && this.hasContent(identity.communication)) {
      const commContent = this.formatCommunication(identity);
      if (commContent) {
        sections.push(`<communication_preferences>\n${commContent}\n</communication_preferences>`);
        includedSections.push("communication");
      }
    }

    // Expertise
    if (this.includeSection("expertise", options) && identity.expertise?.length > 0) {
      sections.push(`<user_expertise>\n${this.formatList(identity.expertise)}\n</user_expertise>`);
      includedSections.push("expertise");
    }

    // Current focus
    if (this.includeSection("focus", options) && this.hasContent(identity.currentFocus)) {
      const focusContent = this.formatFocus(identity);
      if (focusContent) {
        sections.push(`<current_focus>\n${focusContent}\n</current_focus>`);
        includedSections.push("focus");
      }
    }

    // Context
    if (this.includeSection("context", options) && this.hasContent(identity.context)) {
      const contextContent = this.formatContext(identity);
      if (contextContent) {
        sections.push(`<user_context>\n${contextContent}\n</user_context>`);
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

    if (core.name) lines.push(`Name: ${core.name}`);
    if (core.role) lines.push(`Role: ${core.role}`);
    if (core.location) lines.push(`Location: ${core.location}`);
    if (core.background) lines.push(`Background: ${core.background}`);

    return lines.join("\n");
  }

  private formatCommunication(identity: AreteIdentity): string {
    const sections: string[] = [];
    const communication = identity.communication;
    if (!communication) return "";

    if (communication.voice) {
      sections.push(`Voice: ${communication.voice}`);
    }

    if (communication.style?.length > 0) {
      sections.push(`Style preferences:\n${this.formatList(communication.style)}`);
    }

    if (communication.format?.length > 0) {
      sections.push(`Format preferences:\n${this.formatList(communication.format)}`);
    }

    if (communication.avoid?.length > 0) {
      sections.push(`Avoid:\n${this.formatList(communication.avoid)}`);
    }

    return sections.join("\n\n");
  }

  private formatFocus(identity: AreteIdentity): string {
    const sections: string[] = [];
    const currentFocus = identity.currentFocus;
    if (!currentFocus) return "";

    if (currentFocus.projects?.length > 0) {
      const projectLines = currentFocus.projects.map(p =>
        `- ${p.name}${p.status !== "active" ? ` (${p.status})` : ""}: ${p.description}`
      );
      sections.push(`Current projects:\n${projectLines.join("\n")}`);
    }

    if (currentFocus.goals?.length > 0) {
      sections.push(`Goals:\n${this.formatList(currentFocus.goals)}`);
    }

    return sections.join("\n\n");
  }

  private formatContext(identity: AreteIdentity): string {
    const sections: string[] = [];
    const context = identity.context;
    if (!context) return "";

    if (context.professional?.length > 0) {
      sections.push(`Professional context:\n${this.formatList(context.professional)}`);
    }

    if (context.personal?.length > 0) {
      sections.push(`Personal context:\n${this.formatList(context.personal)}`);
    }

    return sections.join("\n\n");
  }
}

/**
 * Create a Claude transform instance
 */
export function createClaudeTransform(): ClaudeTransform {
  return new ClaudeTransform();
}
