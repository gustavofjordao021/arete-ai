/**
 * Tests for MCP handshake enforcement
 *
 * RED: These tests should FAIL initially (no implementation yet)
 * GREEN: After implementing requireInitialization, they should pass
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// We'll test the guard function in isolation first
// Then integration test with the actual server

describe("MCP Handshake Enforcement", () => {
  describe("requireInitialization guard", () => {
    // Import the module - this will fail until we export the function
    let requireInitialization: <T>(
      toolName: string,
      handler: () => Promise<T>
    ) => Promise<T>;
    let setInitialized: (value: boolean) => void;

    beforeEach(async () => {
      // Dynamic import to get fresh module state
      vi.resetModules();
      const module = await import("./handshake.js");
      requireInitialization = module.requireInitialization;
      setInitialized = module.setInitialized;
    });

    it("throws McpError when not initialized", async () => {
      setInitialized(false);

      const mockHandler = vi.fn().mockResolvedValue({ success: true });

      await expect(
        requireInitialization("arete_identity", mockHandler)
      ).rejects.toThrow(McpError);

      await expect(
        requireInitialization("arete_identity", mockHandler)
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringContaining("handshake"),
      });

      // Handler should NOT have been called
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("executes handler when initialized", async () => {
      setInitialized(true);

      const expectedResult = { facts: [], totalFacts: 0 };
      const mockHandler = vi.fn().mockResolvedValue(expectedResult);

      const result = await requireInitialization("arete_identity", mockHandler);

      expect(result).toEqual(expectedResult);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it("propagates handler errors when initialized", async () => {
      setInitialized(true);

      const handlerError = new Error("Handler failed");
      const mockHandler = vi.fn().mockRejectedValue(handlerError);

      await expect(
        requireInitialization("arete_identity", mockHandler)
      ).rejects.toThrow("Handler failed");
    });

    it("logs rejection with tool name", async () => {
      setInitialized(false);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockHandler = vi.fn().mockResolvedValue({});

      try {
        await requireInitialization("arete_remember", mockHandler);
      } catch {
        // Expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("arete_remember")
      );

      consoleSpy.mockRestore();
    });

    it("rejects multiple tools independently", async () => {
      setInitialized(false);

      const tools = ["arete_identity", "arete_remember", "arete_activity"];

      for (const tool of tools) {
        await expect(
          requireInitialization(tool, vi.fn().mockResolvedValue({}))
        ).rejects.toThrow(McpError);
      }
    });
  });
});
