import { teamMigrations } from "./team/server.js";
import { migrations } from "./tasks/data.js";
import { migrations as executionMigrations } from "./execution/data.js";

export const factoryMigrations = [
  ...teamMigrations,
  ...migrations,
  ...executionMigrations,
  `CREATE TABLE factory_legacy_launches (task_id TEXT NOT NULL, launch_id TEXT NOT NULL, PRIMARY KEY(task_id, launch_id)); INSERT OR IGNORE INTO factory_legacy_launches SELECT task_id, json_extract(value, '$.request.launchId') FROM factory_artifacts WHERE kind = 'native-launch-request'; INSERT OR IGNORE INTO factory_legacy_launches SELECT tasks.id, json_extract(assignment.value, '$.launchId') FROM factory_tasks tasks, json_each(tasks.value, '$.assignments') assignment WHERE json_extract(assignment.value, '$.launchId') IS NOT NULL;`,
];
