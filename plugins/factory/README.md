# Factory

Factory combines remembered Team preferences, executable specs, native worker
assignments, review and version-linked evidence in one BB plugin. Start in chat;
use the [Factory skill](skills/factory/SKILL.md) when work needs orchestration.
Direct work is valid. There is no required pipeline or reviewer roster.

The card shows outcome, scope and requirements. Expand a requirement for scenarios
and evidence; approve the delivery or selected rows. Put detailed decisions in
chat and record them through Factory. Delivery history and current verification
are separate: a merged delivery remains delivered when later code changes.

## Commands

- `bb factory --help`: tasks, verification, approval, delivery and spec portability.
- `bb factory team get --json`: this conversation's Team preference.
- `bb factory team get --global --json`: remembered default for new chats.
- `bb factory team set --help`: save a preference; `--local` changes only its scope.
- `bb factory team reset --help`: restore an inherited preference.
- `bb factory execution --help`: durable execution and supervision.
- `bb factory review collect --help`: collect review results without losing failures.
- `bb thread context <id> --configuration`: inspect BB-prepared session context.

SQLite is authoritative for specs, revisions and evidence. `export`/`import`
preserve spec meaning and source revision metadata; imported tasks start as fresh
unverified drafts. Tests stay in the target repository. There is no repository
synchronization. Multiple verification methods are combined with AND; delivery
approval never converts failed automated or agent checks into passes.

## Package and upgrades

The single source package is `plugins/factory`. Its package name
`bb-plugin-factory-team`, runtime ID `factory-team`, and storage identity remain
unchanged. Existing Team and task migrations form an unchanged prefix; execution
migrations append to it. Modules: `team`, `tasks` (including card UI), `execution`,
`review`, and `skills`.

New execution calls the internal module. Standalone Workflows defaults off on
fresh installs and remains separately opt-in. Upgrades preserve its saved setting
and original ownership of old runs. Drain and reconcile those runs before
`bb plugin disable workflows`; the owner guard rejects disabling/removing an
owner with active or unresolved execution. Legacy records are not copied into a
second owner. Unresolved ownership conservatively blocks launches in the other
store, even in disjoint workspaces. Do not reset either database.

Host resource coordination is cooperative guidance: the lead arranges one heavy
check at a time when costs are unknown. It does not constrain arbitrary shell
commands. See [architecture](../../docs/product/architecture.md) and
[execution provenance](execution/PROVENANCE.md) for deeper details.
