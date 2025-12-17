/**
 * Anonymous user ID generation for telemetry
 *
 * Uses SHA-256 hash of deviceId to ensure:
 * 1. Privacy: Cannot reverse engineer original device info
 * 2. Stability: Same device always produces same ID
 * 3. Portability: Works across Arete interfaces
 */

import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

let configDir = join(homedir(), ".arete");

/**
 * Override config directory (for testing)
 */
export function setConfigDir(dir: string): void {
  configDir = dir;
}

/**
 * Get current config directory
 */
export function getConfigDir(): string {
  return configDir;
}

/**
 * Generate a stable anonymous user ID from the device ID.
 *
 * @returns 16-character hex string (SHA-256 truncated)
 */
export function getAnonymousUserId(): string {
  const identityFile = join(configDir, "identity.json");

  let deviceId = "unknown-device";

  if (existsSync(identityFile)) {
    try {
      const data = JSON.parse(readFileSync(identityFile, "utf-8"));
      // Support both v1 (meta.deviceId) and v2 (deviceId) formats
      deviceId = data.deviceId || data.meta?.deviceId || deviceId;
    } catch {
      // Fall through to use default
    }
  }

  // Hash the device ID for anonymity
  const hash = createHash("sha256");
  hash.update(`arete:${deviceId}`);
  return hash.digest("hex").slice(0, 16); // 16 chars is enough for uniqueness
}

/**
 * Generate a deterministic hash for any input
 * Useful for creating anonymous IDs from other identifiers
 */
export function hashForAnonymity(input: string): string {
  const hash = createHash("sha256");
  hash.update(`arete:${input}`);
  return hash.digest("hex").slice(0, 16);
}
