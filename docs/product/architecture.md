# Factory architecture

Factory owns Team preferences, specs, assignments, review and acceptance records.
Its internal execution module reuses Workflows machinery and runs ordinary BB
threads. The lead stays a normal conversation. Native providers, environments,
Usage, Account Pooler, Retry and browser extensions remain independently reusable.

The [single package](../../plugins/factory/README.md) registers once, preserving
runtime/storage identity `factory-team`. Modules separate Team, task records and
card UI, execution, review processing and the one maintained `factory` skill.
The database migration ledger is append-only: Team and task migration positions
and contents remain unchanged, followed by execution and legacy-owner records.

## Execution and ownership

Factory assignments call internal handlers. Canonical workspace locks coordinate
writers; optional isolated worktrees permit parallel writers. Execution records
support idempotent launches, guidance receipts, completion waits, cancellation,
structured results and recovery. Completion alone does not prove native settlement
or acceptance. Confirm settlement before transferring ownership.

Existing Workflows runs retain their original database and owner. Settled legacy
records remain inspectable with Workflows disabled. Unsettled legacy control uses
its original owner; upgrades retain the saved enablement until explicit safe
drain and disable. Fresh installs default standalone Workflows off. Symmetric
read-only ownership guards conservatively block a new launch while the peer
owner has active or unresolved runs. This whole-owner restriction can block
otherwise disjoint work. Concurrent servers writing one data directory are not
supported. The retained standalone source and vendored execution module currently
require fixes to be applied to both; see its provenance file.

## Context and preferences

Team defaults persist across new conversations; an explicit project preference
wins over the remembered user default. Existing conversations retain their
snapshots. Local overrides and reset remain available. Selected profiles constrain
eligible models, not agent counts; explicit user directions override preferences.

One conditional configuration exposes `bb_factory` and the `factory` skill to
leads. Ordinary workers get bounded assignment guidance; execution workers get
structured-result support where required. Shared BB context selection feeds
Codex's app-server adapter and Devin's ACP path. Skill bodies load on demand.
`bb thread context <id> --configuration` records BB-prepared instructions, catalog
and tools. It cannot observe additions discovered inside the provider harness or
prove the provider loaded a prepared snapshot.

## Evidence and delivery

SQLite owns task spec revisions, findings, verification and approval records.
Executable checks stay in the repository. A requirement can require automated,
agent and human verification together (AND). Evidence names its procedure/scope,
reviewer, verdict, support and limitations and binds to spec/code identity.
Worker completion and unsupported reviewer approval do not satisfy requirements.

Edits create revisions. Observed content changes permanently invalidate prior
evidence, including observed changes away and back. Changes occurring entirely
between observations cannot be detected. Unknown content remains unverified.
Host checks use Linux systemd containment; unsupported or unsettled checks cannot
produce a passing result.

Delivery snapshots remain historical when current coverage changes. Explicit
human approval is recorded separately and can apply to all or selected rows;
it never waives failed checks implicitly. Cancel is available only while execution
runs; legacy stopped tasks can resume after settlement without launching workers.
Export/import carries the spec and declared source revision, not acceptance.

Resource safety is a short cooperative skill reference, not a scheduler or RAM
limit. The lead coordinates expensive checks across workers sharing a host.
