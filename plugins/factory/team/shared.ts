import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const identifier = z.string().trim().min(1).max(200);
export const scopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user"), id: z.literal("default") }),
  z.strictObject({ kind: z.literal("thread"), id: identifier }),
  z.strictObject({ kind: z.literal("project"), id: identifier }),
]);
export const profileSchema = z.strictObject({
  providerId: identifier,
  model: identifier,
  reasoningLevel: z.enum([
    "none",
    "low",
    "medium",
    "high",
    "xhigh",
    "ultracode",
    "max",
    "ultra",
  ]),
  serviceTier: z.enum(["default", "fast"]).optional(),
});
export const preferenceSchema = z
  .strictObject({
    mode: z.enum(["auto", "off", "selected"]),
    profiles: z.array(profileSchema).max(32),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "selected" && value.profiles.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Choose at least one implementer.",
        path: ["profiles"],
      });
    }
    const keys = value.profiles.map((profile) =>
      JSON.stringify([profile.providerId, profile.model]),
    );
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each model can only be selected once per provider.",
        path: ["profiles"],
      });
    }
  });
export const recordSchema = z.strictObject({
  preference: preferenceSchema,
  revision: z.number().int().nonnegative(),
});
export const teamRpcContract = defineRpcContract({
  reset: {
    input: z.strictObject({
      scope: scopeSchema,
      expectedRevision: z.number().int().nonnegative(),
    }),
    output: recordSchema,
  },
  get: {
    input: z.strictObject({ scope: scopeSchema }),
    output: z.strictObject({
      ...recordSchema.shape,
      environmentId: z.string().nullable(),
    }),
  },
  set: {
    input: z.strictObject({
      scope: scopeSchema,
      preference: preferenceSchema,
      expectedRevision: z.number().int().nonnegative(),
      remember: z.boolean().default(true),
    }),
    output: recordSchema,
  },
});
export type TeamScope = z.infer<typeof scopeSchema>;
export type TeamPreference = z.infer<typeof preferenceSchema>;
export type TeamRecord = z.infer<typeof recordSchema>;
export type TeamView = z.infer<(typeof teamRpcContract)["get"]["output"]>;
export const DEFAULT_PREFERENCE: TeamPreference = {
  mode: "auto",
  profiles: [],
};
export const TEAM_CHANGED = "team-changed";
export const TEAM_INSTRUCTIONS = `Factory connects a conversational spec to native assignments and versioned evidence. Use the factory skill for substantial work and bb factory --help to discover commands. Read bb factory team get --json before choosing workers. Prefer direct work when delegation adds overhead. Explicit user instructions override Team; Off stays direct, Auto permits useful delegation, Selected limits eligible profiles without requiring launches. Preserve the chosen lead. Worker completion is not acceptance; record tests, agent inspection or explicit human judgment against the reviewed version.`;
