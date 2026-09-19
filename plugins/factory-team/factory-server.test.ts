import { afterEach, expect, it } from "vitest";
import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { factoryRpcContract } from "../bbfactory/src/shared.js";
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
    sdk: {
      threads: {
        get: async ({ threadId }) =>
          makeThreadResponse({
            id: threadId,
            projectId: "project-1",
            environmentId: "env-1",
          }),
      },
      environments: {
        get: async ({ environmentId }) => ({
          id: environmentId,
          projectId: "project-1",
          hostId: "host-1",
          path: "/workspace",
        }),
      },
    },
    experimental_callHostRpc: async () => ({
      fingerprint: "content-v1",
      canonicalPath: "/workspace",
      complete: true,
      detail: null,
    }),
  });
  registerTeam(old.bb);
  const scope = { kind: "thread", id: "thread-test" };
  await old.harness.behavior.callRpc("set", {
    scope,
    preference: {
      mode: "selected",
      profiles: [
        { providerId: "codex", model: "chosen-model", reasoningLevel: "high" },
      ],
    },
    expectedRevision: 0,
  });
  const upgraded = await old.harness.lifecycle.reload(registerFactory);
  hosts.push(upgraded);
  expect(
    await upgraded.harness.behavior.callRpc("get", { scope }),
  ).toMatchObject({
    revision: 1,
    preference: { mode: "selected", profiles: [{ model: "chosen-model" }] },
  });
  expect(
    await upgraded.harness.behavior.callRpc("factoryListTasks", {
      threadId: "thread-test",
    }),
  ).toEqual({ tasks: [] });
  expect(
    await upgraded.harness.behavior.runCli([
      "team",
      "get",
      "--thread",
      "thread-test",
      "--json",
    ]),
  ).toMatchObject({ exitCode: 0 });
  expect(
    await upgraded.harness.behavior.runCli([
      "list",
      "--input",
      '{"threadId":"thread-test"}',
    ]),
  ).toMatchObject({ exitCode: 0, stdout: '{\n  "tasks": []\n}' });
  expect(
    (await upgraded.harness.behavior.runCli(["review", "collect", "--help"]))
      .stdout,
  ).toContain("bb factory review collect");
  const created = factoryRpcContract.factoryCreateTask.output.parse(
    await upgraded.harness.behavior.callRpc("factoryCreateTask", {
      threadId: "thread-test",
      spec: {
        goal: "Review agent-owned behavior",
        scope: "Factory composition",
        requirements: [
          {
            id: "R1",
            text: "Agent review records current evidence",
            criterion: "agent",
          },
        ],
        scenarios: [],
        checks: [],
      },
    }),
  );
  await upgraded.harness.behavior.callRpc("factoryStartTask", {
    taskId: created.task.id,
    expectedVersion: 1,
  });
  const agentReview = await upgraded.harness.behavior.runCli([
    "agent-review",
    "--input",
    JSON.stringify({
      taskId: created.task.id,
      requirementIds: ["R1"],
      expectedVersion: 1,
      expectedFingerprint: "content-v1",
      reviewer: "review-agent",
      summary: "Current content satisfies the agent criterion",
      limitations: "",
      artifactRefs: ["review://composition"],
      accepted: true,
    }),
  ]);
  expect(agentReview).toMatchObject({ exitCode: 0 });
  expect(JSON.parse(agentReview.stdout).reviews).toHaveLength(1);
  const taskHelp = await upgraded.harness.behavior.runCli(["--help"]);
  expect(taskHelp.stdout).toContain("start");
  expect(taskHelp.stdout).toContain("agent-review");
  expect(taskHelp.stdout).toContain("note");
  expect(taskHelp.stdout).toContain("judge-many");
  const configuration =
    await upgraded.harness.behavior.resolveAgentConfiguration(
      makePluginAgentConfigurationContext(),
    );
  expect(configuration.tools.map((tool) => tool.name).sort()).toEqual([
    "bb_factory",
  ]);
  const toolReview = await upgraded.harness.callAgentTool("bb_factory", {
    action: "agent-review",
    input: {
      taskId: created.task.id,
      requirementIds: ["R1"],
      expectedVersion: 1,
      expectedFingerprint: "content-v1",
      reviewer: "review-agent",
      summary: "The agent tool uses the canonical action name",
      limitations: "",
      artifactRefs: ["review://agent-tool"],
      accepted: true,
    },
  });
  expect(JSON.parse(String(toolReview)).reviews).toHaveLength(2);
  await expect(
    upgraded.harness.callAgentTool("bb_factory", {
      action: "review",
      input: {},
    }),
  ).rejects.toThrow("arguments are invalid");
  await expect(
    upgraded.harness.callAgentTool("bb_factory", {
      action: "judge-many",
      input: {
        taskId: "task",
        requirementIds: ["R1"],
        accepted: true,
        actor: "agent",
        rationale: "",
        humanConfirmed: true,
        expectedVersion: 1,
        expectedFingerprint: "content",
      },
    }),
  ).rejects.toThrow("arguments are invalid");
  expect(configuration.skills.sort()).toEqual([
    "pragmatic-orchestration",
    "team",
  ]);
  const reloaded = await upgraded.harness.lifecycle.reload(registerFactory);
  hosts.splice(0, 1, reloaded);
  expect(
    await reloaded.harness.behavior.callRpc("get", { scope }),
  ).toMatchObject({ revision: 1, preference: { mode: "selected" } });
  expect(
    await reloaded.harness.behavior.callRpc("factoryListTasks", {
      threadId: "thread-test",
    }),
  ).toMatchObject({
    tasks: [{ id: created.task.id, phase: "active", status: "accepted" }],
  });
});
