import { afterEach, expect, it } from "vitest";
import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
} from "@get-bb/plugin-sdk/testing";
import { teamMigrations } from "./team/server.js";
import { migrations } from "./tasks/data.js";
import { factoryMigrations } from "./migrations.js";
import registerFactory from "./factory-server.js";

const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose();
});

it("retains the Team ledger and legacy owners including assignments missing launch artifacts across repeated upgrades", () => {
  const host = createFakePluginHost({ pluginId: "factory-team" });
  hosts.push(host);
  const db = host.bb.storage.database();
  host.bb.storage.migrate(db, [...teamMigrations, ...migrations]);
  db.prepare("INSERT INTO team_preferences VALUES (?, ?)").run(
    "thread:origin",
    '{"mode":"off"}',
  );
  db.prepare("INSERT INTO factory_tasks VALUES (?, ?, ?)").run(
    "task",
    "origin",
    JSON.stringify({ assignments: [{ launchId: "missing-artifact" }] }),
  );
  db.prepare("INSERT INTO factory_artifacts VALUES (?, ?, ?, ?)").run(
    "artifact",
    "task",
    "native-launch-request",
    JSON.stringify({ request: { launchId: "with-artifact" } }),
  );
  host.bb.storage.migrate(db, factoryMigrations);
  host.bb.storage.migrate(db, factoryMigrations);
  expect(
    db
      .prepare(
        "SELECT launch_id FROM factory_legacy_launches ORDER BY launch_id",
      )
      .pluck()
      .all(),
  ).toEqual(["missing-artifact", "with-artifact"]);
  expect(db.prepare("SELECT value FROM team_preferences").pluck().get()).toBe(
    '{"mode":"off"}',
  );
  expect(
    db.prepare("SELECT COUNT(*) FROM factory_artifacts").pluck().get(),
  ).toBe(1);
});

it("gives ordinary native subagents bounded worker context without the lead skill or tools", async () => {
  const host = createFakePluginHost({
    pluginId: "factory-team",
    agentSkillIds: ["factory"],
  });
  hosts.push(host);
  await registerFactory(host.bb);
  const context = makePluginAgentConfigurationContext();
  context.thread.parentThreadId = "lead";
  const worker = await host.harness.behavior.resolveAgentConfiguration(context);
  expect(worker.skills).toEqual([]);
  expect(worker.tools).toEqual([]);
  expect(worker.instructions).toContain("bounded assignment");
});
