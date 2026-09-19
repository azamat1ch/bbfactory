import { afterEach, expect, it } from "vitest";
import { createFakePluginHost, makePluginAgentConfigurationContext, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import registerFactory from "./factory-server.js";
import registerTeam from "./server.js";

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});
it("upgrades the existing Team database and retains all Factory tools and skills", async () => {
  const old = createFakePluginHost({
    pluginId: "factory-team",
    agentSkillIds: ["team", "pragmatic-orchestration"],
    sdk: { threads: { get: async () => makeThreadResponse() } },
  });
  registerTeam(old.bb);
  const scope = { kind: "thread", id: "thread-test" };
  await old.harness.behavior.callRpc("set", {
    scope,
    preference: { mode: "selected", profiles: [{ providerId: "codex", model: "chosen-model", reasoningLevel: "high" }] },
    expectedRevision: 0,
  });
  const upgraded = await old.harness.lifecycle.reload(registerFactory);
  hosts.push(upgraded);
  expect(await upgraded.harness.behavior.callRpc("get", { scope })).toMatchObject({ revision: 1, preference: { mode: "selected", profiles: [{ model: "chosen-model" }] } });
  expect(await upgraded.harness.behavior.callRpc("factoryListTasks", { threadId: "thread-test" })).toEqual({ tasks: [] });
  expect(await upgraded.harness.behavior.runCli(["team", "get", "--thread", "thread-test", "--json"])).toMatchObject({ exitCode: 0 });
  expect(await upgraded.harness.behavior.runCli(["list", "--input", '{"threadId":"thread-test"}'])).toMatchObject({ exitCode: 0, stdout: '{\n  "tasks": []\n}' });
  expect((await upgraded.harness.behavior.runCli(["review", "collect", "--help"])).stdout).toContain("bb factory review collect");
  const configuration = await upgraded.harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext());
  expect(configuration.tools.map(tool => tool.name).sort()).toEqual(["bb_factory", "bb_review_collect", "bb_team_get"]);
  expect(configuration.skills.sort()).toEqual(["pragmatic-orchestration", "team"]);
  const reloaded = await upgraded.harness.lifecycle.reload(registerFactory);
  hosts.splice(0, 1, reloaded);
  expect(await reloaded.harness.behavior.callRpc("get", { scope })).toMatchObject({ revision: 1, preference: { mode: "selected" } });
  expect(await reloaded.harness.behavior.callRpc("factoryListTasks", { threadId: "thread-test" })).toEqual({ tasks: [] });
});
