import { describe, it, expect } from "vitest";
import {
  AreteIdentitySchema,
  createEmptyIdentity,
  parseIdentity,
  safeParseIdentity,
} from "./identity.js";

describe("AreteIdentitySchema", () => {
  it("validates a complete identity", () => {
    const identity = {
      meta: {
        version: "1.0.0",
        lastModified: "2024-01-01T00:00:00.000Z",
        deviceId: "test-device",
      },
      core: {
        name: "Test User",
        role: "Developer",
      },
      communication: {
        style: ["direct"],
        format: ["markdown"],
        avoid: ["fluff"],
      },
      expertise: ["TypeScript"],
      currentFocus: {
        projects: [{ name: "Arete", description: "AI identity", status: "active" }],
        goals: ["Ship MVP"],
      },
      context: {
        personal: ["Night owl"],
        professional: ["Remote worker"],
      },
      privacy: {
        public: [],
        private: [],
        localOnly: [],
      },
      custom: {},
      sources: [],
    };

    const result = AreteIdentitySchema.safeParse(identity);
    expect(result.success).toBe(true);
  });

  it("rejects identity missing required meta fields", () => {
    const invalid = {
      meta: { version: "1.0.0" }, // missing lastModified and deviceId
      core: {},
      communication: {},
      expertise: [],
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    const result = AreteIdentitySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("allows optional core fields", () => {
    const identity = {
      meta: {
        version: "1.0.0",
        lastModified: "2024-01-01T00:00:00.000Z",
        deviceId: "test",
      },
      core: {}, // all optional
      communication: { style: [], format: [], avoid: [] },
      expertise: [],
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    const result = AreteIdentitySchema.safeParse(identity);
    expect(result.success).toBe(true);
  });

  it("validates project status enum", () => {
    const identity = {
      meta: {
        version: "1.0.0",
        lastModified: "2024-01-01T00:00:00.000Z",
        deviceId: "test",
      },
      core: {},
      communication: { style: [], format: [], avoid: [] },
      expertise: [],
      currentFocus: {
        projects: [{ name: "Test", description: "Test", status: "invalid" }],
        goals: [],
      },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    const result = AreteIdentitySchema.safeParse(identity);
    expect(result.success).toBe(false);
  });
});

describe("createEmptyIdentity", () => {
  it("creates valid identity with deviceId", () => {
    const identity = createEmptyIdentity("my-device");

    expect(identity.meta.deviceId).toBe("my-device");
    expect(identity.meta.version).toBe("1.0.0");
    expect(identity.meta.lastModified).toBeDefined();
  });

  it("initializes all arrays as empty", () => {
    const identity = createEmptyIdentity("test");

    expect(identity.expertise).toEqual([]);
    expect(identity.communication.style).toEqual([]);
    expect(identity.currentFocus.projects).toEqual([]);
    expect(identity.context.personal).toEqual([]);
  });

  it("passes schema validation", () => {
    const identity = createEmptyIdentity("test");
    const result = AreteIdentitySchema.safeParse(identity);
    expect(result.success).toBe(true);
  });
});

describe("parseIdentity", () => {
  it("parses valid identity data", () => {
    const data = {
      meta: {
        version: "1.0.0",
        lastModified: "2024-01-01T00:00:00.000Z",
        deviceId: "test",
      },
      core: { name: "Test" },
      communication: { style: [], format: [], avoid: [] },
      expertise: [],
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    const identity = parseIdentity(data);
    expect(identity.core.name).toBe("Test");
  });

  it("throws on invalid data", () => {
    expect(() => parseIdentity({})).toThrow();
  });
});

describe("safeParseIdentity", () => {
  it("returns identity on valid data", () => {
    const data = {
      meta: {
        version: "1.0.0",
        lastModified: "2024-01-01T00:00:00.000Z",
        deviceId: "test",
      },
      core: {},
      communication: { style: [], format: [], avoid: [] },
      expertise: [],
      currentFocus: { projects: [], goals: [] },
      context: { personal: [], professional: [] },
      privacy: { public: [], private: [], localOnly: [] },
      custom: {},
      sources: [],
    };

    const result = safeParseIdentity(data);
    expect(result).not.toBeNull();
  });

  it("returns null on invalid data", () => {
    const result = safeParseIdentity({});
    expect(result).toBeNull();
  });
});
