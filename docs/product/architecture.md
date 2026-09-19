# Native BB architecture

Status: implementation recommendation after source reassessment on 2026-09-19.
Team preferences and Devin quota support are on main. Guidance is not integrated.
Draft [PR #6](https://github.com/azamat1ch/bbfactory/pull/6) has task/check runtime
and UI, but failed independent acceptance. Reassess its execution design before
integration. Source attribution remains in [provenance](provenance.md).

## Clear ownership

Present one Factory feature. The recommended final package boundaries are:

| Owner | Responsibility |
| --- | --- |
| Factory plugin | Team preferences/picker, adapted Pragmatic guidance and review prompts, task/spec records, native-run associations, review findings, requirement-linked checks, acceptance and compact UI |
| Native Workflows and BB threads | Execute ordinary subagents; own scheduling, progress, sessions, transport, execution retries, cancellation and recovery |
| Native environment providers | Reuse checkouts or create/remove worktrees and other supported environments |
| Provider plugins, Provider Usage and Account Pooler | Provider execution/auth, actual quota observations and supported account fallback |

The lead decides how to work using guidance and Team preferences. Implementation,
review and research are assignments to the same agents. Direct lead execution
needs no workflow. For Factory-managed delegated work, extend Workflows as the
execution owner rather than maintain another generic worker lifecycle in Factory.

The current `factory-team`, `factory-guidance` and draft `bbfactory` packages are
development boundaries. First integrate through real contracts. Then consolidate
Team and guidance into Factory with preference migration and CLI compatibility;
preserve the implemented picker. Users should not need three independent toggles
to assemble the feature. Workflows remains a reusable native plugin underneath.

## Existing native capabilities and gaps

[Workflows](../../plugins/workflows/README.md) already has persisted runs/calls,
parallel calls, sequencing, retries, replay, worker discovery, notifications and
progress UI. [SDK threads](../../packages/sdk/src/areas/threads.ts) supplies spawn,
fork, send, stop, wait and inspection. Fresh workers get explicit briefs; copied
history is a separate choice. Direct work and concise ad-hoc delegation remain
valid; users need not write a workflow script for every request.

The narrow extensions to prove are:

1. **Supported integration API.** `bb.sdk.plugins.callRpc` exists, but Workflows
   currently registers UI inspection/stop RPCs. Start is an agent tool/CLI/private
   service operation. Add typed experimental start/result/cancel and scoped
   guidance operations over that service, with stable caller task/launch identity.
   No imports of another plugin's private database/service or server-side CLI
   shelling. New public SDK surfaces need guide and API-audit updates.
2. **Environment and access choice.** Workflows currently reuses the origin
   environment and permissions for every call. Add per-assignment native choices.
   Worktrees are optional: shared checkout use is valid for read-only or
   coordinated work. Competing writes require isolation or enforceable ownership.
   Record the actual environment and scope; do not equate a scope description
   with enforced filesystem confinement.
3. **Truthful stop/replacement.** Native lifecycle has an internal `requireStopped`
   path, but public stop is weaker and Workflows discards stop failures/results.
   Extend the native contract and reconcile uncertain workers before replacement.
   Thread settlement alone does not prove detached processes cannot still write.
4. **Supervision.** Reuse native events, bounded output and send modes. Expose
   call/thread linkage and guidance outcomes; distinguish queued/sent guidance
   from observed compliance. Add durable guidance identity only where needed.

Sources: [Workflows service](../../plugins/workflows/src/service.ts),
[RPC registration](../../plugins/workflows/src/server.ts),
[call options](../../plugins/workflows/src/types.ts) and native thread lifecycle.
These extensions are proposals, not shipped APIs. Workflows is disabled by default;
Factory must configure the dependency deliberately. Credentials stay with providers.

Workflows `parallel` can return `null` for failed calls; preserve attributed
failures. Its `pipeline` streams per item and is not a global review barrier.
Successful replay assumes earlier effects remain in the same environment; it
cannot establish current content acceptance.

## Connect the existing Team picker

[Factory Team](../../plugins/factory-team/README.md) already persists versioned
Auto/Off/Selected preferences and exposes `bb_team_get`, CLI and RPC. It currently
guides the lead, rather than constraining actual launches.

Resolve Factory assignments from that same record and validate availability on
the target host. Selected profiles limit choices, not worker count. Preserve the
lead and explicit task overrides; never silently substitute a model or overwrite
saved preferences. Record the preference revision used. Changes affect future
decisions, not running workers. Keep the existing picker and migrate its data if
package ownership moves.

## Executable specifications inside Factory

Use one chain: requirement → optional behavioral scenario → actual project
check → evidence on tested content. Checks explicitly reference requirements.
Given/When/Then without a test is prose. Reuse project test tools; no mandatory
Gherkin, replacement test runner or separate SDD plugin is needed.

The Factory host module runs declared checks independently of worker claims and
records spec/check versions, content identity, environment, outcome and logs.
Unmapped requirements stay unverified; human judgments stay explicit. The compact
card opens details, native worker threads and changes. UI, tools and CLI share
records. Factory owns acceptance; Workflows owns execution status. Recheck final
integrated content and invalidate evidence after relevant changes. Failed checks,
unresolved required findings and unknown content cannot become a green result.

## Retain useful PR #6 work

Retain task/evidence concepts, check UI, CLI/tool consistency and direct execution.
Add requirement-to-check mapping. Replace duplicate spawn/discovery/stop/retry
logic with native execution associations. Move useful failure tests to that owner.
Do not carry over host verification unchanged: review found problems with uncertain
checks, escaped processes, archival stops, path aliases and freshness watchers.
The [next slice](first-slice.md) proves the boundary before broad integration.

## Pragmatic coverage remains required

The 95%+ useful-behavior target stays. Preserve skill/reference/prompt text nearly
verbatim where compatible, adapt commands, and implement missing native behavior.
Do not translate every instruction into TypeScript. Bundled text, working tools
and demonstrated behavior are separate evidence.

The [parity map](parity-map.md) and [source inventory](coverage.md) track review,
supervision, context/session handling, steering, recovery and handover. Row counts
are not measured coverage. No automatic quota optimizer is required; useful quota
inspection and delegation practices remain. Porch remains a development tool,
not a second required product execution runtime.
