# Native BB architecture

Status: implementation direction based on inspected source. No bbfactory runtime
has been built. This replaces the earlier mandatory Porch-wrapper design.
Source pins and attribution are in [provenance](provenance.md).

## Reuse first

| Concern | Existing BB surface | bbfactory responsibility |
| --- | --- | --- |
| Agent execution | [provider plugins](../provider-plugin-api.md), native SDK threads | Choose eligible profiles; fill provider gaps through provider integration |
| Durable orchestration | [Workflows](../../plugins/workflows/README.md): SQLite runs/calls, replay, bounded retries, native worker threads, stop and progress UI | Bind execution to task contracts; avoid a second retry scheduler |
| Conversation | Normal lead thread and [composer extensions](../../examples/plugins/composer-customization/README.md) | Lead/team/execution controls, meaningful task cards and decisions |
| Usage | [Provider Usage](../../plugins/provider-usage/README.md) | Capacity freshness, shared-pool policy, routing reasons and total-run accounting |
| Account switching | [Account Pooler](../../plugins/account-pool/PLUGIN_OVERVIEW.md), experimental Codex/Claude support | Expose supported rotation accurately; never infer universal provider support |
| Workspaces | Existing environment/worktree and host routing | Assign exclusive write scope; integrate isolated work when parallelism is justified |
| Tools and UI | Plugin server/app/host entries, SDK, CLI and realtime surfaces | A bundled product experience with consistent state on every surface |

Workflows is opt-in in upstream BB. bbfactory must deliberately configure its
required capabilities; documentation does not enable them. Provider auth and
account services remain native. The orchestration layer must not copy tokens
into prompts, task records or artifacts.

## Ownership

Use a bundled `bbfactory` plugin/package as the proposed product boundary:

- **Guidance:** a native skill bundle preserves Pragmatic Orchestration's useful
  instructions, references and review prompts. Adapt commands and incompatible
  assumptions to BB; load detailed guidance only for the current operation.
- **Server:** versioned task contracts, profile eligibility, direct/delegate
  decisions, review policy, attempt-to-thread links and acceptance evaluation.
- **Native execution:** BB threads and Workflows own worker sessions, execution
  state, transport and applicable retries. Reuse their lifecycle rather than
  launching a parallel Porch process tree.
- **Host:** resolve the actual environment, collect immutable resulting content
  and run declared checks independently of worker claims. Every action carries
  the stored host/workspace identity. Add only primitives missing from BB.
- **App:** composer controls, task/evidence cards and dashboard. Read server
  records; model-written prose cannot manufacture successful check state.

This is not yet a public API contract. Workflows is not assumed to expose a
cross-plugin scheduling service just because it has a CLI and agent tool.
Establish the smallest supported integration seam before coding dependent
lanes. If a seam is missing, extend or extract that native boundary under BB's
experimental SDK rules. Do not make a second scheduler to avoid this decision.
All end-user actions need UI, SDK/tool and CLI access; `bb factory` is a proposed
namespace, not an existing command.

## Records and invariants

Keep task, attempt, review and evidence separate. A task has a spec version,
requirement IDs, scope, declared checks and delivery status. An attempt has a
stable launch intent, worker profile, native thread/workflow IDs, host/workspace,
base revision, state and artifact references. Evidence binds a check and its
result to immutable content, spec version and relevant environment.

Persist intent before launch and correlate native ownership metadata. If a
response is lost, reconcile the existing worker before starting another.
Unknown launch or stop state stays unresolved until established. A transport
acknowledgement is not proof of applied steering or a stopped writer.

Only one lifecycle owner retries an attempt. Application-level rework is a new
recorded attempt following a diagnosis, not a hidden duplicate of a native
retry. Cancellation must confirm the old writer is stopped before another
writer receives its scope. Integrating or delivering twice after repeated
completion notifications is forbidden.

Acceptance is independent of successful worker output. Validate predeclared
checks outside the worker, against a captured commit/snapshot including new
files. Revalidate content before acceptance. Changed relevant spec/content or
check definitions invalidate evidence. Do not use unchanged HEAD as proof that
a dirty worktree has not changed.

## Native gaps to prove

1. **Workspace ownership:** Workflows reuses the origin environment for worker
   threads. Do not fan out concurrent writers in that workspace. The first slice
   serializes writing; later isolation needs verified worktree/environment wiring.
2. **Replay:** Workflows reuses successful calls in the same workspace assuming
   their effects remain. bbfactory must verify content/effects before accepting
   resumed work; cached output cannot establish fresh acceptance evidence.
3. **Checks:** QuickJS intentionally has no shell/filesystem access. Independent
   check execution belongs in a narrow host service outside the workflow script.
4. **Notifications:** completion delivery is at-least-once. Use stable identifiers
   for product transitions and reconcile durable state after reconnect/restart.
5. **Providers:** Devin is not a shipped default provider at this pin. Test its
   ACP compatibility through the native provider mechanism. Validate GLM/Z.ai's
   actual harness/auth/model path separately. Resume, steering, sandboxing, usage
   and rotation support must be checked per integration.
6. **Retry/stop boundary:** the inspected Workflows stop helper discards the
   SDK stop result, which can remain `stopping`; retry paths clear the previous
   thread reference. Native durability does not prove exclusive writer safety.
   Prove termination/ownership across this boundary or patch the native path
   before enabling writer retries or automatic replacement.
7. **Limits:** Workflows already has concurrency, call and elapsed-time controls.
   Expose intentional limits and account for its retry behavior before adding
   subscription policy. A timeout or quota observation is not a completed task.

## Adapting Pragmatic Orchestration

Retain useful behavior: precise briefs, context selection, early supervision,
bounded observations, delta steering, peer review with distinct findings,
revision-bound acceptance, diagnosed retries, recovery and preserved handovers.
Some of these are instructions; others need enforced state transitions. Label
which is which and test observed behavior, not just prompt presence.

Preserve upstream skill/reference/prompt text nearly verbatim where compatible.
Use verified native tools and CLI commands in examples; an SDK method is not
automatically an agent tool. Missing automation must stay explicitly unavailable
until implemented. The [parity map](parity-map.md) distinguishes preserved
guidance, native-call substitutions and executable invariants, and records the
source assets and proposed work packages. This is a behavior map, not evidence
of implemented coverage.

[coverage.md](coverage.md) preserves 135 upstream source-inventory rows. Map each
relevant behavior to inherited BB support, adaptation, new implementation or a
justified non-applicable implementation detail. The old table's Porch-specific
port suggestions are historical hypotheses, not requirements to re-create its
CLI, registry and process supervisor.

Porch remains useful as an external development tool. An optional runtime
adapter is justified only by a demonstrated missing native capability and its
maintenance cost. If added, it must have one lifecycle owner. Porch is an ACP
client, not an ACP server or a provider that can simply be registered in BB.
