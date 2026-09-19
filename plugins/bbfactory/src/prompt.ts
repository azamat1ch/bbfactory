import type { FactoryCheckSpec, FactoryTaskView } from "./shared.js";

const MAX_GOAL_CHARS = 4000;
const MAX_SCOPE_CHARS = 8000;

export function buildWorkerPrompt(task: FactoryTaskView): string {
  const checks: FactoryCheckSpec[] = task.checks;
  const lines = [
    `You are a bbfactory worker thread completing one bounded task.`,
    ``,
    `# Task ${task.id}`,
    ``,
    `## Goal`,
    task.goal.slice(0, MAX_GOAL_CHARS),
    ``,
    `## Scope`,
    task.scope.length > 0 ? task.scope.slice(0, MAX_SCOPE_CHARS) : "The whole workspace.",
  ];
  if (task.requirementIds.length > 0) {
    lines.push(``, `## Requirements`);
    for (const id of task.requirementIds) lines.push(`- ${id}`);
  }
  if (checks.length > 0) {
    lines.push(``, `## Declared checks (run independently after you finish)`);
    for (const check of checks) lines.push(`- \`${check.argv.join(" ")}\``);
  }
  lines.push(
    ``,
    `## Contract`,
    `- Make the change inside this workspace only. Do not commit unless the task asks for it.`,
    `- Do not modify the declared checks to make them pass.`,
    `- When you believe the task is done, end your turn with a short summary of what changed.`,
    `- Your completion is not acceptance: the task is verified independently against the workspace contents.`,
  );
  return lines.join("\n");
}
