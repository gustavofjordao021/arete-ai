/**
 * Archive Module - Phase 6: Archive + Cleanup
 *
 * Handles archiving of expired facts (effective confidence < threshold).
 * Facts are moved to ~/.arete/archive/ for potential future recovery.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  type IdentityV2,
  type IdentityFact,
  isIdentityV2,
  getEffectiveConfidence,
  createEmptyIdentityV2,
} from "../schema/identity-v2.js";

// Default threshold for archiving (10% effective confidence)
export const DEFAULT_ARCHIVE_THRESHOLD = 0.1;

// Config directory (can be overridden for testing)
let configDir = join(homedir(), ".arete");

/**
 * Set the config directory (for testing)
 */
export function setConfigDir(dir: string): void {
  configDir = dir;
}

/**
 * Get the config directory
 */
export function getConfigDir(): string {
  return configDir;
}

/**
 * Get the archive directory path
 */
export function getArchiveDir(): string {
  return join(configDir, "archive");
}

/**
 * Ensure the archive directory exists
 */
function ensureArchiveDir(): void {
  const archiveDir = getArchiveDir();
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }
}

/**
 * Load identity from file
 */
export function loadIdentityV2(): IdentityV2 | null {
  const identityPath = join(configDir, "identity.json");
  if (!existsSync(identityPath)) {
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(identityPath, "utf-8"));
    if (isIdentityV2(data)) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save identity to file
 */
export function saveIdentityV2(identity: IdentityV2): void {
  const identityPath = join(configDir, "identity.json");
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(identityPath, JSON.stringify(identity, null, 2));
}

/**
 * Find facts that have decayed below the threshold
 *
 * @param identity - The identity to check
 * @param threshold - Minimum effective confidence (default 0.1)
 * @returns Array of expired facts
 */
export function findExpiredFacts(
  identity: IdentityV2,
  threshold: number = DEFAULT_ARCHIVE_THRESHOLD
): IdentityFact[] {
  const halfLifeDays = identity.settings.decayHalfLifeDays;

  return identity.facts.filter((fact) => {
    const effectiveConfidence = getEffectiveConfidence(fact, halfLifeDays);
    return effectiveConfidence < threshold;
  });
}

/**
 * Archive interface for stored data
 */
interface ArchiveData {
  archivedAt: string;
  reason: string;
  facts: IdentityFact[];
}

/**
 * Archive facts to a timestamped file
 *
 * @param facts - Facts to archive
 * @returns Path to archive file, or null if no facts to archive
 */
export async function archiveFacts(
  facts: IdentityFact[]
): Promise<string | null> {
  if (facts.length === 0) {
    return null;
  }

  ensureArchiveDir();

  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const filename = `archived-facts-${timestamp}.json`;
  const archivePath = join(getArchiveDir(), filename);

  const archiveData: ArchiveData = {
    archivedAt: new Date().toISOString(),
    reason: `Effective confidence below threshold (${DEFAULT_ARCHIVE_THRESHOLD})`,
    facts,
  };

  writeFileSync(archivePath, JSON.stringify(archiveData, null, 2));

  return archivePath;
}

/**
 * Result of archive cleanup operation
 */
export interface CleanupResult {
  archivedCount: number;
  remainingCount: number;
  archivePath: string | null;
}

/**
 * Run the archive cleanup process
 *
 * 1. Load identity
 * 2. Find expired facts
 * 3. Archive them
 * 4. Remove from identity
 * 5. Save updated identity
 *
 * @param threshold - Optional custom threshold
 * @returns Cleanup result with counts
 */
export async function runArchiveCleanup(
  threshold: number = DEFAULT_ARCHIVE_THRESHOLD
): Promise<CleanupResult> {
  // Load identity
  let identity = loadIdentityV2();
  if (!identity) {
    identity = createEmptyIdentityV2("cli");
    saveIdentityV2(identity);
    return {
      archivedCount: 0,
      remainingCount: 0,
      archivePath: null,
    };
  }

  // Find expired facts
  const expiredFacts = findExpiredFacts(identity, threshold);

  if (expiredFacts.length === 0) {
    return {
      archivedCount: 0,
      remainingCount: identity.facts.length,
      archivePath: null,
    };
  }

  // Archive expired facts
  const archivePath = await archiveFacts(expiredFacts);

  // Remove expired facts from identity
  const expiredIds = new Set(expiredFacts.map((f) => f.id));
  identity.facts = identity.facts.filter((f) => !expiredIds.has(f.id));

  // Save updated identity
  saveIdentityV2(identity);

  return {
    archivedCount: expiredFacts.length,
    remainingCount: identity.facts.length,
    archivePath,
  };
}
