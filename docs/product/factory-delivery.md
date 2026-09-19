# Factory consolidation verification

Factory is now one package at `plugins/factory`, preserving the installed
`factory-team` identity and SQLite ledger. The original Workflows source remains
available; new Factory assignments call the embedded execution module directly.

## Verified

- Serial Factory execution policy tests: 53 passing, including parallel readers,
  writer barriers, steering receipts, cancellation/recovery, uncertain launches,
  retained cleanup ownership, and completed-session continuation. Continuations
  use a new assignment/launch with `continuationThreadId`, reuse the native session,
  retain original results and reacquire ownership. They never replay an uncertain send.
- Factory card tests: 25 passing; records: 30 passing; native task integration and
  migration/composition tests pass. Combined verification methods, stale evidence,
  exact selected approval, delivery history and import without acceptance are covered.
- Builtin installation/lifecycle: 40 passing, including both owners' disable/remove
  guards and preserved saved enablement. Standalone Workflows: 255 passing.
- Codex and ACP adapter context tests: 64 passing. Prepared-context diagnostics and
  CLI tests pass. Factory, server and CLI typechecks pass.
- Isolated built app with Workflows disabled launched real Codex and Devin workers.
  Fresh lead/worker configuration showed the intended Factory skill/tool separation.
  A 100-requirement card was inspected in Chrome; a real column-alignment defect was
  fixed and the resulting wrapping layout inspected again. No synthetic human
  approval was recorded.
- App, server, daemon, CLI and bundled plugins build through Turbo with one heavy
  job at a time. Test runners use one worker. This is cooperative resource control.

## Boundaries

This is evidence for the exercised behavior, not blanket human acceptance. Live
provider interruption/restart combinations were not exhaustively exercised; the
recovery and cancellation failure paths above are deterministic integration tests.
BB context diagnostics report prepared configuration, not additions inside a provider
harness. Fingerprints cannot detect unobserved away-and-back edits. Legacy owner
drain and mixed reader/writer runs remain conservative. The vendored execution copy
requires shared fixes to be applied to standalone Workflows where relevant.

The implementation task was originally bound to a non-Git personal environment;
its card cannot certify this separate Git checkout's fingerprint. Repository checks
and this report must not be represented as automatic acceptance of that binding.

## Try it

Start a fresh conversation, choose Team once, then describe a change. The `factory`
skill guides spec creation for substantial work and direct work for small changes.
Open its spec card for scope, requirements and evidence; select rows for scoped
approval or approve the delivery. Put discussion and exceptions in chat.

Use `bb factory --help`, `bb factory execution --help`, and
`bb thread context <id> --configuration` for command/context discovery.
