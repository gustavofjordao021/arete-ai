/**
 * arete_infer MCP tool - Inference Engine
 *
 * Extracts candidate facts from local context patterns.
 * Uses cross-type inference to correlate signals across page_visit, insight,
 * conversation, file, and selection events.
 * The "invisible" part: Returns guidance so Claude naturally knows how to present suggestions.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  loadConfig,
  createCLIClient,
  type IdentityV2,
  type IdentityFact,
  type FactCategory,
} from "@arete/core";

// Cross-type inference modules
import { aggregateContext, type ContextEvent as AggContextEvent } from "./context-aggregator.js";
import { buildInferencePrompt } from "./inference-prompt.js";
import {
  parseInferenceResponse,
  type CandidateFact as InferenceCandidateFact,
  type ReinforceAction,
  type DowngradeAction,
} from "./inference-response.js";
import { registerCandidates, getCandidate, removeCandidate, type StoredCandidate } from "./candidate-registry.js";

// Configurable directory (for testing)
let CONFIG_DIR = join(homedir(), ".arete");

export function setConfigDir(dir: string): void {
  CONFIG_DIR = dir;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

function getContextFile(): string {
  return join(CONFIG_DIR, "context.json");
}

function getIdentityFile(): string {
  return join(CONFIG_DIR, "identity.json");
}

function getBlockedFile(): string {
  return join(CONFIG_DIR, "blocked.json");
}

// --- Types ---

interface ContextEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface CandidateFact {
  id: string;
  category: FactCategory;
  content: string;
  confidence: number;
  maturity: "candidate";
  source: "inferred";
  sourceRef?: string;
  visitCount?: number;
}

// Domain categorization types
type DomainType = "tech" | "health" | "sports" | "news" | "shopping" | "finance" | "entertainment" | "general";

interface DomainInfo {
  type: DomainType;
  name: string;
  label?: string; // Custom label override
}

interface BlockedFact {
  factId: string;
  content?: string;
  reason?: string;
  blockedAt: string;
}

// Common domains to ignore (not meaningful for expertise)
const IGNORED_DOMAINS = new Set([
  "google.com",
  "google.co",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "youtube.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "reddit.com",
  "github.com", // Too generic - everyone uses GitHub
  "stackoverflow.com", // Too generic
  "localhost",
  "127.0.0.1",
]);

// Domain categorization - maps domains to their type and readable name
const DOMAIN_INFO: Record<string, DomainInfo> = {
  // Tech/Development
  "supabase.com": { type: "tech", name: "Supabase" },
  "react.dev": { type: "tech", name: "React" },
  "nextjs.org": { type: "tech", name: "Next.js" },
  "typescriptlang.org": { type: "tech", name: "TypeScript" },
  "rust-lang.org": { type: "tech", name: "Rust" },
  "deno.land": { type: "tech", name: "Deno" },
  "nodejs.org": { type: "tech", name: "Node.js" },
  "python.org": { type: "tech", name: "Python" },
  "go.dev": { type: "tech", name: "Go" },
  "vuejs.org": { type: "tech", name: "Vue.js" },
  "angular.io": { type: "tech", name: "Angular" },
  "svelte.dev": { type: "tech", name: "Svelte" },
  "tailwindcss.com": { type: "tech", name: "Tailwind CSS" },
  "prisma.io": { type: "tech", name: "Prisma" },
  "vercel.com": { type: "tech", name: "Vercel" },
  "aws.amazon.com": { type: "tech", name: "AWS" },
  "cloud.google.com": { type: "tech", name: "Google Cloud" },
  "azure.microsoft.com": { type: "tech", name: "Azure" },
  "kubernetes.io": { type: "tech", name: "Kubernetes" },
  "docker.com": { type: "tech", name: "Docker" },
  "modelcontextprotocol.io": { type: "tech", name: "MCP Protocol" },
  "anthropic.com": { type: "tech", name: "Claude/Anthropic" },
  "openai.com": { type: "tech", name: "OpenAI" },
  "docs.rs": { type: "tech", name: "Rust crates" },
  "npmjs.com": { type: "tech", name: "npm packages" },
  "pypi.org": { type: "tech", name: "Python packages" },
  "crates.io": { type: "tech", name: "Rust crates" },

  // Health
  "ro.co": { type: "health", name: "Ro", label: "health & wellness" },
  "webmd.com": { type: "health", name: "WebMD", label: "health information" },
  "mayoclinic.org": { type: "health", name: "Mayo Clinic", label: "health & wellness" },
  "healthline.com": { type: "health", name: "Healthline", label: "health information" },
  "nih.gov": { type: "health", name: "NIH", label: "health research" },

  // Sports
  "espn.com": { type: "sports", name: "ESPN", label: "sports" },
  "ge.globo.com": { type: "sports", name: "Globo Esporte", label: "Brazilian sports" },
  "nba.com": { type: "sports", name: "NBA", label: "basketball" },
  "nfl.com": { type: "sports", name: "NFL", label: "football" },
  "mlb.com": { type: "sports", name: "MLB", label: "baseball" },
  "fifa.com": { type: "sports", name: "FIFA", label: "soccer" },
  "ufc.com": { type: "sports", name: "UFC", label: "MMA" },

  // News
  "nytimes.com": { type: "news", name: "NY Times", label: "news" },
  "washingtonpost.com": { type: "news", name: "Washington Post", label: "news" },
  "bbc.com": { type: "news", name: "BBC", label: "news" },
  "cnn.com": { type: "news", name: "CNN", label: "news" },
  "reuters.com": { type: "news", name: "Reuters", label: "news" },
  "globo.com": { type: "news", name: "Globo", label: "Brazilian news" },
  "uol.com.br": { type: "news", name: "UOL", label: "Brazilian content" },
  "folha.uol.com.br": { type: "news", name: "Folha", label: "Brazilian news" },

  // Shopping
  "amazon.com": { type: "shopping", name: "Amazon", label: "online shopping" },
  "ebay.com": { type: "shopping", name: "eBay", label: "online shopping" },
  "etsy.com": { type: "shopping", name: "Etsy", label: "handmade & vintage" },

  // Finance
  "bloomberg.com": { type: "finance", name: "Bloomberg", label: "finance" },
  "wsj.com": { type: "finance", name: "Wall Street Journal", label: "finance" },
  "cnbc.com": { type: "finance", name: "CNBC", label: "finance" },
  "investopedia.com": { type: "finance", name: "Investopedia", label: "investing" },

  // Entertainment
  "netflix.com": { type: "entertainment", name: "Netflix", label: "streaming" },
  "spotify.com": { type: "entertainment", name: "Spotify", label: "music" },
  "imdb.com": { type: "entertainment", name: "IMDB", label: "movies & TV" },
};

// Keywords that indicate domain type (for unknown domains)
const TYPE_KEYWORDS: Record<DomainType, string[]> = {
  tech: ["docs", "api", "dev", "developer", "documentation", "sdk", "cli", "code", "programming"],
  health: ["health", "medical", "clinic", "hospital", "wellness", "therapy", "medicine"],
  sports: ["sports", "esporte", "futebol", "football", "basketball", "soccer", "nba", "nfl", "game", "match"],
  news: ["news", "noticias", "breaking", "headlines", "journal", "times", "post"],
  shopping: ["shop", "store", "buy", "cart", "product", "deal"],
  finance: ["finance", "invest", "stock", "market", "trading", "bank", "money"],
  entertainment: ["movie", "film", "music", "video", "stream", "watch", "play"],
  general: [],
};

// --- Haiku Integration ---

const HAIKU_MODEL = "claude-3-haiku-20240307";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Cache for Haiku categorization results (persists during session)
const haikusCache = new Map<string, DomainInfo>();

/**
 * Get Anthropic API key from environment
 */
function getAnthropicApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || null;
}

/**
 * Build prompt for Haiku domain categorization
 */
function buildCategorizationPrompt(domain: string, urls: string[], titles: string[]): string {
  return `<task>
Categorize this website domain based on the URLs and page titles provided.
</task>

<domain>${domain}</domain>

<urls>
${urls.slice(0, 5).join("\n")}
</urls>

<titles>
${titles.slice(0, 5).join("\n")}
</titles>

<categories>
- tech: Developer tools, programming languages, frameworks, APIs, cloud services
- health: Healthcare, wellness, medical information, fitness
- sports: Sports news, teams, leagues, athletic content
- news: News sites, journalism, current events
- shopping: E-commerce, retail, online stores
- finance: Banking, investing, financial news
- entertainment: Movies, music, streaming, gaming
- general: Anything else
</categories>

<output_format>
Return ONLY a JSON object with these fields:
- type: one of the categories above
- name: A readable name for this site (e.g., "React", "ESPN", "Amazon")
- label: A brief description for the user's focus (e.g., "React development", "sports", "online shopping")
- category: "expertise" if tech-related, "focus" otherwise
</output_format>

<example>
For domain "supabase.com" with titles ["Supabase Docs", "Database Guide"]:
{"type":"tech","name":"Supabase","label":"Supabase development","category":"expertise"}
</example>

Return ONLY the JSON, no other text.`;
}

