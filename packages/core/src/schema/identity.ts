import { z } from "zod";

/**
 * Project schema for tracking current work
 */
export const ProjectSchema = z.object({
  name: z.string(),
  description: z.string(),
  status: z.enum(["active", "paused", "completed"]),
});

export type Project = z.infer<typeof ProjectSchema>;

/**
 * Source tracking for where identity data came from
 */
export const SourceSchema = z.object({
  field: z.string(),
  source: z.enum(["user_input", "conversation", "document", "browser"]),
  confidence: z.enum(["high", "medium", "low"]),
  timestamp: z.string(),
  raw: z.string().optional(),
});

export type Source = z.infer<typeof SourceSchema>;

/**
 * Core Arete Identity Schema
 *
 * Philosophy:
 * - User writes prose, system stores structure
 * - Human-readable input, machine-optimized storage
 * - Multiple input modes, single canonical schema
 * - Per-model transforms for injection
 */
export const AreteIdentitySchema = z.object({
  meta: z.object({
    version: z.string().default("1.0.0"),
    lastModified: z.string(),
    deviceId: z.string(),
  }),

  core: z.object({
    name: z.string().optional(),
    role: z.string().optional(),
    location: z.string().optional(),
    background: z.string().optional(),
  }),

  communication: z.object({
    style: z.array(z.string()).default([]),
    format: z.array(z.string()).default([]),
    avoid: z.array(z.string()).default([]),
    voice: z.string().optional(),
  }),

  expertise: z.array(z.string()).default([]),

  currentFocus: z.object({
    projects: z.array(ProjectSchema).default([]),
    goals: z.array(z.string()).default([]),
  }),

  context: z.object({
    personal: z.array(z.string()).default([]),
    professional: z.array(z.string()).default([]),
  }),

  privacy: z.object({
    public: z.array(z.string()).default([]),
    private: z.array(z.string()).default([]),
    localOnly: z.array(z.string()).default([]),
  }),

  custom: z.record(z.any()).default({}),

  sources: z.array(SourceSchema).default([]),
});

export type AreteIdentity = z.infer<typeof AreteIdentitySchema>;

/**
 * Create an empty identity with defaults
 */
export function createEmptyIdentity(deviceId: string): AreteIdentity {
  return AreteIdentitySchema.parse({
    meta: {
      version: "1.0.0",
      lastModified: new Date().toISOString(),
      deviceId,
    },
    core: {},
    communication: {
      style: [],
      format: [],
      avoid: [],
    },
    expertise: [],
    currentFocus: {
      projects: [],
      goals: [],
    },
    context: {
      personal: [],
      professional: [],
    },
    privacy: {
      public: [],
      private: [],
      localOnly: [],
    },
    custom: {},
    sources: [],
  });
}

/**
 * Validate and parse identity data
 */
export function parseIdentity(data: unknown): AreteIdentity {
  return AreteIdentitySchema.parse(data);
}

/**
 * Safely parse identity, returning null on error
 */
export function safeParseIdentity(data: unknown): AreteIdentity | null {
  const result = AreteIdentitySchema.safeParse(data);
  return result.success ? result.data : null;
}
