#!/usr/bin/env node
/**
 * extract-facts.mts
 *
 * Hook script for Claude Code that extracts durable facts from conversation
 * transcripts and persists them to ~/.arete/identity.json
 *
 * Called by PreCompact and SessionEnd hooks.
 *
 * Usage: node extract-facts.mjs <transcript_path> <event_type>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import {
  createIdentityFact,
  createCLIClient,
  loadConfig,
  type IdentityV2,
  type IdentityFact,
  type FactCategory,
  type Visibility,
  type CLIClient,
} from "@arete/core";

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const EXTRACTION_MODEL = "claude-3-haiku-20240307";
const CONFIG_DIR = join(homedir(), ".arete");
const IDENTITY_FILE = join(CONFIG_DIR, "identity.json");
const EXTRACTION_LOG = join(CONFIG_DIR, "extraction.log");

// Cloud client (lazily initialized)
let cloudClient: CLIClient | null = null;

function getCloudClient(): CLIClient | null {
  if (cloudClient) return cloudClient;

  const config = loadConfig();
  if (config.apiKey && config.supabaseUrl) {
    cloudClient = createCLIClient({
      supabaseUrl: config.supabaseUrl,
      apiKey: config.apiKey,
    });
    return cloudClient;
  }

  return null;
}

// ============================================================================
// TRANSCRIPT PARSING
// ============================================================================

interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

interface TranscriptEntry {
  type: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
  content?: string | Array<{ type: string; text?: string }>;
}

export function parseTranscript(transcriptPath: string): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry;

        // Handle different transcript entry formats
        if (entry.type === "user" || entry.type === "assistant") {
          const messageContent = extractTextContent(entry.content || entry.message?.content);
          if (messageContent) {
            messages.push({
              role: entry.type as "user" | "assistant",
              content: messageContent,
            });
          }
        } else if (entry.message?.role === "user" || entry.message?.role === "assistant") {
          const messageContent = extractTextContent(entry.message.content);
          if (messageContent) {
            messages.push({
              role: entry.message.role as "user" | "assistant",
              content: messageContent,
            });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch (error) {
    log(`Error reading transcript: ${error}`);
  }

  return messages;
}

function extractTextContent(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === "text" && c.text)
      .map(c => c.text)
      .join("\n");
  }
  return "";
}

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

export function buildConversationExtractionPrompt(messages: TranscriptMessage[]): string {
  const conversation = messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n\n");

  return `<task>
Extract DURABLE identity facts from this conversation. Focus on facts that would be useful in FUTURE conversations with this user.
</task>

<conversation>
${conversation}
</conversation>

<extraction_rules>
1. DURABLE facts only - things useful in FUTURE conversations:

   PERSONAL facts:
   - Role, job, company (not today's tasks)
   - Skills and expertise (not one-off code fixes)
   - Preferences and communication style (not temporary requests)
   - Location, background, constraints (not current context)
   - Learning goals (ongoing, not completed)

   PROJECT/STRATEGIC facts (equally important!):
   - Strategic pivots or architectural shifts discovered
   - Key architectural decisions and their rationale
   - Important constraints or requirements
   - Technology choices and why they were made

   Test: Would a future AI benefit from knowing this?

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
   - "trusted": Needs discretion (company info, specific projects, strategic decisions)
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

// ============================================================================
// HAIKU EXTRACTION
// ============================================================================

export interface ExtractedFact {
  category: FactCategory;
  content: string;
  confidence: number;
  visibility: Visibility;
  evidence?: string;
}

/**
 * Extract facts using cloud API (preferred) or local Anthropic (fallback)
 */
async function extractFacts(
  messages: TranscriptMessage[],
  localApiKey?: string
): Promise<ExtractedFact[]> {
  if (messages.length < 2) {
    log("Conversation too short for meaningful extraction");
    return [];
  }

  // Build transcript string for cloud API
  const transcript = messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n\n");

  // Try cloud first (uses server-side API keys)
  const client = getCloudClient();
  if (client) {
    try {
      log("Extracting via cloud API...");
      const result = await client.extractFacts(transcript);
      log(`Cloud extraction returned ${result.facts.length} facts (model: ${result.model})`);

      // Map cloud facts to our ExtractedFact format
      return result.facts.map(f => ({
        category: validateCategory(f.category),
        content: f.content,
        confidence: Math.max(0, Math.min(1, f.confidence)),
        visibility: "trusted" as Visibility, // Cloud API doesn't return visibility
        evidence: f.reasoning,
      }));
    } catch (error) {
      log(`Cloud extraction failed: ${error}, trying local fallback...`);
    }
  }

  // Fallback to local Anthropic API
  if (localApiKey) {
    return extractFactsWithLocalHaiku(messages, localApiKey);
  }

  log("No extraction method available (no cloud auth, no local API key)");
  return [];
}

/**
 * Extract facts using local Anthropic API (fallback)
 */
