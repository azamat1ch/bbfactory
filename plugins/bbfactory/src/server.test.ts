import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
  makeThreadResponse,
  type FakePluginHarness,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "./server.js";

const ORIGIN_THREAD_ID = "thr_origin";

function makeHost() {
  return createFakePluginHost({
    pluginId: "bbfactory",
    agentSkillIds: ["bbfactory"],
    sdk: {
      threads: {
        get: async (input: { threadId: string }) => ({
          id: input.threadId,
          projectId: "project_1",
          environmentId: "env_1",
          status: "idle",
          archivedAt: null,
          deletedAt: null,
        }),
        list: async () => [],
      },
      environments: {
        get: async (input: { environmentId: string }) => ({
          id: input.environmentId,
          hostId: "host_1",
          path: "/workspace/project",
        }),
      },
      providers: {
        list: async () => [],
      },
    },
    experimental_callHostRpc: () => {
      throw new Error("no host in this test");
    },
  });
}

describe("bbfactory plugin wiring", () => {
  const hosts: FakePluginHarness[] = [];
  afterEach(async () => {
    await Promise.all(hosts.map((host) => host.dispose()));
    hosts.length = 0;
  });

  it("registers rpc, cli, agent tool and the reconcile service", async () => {
    const { bb, harness } = makeHost();
    hosts.push(harness);
    await plugin(bb);

    expect(
      harness.registrations.services.map((service) => service.name),
    ).toEqual(["factory-reconcile"]);
    expect(
      harness.registrations.agentTools.map((tool) => tool.name),
    ).toEqual(["bb_factory"]);
    expect(harness.registrations.cli?.name).toBe("factory");
    expect(harness.registrations.rpcMethods).toEqual(
      expect.arrayContaining([
        "factoryCreateTask",
        "factoryStartAttempt",
        "factoryVerifyTask",
        "factoryCancelTask",
      ]),
    );
  });

  it("serves the durable record over the CLI, not model text", async () => {
    const { bb, harness } = makeHost();
    hosts.push(harness);
    await plugin(bb);

    const created = await harness.runCli(
      [
        "task",
        "create",
        "--goal",
        "Implement the thing",
        "--check",
        '["run-tests"]',
      ],
      { threadId: ORIGIN_THREAD_ID, projectId: "project_1" },
    );
    expect(created.exitCode).toBe(0);
    const parsed = JSON.parse(created.stdout ?? "") as {
      task: { id: string; status: string };
      previewDirective: string;
    };
    expect(parsed.task.status).toBe("proposed");
    expect(parsed.previewDirective).toContain(parsed.task.id);

    const shown = await harness.runCli(["task", "show", parsed.task.id], {
      threadId: ORIGIN_THREAD_ID,
      projectId: "project_1",
    });
    expect(shown.exitCode).toBe(0);
    const detail = JSON.parse(shown.stdout ?? "") as {
      task: { id: string };
      attempts: unknown[];
      evidence: unknown[];
    };
    expect(detail.task.id).toBe(parsed.task.id);
  });

  it("exposes the tool to leads and hides it from its own workers", async () => {
    const { bb, harness } = makeHost();
    hosts.push(harness);
    await plugin(bb);

    const lead = await harness.resolveAgentConfiguration(
      makePluginAgentConfigurationContext(),
    );
    expect(lead.tools.map((tool) => tool.name)).toEqual(["bb_factory"]);
    expect(lead.skills).toEqual(["bbfactory"]);

    const worker = await harness.resolveAgentConfiguration(
      makePluginAgentConfigurationContext({
        pluginMetadata: { factoryWorker: 1 },
      }),
    );
    expect(worker.tools).toEqual([]);
    expect(worker.instructions).toContain("bbfactory worker");
  });

  it("forwards thread lifecycle events to worker completion handling", async () => {
    const { bb, harness } = makeHost();
    hosts.push(harness);
    await plugin(bb);

    const { errors } = await harness.emitThreadEvent("thread.idle", {
      thread: makeThreadResponse({ id: "thr_unknown" }),
      lastAssistantText: "done",
    });
    expect(errors).toEqual([]);
  });
});
