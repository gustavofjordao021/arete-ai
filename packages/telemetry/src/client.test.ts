import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock posthog-node before imports
vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    identify: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  TelemetryClient,
  getTelemetryClient,
  shutdownTelemetry,
  resetTelemetryClient,
} from "./client.js";
import { setConfigDir } from "./user-id.js";

const TEST_DIR = join(tmpdir(), `arete-telemetry-test-${Date.now()}`);

describe("TelemetryClient", () => {
  beforeEach(() => {
    resetTelemetryClient();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setConfigDir(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("is enabled by default", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      expect(client.isEnabled()).toBe(true);
    });

    it("respects enabled: false in config", () => {
      writeFileSync(
        join(TEST_DIR, "config.json"),
        JSON.stringify({ telemetry: { enabled: false } })
      );
      const client = new TelemetryClient({ forceUserId: "test-user" });
      expect(client.isEnabled()).toBe(false);
    });

    it("respects constructor options over config", () => {
      writeFileSync(
        join(TEST_DIR, "config.json"),
        JSON.stringify({ telemetry: { enabled: true } })
      );
      const client = new TelemetryClient({
        enabled: false,
        forceUserId: "test-user",
      });
      expect(client.isEnabled()).toBe(false);
    });

    it("saves anonymousId to config", () => {
      // Create identity file with deviceId
      writeFileSync(
        join(TEST_DIR, "identity.json"),
        JSON.stringify({ deviceId: "my-device-123" })
      );

      const client = new TelemetryClient();
      const userId = client.getUserId();

      // Should be a 16-char hex string
      expect(userId).toMatch(/^[a-f0-9]{16}$/);

      // Should be saved to config
      const config = JSON.parse(
        readFileSync(join(TEST_DIR, "config.json"), "utf-8")
      );
      expect(config.telemetry.anonymousId).toBe(userId);
    });

    it("reuses saved anonymousId from config", () => {
      const savedId = "abcd1234abcd1234";
      writeFileSync(
        join(TEST_DIR, "config.json"),
        JSON.stringify({ telemetry: { enabled: true, anonymousId: savedId } })
      );

      const client = new TelemetryClient();
      expect(client.getUserId()).toBe(savedId);
    });
  });

  describe("opt-out", () => {
    it("persists disabled state to config", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.disable();

      const config = JSON.parse(
        readFileSync(join(TEST_DIR, "config.json"), "utf-8")
      );
      expect(config.telemetry.enabled).toBe(false);
    });

    it("can re-enable after disabling", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.disable();
      expect(client.isEnabled()).toBe(false);

      client.enable();
      expect(client.isEnabled()).toBe(true);

      const config = JSON.parse(
        readFileSync(join(TEST_DIR, "config.json"), "utf-8")
      );
      expect(config.telemetry.enabled).toBe(true);
    });
  });

  describe("tracking", () => {
    it("tracks tool calls with trackToolCall", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      // Should not throw
      client.trackToolCall("arete_get_identity", true, 42);
    });

    it("tracks fact creation", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackFactCreated("expertise", "conversation", "candidate");
    });

    it("tracks fact validation", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackFactValidated(true, "candidate", "established", "fuzzy");
    });

    it("tracks candidate proposal", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackCandidateProposed("focus", 0.75, 3);
    });

    it("tracks candidate acceptance", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackCandidateAccepted("preference", false);
    });

    it("tracks candidate rejection", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackCandidateRejected(true);
    });

    it("tracks context event addition", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackContextEventAdded("insight", "chrome", true);
    });

    it("tracks projection calls", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackProjectionCalled(true, 5, 10);
    });

    it("tracks fact surfacing", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.trackFactSurfaced("expertise", "proven", 0.85);
    });

    it("does not throw when disabled", () => {
      const client = new TelemetryClient({
        enabled: false,
        forceUserId: "test-user",
      });
      // Should not throw even when disabled
      client.trackToolCall("arete_get_identity", true, 42);
      client.trackFactCreated("core", "manual", "proven");
    });
  });

  describe("connector", () => {
    it("sets connector name", () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      client.setConnector("mcp-server");
      // Connector is included in all tracked events
      client.trackToolCall("test", true);
    });
  });

  describe("shutdown", () => {
    it("flushes events on shutdown", async () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      await client.shutdown();
      // Should not throw
    });

    it("can shutdown multiple times safely", async () => {
      const client = new TelemetryClient({ forceUserId: "test-user" });
      await client.shutdown();
      await client.shutdown();
      // Should not throw
    });
  });

  describe("singleton", () => {
    it("returns same instance from getTelemetryClient", () => {
      const client1 = getTelemetryClient();
      const client2 = getTelemetryClient();
      expect(client1).toBe(client2);
    });

    it("shutdownTelemetry clears singleton", async () => {
      const client1 = getTelemetryClient();
      await shutdownTelemetry();
      const client2 = getTelemetryClient();
      // After shutdown and recreate, should be new instance
      expect(client1).not.toBe(client2);
    });

    it("resetTelemetryClient clears singleton", () => {
      const client1 = getTelemetryClient();
      resetTelemetryClient();
      const client2 = getTelemetryClient();
      expect(client1).not.toBe(client2);
    });
  });
});
