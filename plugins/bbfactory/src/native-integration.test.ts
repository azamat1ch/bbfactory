import { createConnection, migrate } from "@bb/db";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { expect, it } from "vitest";
import { migrations } from "../../workflows/src/data.js";
import { registerExecutionRpc } from "../../workflows/src/execution.js";
import { createWorkflowService } from "../../workflows/src/service.js";
import { createFactoryService } from "./service.js";

it("carries two selected assignments through real Workflows and only accepts checked integration content", async () => {
  const nativeDb = createConnection(":memory:");
  const factoryDb = createConnection(":memory:");
  migrate(nativeDb);
  migrate(factoryDb);
  let workers = 0;
  let fingerprint = "integrated-v1";
  let teamMode = "selected";
  const profile = {
    providerId: "codex",
    model: "gpt-test",
    reasoningLevel: "medium" as const,
    serviceTier: "default" as const,
  };
  const provider = {
    id: "codex",
    displayName: "Codex",
    logoUrl: null,
    available: true,
    capabilities: { permissionModes: ["full"], supportsThreadArchive: true },
    reasoningLevels: [{ id: "medium" }],
    serviceTiers: [{ id: "default" }],
    composerActions: [],
  };
  const sdk = {
    threads: {
      get: async ({ threadId }: { threadId: string }) =>
        ({
          id: threadId,
          projectId: "project",
          environmentId: "integration",
          providerId: "codex",
          status: threadId === "origin" ? "idle" : "active",
          archivedAt: null,
          deletedAt: null,
        }) as never,
      list: async () => [],
      output: async () => ({ output: null }),
      defaultExecutionOptions: async () =>
        ({ ...profile, permissionMode: "full", source: "default" }) as never,
      spawn: async () => ({ id: `child-${++workers}` }) as never,
      send: async () => ({ ok: true as const }),
      stop: async () => ({ ok: true as const }),
      archive: async () => ({ ok: true }) as never,
    },
    environments: {
      get: async ({ environmentId }: { environmentId: string }) =>
        ({
          id: environmentId,
          projectId: "project",
          hostId: "host",
          path: `/worktrees/${environmentId}`,
        }) as never,
    },
    providers: {
      list: async () => [provider] as never,
      models: async () =>
        ({
          providers: [provider],
          models: [
            {
              id: "gpt-test",
              model: "gpt-test",
              displayName: "GPT Test",
              description: "test",
              supportedReasoningEfforts: [
                { reasoningEffort: "medium", description: "test" },
              ],
              defaultReasoningEffort: "medium",
              isDefault: true,
            },
          ],
          selectedOnlyModels: [],
          modelLoadError: null,
        }) as never,
    },
  };
  const native = createFakePluginHost({
    pluginId: "workflows",
    sdk,
    experimental_callHostRpc: (call) => ({
      path: (call.input as { path: string }).path,
    }),
  });
  native.bb.storage.database = () => nativeDb.$client;
  native.bb.storage.migrate(nativeDb.$client, migrations);
  const execution = createWorkflowService(native.bb, nativeDb.$client);
  registerExecutionRpc(native.bb, nativeDb.$client, execution);
  const factory = createFakePluginHost({
    pluginId: "factory-team",
    sdk: {
      ...sdk,
      plugins: {
        callRpc: async (call: {
          pluginId: string;
          method: string;
          input?: unknown;
        }) => {
          if (call.pluginId === "factory-team")
            return {
              preference: { mode: teamMode, profiles: [profile] },
              revision: 4,
              environmentId: "integration",
            };
          expect(call.pluginId).toBe("workflows");
          return native.harness.callRpc(call.method, call.input);
        },
      },
    },
    experimental_callHostRpc: (call) =>
      call.method === "captureState"
        ? {
            canonicalPath: (call.input as { rootPath: string }).rootPath,
            fingerprint,
            complete: true,
            detail: null,
          }
        : {
            exitCode: 0,
            timedOut: false,
            settled: true,
            startedAt: 1,
            finishedAt: 2,
            logRef: "/checks/log",
            output: "passed",
            detail: null,
          },
  });
  factory.bb.storage.database = () => factoryDb.$client;
  const service = createFactoryService(factory.bb);
  const controller = new AbortController();
  const running = execution.runWorker(controller.signal);
  try {
    const { task } = await service.createTask({
      threadId: "origin",
      spec: {
        problem: "Independent changes need integration",
        outcome: "Both changes pass together",
        goal: "Implement two independent changes",
        scope: "src",
        requirements: [
          {
            id: "R1",
            text: "Integrated changes pass regression",
            criterion: "automated",
            verificationMethods: [],
            reviewInstructions: "",
            artifactRefs: [],
          },
        ],
        scenarios: [],
        checks: [
          {
            id: "regression",
            requirementIds: ["R1"],
            testRef: "tests/regression.ts",
            argv: ["node", "tests/regression.ts"],
            timeoutMs: 1000,
            required: true,
          },
        ],
        teamPlan: [],
      },
    });
    await service.startTask({ taskId: task.id, expectedVersion: 1 });
    const assignments = ["a", "b"].map((id) => ({
      id,
      role: "implement" as const,
      title: `Change ${id}`,
      prompt: `Implement ${id}`,
      scope: `src/${id}`,
      ownership: "exclusive" as const,
      profile,
      environmentId: `worker-${id}`,
      permissionMode: "full" as const,
    }));
    teamMode = "off";
    await expect(
      service.assign({ taskId: task.id, launchId: "work", assignments }),
    ).rejects.toThrow("Team is Off");
    teamMode = "selected";
    await service.assign({ taskId: task.id, launchId: "work", assignments });
    await expect.poll(() => workers).toBe(2);
    await expect(service.verifyTask(task.id)).rejects.toThrow(
      "settled native assignments",
    );
    execution.onThreadIdle("child-1", "First change done");
    execution.onThreadIdle("child-2", "Second change done");
    await expect
      .poll(async () =>
        (await service.getTaskDetail(task.id)).assignments.map(
          (a) => a.nativeStatus,
        ),
      )
      .toEqual(["succeeded", "succeeded"]);
    expect((await service.getTaskDetail(task.id)).task.status).toBe(
      "unverified",
    );
    const accepted = await service.verifyTask(task.id);
    expect(accepted.task.status).toBe("accepted");
    expect(accepted.evidence[0]?.content.canonicalPath).toBe(
      "/worktrees/integration",
    );
    expect(accepted.assignments.map((a) => a.environmentId)).toEqual([
      "worker-a",
      "worker-b",
    ]);
    fingerprint = "integrated-v2";
    expect((await service.getTaskDetail(task.id)).task.status).toBe("stale");
  } finally {
    controller.abort();
    await running;
    await native.harness.dispose();
    await factory.harness.dispose();
    nativeDb.$client.close();
    factoryDb.$client.close();
  }
});
