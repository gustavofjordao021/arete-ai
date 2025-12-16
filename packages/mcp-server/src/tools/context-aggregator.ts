/**
 * Context Aggregator - Phase 1
 *
 * Formats ALL context event types into structured format for Haiku analysis.
 * This is FORMATTING ONLY - no intelligence, no filtering, no pattern detection.
 * All intelligence happens in the Haiku pass.
 *
 * Purpose: Token efficiency (47 raw events ~5K tokens → structured ~500 tokens)
 */

// --- Types ---

export interface ContextEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface PageVisitSummary {
  domain: string;
  count: number;
  titles: string[];
}

export interface AggregatedContext {
  pageVisits: PageVisitSummary[];
  insights: string[];
  conversations: string[];
  files: string[];
  selections: string[];
}

export interface AggregateOptions {
  maxDomains?: number;
  maxInsights?: number;
  maxConversations?: number;
  maxFiles?: number;
  maxSelections?: number;
  maxSelectionLength?: number;
}

const DEFAULT_OPTIONS: Required<AggregateOptions> = {
  maxDomains: 15,
  maxInsights: 10,
  maxConversations: 10,
  maxFiles: 15,
  maxSelections: 10,
  maxSelectionLength: 200,
};

// --- Helpers ---

/**
 * Extract domain from URL, stripping www. prefix
 */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Safely get string from data field, checking multiple possible field names
 */
function getStringField(data: Record<string, unknown>, ...fields: string[]): string | null {
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Safely get string array from data field
 */
function getStringArrayField(data: Record<string, unknown>, field: string): string[] {
  const value = data[field];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  return [];
}

// --- Aggregation Functions ---

/**
 * Aggregate page_visit events by domain
 */
function aggregatePageVisits(events: ContextEvent[]): PageVisitSummary[] {
  const domainMap = new Map<string, { count: number; titles: Set<string> }>();

  for (const event of events) {
    if (event.type !== "page_visit") continue;

    const url = getStringField(event.data, "url");
    if (!url) continue;

    const domain = extractDomain(url);
    if (!domain) continue;

    const existing = domainMap.get(domain) || { count: 0, titles: new Set<string>() };
    existing.count++;

    const title = getStringField(event.data, "title");
    if (title) {
      existing.titles.add(title);
    }

    domainMap.set(domain, existing);
  }

  // Convert to array and sort by count descending
  return Array.from(domainMap.entries())
    .map(([domain, data]) => ({
      domain,
      count: data.count,
      titles: Array.from(data.titles),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Aggregate insight events
 */
function aggregateInsights(events: ContextEvent[]): string[] {
  const insights: string[] = [];

  for (const event of events) {
    if (event.type !== "insight") continue;

    // Try different field names for insight content
    const singleInsight = getStringField(event.data, "insight", "fact");
    if (singleInsight) {
      insights.push(singleInsight);
    }

    // Handle summary field
    const summary = getStringField(event.data, "summary");
    if (summary && !singleInsight) {
      insights.push(summary);
    }

    // Handle insights array
    const insightsArray = getStringArrayField(event.data, "insights");
    insights.push(...insightsArray);
  }

  return insights;
}

/**
 * Aggregate conversation events
 */
function aggregateConversations(events: ContextEvent[]): string[] {
  const conversations: string[] = [];

  for (const event of events) {
    if (event.type !== "conversation") continue;

    // Try different field names
    const content = getStringField(event.data, "summary", "topic", "content", "message");
    if (content) {
      conversations.push(content);
    }
  }

  return conversations;
}

/**
 * Aggregate file events
 */
function aggregateFiles(events: ContextEvent[]): string[] {
  const files = new Set<string>();

  for (const event of events) {
    if (event.type !== "file") continue;

    const path = getStringField(event.data, "path", "filename", "file");
    if (path) {
      files.add(path);
    }
  }

  return Array.from(files);
}

/**
 * Aggregate selection events
 */
function aggregateSelections(events: ContextEvent[], maxLength: number): string[] {
  const selections: string[] = [];

  for (const event of events) {
    if (event.type !== "selection") continue;

    let text = getStringField(event.data, "text", "content", "selection");
    if (text) {
      // Truncate if too long
      if (text.length > maxLength) {
        text = text.substring(0, maxLength - 3) + "...";
      }
      selections.push(text);
    }
  }

  return selections;
}

// --- Main Function ---

/**
 * Aggregate all context events into structured format for Haiku
 *
 * @param events - Raw context events
 * @param options - Limits for each category
 * @returns Structured aggregated context
 */
export function aggregateContext(
  events: ContextEvent[],
  options: AggregateOptions = {}
): AggregatedContext {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Aggregate each type
  let pageVisits = aggregatePageVisits(events);
  let insights = aggregateInsights(events);
  let conversations = aggregateConversations(events);
  let files = aggregateFiles(events);
  let selections = aggregateSelections(events, opts.maxSelectionLength);

  // Apply limits
  pageVisits = pageVisits.slice(0, opts.maxDomains);
  insights = insights.slice(0, opts.maxInsights);
  conversations = conversations.slice(0, opts.maxConversations);
  files = files.slice(0, opts.maxFiles);
  selections = selections.slice(0, opts.maxSelections);

  return {
    pageVisits,
    insights,
    conversations,
    files,
    selections,
  };
}
