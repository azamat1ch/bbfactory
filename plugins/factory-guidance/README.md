# Factory guidance internal package

Bundled automatically inside the single [Factory plugin](../factory-team/README.md); no separate installation is needed. Use `bb factory review collect` for the collector CLI.

Read [PLUGIN_OVERVIEW.md](PLUGIN_OVERVIEW.md) for scope, [MIGRATION.md](MIGRATION.md)
for source disposition, [PORT-COVERAGE.md](PORT-COVERAGE.md) for evidence limits,
and the [skill](skills/pragmatic-orchestration/SKILL.md) for operating instructions.

Review helpers are pure result processors. They do not launch processes, manage
threads, claim current content identity, or accept Factory tasks.
