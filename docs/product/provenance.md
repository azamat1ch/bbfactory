# Sources, ownership and history

## Foundations

- **BB:** [get-bb/bb](https://github.com/get-bb/bb), imported from
  `c1a64f4b49b0659e92a7aa4434e79d062b3e814f`. The import commit has the exact
  upstream tree. [LICENSE](../../LICENSE) retains Michael Yong's MIT copyright.
  The source link and pinned commit preserve provenance. This distribution's
  configured remote is the private bbfactory repository.
- **Pragmatic Orchestration:** [CodeAlive-AI/pragmatic-orchestration](https://github.com/CodeAlive-AI/pragmatic-orchestration/tree/061bcd6b58a596bc0e1e5403c6aa5c0bdb195ae5),
  inspected at `061bcd6b58a596bc0e1e5403c6aa5c0bdb195ae5`. Practices and source
  inventory inform the design. Porch was used externally during bootstrap;
  its runtime is not vendored or required by this distribution. Preserve its
  applicable notices if code or prompts are adapted later.

Inherited BB capabilities include workspace/runtime, threads, providers,
Workflows, plugin UI and account/usage facilities. Planned bbfactory work adds
product policy, task/spec/evidence binding, subscription-aware assignment and
coherent default interactions. Adapting practices is not an invention claim.

## Specification lineage

The original LifeOS files were `os/20_projects/ai-builder-track/`:
`subscription-team-plan.md` and `subscription-team-build-order.md`. They have been removed from LifeOS and retained here as
[original product plan](history/original-product-plan.md) and
[original build order](history/original-build-order.md), both explicitly historical.
Current requirements are consolidated in [spec.md](spec.md). Later corrections keep all providers interchangeable and
prefer BB-native execution over the proposed Porch wrapper. Source inventory
rows retain their original hypotheses with explicit superseded labels.

## Clean main history

At the user's request, the September 19, 2026 bootstrap history was consolidated
into a pinned BB import and a coherent bbfactory setup commit. The full previous
history was initially retained through tag `archive/pre-cleanup-2026-09-19`,
pointing to `dc634fcba34b02aa0d1bf8c0e961b7a450555419`. On September 20 the
original-BB remote references and release tags, including that archive tag,
were removed from the working repository; the archive tag was also removed
from GitHub. A verified `all-refs.bundle` preserves them in the development
workspace's `setup/backups/git-cleanup-*` directory, alongside retired workers'
uncommitted changes and recovery instructions. The default branch retains its
clean history. Source attribution and the upstream license remain in the repo.
No collaborator commit on main was present at the reset. An unmerged inherited
Dependabot PR was obsolete after this change; inherited scheduling was removed.

For an existing clone, fetch and inspect before switching. Preserve local work
on a branch, then create a fresh branch from `origin/main`; do not merge the old
bootstrap ancestry back into the clean branch. The default branch update uses
an explicit lease against the inspected old head. Future changes should keep
ordinary, reviewable history rather than repeating this reset.
