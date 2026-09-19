import { factoryMigrations } from "./migrations.js";
import { registerExecutionCommands } from "./execution/commands.js";
import registerExecution from "./execution/server.js";
import { TEAM_INSTRUCTIONS } from "./team/shared.js";
import type { BbPluginApi, PluginCliRegistration } from "@get-bb/plugin-sdk";
import registerTeam from "./team/server.js";
import { registerFactoryTasks } from "./tasks/server.js";
import { registerFactoryGuidance } from "./review/server.js";

export default async function registerFactory(bb: BbPluginApi) {
  bb.storage.migrate(bb.storage.database(), factoryMigrations);
  const commands = new Map<string, PluginCliRegistration>();
  const modules: BbPluginApi = {
    ...bb,
    agents: { ...bb.agents, configure: () => {} },
    cli: {
      register: (command) => {
        commands.set(command.name, command);
      },
    },
  };
  registerTeam(modules, false);
  registerFactoryGuidance(modules);
  const { service, execution, configuration } =
    await registerExecution(modules);
  registerExecutionCommands(modules, execution);
  registerFactoryTasks(modules, false, execution);
  bb.agents.configure((context) => {
    if (
      service.agentConfiguration(context.thread.id) !== null ||
      context.origin.pluginId === bb.pluginId
    ) {
      return configuration(context);
    }
    if (context.thread.parentThreadId !== null)
      return {
        tools: [],
        skills: [],
        instructions:
          "Follow your bounded assignment, preserve partial work, and return results, checks and unresolved limitations to your lead.",
      };
    return {
      tools: ["bb_factory"],
      skills: ["factory"],
      instructions: TEAM_INSTRUCTIONS,
    };
  });
  const tasks = commands.get("factory");
  if (!tasks) throw new Error("Factory task CLI is missing");
  bb.cli.register({
    name: "factory",
    summary: "Team, review and requirement-linked task checks",
    rendersHelp: true,
    commands: [
      ...(tasks.commands ?? []),
      {
        name: "execution",
        summary: "Run, inspect and cancel native execution",
        usage: "bb factory execution --help",
      },
      {
        name: "team",
        summary: "Read or update Team preferences",
        usage: "bb factory team get|set --help",
      },
      {
        name: "review",
        summary: "Collect reviewer results",
        usage: "bb factory review collect --help",
      },
    ],
    async run(argv, context) {
      const group =
        argv[0] === "execution"
          ? "workflows"
          : argv[0] === "team" || argv[0] === "review"
            ? argv[0]
            : "factory";
      const command = commands.get(
        group === "workflows" &&
          ["inspect", "guide", "guide-status", "wait"].includes(
            argv[1] === "help" ? (argv[2] ?? "") : (argv[1] ?? ""),
          )
          ? "execution-control"
          : group,
      );
      if (!command) throw new Error(`Missing Factory CLI group: ${group}`);
      const result = await command.run(
        group === "factory" ? argv : argv.slice(1),
        context,
      );
      const help =
        argv.includes("--help") ||
        argv.includes("-h") ||
        argv.includes("help") ||
        (group === "workflows" && argv.length === 1);
      if (group !== "factory" && help && result.stdout) {
        const executionRootHelp =
          group === "workflows" &&
          (argv.length === 1 ||
            ["--help", "-h"].includes(argv[1] ?? "") ||
            (argv[1] === "help" && argv.length === 2));
        const controlHelp = executionRootHelp
          ? await commands.get("execution-control")?.run(["--help"], context)
          : undefined;
        return {
          ...result,
          stdout:
            result.stdout
              .replaceAll(
                `bb ${group} `,
                `bb factory ${group === "workflows" ? "execution" : group} `,
              )
              .replaceAll("bb execution-control ", "bb factory execution ") +
            (controlHelp?.stdout
              ? "\n" +
                controlHelp.stdout.replaceAll(
                  "bb execution-control",
                  "bb factory execution",
                )
              : ""),
        };
      }
      if (
        argv.length === 0 ||
        argv[0] === "--help" ||
        argv[0] === "-h" ||
        (argv[0] === "help" && argv.length === 1)
      ) {
        return {
          ...result,
          stdout: `${result.stdout ?? ""}\nExecution: bb factory execution --help\nTeam: bb factory team get|set --help\nReview: bb factory review collect --help\n`,
        };
      }
      if (group === "workflows" && result.exitCode !== 0) {
        const rewrite = (text: string) =>
          text
            .replaceAll("bb workflows", "bb factory execution")
            .replaceAll("bb execution-control", "bb factory execution");
        return {
          ...result,
          ...(result.stdout === undefined
            ? {}
            : { stdout: rewrite(result.stdout) }),
          ...(result.stderr === undefined
            ? {}
            : { stderr: rewrite(result.stderr) }),
        };
      }
      return result;
    },
  });
}
