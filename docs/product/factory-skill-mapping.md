# Factory skill behavior mapping

Developer ledger for the consolidation of the operational orchestration skill
into the single Factory skill at `plugins/factory/skills/factory/`
(name/id `factory`). It records what was retained, moved, simplified and
dropped from the prior `pragmatic-orchestration` skill — and why. This is a
disposition map, not a measured parity claim; the ~90–95% target in the spec
is a preservation goal verified by use, not a line count.

Upstream prompt and review assets remain adapted from
[Pragmatic Orchestration](https://github.com/CodeAlive-AI/pragmatic-orchestration)
(pin `061bcd6b58a596bc0e1e5403c6aa5c0bdb195ae5`, MIT). Original license
notices and the historical migration/port ledgers stay in developer docs —
see [provenance](provenance.md) and the former package's `MIGRATION.md` /
`PORT-COVERAGE.md` — not in the operational skill.

## SKILL.md

| Original content | Disposition | Reason |
|---|---|---|
| Frontmatter `name`/`description` | adapted | Renamed to `factory`; description targets the Factory loop rather than cross-provider thread juggling. |
| "Shipped BB surfaces" intro, Workflows enablement preamble | simplified | Factory internalizes execution; `bb workflows` is no longer the lead entry point. The plugin-enablement check is obsolete. |
| `bb_workflow_run` vs `bb_workflow_result` tool distinction | moved | Kept as the `bb_factory_result` worker-only note in `references/runtime-contracts.md`. |
| Factory integration section (modes, Team, requirement checks, collector) | moved | Now the core of `references/tasks.md` and `references/team.md`. |
| Execution context / `bb skill` asset resolution | simplified | `bb status`, env vars and asset discovery kept in `references/configuration.md`. |
| Prompt transport rules | retained | Same rules in `references/delegate.md`; extended to `--input` JSON. |
| Reviewer/worker selection, no fixed pool | retained | Fewer-agents policy + provider discovery in SKILL.md and `references/configuration.md`. |
| Review depth table (basic/specialists/super/ultra) | simplified | Kept as optional recipes in `references/review.md`; no longer the default framing — proportionate lead-first review is primary. |
| Mandatory repository context seed + web/primary-source rules | retained | `references/review.md`, unchanged contract. |
| Decision map by intent | simplified | Replaced by the working loop + reference map; mode-per-intent ceremony removed since one interface covers delegation. |
| Delegation context and intent | retained | `references/delegate.md`. |
| Universal first-minute check + 5–15 min cadence | simplified | Replaced by artifact/event-first, risk-based checkpoints per spec `supervision`; logs/status are pulled only to resolve uncertainty — "liveness ≠ understanding" retained. |
| Less-capable-model protocol + deviation journal | adapted | `references/delegate.md` reframes it as the higher-risk delegation protocol: the trigger is task risk and observed drift, not a presumed model rank; example model pairs removed entirely. |
| Stateful repository research workflow | retained | `references/delegate.md` recovery/research section. |
| Default launch commands | adapted | `bb factory assign`/`execution`/`status` are the supported surface; `bb thread` primitives documented strictly as the lower-level/troubleshooting layer, not a competing default. |
| Parallel waiting, parent-active rules, stop/settle reconciliation | retained | `references/delegate.md`; `execution wait` covers group completion for assignments. |
| Workflows `agent()` composition examples | adapted | Same semantics under `bb factory execution run/validate/status/history/stop`. |

## References

| Original file | Disposition | Reason |
|---|---|---|
| `references/factory.md` | moved/adapted | Became `references/tasks.md`; cross-plugin Workflows-RPC seam replaced by the internal `bb factory execution` surface. |
| `skills/team/SKILL.md` (factory-team) | moved | Folded into `references/team.md`; extended with global default, `--local`, `reset` and precedence. |
| `references/delegate.md` | retained/simplified | Core supervision, steering, continuation, recovery and VCS observation preserved; first-minute mandate softened to risk-based checks per spec. |
| `references/review.md` | adapted | Depths kept as optional recipes; added lens list (test quality, BDD coverage, QA, simplification); composition uses `bb factory execution` + `bb factory review collect`. |
| `references/configuration.md` | retained/simplified | Discovery, permission modes, transport, env vars, usage kept; per-backend env aliases already gone upstream. |
| `references/runtime-contracts.md` | adapted | Thread/steering contracts kept; Workflows run model reframed as internal execution records; redaction caution kept. |
| `references/session-history.md` | dropped | Upstream `porch sessions` contract for a surface that is not shipped; operational guidance should not carry a large pending-spec document. Source remains in git history and the port ledger. |
| `references/testing.md` | moved | Bundle-maintenance and live-smoke procedures are developer process, not operational guidance; see this document and package tests. |
| — | added | `references/resources.md`: cooperative host-resource safety (focused checks, serial heavy runs when unknown, bounded runners, no blind retries). |

## Prompts

All eight prompt assets are retained under `prompts/` with the same
placeholders and schemas. `roles.txt` was adapted to drop harness-specific
tool names (`Grep`/`Glob`/`Read` → generic search/read tools) so the prompts
fit every provider; `judge.txt` drops the `json_repair` tool reference for a
plain strict-JSON requirement; `probe-generic.txt` drops C#-specific API
names (`Equals`/`IDisposable`) for language-neutral wording. The remaining
templates are unchanged in substance. `review-framework.txt` already carried
Factory branding; `review-recap.txt` was already neutral.

## Intentionally dropped

- Porch branding, `$PORCH` entrypoint resolution and `PORCH_*` environment —
  the runtime is not part of this product.
- Fixed model-pair examples and any model ranking — providers are peers;
  supervision depth follows task risk, not rank.
- Workflow-skill-first orchestration framing — `bb factory`/`bb_factory` is
  the single supported interface; the standalone Workflows skill remains a
  platform opt-in, not a Factory entry point.
- Bundle validation/maintenance procedures — developer concern, covered by
  package tests and this ledger.
- Group `wait-any` workaround prose — superseded by `bb factory execution
  wait` for assignments; the raw-thread gap is documented honestly.

## Known boundaries (unchanged truths)

- `bb thread tell` still has no idempotency key for ad-hoc threads; Factory
  `execution guide` receipts close the gap for assignments.
- A settled `bb thread stop` still reports `idle`/`error` — no `cancelled`
  marker; reconcile before reassigning scope.
- Diagnostic credential redaction is still unverified on native surfaces.
- External session-history readers remain unshipped.
