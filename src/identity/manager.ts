import {
  type AreteIdentity,
  createEmptyIdentity,
  safeParseIdentity,
  mergeIdentity,
  createClaudeTransform,
  createOpenAITransform,
} from "@arete/core";

export const STORAGE_KEY = "arete_identity";

/**
 * Get the device ID (extension ID or generated)
 */
function getDeviceId(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    return chrome.runtime.id;
  }
  return "browser-" + Math.random().toString(36).slice(2, 11);
}

/**
 * Get the current identity from storage
 */
export async function getIdentity(): Promise<AreteIdentity> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return createEmptyIdentity(getDeviceId());
  }

  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const stored = result[STORAGE_KEY];

  if (stored) {
    const parsed = safeParseIdentity(stored);
    if (parsed) {
      return parsed;
    }
  }

  return createEmptyIdentity(getDeviceId());
}

/**
 * Get identity formatted for a specific model
 */
export async function getIdentityForModel(model: string): Promise<string> {
  const identity = await getIdentity();

  // Check if identity has any meaningful content
  const hasContent =
    identity.core.name ||
    identity.core.role ||
    identity.expertise.length > 0 ||
    identity.communication.style.length > 0;

  if (!hasContent) {
    return "";
  }

  const transform =
    model === "claude" ? createClaudeTransform() : createOpenAITransform();

  const result = transform.transform(identity);
  return result.content;
}

/**
 * Update identity with partial data (merges with existing)
 */
export async function updateIdentity(
  updates: Partial<AreteIdentity>
): Promise<AreteIdentity> {
  const existing = await getIdentity();
  const merged = mergeIdentity(existing, updates);

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  }

  return merged;
}

/**
 * Set identity from prose text (requires LLM - placeholder)
 *
 * This will be implemented when we have an LLM provider configured.
 * For now, it's a stub that returns the current identity.
 */
export async function setIdentityFromProse(
  _prose: string
): Promise<AreteIdentity> {
  // TODO: Implement with extractIdentityFromText when LLM is available
  return getIdentity();
}
