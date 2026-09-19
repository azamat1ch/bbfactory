# Execution provenance and ownership

Factory's execution module is adapted from the BB Workflows implementation in
`plugins/workflows/src` at the consolidation base (`ab6ec254d`). BB's MIT license
and copyright in the repository root apply. Standalone Workflows source, its
skill, and opt-in plugin remain available.

The parser, durable calls, runtime, worker lifecycle, recovery, supervision,
settings, host canonicalization, and progress views are retained. Factory adds
internal task calls, one CLI namespace and worker-only structured-result tools;
it omits the standalone author tool and composer activity dashboard.

This is a vendored source copy, not a second scheduler design. Shared behavioral
fixes must be reviewed in both modules until a neutral internal library is
extracted. Core tests are retained in both packages. Standalone app, author-tool
and CLI registration tests remain with standalone Workflows; Factory composition
and internal integration have their own tests. The read-only peer-owner guard is
also mirrored in core disable/removal enforcement.

## Drain and handoff

The `factory-team` installation ID and database stay unchanged. The existing
Team/task migration prefix is preserved; execution tables and a legacy-launch
index are appended. Never insert a migration into the released prefix.

Every pre-upgrade task assignment and immutable launch request retains Workflows
ownership, including assignments without a launch artifact. Factory reads its
legacy database read-only for inspection and settled results. Unsettled cancel
requests go to Workflows. It never recreates an old launch in Factory's database.
Missing legacy data is an actionable error, not permission to relaunch.

New execution is blocked while the other owner's database contains queued,
running or unconfirmed spawn attempts. This conservative whole-owner drain also
blocks disjoint workspaces; it intentionally avoids transferring uncertain
ownership. The check and insert are synchronous in the single BB server process.
Multiple server processes writing the same data directory are unsupported.

Fresh installations disable standalone Workflows. Upgrades retain the saved
Workflows enablement and owner; disabling/removing either execution plugin is
rejected until its runs and spawn attempts settle. Inspect/cancel legacy runs via
`bb workflows` while they drain, then explicitly disable Workflows. Factory does
not automatically change the user's standalone opt-in setting. Do not disable
Workflows mid-run or delete either database. Existing restart/recovery semantics
remain with the original owner; migration itself starts or stops no workers.

Legacy guidance/waits remain on the Workflows RPC/CLI surfaces until drain. New
Factory control uses `bb factory execution`; its discoverable RPC contract is on
`factory-team`. No legacy runtime record is claimed as migrated execution.

## Advisory reader access

Factory execution accepts `ownership: "read-only" | "exclusive"` on assignments;
missing legacy metadata defaults to exclusive. This is coordination metadata,
not a provider sandbox or permission change. Read-only worker prompts explicitly
instruct workers not to modify workspace files. Existing permissionMode remains
unchanged. Concurrent readers may share a canonical workspace; a writer waits
for prior readers in the same launch and blocks against overlapping active runs.
Stopped/failed runs with unconfirmed workers remain blocking even when they were
read-only. Cross-run sharing conservatively requires every assignment in the
existing run to be read-only; mixed runs retain exclusive reservation until
settled. Cross-plugin owner drain remains exclusive. Stored legacy requests are
normalized for identity checks without rewriting their execution records.

Factory-only continuation keeps settled managed sessions until retention cleanup.
A fresh assignment may name `continuationThreadId`; it reserves the existing
session and workspace through the normal durable execution path. The current
call owns the mutable thread link, while prior calls retain their thread identity
in `workflow_spawn_attempts` and inspection history. Results and completion events
remain separate per run. Standalone Workflows does not expose this assignment API.
