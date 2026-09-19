import { z } from "zod";
import type { Db } from "./data.js";
import { executionStartSchema } from "./execution-contract.js";

const occupiedRunSchema = z.object({
  id: z.string(),
  status: z.string(),
  argsJson: z.string(),
});

export function hasWorkspaceConflict(
  db: Db,
  requested: {
    environmentId: string;
    hostId: string;
    rootPath: string;
    ownership: "read-only" | "exclusive";
  },
): boolean {
  const runs = z.array(occupiedRunSchema).parse(
    db
      .prepare(
        `
    SELECT runs.id, runs.status, runs.args_json AS argsJson FROM workflow_runs runs
    WHERE (runs.status IN ('queued', 'running') OR EXISTS (
      SELECT 1 FROM workflow_spawn_attempts attempts WHERE attempts.run_id = runs.id AND attempts.state != 'stopped'
    )) AND (
      runs.environment_id = @environmentId
      OR EXISTS (SELECT 1 FROM json_each(runs.args_json, '$.assignments') assignments
        WHERE json_extract(assignments.value, '$.environment.environmentId') = @environmentId)
      OR EXISTS (SELECT 1 FROM workflow_execution_environments environments
        WHERE environments.run_id = runs.id AND environments.host_id = @hostId AND (
          rtrim(environments.root_path, '/') = rtrim(@rootPath, '/')
          OR substr(rtrim(environments.root_path, '/'), 1, length(rtrim(@rootPath, '/')) + 1) = rtrim(@rootPath, '/') || '/'
          OR substr(rtrim(@rootPath, '/'), 1, length(rtrim(environments.root_path, '/')) + 1) = rtrim(environments.root_path, '/') || '/'
        ))
    )`,
      )
      .all({
        environmentId: requested.environmentId,
        hostId: requested.hostId,
        rootPath: requested.rootPath,
      }),
  );
  return runs.some((run) => {
    if (
      requested.ownership !== "read-only" ||
      !run.id.startsWith("wfr_exec_") ||
      !["queued", "running"].includes(run.status)
    )
      return true;
    const parsed = executionStartSchema.safeParse(JSON.parse(run.argsJson));
    return (
      !parsed.success ||
      parsed.data.assignments.some(
        (assignment) => assignment.ownership !== "read-only",
      )
    );
  });
}