/**
 * Call Haiku to categorize a domain
 */
async function categorizeDomainWithHaiku(
  domain: string,
  urls: string[],
  titles: string[],
  apiKey: string
): Promise<DomainInfo | null> {
  try {
    const prompt = buildCategorizationPrompt(domain, urls, titles);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`Haiku API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content?.[0]?.text;
    if (!text) return null;

    // Parse JSON response
    const parsed = JSON.parse(text) as {
      type: DomainType;
      name: string;
      label?: string;
      category?: string;
    };

    return {
      type: parsed.type || "general",
      name: parsed.name || domain,
      label: parsed.label,
    };
  } catch (error) {
    console.error("Haiku categorization failed:", error);
    return null;
  }
}

// --- Helpers ---

function daysSince(timestamp: string): number {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Remove www. prefix
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Infer domain type from URL paths and page titles
 */
function inferDomainType(domain: string, urls: string[], titles: string[]): DomainType {
  // Combine all text for keyword matching
  const allText = [...urls, ...titles].join(" ").toLowerCase();

  // Check keywords for each type (excluding general)
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (type === "general") continue;
    for (const keyword of keywords) {
      if (allText.includes(keyword)) {
        return type as DomainType;
      }
    }
  }

  return "general";
}

/**
 * Get domain info including type and readable name (synchronous, static only)
 */
function getDomainInfo(domain: string, urls: string[] = [], titles: string[] = []): DomainInfo {
  // Check for known mappings (exact match)
  if (DOMAIN_INFO[domain]) {
    return DOMAIN_INFO[domain];
  }

  // Check for subdomain matches (e.g., "docs.example.com" → check "example.com")
  const parts = domain.split(".");
  if (parts.length > 2) {
    const baseDomain = parts.slice(-2).join(".");
    if (DOMAIN_INFO[baseDomain]) {
      return DOMAIN_INFO[baseDomain];
    }
    // Check with subdomain prefix (e.g., "ge.globo.com")
    const fullWithSub = parts.slice(-3).join(".");
    if (DOMAIN_INFO[fullWithSub]) {
      return DOMAIN_INFO[fullWithSub];
    }
  }

  // Infer type from URLs and titles
  const inferredType = inferDomainType(domain, urls, titles);

  // Generate readable name from domain
  const name = domain
    .replace(/\.(com|org|io|dev|net|co|land|br)$/, "")
    .split(/[-.]/)
    .filter(s => s.length > 1) // Filter out single chars
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");

  return { type: inferredType, name };
}

/**
 * Get domain info with Haiku intelligence for unknown domains
 */
async function getDomainInfoWithHaiku(
  domain: string,
  urls: string[] = [],
  titles: string[] = []
): Promise<DomainInfo> {
  // Check cache first
  if (haikusCache.has(domain)) {
    return haikusCache.get(domain)!;
  }

  // Check static mappings (exact match)
  if (DOMAIN_INFO[domain]) {
    return DOMAIN_INFO[domain];
  }

  // Check for subdomain matches
  const parts = domain.split(".");
  if (parts.length > 2) {
    const baseDomain = parts.slice(-2).join(".");
    if (DOMAIN_INFO[baseDomain]) {
      return DOMAIN_INFO[baseDomain];
    }
    const fullWithSub = parts.slice(-3).join(".");
    if (DOMAIN_INFO[fullWithSub]) {
      return DOMAIN_INFO[fullWithSub];
    }
  }

  // Try Haiku for unknown domains
  const apiKey = getAnthropicApiKey();
  if (apiKey) {
    const haikuResult = await categorizeDomainWithHaiku(domain, urls, titles, apiKey);
    if (haikuResult) {
      // Cache the result
      haikusCache.set(domain, haikuResult);
      return haikuResult;
    }
  }

  // Fall back to static inference
  const inferredType = inferDomainType(domain, urls, titles);
  const name = domain
    .replace(/\.(com|org|io|dev|net|co|land|br)$/, "")
    .split(/[-.]/)
    .filter(s => s.length > 1)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");

  return { type: inferredType, name };
}

/**
 * Generate fact content based on domain type
 */
function generateFactContent(info: DomainInfo): string {
  // If there's a custom label, use it
  if (info.label) {
    return info.label;
  }

  // Generate based on type
  switch (info.type) {
    case "tech":
      return `${info.name} development`;
    case "health":
      return "health & wellness";
    case "sports":
      return "sports";
    case "news":
      return "news & current events";
    case "shopping":
      return "online shopping";
    case "finance":
      return "finance & investing";
    case "entertainment":
      return "entertainment";
    case "general":
    default:
      // For unknown general sites, just use the name
      return info.name;
  }
}

/**
 * Determine fact category based on domain type
 */
function getFactCategory(type: DomainType): "expertise" | "focus" {
  // Tech is expertise, everything else is focus
  return type === "tech" ? "expertise" : "focus";
}

/**
 * Simple helper to get readable domain name for activity summary
 */
function getDomainName(domain: string): string {
  const info = getDomainInfo(domain);
  return info.name;
}

function isIdentityV2(identity: unknown): identity is IdentityV2 {
  if (!identity || typeof identity !== "object") return false;
  const obj = identity as Record<string, unknown>;
  return obj.version === "2.0.0" && Array.isArray(obj.facts);
}

/**
 * Get CLI client for cloud operations (if authenticated)
 */
function getCloudClient(): ReturnType<typeof createCLIClient> | null {
  const config = loadConfig();
  if (!config || !config.apiKey || !config.supabaseUrl) {
    return null;
  }
  return createCLIClient({
    supabaseUrl: config.supabaseUrl,
    apiKey: config.apiKey,
  });
}

/**
 * Load context events - tries cloud first, falls back to local
 */
async function loadContextEventsAsync(): Promise<ContextEvent[]> {
  // Try cloud first if authenticated
  const client = getCloudClient();
  if (client) {
    try {
      const cloudEvents = await client.getRecentContext({ limit: 100 });
      if (cloudEvents.length > 0) {
        return cloudEvents.map(e => ({
          id: e.id,
          type: e.type,
          source: e.source,
          timestamp: e.timestamp,
          data: e.data,
        }));
      }
    } catch (err) {
      console.error("Cloud context fetch failed:", err);
      // Fall through to local
    }
  }

  // Fallback to local file
  const contextFile = getContextFile();
  if (!existsSync(contextFile)) {
    return [];
  }

  try {
    const data = readFileSync(contextFile, "utf-8");
    const parsed = JSON.parse(data);

    // Handle both formats:
    // - Flat array: [event1, event2, ...]
    // - Wrapped: {events: [event1, event2, ...]}
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.events && Array.isArray(parsed.events)) {
      return parsed.events;
    }
    return [];
  } catch {
    return [];
  }
}

function loadIdentityFacts(): IdentityFact[] {
  const identityFile = getIdentityFile();
  if (!existsSync(identityFile)) {
    return [];
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    const parsed = JSON.parse(data);
    if (isIdentityV2(parsed)) {
      return parsed.facts;
    }
    return [];
  } catch {
    return [];
  }
}

function loadBlockedFacts(): BlockedFact[] {
  const blockedFile = getBlockedFile();
  if (!existsSync(blockedFile)) {
    return [];
  }

  try {
    const data = readFileSync(blockedFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveBlockedFacts(blocked: BlockedFact[]): void {
  const blockedFile = getBlockedFile();
  writeFileSync(blockedFile, JSON.stringify(blocked, null, 2));
}

function loadIdentityV2ForUpdate(): IdentityV2 | null {
  const identityFile = getIdentityFile();
  if (!existsSync(identityFile)) {
    return null;
  }

  try {
    const data = readFileSync(identityFile, "utf-8");
    const parsed = JSON.parse(data);
    if (isIdentityV2(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveIdentityV2(identity: IdentityV2): void {
  const identityFile = getIdentityFile();
  const dir = join(CONFIG_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(identityFile, JSON.stringify(identity, null, 2));
}

// --- Pattern Analysis ---

/**
 * Collect domain statistics from events (shared helper)
 */
function collectDomainStats(events: ContextEvent[]): {
  domainCounts: Map<string, number>;
  domainUrls: Map<string, string[]>;
  domainTitles: Map<string, string[]>;
} {
  const domainCounts = new Map<string, number>();
  const domainUrls = new Map<string, string[]>();
  const domainTitles = new Map<string, string[]>();

  for (const event of events) {
    if (event.type !== "page_visit") continue;

    const url = event.data.url as string;
    const title = event.data.title as string;
    if (!url) continue;

    const domain = extractDomain(url);
    if (!domain) continue;

    // Skip ignored domains
    if (IGNORED_DOMAINS.has(domain)) continue;

    // Skip if domain is in ignored set (check subdomains too)
    const baseDomain = domain.split(".").slice(-2).join(".");
    if (IGNORED_DOMAINS.has(baseDomain)) continue;

    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);

    const urls = domainUrls.get(domain) ?? [];
    urls.push(url);
    domainUrls.set(domain, urls);

    if (title) {
      const titles = domainTitles.get(domain) ?? [];
      if (!titles.includes(title)) {
        titles.push(title);
      }
      domainTitles.set(domain, titles);
    }
  }

  return { domainCounts, domainUrls, domainTitles };
}

/**
 * Analyze context events for patterns that suggest expertise or interests
 * (Synchronous version - uses static categorization only)
 */
export function analyzeContextForPatterns(events: ContextEvent[]): CandidateFact[] {
  const { domainCounts, domainUrls, domainTitles } = collectDomainStats(events);

  // Convert to candidates (require at least 3 visits for a pattern)
  const candidates: CandidateFact[] = [];

  for (const [domain, count] of domainCounts) {
    if (count < 3) continue;

    const urls = domainUrls.get(domain) ?? [];
    const titles = domainTitles.get(domain) ?? [];

    // Get domain info with type detection (static only)
    const info = getDomainInfo(domain, urls, titles);

    // Generate appropriate content and category
    const content = generateFactContent(info);
    const category = getFactCategory(info.type);

    // Calculate confidence based on visit count
    // 3 visits = 0.5, 5 visits = 0.6, 8+ visits = 0.7+
    const confidence = Math.min(0.8, 0.4 + count * 0.05);

    candidates.push({
      id: crypto.randomUUID(),
      category,
      content,
      confidence,
      maturity: "candidate",
      source: "inferred",
      sourceRef: domain,
      visitCount: count,
    });
  }

  // Sort by confidence (visit count) descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}

/**
 * Analyze context events for patterns with Haiku intelligence
 * (Async version - uses Haiku for unknown domains when API key is set)
 */
export async function analyzeContextForPatternsWithHaiku(events: ContextEvent[]): Promise<CandidateFact[]> {
  const { domainCounts, domainUrls, domainTitles } = collectDomainStats(events);

  // Convert to candidates (require at least 3 visits for a pattern)
  const candidates: CandidateFact[] = [];

  // Get domains that need categorization
  const domainsToProcess = Array.from(domainCounts.entries())
    .filter(([_, count]) => count >= 3);

  // Process domains in parallel (limit to avoid rate limiting)
  const BATCH_SIZE = 3;
  for (let i = 0; i < domainsToProcess.length; i += BATCH_SIZE) {
    const batch = domainsToProcess.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async ([domain, count]) => {
        const urls = domainUrls.get(domain) ?? [];
        const titles = domainTitles.get(domain) ?? [];

        // Get domain info with Haiku (async)
        const info = await getDomainInfoWithHaiku(domain, urls, titles);

        // Generate appropriate content and category
        const content = generateFactContent(info);
        const category = getFactCategory(info.type);

        // Calculate confidence based on visit count
        const confidence = Math.min(0.8, 0.4 + count * 0.05);

        return {
          id: crypto.randomUUID(),
          category,
          content,
          confidence,
          maturity: "candidate" as const,
          source: "inferred" as const,
          sourceRef: domain,
          visitCount: count,
        };
      })
    );

    candidates.push(...results);
  }

  // Sort by confidence (visit count) descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}

// --- Cross-Type Inference (Phase 4) ---

const CROSS_TYPE_HAIKU_MODEL = "claude-3-haiku-20240307";

/**
 * Perform cross-type inference using Haiku to correlate signals
 * across all event types (page_visit, insight, conversation, file, selection)
 */
async function performCrossTypeInference(
  events: ContextEvent[],
  existingFacts: IdentityFact[],
  blockedFacts: BlockedFact[],
  apiKey: string
): Promise<{
  candidates: InferenceCandidateFact[];
  reinforce: ReinforceAction[];
  downgrade: DowngradeAction[];
}> {
  try {
    // Aggregate all context types
    const aggregatedContext = aggregateContext(events as AggContextEvent[]);

    // Build the inference prompt
    const prompt = buildInferencePrompt({
      context: aggregatedContext,
      existingFacts,
      blockedFacts,
    });

    // Call Haiku for cross-type analysis
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CROSS_TYPE_HAIKU_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`Cross-type Haiku API error: ${response.status}`);
      return { candidates: [], reinforce: [], downgrade: [] };
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const text = data.content?.[0]?.text;
    if (!text) {
      return { candidates: [], reinforce: [], downgrade: [] };
    }

    // Parse the response
    const result = parseInferenceResponse(text, existingFacts);

    return {
      candidates: result.candidates,
      reinforce: result.reinforce,
      downgrade: result.downgrade,
    };
  } catch (error) {
    console.error("Cross-type inference failed:", error);
    return { candidates: [], reinforce: [], downgrade: [] };
  }
}

// --- Handler ---

export interface InferInput {
  lookbackDays?: number;
  // Candidate management (processed before inference)
  accept?: string[];  // Candidate IDs to accept
  reject?: Array<{ id: string; reason?: string }>;  // Candidates to reject
}

export interface AcceptedCandidate {
  id: string;
  content: string;
  category: string;
}

export interface RejectedCandidate {
  id: string;
  content: string;
  reason?: string;
}

export interface InferOutput {
  success: boolean;
  candidates: CandidateFact[];
  activitySummary: string[];
  source: "local_context" | "rollup" | "haiku_analysis";
  error?: string;
  guidance?: string;
  // Cross-type inference results (Phase 4)
  reinforce: ReinforceAction[];
  downgrade: DowngradeAction[];
  // Candidate management results
  accepted?: AcceptedCandidate[];
  rejected?: RejectedCandidate[];
}

export interface InferToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: InferOutput;
}

/**
 * Handler for arete_infer tool
 */
export async function inferHandler(input: InferInput): Promise<InferToolResult> {
  const lookbackDays = input.lookbackDays ?? 7;
  const { accept, reject } = input;

  // Track accepted/rejected candidates for response
  const accepted: AcceptedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  // Process accept requests first
  if (accept && accept.length > 0) {
    const identity = loadIdentityV2ForUpdate();
    if (identity) {
      for (const candidateId of accept) {
        const candidate = getCandidate(candidateId);
        if (candidate) {
          // Check for duplicates
          const alreadyExists = identity.facts.some(
            f => f.content.toLowerCase() === candidate.content.toLowerCase()
          );
          if (!alreadyExists) {
            // Add fact to identity
            const newFact = {
              id: crypto.randomUUID(),
              category: candidate.category,
              content: candidate.content,
              confidence: candidate.confidence,
              lastValidated: new Date().toISOString(),
              validationCount: 0,
              maturity: "candidate" as const,
              source: "inferred" as const,
              sourceRef: candidate.sourceRef,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            identity.facts.push(newFact);
            accepted.push({
              id: candidate.id,
              content: candidate.content,
              category: candidate.category,
            });
            // Remove from candidate registry
            removeCandidate(candidateId);
          }
        }
      }
      // Save identity if any were accepted
      if (accepted.length > 0) {
        saveIdentityV2(identity);
      }
    }
  }

  // Process reject requests
  if (reject && reject.length > 0) {
    const blockedFacts = loadBlockedFacts();
    for (const { id, reason } of reject) {
      const candidate = getCandidate(id);
      if (candidate) {
        // Add to blocked list
        blockedFacts.push({
          factId: id,
          content: candidate.content,
          reason: reason,
          blockedAt: new Date().toISOString(),
        });
        rejected.push({
          id: candidate.id,
          content: candidate.content,
          reason,
        });
        // Remove from candidate registry
        removeCandidate(id);
      }
    }
    // Save blocked list if any were rejected
    if (rejected.length > 0) {
      saveBlockedFacts(blockedFacts);
    }
  }

  // Load existing facts and blocked list to filter out
  const existingFacts = loadIdentityFacts();
  const blockedFacts = loadBlockedFacts();

  // Create sets for quick lookup
  const existingContents = new Set(
    existingFacts.map((f) => f.content.toLowerCase())
  );
  const blockedContents = new Set(
    blockedFacts.map((b) => b.content?.toLowerCase()).filter(Boolean)
  );
  const blockedIds = new Set(blockedFacts.map((b) => b.factId));

  // Load and filter context events (from cloud or local)
  const allEvents = await loadContextEventsAsync();
  const recentEvents = allEvents.filter(
    (e) => daysSince(e.timestamp) <= lookbackDays
  );

  // Initialize results
  let candidates: CandidateFact[] = [];
  let reinforce: ReinforceAction[] = [];
  let downgrade: DowngradeAction[] = [];
  let source: "local_context" | "rollup" | "haiku_analysis" = "local_context";

  // Try cross-type inference with Haiku when API key is available
  const apiKey = getAnthropicApiKey();
  if (apiKey) {
    const crossTypeResult = await performCrossTypeInference(
      recentEvents,
      existingFacts,
      blockedFacts,
      apiKey
    );

    // Convert cross-type candidates to CandidateFact format
    if (crossTypeResult.candidates.length > 0) {
      candidates = crossTypeResult.candidates.map((c) => ({
        id: crypto.randomUUID(),
        category: c.category,
        content: c.content,
        confidence: c.confidence,
        maturity: "candidate" as const,
        source: "inferred" as const,
        sourceRef: c.signals.join(", "),
      }));
      source = "haiku_analysis";
    }

    reinforce = crossTypeResult.reinforce;
    downgrade = crossTypeResult.downgrade;
  }

  // Fallback to domain-only analysis if no cross-type candidates
  if (candidates.length === 0) {
    candidates = await analyzeContextForPatternsWithHaiku(recentEvents);
    source = "local_context";
  }

  // Filter out existing and blocked facts
  candidates = candidates.filter((c) => {
    const contentLower = c.content.toLowerCase();

    // Check if already in identity (fuzzy match on content)
    for (const existing of existingContents) {
      if (
        contentLower.includes(existing) ||
        existing.includes(contentLower.replace(" development", ""))
      ) {
        return false;
      }
    }

    // Check if blocked (by ID or content)
    if (blockedIds.has(c.id)) return false;
    for (const blocked of blockedContents) {
      if (blocked && (contentLower.includes(blocked) || blocked.includes(contentLower.replace(" development", "")))) {
        return false;
      }
    }

    return true;
  });

  // Limit to top 5 candidates
  candidates = candidates.slice(0, 5);

  // Register candidates for later acceptance via arete_accept_candidate
  // registerCandidates filters out stale/suppressed candidates
  let filteredCandidates = candidates;
  if (candidates.length > 0) {
    const candidateInputs = candidates.map((c) => ({
      id: c.id,
      category: c.category,
      content: c.content,
      confidence: c.confidence,
      sourceRef: c.sourceRef || "",
      signals: c.sourceRef ? c.sourceRef.split(", ") : [],
      createdAt: new Date().toISOString(),
    }));
    const registered = registerCandidates(candidateInputs);

    // Only return non-stale candidates
    const registeredIds = new Set(registered.map((r) => r.id));
    // Match by content since IDs might differ
    const registeredContents = new Set(
      registered.map((r) => r.content.toLowerCase().trim())
    );
    filteredCandidates = candidates.filter((c) =>
      registeredContents.has(c.content.toLowerCase().trim())
    );
  }

  // Build activity summary from ALL recent events (not just candidates)
  const activityDomains = new Map<string, { count: number; titles: string[] }>();
  for (const event of recentEvents) {
    if (event.type !== "page_visit") continue;
    const url = event.data.url as string;
    const title = event.data.title as string;
    if (!url) continue;

    const domain = extractDomain(url);
    if (!domain || IGNORED_DOMAINS.has(domain)) continue;
    const baseDomain = domain.split(".").slice(-2).join(".");
    if (IGNORED_DOMAINS.has(baseDomain)) continue;

    const existing = activityDomains.get(domain) || { count: 0, titles: [] };
    existing.count++;
    if (title && !existing.titles.includes(title)) {
      existing.titles.push(title);
    }
    activityDomains.set(domain, existing);
  }

  // Sort by visit count and take top domains for summary
  const topDomains = Array.from(activityDomains.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([domain]) => getDomainName(domain));

  // Build conversational response with activity summary + candidates
  // Use filteredCandidates (stale candidates are excluded)
  let text: string;
  if (topDomains.length === 0 && filteredCandidates.length === 0) {
    text = "Not much recent activity to summarize.";
  } else if (filteredCandidates.length === 0) {
    // Activity but no new patterns to remember
    text = `Recent activity: ${topDomains.join(", ")}. Nothing new to remember.`;
  } else {
    // Activity + candidates to consider
    const observations = filteredCandidates.map((c) => {
      const visits = c.visitCount ? `${c.visitCount} visits` : "";
      return `${c.content} (${visits ? visits + " to " : "from "}${c.sourceRef})`;
    });

    if (filteredCandidates.length === 1) {
      text = `Recent activity: ${topDomains.join(", ")}.\n\nI noticed you've been exploring ${observations[0]}. Worth remembering?`;
    } else {
      const last = observations.pop();
      text = `Recent activity: ${topDomains.join(", ")}.\n\nI noticed you've been exploring ${observations.join(", ")} and ${last}. Any of these worth remembering?`;
    }
  }

  // Add reinforce/downgrade suggestions to text if present
  if (reinforce.length > 0 || downgrade.length > 0) {
    if (reinforce.length > 0) {
      text += `\n\nSome existing knowledge looks well-supported by recent activity.`;
    }
    if (downgrade.length > 0) {
      text += `\n\nSome older knowledge might need review - no recent activity.`;
    }
  }

  // Guidance for natural behavior
  const guidance =
    "Summarize their activity naturally without listing domains. " +
    "If candidates exist, ask casually if worth remembering. " +
    "If they confirm, use arete_accept_candidate with the candidateId. If they decline, acknowledge briefly. " +
    "Reinforce suggestions indicate facts that are well-supported. " +
    "Downgrade suggestions indicate facts that may be stale.";

  const output: InferOutput = {
    success: true,
    candidates: filteredCandidates,
    activitySummary: topDomains,
    source,
    guidance,
    reinforce,
    downgrade,
    accepted: accepted.length > 0 ? accepted : undefined,
    rejected: rejected.length > 0 ? rejected : undefined,
  };

  return {
    content: [{ type: "text", text }],
    structuredContent: output,
  };
}

/**
 * Tool definition for MCP registration
 */
export const inferTool = {
  name: "arete_infer",
  description: `Learn from browsing patterns + manage candidate lifecycle.

**Analysis:**
Extracts candidate facts from recent activity. Returns candidates for user approval.

**Candidate Management:**
Accept or reject candidates inline (no separate tool calls needed).
- accept: Pass candidate IDs to confirm as facts
- reject: Pass {id, reason} to block candidates permanently

**Usage:**
- "What have I been up to?" → arete_infer() to analyze
- User confirms candidate → arete_infer(accept: ["id1"])
- User declines → arete_infer(reject: [{id: "id2", reason: "Not accurate"}])

Replaces: arete_accept_candidate, arete_accept_candidates, arete_reject_fact`,
  inputSchema: {
    type: "object",
    properties: {
      lookbackDays: {
        type: "number",
        description: "How many days of context to analyze (default: 7)",
      },
      accept: {
        type: "array",
        items: { type: "string" },
        description: "Candidate IDs to accept (promotes to facts)",
      },
      reject: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: { type: "string" },
          },
          required: ["id"],
        },
        description: "Candidates to reject (blocked permanently)",
      },
    },
  },
};
