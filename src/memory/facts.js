import { memory } from './store.js';
import { callModel } from '../api.js';
import { storePreference } from './preferences.js';
import { isDuplicateFact, pruneFacts, getOptimizedFacts } from './manager.js';

const FACT_EXTRACTION_PROMPT = `You are a fact extractor. Given a conversation exchange, extract any facts learned about the user.

Rules:
- Only extract CONCRETE facts (not opinions or questions)
- Format as short phrases: "User prefers X", "User works at Y", "User likes Z"
- Return JSON array of strings
- Return empty array [] if no new facts
- Max 3 facts per extraction
- Don't repeat obvious things from context

Examples:
- "User prefers bullet points over paragraphs"
- "User is interested in fintech"
- "User wants concise responses"

Return ONLY a JSON array, no other text.`;

/**
 * Extract facts from a conversation exchange
 */
export async function extractFacts(userQuery, aiResponse) {
  try {
    console.log('Arete: Extracting facts from conversation...');

    const prompt = `User said: "${userQuery}"
AI responded: "${aiResponse.slice(0, 500)}..."

Extract any new facts learned about the user:`;

    const result = await callModel('claude', FACT_EXTRACTION_PROMPT, [
      { role: 'user', content: prompt }
    ]);

    console.log('Arete: Extraction response:', result);

    // Parse JSON array from response - try multiple patterns
    let facts = [];
    try {
      // Try parsing the whole response as JSON first
      facts = JSON.parse(result);
    } catch {
      // Try extracting array from response
      const match = result.match(/\[[\s\S]*?\]/);
      if (match) {
        facts = JSON.parse(match[0]);
      }
    }

    if (Array.isArray(facts) && facts.length > 0) {
      const storedFacts = [];
      for (const fact of facts) {
        if (typeof fact === 'string' && fact.trim()) {
          const factText = fact.trim();

          // Check for duplicates before adding
          const isDupe = await isDuplicateFact(factText);
          if (isDupe) {
            console.log('Arete: Skipping duplicate fact:', factText);
            continue;
          }

          await memory.append('facts', 'learned', { fact: factText });
          await storePreference(factText);
          storedFacts.push(factText);

          // Sync to cloud via background script
          chrome.runtime.sendMessage({
            type: 'SYNC_FACT',
            fact: factText,
          }).catch(() => {
            // Ignore errors if background script not available
          });
        }
      }

      // Auto-prune if over limit
      await pruneFacts();

      console.log('Arete: Stored facts:', storedFacts);
      return storedFacts;
    }

    console.log('Arete: No facts extracted');
    return [];
  } catch (err) {
    console.error('Arete: Fact extraction failed:', err);
    return [];
  }
}

/**
 * Get all learned facts
 */
export async function getAllFacts() {
  const data = await memory.get('facts', 'learned');
  return data || [];
}

/**
 * Get facts as formatted string for prompts (token-optimized)
 */
export async function getFactsForPrompt() {
  const optimizedFacts = await getOptimizedFacts();
  if (optimizedFacts.length === 0) return '';

  return `\n\nLearned about this user:\n${optimizedFacts.map(f => `- ${f}`).join('\n')}`;
}

/**
 * Clear all facts
 */
export async function clearFacts() {
  await memory.remove('facts', 'learned');
}
