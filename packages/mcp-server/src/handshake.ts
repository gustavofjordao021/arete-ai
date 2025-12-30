/**
 * MCP Handshake Enforcement
 *
 * Prevents tool calls before the MCP initialization handshake completes.
 * This blocks the "pipe JSON to stdin" bypass where scripts skip the
 * initialize/initialized sequence.
 */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Track whether the MCP handshake has completed
let isInitialized = false;

/**
 * Set initialization state.
 * Called by server.server.oninitialized callback.
 * Exported for testing.
 */
export function setInitialized(value: boolean): void {
  isInitialized = value;
}

/**
 * Get current initialization state.
 * Exported for testing.
 */
export function getInitialized(): boolean {
  return isInitialized;
}

/**
 * Guard function that rejects tool calls before MCP initialization.
 *
 * @param toolName - Name of the tool being called (for logging)
 * @param handler - The actual tool handler to execute
 * @throws McpError with InvalidRequest if not initialized
 */
export async function requireInitialization<T>(
  toolName: string,
  handler: () => Promise<T>
): Promise<T> {
  if (!isInitialized) {
    console.error(`[Arete] Rejected ${toolName} - MCP handshake not complete`);
    throw new McpError(
      ErrorCode.InvalidRequest,
      "MCP handshake not complete. Call initialize first."
    );
  }
  return handler();
}
