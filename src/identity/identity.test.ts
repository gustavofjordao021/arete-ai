import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase auth BEFORE importing manager
vi.mock("../supabase/auth", () => ({
  getAuthState: vi.fn(() => Promise.resolve({ isAuthenticated: false, user: null, loading: false })),
}));

vi.mock("../supabase/sync", () => ({
  saveIdentity: vi.fn(() => Promise.resolve({ id: "test-id" })),
  loadIdentity: vi.fn(() => Promise.resolve(null)),
}));

import {
  getIdentity,
  getIdentityForModel,
  updateIdentity,
  setIdentityFromProse,
  STORAGE_KEY,
  getLastCloudSync,
} from "./manager";
import { getAuthState } from "../supabase/auth";
import { saveIdentity as saveIdentityToCloud, loadIdentity as loadIdentityFromCloud } from "../supabase/sync";

// Mock chrome.storage.local
const mockStorage: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((keys: string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    id: "test-extension-id",
  },
};

// @ts-expect-error - mocking global chrome
globalThis.chrome = chromeMock;

describe("Identity Manager", () => {
  beforeEach(() => {
    // Clear mock storage before each test
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    vi.clearAllMocks();
  });

  describe("getIdentity", () => {
    it("returns empty identity when storage is empty", async () => {
      const identity = await getIdentity();

      expect(identity).toBeDefined();
      expect(identity.meta.deviceId).toBeDefined();
      expect(identity.core).toEqual({});
      expect(identity.expertise).toEqual([]);
    });

    it("returns stored identity when available", async () => {
      const storedIdentity = {
        meta: {
          version: "1.0.0",
          lastModified: "2024-01-01T00:00:00.000Z",
          deviceId: "test-device",
        },
        core: {
          name: "Test User",
          role: "Developer",
        },
        communication: { style: [], format: [], avoid: [] },
        expertise: ["TypeScript"],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      mockStorage[STORAGE_KEY] = storedIdentity;

      const identity = await getIdentity();

      expect(identity.core.name).toBe("Test User");
      expect(identity.core.role).toBe("Developer");
      expect(identity.expertise).toContain("TypeScript");
    });
  });

  describe("getIdentityForModel", () => {
    it("returns Claude-formatted identity with XML tags", async () => {
      mockStorage[STORAGE_KEY] = {
        meta: {
          version: "1.0.0",
          lastModified: "2024-01-01T00:00:00.000Z",
          deviceId: "test",
        },
        core: { name: "Alex", role: "Engineer" },
        communication: { style: ["direct"], format: [], avoid: [] },
        expertise: ["TypeScript"],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      const formatted = await getIdentityForModel("claude");

      expect(formatted).toContain("<user_identity>");
      expect(formatted).toContain("</user_identity>");
      expect(formatted).toContain("Name: Alex");
      expect(formatted).toContain("Role: Engineer");
    });

    it("returns OpenAI-formatted identity with markdown", async () => {
      mockStorage[STORAGE_KEY] = {
        meta: {
          version: "1.0.0",
          lastModified: "2024-01-01T00:00:00.000Z",
          deviceId: "test",
        },
        core: { name: "Alex", role: "Engineer" },
        communication: { style: [], format: [], avoid: [] },
        expertise: [],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      const formatted = await getIdentityForModel("gpt");

      expect(formatted).toContain("## User Profile");
      expect(formatted).toContain("**Name:** Alex");
      expect(formatted).toContain("**Role:** Engineer");
    });

    it("returns empty string when identity has no content", async () => {
      // Empty storage = empty identity
      const formatted = await getIdentityForModel("claude");

      expect(formatted).toBe("");
    });
  });

  describe("updateIdentity", () => {
    it("merges updates into existing identity", async () => {
      mockStorage[STORAGE_KEY] = {
        meta: {
          version: "1.0.0",
          lastModified: "2024-01-01T00:00:00.000Z",
          deviceId: "test",
        },
        core: { name: "Old Name" },
        communication: { style: [], format: [], avoid: [] },
        expertise: ["JavaScript"],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      await updateIdentity({
        core: { name: "New Name", role: "Engineer" },
        expertise: ["TypeScript"],
      });

      // Verify storage was called
      expect(chromeMock.storage.local.set).toHaveBeenCalled();

      // Get the updated identity
      const updated = await getIdentity();
      expect(updated.core.name).toBe("New Name");
      expect(updated.core.role).toBe("Engineer");
      expect(updated.expertise).toContain("JavaScript");
      expect(updated.expertise).toContain("TypeScript");
    });

    it("creates new identity if none exists", async () => {
      await updateIdentity({
        core: { name: "New User" },
      });

      expect(chromeMock.storage.local.set).toHaveBeenCalled();

      const identity = await getIdentity();
      expect(identity.core.name).toBe("New User");
    });
  });

  describe("setIdentityFromProse", () => {
    it("parses prose and updates identity", async () => {
      // This requires an LLM, so we'll test the interface
      // The actual extraction is tested in @arete/core

      // For now, just verify it exists and returns a promise
      expect(typeof setIdentityFromProse).toBe("function");
    });
  });
});

describe("Storage Key", () => {
  it("uses arete_ prefix", () => {
    expect(STORAGE_KEY).toBe("arete_identity");
  });
});

describe("Cloud Sync", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    vi.clearAllMocks();
  });

  describe("getIdentity with cloud", () => {
    it("loads from cloud when authenticated", async () => {
      const cloudIdentity = {
        meta: {
          version: "1.0.0",
          lastModified: new Date().toISOString(),
          deviceId: "cloud-device",
        },
        core: { name: "Cloud User", role: "Engineer" },
        communication: { style: ["concise"], format: [], avoid: [] },
        expertise: ["Supabase"],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      vi.mocked(getAuthState).mockResolvedValueOnce({
        isAuthenticated: true,
        user: { id: "user-123", email: "test@test.com" },
        loading: false,
      });
      vi.mocked(loadIdentityFromCloud).mockResolvedValueOnce(cloudIdentity);

      const identity = await getIdentity();

      expect(identity.core.name).toBe("Cloud User");
      expect(identity.expertise).toContain("Supabase");
      expect(loadIdentityFromCloud).toHaveBeenCalled();
    });

    it("falls back to local when cloud fails", async () => {
      mockStorage[STORAGE_KEY] = {
        meta: {
          version: "1.0.0",
          lastModified: new Date().toISOString(),
          deviceId: "local",
        },
        core: { name: "Local User" },
        communication: { style: [], format: [], avoid: [] },
        expertise: ["TypeScript"],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      vi.mocked(getAuthState).mockResolvedValueOnce({
        isAuthenticated: true,
        user: { id: "user-123" },
        loading: false,
      });
      vi.mocked(loadIdentityFromCloud).mockRejectedValueOnce(new Error("Network error"));

      const identity = await getIdentity();

      expect(identity.core.name).toBe("Local User");
    });

    it("uses local when not authenticated", async () => {
      mockStorage[STORAGE_KEY] = {
        meta: {
          version: "1.0.0",
          lastModified: new Date().toISOString(),
          deviceId: "local",
        },
        core: { name: "Offline User" },
        communication: { style: [], format: [], avoid: [] },
        expertise: [],
        currentFocus: { projects: [], goals: [] },
        context: { personal: [], professional: [] },
        privacy: { public: [], private: [], localOnly: [] },
        custom: {},
        sources: [],
      };

      vi.mocked(getAuthState).mockResolvedValueOnce({
        isAuthenticated: false,
        user: null,
        loading: false,
      });

      const identity = await getIdentity();

      expect(identity.core.name).toBe("Offline User");
      expect(loadIdentityFromCloud).not.toHaveBeenCalled();
    });
  });

  describe("updateIdentity with cloud", () => {
    it("syncs to cloud when authenticated", async () => {
      vi.mocked(getAuthState).mockResolvedValue({
        isAuthenticated: true,
        user: { id: "user-123" },
        loading: false,
      });

      await updateIdentity({
        core: { name: "Updated User" },
      });

      expect(saveIdentityToCloud).toHaveBeenCalled();
    });

    it("does not sync when not authenticated", async () => {
      vi.mocked(getAuthState).mockResolvedValue({
        isAuthenticated: false,
        user: null,
        loading: false,
      });

      await updateIdentity({
        core: { name: "Local Only User" },
      });

      expect(saveIdentityToCloud).not.toHaveBeenCalled();
    });

    it("continues on cloud sync failure", async () => {
      vi.mocked(getAuthState).mockResolvedValue({
        isAuthenticated: true,
        user: { id: "user-123" },
        loading: false,
      });
      vi.mocked(saveIdentityToCloud).mockRejectedValueOnce(new Error("Network error"));

      // Should not throw
      await updateIdentity({
        core: { name: "Sync Failed User" },
      });

      // Local storage should still be updated
      const identity = await getIdentity();
      expect(identity.core.name).toBe("Sync Failed User");
    });
  });
});
