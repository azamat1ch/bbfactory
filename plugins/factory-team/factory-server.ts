import type { BbPluginApi, PluginCliRegistration } from "@get-bb/plugin-sdk";
import registerTeam, { teamMigrations } from "./server.js";
import { migrations } from "../bbfactory/src/data.js";
import { registerFactoryTasks } from "../bbfactory/src/server.js";
import { registerFactoryGuidance } from "../factory-guidance/server.js";

export default function registerFactory(bb: BbPluginApi) {
  bb.storage.migrate(bb.storage.database(), [...teamMigrations, ...migrations]);
  const commands = new Map<string, PluginCliRegistration>();
  const modules: BbPluginApi = {
    ...bb,
    cli: { register: (command) => { commands.set(command.name, command); } },
  };
  registerTeam(modules, false);
  registerFactoryGuidance(modules);
  registerFactoryTasks(modules, false);
  const tasks = commands.get("factory");
  if (!tasks) throw new Error("Factory task CLI is missing");
  bb.cli.register({
    name: "factory",
    summary: "Team, review and requirement-linked task checks",
    rendersHelp: true,
    commands: [
      ...(tasks.commands ?? []),
      { name: "team", summary: "Read or update Team preferences", usage: "bb factory team get|set --help" },
      { name: "review", summary: "Collect reviewer results", usage: "bb factory review collect --help" },
    ],
    async run(argv, context) {
      const group = argv[0] === "team" || argv[0] === "review" ? argv[0] : "factory";
      const command = commands.get(group);
      if (!command) throw new Error(`Missing Factory CLI group: ${group}`);
      const result = await command.run(group === "factory" ? argv : argv.slice(1), context);
      const help = argv.includes("--help") || argv.includes("-h") || argv.includes("help");
      if (group !== "factory" && help && result.stdout) {
        return { ...result, stdout: result.stdout.replaceAll(`bb ${group} `, `bb factory ${group} `) };
      }
      if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || (argv[0] === "help" && argv.length === 1)) {
        return { ...result, stdout: `${result.stdout ?? ""}\nTeam: bb factory team get|set --help\nReview: bb factory review collect --help\n` };
      }
      return result;
    },
  });
}
