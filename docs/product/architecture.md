# Native BB architecture

Factory owns product records and acceptance. Workflows and BB threads own
execution. Direct work is valid; delegation, review and research are ordinary
assignments, with optional worktrees and no fixed worker count or provider hierarchy.

| Owner | Responsibility |
| --- | --- |
| Factory | Team preferences/picker, adapted guidance, task/spec records, native associations, requirement-linked checks, review findings, acceptance and compact UI |
| Workflows and BB threads | Scheduling, sessions, progress, transport, retries, cancellation and recovery |
| Native environment providers | Existing checkouts, optional worktrees and supported environments |
| Provider plugins, Provider Usage and Account Pooler | Execution/authentication, quota observations and supported account fallback |

## One product feature

The bundled [Factory package](../../plugins/factory-team/README.md) retains installed
ID `factory-team`, its database and Team `get`/`set` RPCs. Composition adds task
migrations after the original Team migration, registers the three modules once,
and stages guidance assets automatically. The `bbfactory` and `factory-guidance`
source packages are internal modules, not separate user toggles. Default agent
selection includes Team, task and review tools plus both skills.

The canonical CLI is `bb factory <action>`, `bb factory team get|set` and
`bb factory review collect`. Existing `bb team` scripts must use `bb factory team`.
All Factory RPCs use `factory-team`; `builtin:` identifies package sources only.
Workflows remains a separate reusable plugin enabled on fresh installs. Existing
enabled/disabled choices are retained during upgrades.

## Native execution boundary

Workflows exposes typed discoverable experimental Start, Inspect, Cancel and
Guide RPCs over its existing service. Per-assignment environment/access choices
are recorded. Canonical root locks serialize competing checkout writers;
isolated worktrees can run concurrently. Ownership text alone is advisory.
Durable native launch identity supports recovery when the spawn reply is lost.
Settlement is explicitly pending, unconfirmed or confirmed; thread completion
alone does not establish that detached processes cannot write.

Factory reads the same versioned Team preference used by the picker, validates
profiles on the target host and retains the preference revision and explicit
user override. Selected profiles limit model choices, not worker count. Changes
affect later assignments and never silently replace the user's lead or models.

## Requirements and evidence

A task links requirements, optional scenarios and actual project checks. Host
verification records content identity, full check/spec versions, environment,
result and bounded logs. Linux systemd scopes contain check descendants;
unsupported capture or unsettled checks remain unverified. Freshness is checked
on reads and during active task polling. Changed content invalidates evidence.

A passing worker or command is insufficient when a requirement has no linked
check, a required check fails, or a required review finding remains open. Human
criteria require an explicit version/content-bound attestation. Stopping a task
is permanent; subsequent work starts a new task after native settlement.

## Evidence limits

[Runtime and UI tests](first-slice.md) exercise these boundaries locally. They do
not establish real-provider end-to-end delivery, universal process containment,
external history-store parity or a 95% useful-behavior pass rate. The guidance
collector validates supplied snapshots and outputs; it does not run agents or
replace Factory acceptance. No quota optimizer or required Porch runtime exists.
Draft PR #6 is superseded historical reference; this implementation started from
main and uses native execution ownership. See [provenance](provenance.md).
