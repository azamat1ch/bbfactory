# Factory Team

Bundled bbfactory composer control: **Team: Auto / Off / Selected**. Selected
implementers use BB's real provider/model/reasoning/service-tier picker and live
catalog, including Devin when installed. The lead picker is unchanged.

Open Team, choose a mode from its dropdown, add or remove models, then Save.
Add implementer previews a native selection before Add to team. Each provider/model
can appear once, regardless of reasoning or tier. Editing a row to an already
selected model consolidates those rows using the new selection. Cancel discards the
editor draft. Thread composers save a conversation preference; new-thread
composers save a clearly labelled project default for new conversations. Thread
creation snapshots that default; existing conversations are not retroactively
changed. Existing threads predating the plugin snapshot on first access.
Saved preferences survive reload. Revision checks reject stale saves. Changes
apply to future decisions, not workers already running or historical assignments.

Provider discovery is routed through the thread environment or the selected
existing machine/environment in the new-thread composer. A not-yet-created
machine cannot supply a verified model catalog; create its environment first.
Profiles are preferences, not worker counts, account identities or permission
grants. The native picker reconciles model capabilities in the editor; nothing
is persisted until Save. CLI input is shape-validated, and actual eligibility
must be checked again at execution time.

## Agent and CLI access

The registered `bb_team_get` tool reads current persisted state for its caller's
thread. Standing instructions tell the lead to call it before every new user
task, so updates do not rely on replacing a running provider's system prompt.
Explicit user instructions override the preference for a task. This is agent
**guidance**, not hard enforcement of launch admission. Installing the plugin
into an already running provider requires its next session start/resume to make
the new tool available. There is no separate scheduler or worker progress UI.

- `bb team get [--thread <id> | --project <id>] --json`
- `bb team set --mode auto|off|selected [--profiles '<JSON array>'] [--revision <n>] [--thread <id> | --project <id>] --json`

A profile has `providerId`, `model`, `reasoningLevel` and optional `serviceTier`.
Omitting `--profiles` retains the saved list. Selected requires at least one
profile; duplicate provider/model pairs are rejected, even with different reasoning or tiers. Thread scope defaults to the
current CLI thread. Use `--revision` for optimistic concurrency when saving a
previously read preference.

SDK and generic CLI clients can discover the `factory-team` RPC `get` and `set`
contracts through `bb plugin rpc inspect factory-team get --json` (and `set`).
Both use `{scope: {kind: "thread" | "project", id}}`; set additionally requires
`preference` and `expectedRevision`. The frontend, tool and CLI share storage.

## Verification

Run `pnpm exec turbo run test typecheck --filter=bb-plugin-factory-team` and
`bb plugin build plugins/factory-team` from the repository. Automated checks
exercise thread isolation, creation snapshots, reload persistence, live tool
reads, invalid selections, stale saves, CLI parity and native picker routing.

The shared native picker hides reasoning labels and controls when a model has
only one effort, including ACP's agent-managed placeholder. Models exposing a
real effort choice retain the control. Menus use BB's responsive overlay motion;
the add form respects reduced-motion preferences.

Local verification on 2026-09-19: 11 plugin tests and typecheck passed; the
shared model picker's 47 tests and app build/typecheck passed; all 44 bundled
build tasks passed. Live Chromium checks covered nested mode selection,
duplicate prevention, persisted save/reload, mobile sizing, and Devin/OpenCode
without a fixed reasoning control. No worker was launched by these UI checks.
The built-in plugin suite passed 32 tests; two source-watcher reload tests timed
out, including isolated retries. A standalone recursive `fs.watch` write probe
also received no events in this environment. Explicit plugin reload succeeded.
