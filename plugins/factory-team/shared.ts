import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const identifier = z.string().trim().min(1).max(200);
export const scopeSchema = z.discriminatedUnion("kind", [
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
export const TEAM_INSTRUCTIONS = `Before each new user task, call bb_team_get to read this conversation's current Team preference, even in an existing session. Treat it as the user's delegation preference, not permission to start work. Explicit user directions for this task override it; do not silently change the saved preference. Auto: decide whether delegation is worth its coordination cost. Off: work directly unless the user explicitly overrides it. Selected: when delegating, use only the returned provider/model/reasoning/service-tier profiles unless the user explicitly overrides them. These are eligible profiles, not worker counts or instructions to launch one of each. Check native provider availability and permissions before launching; if a selected profile is unavailable, report that instead of silently substituting. Use BB-native worker threads for cross-provider delegation and preserve the current lead. Isolate independent writers, expose native worker progress, and distinguish completion from verified acceptance. Do not infer quota from a model or account name.`;
