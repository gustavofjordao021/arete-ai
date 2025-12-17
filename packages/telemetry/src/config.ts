/**
 * Telemetry configuration management
 *
 * Reads/writes telemetry settings from ~/.arete/config.json
 * Default: telemetry is ON (enabled: true)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";
import { getConfigDir } from "./user-id.js";

export const TelemetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  anonymousId: z.string().optional(),
});

export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

function getConfigFile(): string {
  return join(getConfigDir(), "config.json");
}

/**
 * Load telemetry configuration from ~/.arete/config.json
 *
 * @returns TelemetryConfig with defaults applied
 */
export function loadTelemetryConfig(): TelemetryConfig {
  const configFile = getConfigFile();

  if (!existsSync(configFile)) {
    return { enabled: true };
  }

  try {
    const data = JSON.parse(readFileSync(configFile, "utf-8"));
    return {
      enabled: data.telemetry?.enabled ?? true,
      anonymousId: data.telemetry?.anonymousId,
    };
  } catch {
    return { enabled: true };
  }
}

/**
 * Save telemetry configuration to ~/.arete/config.json
 *
 * Merges with existing config to preserve other settings
 */
export function saveTelemetryConfig(config: TelemetryConfig): void {
  const configFile = getConfigFile();
  const dir = dirname(configFile);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  let existingConfig: Record<string, unknown> = {};
  if (existsSync(configFile)) {
    try {
      existingConfig = JSON.parse(readFileSync(configFile, "utf-8"));
    } catch {
      // Start fresh
    }
  }

  existingConfig.telemetry = config;
  writeFileSync(configFile, JSON.stringify(existingConfig, null, 2), {
    mode: 0o600,
  });
}

/**
 * Check if telemetry is enabled without loading full config
 */
export function isTelemetryEnabled(): boolean {
  return loadTelemetryConfig().enabled;
}
