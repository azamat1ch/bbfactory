import { afterEach, describe, expect, it } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import plugin from "./server.js";

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});
function setup() {
  const host = createFakePluginHost({
    pluginId: "factory-team",
    sdk: {
      projects: { get: async ({ projectId }) => ({ id: projectId }) },
      threads: {
        get: async ({ threadId }) => {
          if (threadId === "missing") throw new Error("Thread not found");
          return makeThreadResponse({
            id: threadId,
            projectId: "project-1",
            environmentId: "env-remote",
          });
        },
      },
    },
  });
  hosts.push(host);
  plugin(host.bb);
  return host;
}
const threadScope = { kind: "thread", id: "thread-1" };
const projectScope = { kind: "project", id: "project-1" };
const profile = {
  providerId: "acp-devin",
  model: "adaptive",
  reasoningLevel: "medium",
};

describe("Team preferences", () => {
  it("snapshots project defaults at creation without rewriting existing threads", async () => {
    const { harness } = setup();
    await harness.behavior.callRpc("set", {
      scope: projectScope,
      preference: { mode: "selected", profiles: [profile] },
      expectedRevision: 0,
    });
    await harness.behavior.emitThreadEvent("thread.created", {
      thread: makeThreadResponse(),
    });
    await harness.behavior.callRpc("set", {
      scope: projectScope,
      preference: { mode: "off", profiles: [] },
      expectedRevision: 1,
    });
    expect(
      await harness.behavior.callRpc("get", { scope: threadScope }),
    ).toMatchObject({
      preference: { mode: "selected", profiles: [profile] },
      environmentId: "env-remote",
    });
    expect(
      await harness.behavior.callRpc("get", {
        scope: { kind: "thread", id: "new-thread" },
      }),
    ).toMatchObject({ preference: { mode: "off" } });
  });

  it("keeps the native execution tuple and re-reads changes in the same agent session", async () => {
    const { harness } = setup();
    expect(
      await harness.behavior.callRpc("get", { scope: threadScope }),
    ).toMatchObject({ preference: { mode: "auto" } });
    const selected = {
      ...profile,
      providerId: "codex",
      model: "gpt-5.6-luna",
      reasoningLevel: "high",
      serviceTier: "fast",
    };
    await harness.behavior.callRpc("set", {
      scope: threadScope,
      preference: { mode: "selected", profiles: [selected] },
      expectedRevision: 0,
    });
    const result = await harness.behavior.callRpc("get", { scope: threadScope });
    expect(result).toMatchObject({ preference: { profiles: [selected] } });
    expect(harness.inspection.sdk.callsTo("threads.spawn")).toEqual([]);
  });

  it("remembers defaults across projects and restart while preserving local overrides", async () => {
    const { harness } = setup();
    await harness.behavior.callRpc("set", {
      scope: threadScope, preference: { mode: "selected", profiles: [profile] }, expectedRevision: 0,
    });
    const replacement = await harness.lifecycle.reload(plugin);
    hosts.push(replacement);
    const h = replacement.harness;
    expect(await h.behavior.callRpc("get", { scope: { kind: "project", id: "another-project" } }))
      .toMatchObject({ preference: { mode: "selected", profiles: [profile] } });
    await h.behavior.callRpc("set", {
      scope: { kind: "thread", id: "local-thread" }, preference: { mode: "off", profiles: [] }, expectedRevision: 0, remember: false,
    });
    expect(await h.behavior.callRpc("get", { scope: { kind: "thread", id: "fresh-thread" } }))
      .toMatchObject({ preference: { mode: "selected", profiles: [profile] } });
    expect(await h.behavior.callRpc("get", { scope: { kind: "thread", id: "local-thread" } }))
      .toMatchObject({ preference: { mode: "off" } });
    await h.behavior.callRpc("reset", { scope: { kind: "thread", id: "local-thread" }, expectedRevision: 1 });
    expect(await h.behavior.callRpc("get", { scope: { kind: "thread", id: "local-thread" } }))
      .toMatchObject({ preference: { mode: "selected", profiles: [profile] } });
    expect(h.inspection.sdk.callsTo("threads.spawn")).toEqual([]);
  });

  it("rejects empty selections, duplicate models and stale-window writes", async () => {
    const { harness } = setup();
    await expect(
      harness.behavior.callRpc("set", {
        scope: threadScope,
        preference: { mode: "selected", profiles: [] },
        expectedRevision: 0,
      }),
    ).rejects.toThrow();
    await expect(
      harness.behavior.callRpc("set", {
        scope: threadScope,
        preference: {
          mode: "selected",
          profiles: [
            profile,
            { ...profile, reasoningLevel: "high", serviceTier: "fast" },
          ],
        },
        expectedRevision: 0,
      }),
    ).rejects.toThrow();
    await harness.behavior.callRpc("set", {
      scope: threadScope,
      preference: { mode: "off", profiles: [] },
      expectedRevision: 0,
    });
    await expect(
      harness.behavior.callRpc("set", {
        scope: threadScope,
        preference: { mode: "auto", profiles: [] },
        expectedRevision: 0,
      }),
    ).rejects.toThrow(/another window/);
    expect(
      await harness.behavior.callRpc("get", { scope: threadScope }),
    ).toMatchObject({ preference: { mode: "off" }, revision: 1 });
  });

  it("preserves choices through plugin reload and rejects missing threads", async () => {
    const { harness } = setup();
    await harness.behavior.callRpc("set", {
      scope: threadScope,
      preference: { mode: "selected", profiles: [profile] },
      expectedRevision: 0,
    });
    const replacement = await harness.lifecycle.reload(plugin);
    hosts.push(replacement);
    expect(
      await replacement.harness.behavior.callRpc("get", { scope: threadScope }),
    ).toMatchObject({
      preference: { mode: "selected", profiles: [profile] },
      revision: 1,
    });
    await expect(
      replacement.harness.behavior.callRpc("set", {
        scope: { kind: "thread", id: "missing" },
        preference: { mode: "off", profiles: [] },
        expectedRevision: 0,
      }),
    ).rejects.toThrow(/not found/);
  });

  it("repairs earlier duplicate-model preferences without losing the first effort or allowing stale writes", async () => {
    const { bb, harness } = setup();
    const db = bb.storage.database();
    const first = { ...profile, reasoningLevel: "high" };
    db.prepare("INSERT INTO team_preferences (scope, value) VALUES (?, ?)").run(
      "thread:thread-1",
      JSON.stringify({
        preference: { mode: "selected", profiles: [first, profile] },
        revision: 3,
      }),
    );
    expect(
      await harness.behavior.callRpc("get", { scope: threadScope }),
    ).toMatchObject({
      preference: { mode: "selected", profiles: [first] },
      revision: 4,
    });
    expect(
      await harness.behavior.callRpc("get", { scope: threadScope }),
    ).toMatchObject({ revision: 4 });
    await expect(
      harness.behavior.callRpc("set", {
        scope: threadScope,
        preference: { mode: "auto", profiles: [] },
        expectedRevision: 3,
      }),
    ).rejects.toThrow(/another window/);
    await harness.behavior.callRpc("set", {
      scope: threadScope,
      preference: { mode: "off", profiles: [first] },
      expectedRevision: 4,
    });
  });

  it("provides CLI parity and rejects ambiguous scope", async () => {
    const { harness } = setup();
    const saved = await harness.behavior.runCli([
      "set",
      "--thread",
      "thread-1",
      "--mode",
      "selected",
      "--profiles",
      JSON.stringify([profile]),
      "--json",
    ]);
    expect(saved.exitCode).toBe(0);
    const get = await harness.behavior.runCli([
      "get",
      "--thread",
      "thread-1",
      "--json",
    ]);
    expect(JSON.parse(get.stdout!)).toMatchObject({
      preference: { mode: "selected", profiles: [profile] },
      revision: 1,
    });
    expect(
      (
        await harness.behavior.runCli([
          "set",
          "--thread",
          "thread-1",
          "--mode",
          "off",
          "--revision",
          "0",
          "--json",
        ])
      ).exitCode,
    ).not.toBe(0);
    expect(
      (
        await harness.behavior.runCli([
          "get",
          "--thread",
          "thread-1",
          "--project",
          "project-1",
          "--json",
        ])
      ).exitCode,
    ).not.toBe(0);
  });
});