async function extractFactsWithLocalHaiku(
  messages: TranscriptMessage[],
  apiKey: string
): Promise<ExtractedFact[]> {
  const prompt = buildConversationExtractionPrompt(messages);

  try {
    log("Extracting via local Anthropic API...");
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
      const errorText = await response.text();
      log(`Local Haiku API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content?.[0]?.text;
    if (!text) {
      log("Empty response from local Haiku");
      return [];
    }

    // Parse JSON response
    const parsed = JSON.parse(text) as ExtractedFact[];

    // Validate and normalize
    return parsed.map(f => ({
      category: validateCategory(f.category),
      content: f.content,
      confidence: Math.max(0, Math.min(1, f.confidence)),
      visibility: validateVisibility(f.visibility),
      evidence: f.evidence,
    }));
  } catch (error) {
    log(`Local extraction error: ${error}`);
    return [];
  }
}

function validateCategory(category: string): FactCategory {
  const valid: FactCategory[] = ["core", "expertise", "preference", "context", "focus"];
  return valid.includes(category as FactCategory) ? (category as FactCategory) : "context";
}

function validateVisibility(visibility: string): Visibility {
  const valid: Visibility[] = ["public", "trusted", "local"];
  return valid.includes(visibility as Visibility) ? (visibility as Visibility) : "trusted";
}

// ============================================================================
// IDENTITY MANAGEMENT
// ============================================================================

function loadIdentity(): IdentityV2 {
  if (!existsSync(IDENTITY_FILE)) {
    return createEmptyIdentity();
  }

  try {
    const data = readFileSync(IDENTITY_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed.version === "2.0.0" && Array.isArray(parsed.facts)) {
      return parsed;
    }
    return createEmptyIdentity();
  } catch {
    return createEmptyIdentity();
  }
}

function createEmptyIdentity(): IdentityV2 {
  return {
    version: "2.0.0",
    deviceId: `device-${Date.now()}`,
    facts: [],
    core: {},
    settings: {
      decayHalfLifeDays: 60,
      autoInfer: true,
      excludedDomains: [],
      autoPromote: true,
      useHaikuClassification: true,
    },
  };
}

function saveIdentity(identity: IdentityV2): void {
  const dir = dirname(IDENTITY_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2));
}

// ============================================================================
// DEDUPLICATION (Jaro-Winkler similarity)
// ============================================================================

export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();

  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);

    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler modification
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export function isDuplicate(
  newFact: ExtractedFact,
  existingFacts: IdentityFact[]
): boolean {
  return existingFacts.some(existing =>
    existing.category === newFact.category &&
    jaroWinklerSimilarity(existing.content, newFact.content) > 0.85
  );
}

// ============================================================================
// LOGGING
// ============================================================================

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  try {
    const dir = dirname(EXTRACTION_LOG);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Append to log file
    const existingLog = existsSync(EXTRACTION_LOG) ? readFileSync(EXTRACTION_LOG, "utf-8") : "";
    writeFileSync(EXTRACTION_LOG, existingLog + logLine);
  } catch {
    // Fallback to stderr
    console.error(logLine);
  }
}

// ============================================================================
// MAIN FUNCTION (exported for CLI use)
// ============================================================================

export async function runExtraction(transcriptPath: string, eventType: string = "unknown"): Promise<void> {
  log(`=== Extraction triggered by ${eventType} ===`);

  if (!transcriptPath) {
    log("Error: No transcript path provided");
    return;
  }

  // Get local API key from environment or config (fallback only)
  let localApiKey = process.env.ANTHROPIC_API_KEY;

  if (!localApiKey) {
    // Try loading from .env in project root
    try {
      const envPath = join(process.cwd(), ".env");
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, "utf-8");
        const match = envContent.match(/ANTHROPIC_API_KEY=["']?([^"'\n]+)["']?/);
        if (match) {
          localApiKey = match[1];
        }
      }
    } catch {
      // Ignore .env errors
    }
  }

  // Also try ~/.arete/.env
  if (!localApiKey) {
    try {
      const areteEnvPath = join(CONFIG_DIR, ".env");
      if (existsSync(areteEnvPath)) {
        const envContent = readFileSync(areteEnvPath, "utf-8");
        const match = envContent.match(/ANTHROPIC_API_KEY=["']?([^"'\n]+)["']?/);
        if (match) {
          localApiKey = match[1];
        }
      }
    } catch {
      // Ignore .env errors
    }
  }

  // Check if we have any extraction method available
  const hasCloudClient = getCloudClient() !== null;
  if (!hasCloudClient && !localApiKey) {
    log("Error: No extraction method available (no cloud auth, no ANTHROPIC_API_KEY)");
    log("Run 'npx arete-mcp-server setup' to configure cloud auth, or set ANTHROPIC_API_KEY for local extraction");
    return;
  }

  // Parse transcript
  log(`Parsing transcript: ${transcriptPath}`);
  const messages = parseTranscript(transcriptPath);
  log(`Found ${messages.length} messages`);

  if (messages.length < 2) {
    log("Not enough messages for extraction");
    return;
  }

  // Extract facts (cloud-first, local fallback)
  const extractedFacts = await extractFacts(messages, localApiKey);
  log(`Extracted ${extractedFacts.length} facts`);

  if (extractedFacts.length === 0) {
    log("No facts extracted");
    return;
  }

  // Load existing identity
  const identity = loadIdentity();

  // Merge with deduplication
  let added = 0;
  for (const fact of extractedFacts) {
    if (!isDuplicate(fact, identity.facts)) {
      const newFact = createIdentityFact({
        category: fact.category,
        content: fact.content,
        source: "inferred",
        confidence: fact.confidence,
        visibility: fact.visibility,
      });
      identity.facts.push(newFact);
      added++;
      log(`Added: [${fact.category}] ${fact.content}`);
    } else {
      log(`Skipped duplicate: ${fact.content}`);
    }
  }

  // Save if any new facts
  if (added > 0) {
    saveIdentity(identity);
    log(`Saved ${added} new facts (total: ${identity.facts.length})`);
  } else {
    log("No new facts to save");
  }

  log("=== Extraction complete ===\n");
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

// Run if called directly
if (process.argv[1]?.endsWith("extract-facts.mts") || process.argv[1]?.endsWith("extract-facts.mjs")) {
  const [, , transcriptPath, eventType] = process.argv;
  runExtraction(transcriptPath, eventType).catch(error => {
    log(`Fatal error: ${error}`);
    process.exit(1);
  });
}
