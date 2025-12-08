/**
 * arete_infer MCP tool - Inference Engine
 *
 * Extracts candidate facts from local context patterns.
 * The "invisible" part: Returns guidance so Claude naturally knows how to present suggestions.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  loadConfig,
  createCLIClient,
  type IdentityV2,
  type IdentityFact,
} from "@arete/core";

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
  category: "expertise" | "interest";
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
 * Get domain info including type and readable name
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
function getFactCategory(type: DomainType): "expertise" | "interest" {
  // Tech is expertise, everything else is interest
  return type === "tech" ? "expertise" : "interest";
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

function loadContextEvents(): ContextEvent[] {
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

// --- Pattern Analysis ---

/**
 * Analyze context events for patterns that suggest expertise or interests
 */
export function analyzeContextForPatterns(events: ContextEvent[]): CandidateFact[] {
  // Count visits by domain and collect URLs/titles
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

  // Convert to candidates (require at least 3 visits for a pattern)
  const candidates: CandidateFact[] = [];

  for (const [domain, count] of domainCounts) {
    if (count < 3) continue;

    const urls = domainUrls.get(domain) ?? [];
    const titles = domainTitles.get(domain) ?? [];

    // Get domain info with type detection
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

// --- Handler ---

export interface InferInput {
  lookbackDays?: number;
}

export interface InferOutput {
  success: boolean;
  candidates: CandidateFact[];
  activitySummary: string[];
  source: "local_context" | "rollup";
  error?: string;
  guidance?: string;
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

  // Load and filter context events
  const allEvents = loadContextEvents();
  const recentEvents = allEvents.filter(
    (e) => daysSince(e.timestamp) <= lookbackDays
  );

  // Analyze for patterns
  let candidates = analyzeContextForPatterns(recentEvents);

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
  let text: string;
  if (topDomains.length === 0 && candidates.length === 0) {
    text = "Not much recent activity to summarize.";
  } else if (candidates.length === 0) {
    // Activity but no new patterns to remember
    text = `Recent activity: ${topDomains.join(", ")}. Nothing new to remember.`;
  } else {
    // Activity + candidates to consider
    const observations = candidates.map((c) => {
      const visits = c.visitCount ? `${c.visitCount} visits` : "";
      return `${c.content} (${visits} to ${c.sourceRef})`;
    });

    if (candidates.length === 1) {
      text = `Recent activity: ${topDomains.join(", ")}.\n\nI noticed you've been exploring ${observations[0]}. Worth remembering?`;
    } else {
      const last = observations.pop();
      text = `Recent activity: ${topDomains.join(", ")}.\n\nI noticed you've been exploring ${observations.join(", ")} and ${last}. Any of these worth remembering?`;
    }
  }

  // Guidance for natural behavior
  const guidance =
    "Summarize their activity naturally without listing domains. " +
    "If candidates exist, ask casually if worth remembering. " +
    "If they confirm, use arete_update_identity. If they decline, acknowledge briefly.";

  const output: InferOutput = {
    success: true,
    candidates,
    activitySummary: topDomains,
    source: "local_context",
    guidance,
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
  description: `Extract candidate identity facts from recent browsing patterns.

Analyzes local context to find patterns that might indicate user expertise.
Returns candidates for user approval - they are NOT automatically added.

Use this when:
- User asks what they've been working on
- Starting a conversation where context would help
- User wants to update their identity based on recent activity

The response includes guidance on how to naturally present the suggestions.`,
  inputSchema: {
    type: "object",
    properties: {
      lookbackDays: {
        type: "number",
        description: "How many days of context to analyze (default: 7)",
      },
    },
  },
};
