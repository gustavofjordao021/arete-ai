/**
 * Prompt for extracting structured identity from prose input
 */
export const IDENTITY_EXTRACTION_PROMPT = `You are an identity extraction system. Given user-provided text describing themselves, extract structured identity information.

Extract the following categories (omit if not present):

CORE:
- name: User's name if mentioned
- role: Job title and company
- location: Where they're based
- background: Brief summary of professional/personal background (max 100 words)

COMMUNICATION:
- style: How they prefer to communicate (e.g., direct, formal, casual, concise)
- format: Preferred response format (e.g., prose, bullets, detailed, minimal)
- avoid: Things they don't want in responses (e.g., emojis, fluff, disclaimers)

EXPERTISE:
- List of domains/skills they're knowledgeable in

CURRENT FOCUS:
- projects: Active projects with name, description, and status (active/paused/completed)
- goals: Current goals they're working toward

CONTEXT:
- personal: Personal interests, lifestyle details
- professional: Professional context beyond role

Preserve the user's voice when capturing communication style.
Be concise — each field should be the minimum needed to capture the essence.

User text:
"""
{input}
"""

Output valid JSON matching this structure (omit empty arrays/objects):
{
  "core": { "name": "", "role": "", "location": "", "background": "" },
  "communication": { "style": [], "format": [], "avoid": [] },
  "expertise": [],
  "currentFocus": { "projects": [], "goals": [] },
  "context": { "personal": [], "professional": [] }
}`;

/**
 * Prompt for extracting facts from conversation
 */
export const FACT_EXTRACTION_PROMPT = `You are a fact extractor. Given a conversation exchange, extract any NEW facts learned about the user.

Rules:
- Only extract CONCRETE facts (not opinions or questions)
- Format as short phrases: "User prefers X", "User works at Y", "User likes Z"
- Return JSON array of strings
- Return empty array [] if no new facts
- Don't repeat facts that would be obvious from context

Conversation:
User: {userMessage}
Assistant: {assistantMessage}

Output JSON array of extracted facts:`;

/**
 * Fill in the extraction prompt with user input
 */
export function buildExtractionPrompt(input: string): string {
  return IDENTITY_EXTRACTION_PROMPT.replace("{input}", input);
}

/**
 * Fill in the fact extraction prompt
 */
export function buildFactExtractionPrompt(
  userMessage: string,
  assistantMessage: string
): string {
  return FACT_EXTRACTION_PROMPT
    .replace("{userMessage}", userMessage)
    .replace("{assistantMessage}", assistantMessage);
}
