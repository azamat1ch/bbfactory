# BB × Pragmatic Orchestration — Integration Design

Goal: a clean BB distribution carrying a native, near-complete Pragmatic
Orchestration integration. The user picks any conversational lead (the thread's
normal provider/model). The lead may execute directly or delegate slices to
peer implementers (Sol = `codex-gpt-5.6` profile alias, Devin = `devin`
profile) through Porch, with independent acceptance checks. This document
separates **verified** facts (read from source) from **proposed** design.

## Verified substrate — Porch

Source pin: `061bcd6b58a596bc0e1e5403c6aa5c0bdb195ae5`. Porch source paths below are relative to `skills/pragmatic-orchestration/` in [upstream Pragmatic Orchestration at the pinned revision](https://github.com/CodeAlive-AI/pragmatic-orchestration/tree/061bcd6b58a596bc0e1e5403c6aa5c0bdb195ae5/skills/pragmatic-orchestration). No adjacent checkout is required to read this specification.

- CLI: `scripts/porch` (bash; `porch.cmd` sibling on Windows). Commands:
  `review ask|code`, `delegate -a <id> [--detach|--one-shot|--persist-session|
  --continue-run]`, `delegate steer|status|cancel|wait|wait-any|watch|events|
  list`, `quota`, `sessions`, `--list-agents` (`scripts/porch` usage block).
- Detached launch: `porch delegate -a <id> --detach "task"` prints the run id
  alone on stdout and exits; the supervisor `setsid`s and survives the caller
  (`scripts/lib/delegate.sh` ~L284-319; `references/delegate.md` L40-48).
- Run id persistence: atomic filesystem registry at `$PORCH_STEER_DIR`, default
  `$XDG_CACHE_HOME/pragmatic-orchestration/steer` (or `~/.cache/...`,
  `%LOCALAPPDATA%` on Windows). Per-run `meta.json`, `state.json`, `mailbox/`,
  `control/` (`run.lock`, `cancel`), `steers/`, `turns/`
  (`scripts/lib/steer/registry.py` L30-46, L96-136). Run ids are
  `run_<word>-<word>-<hex4>` from `human_id.py`.
- Artifacts: `raw/`, `normalized/`, `final/` under `PORCH_RUN_DIR`/
  `PORCH_OUTPUT_DIR` (`references/runtime-contracts.md` L14-24).
- `delegate events RUN_ID --cursor N --max-events N`: bounded non-blocking JSON
  page + `next_cursor`; exit 0 even when the run failed — terminal state is in
  the JSON (`references/delegate.md` L440-450).
- `delegate wait` exits: 0 completed, 124 observer timeout (worker alive), 130
  cancelled, 70 supervisor died, 74 completed without answer
  (`references/delegate.md` L452-461). Consensus/review exits: 0 ok, 2 partial,
  3 all-failed, 4 config, 5 usage (`scripts/lib/common.sh` L23-28).
- Steering: `steer RUN_ID --mode auto|queue|interrupt`; delivery is async;
  `status --json` reports `mailbox_status`, `delivery_class`, `backend_ack`.
  Porch reports wire-observable acks only — never claims semantic "applied".
- **Porch is an ACP client, not an ACP server.** The Devin backend spawns
  `devin acp` as a JSON-RPC subprocess and drives `initialize`,
  `session/new`, `session/prompt`, `session/cancel`, `session/set_mode
  bypass`; it strips `ACP_BACKEND` from the child env
  (`scripts/lib/steer/adapters/devin.py` L11-18, L77-215). There is no Porch
  ACP server endpoint to register anywhere.
- Auth is native: each backend CLI's own login on the host (e.g. `devin auth
  login`, SKILL.md L56). Porch holds no credentials.
- Access policy: `delegate` is full YOLO; `review` is read-only
  (`references/runtime-contracts.md` L61-90).

## Verified substrate — BB

Source pin: `c1a64f4b49b0659e92a7aa4434e79d062b3e814f`; paths relative to this repository root.

- Plugin entries via `package.json` `bb`: `server`, `app`, `host`, `skills`,
  `branding` (`plugins/tasks/package.json`; `plugins/provider-acp/package.json`
  declares `"host": "./src/host.ts"`).
- Server entry: `export default async function plugin(bb: BbPluginApi)`
  (`plugins/tasks/server.ts`). Relevant `bb` members
  (`packages/plugin-sdk/src/backend-contract.ts`):
  - `bb.agents.registerTool` / `configure` / `contributeInstructions`
    (L1601-1672) — native agent tools, per-resolution selection.
  - `bb.cli.register` with `defineCli`/`cliCommand` (`cli-spec.ts`;
    precedent `plugins/workflows/src/cli.ts` L321+).
  - `bb.rpc.register(contract, handlers)`, `bb.realtime.publish`,
    `bb.storage`, `bb.sdk.threads.spawn/send/get/updatePluginMetadata`
    (`plugins/tasks/delegate/index.ts` L331+).
  - `bb.hosts.experimental_client({contract, experimental_signals})` →
    `call(method, input, {hostId, timeoutMs ≤ 30 min, signal})`,
    `experimental_onSignal`, `experimental_onWorkerExit`
    (L1926-1955; `host-contract.ts` L19-55).
- Host entry: `experimental_defineHostEntry({contract, handlers, dispose})`
  runs on the host daemon. Context gives `experimental_paths.dataDir/tempDir`
  (plugin-scoped, persistent), `experimental_retainWorker()` for background
  work, `experimental_emitSignal`, `experimental_watch`, `lifecycle.signal`
  (`host-contract.ts` L111-179). Host code may spawn OS processes directly
  (`plugins/keep-awake/host.ts` uses `node:child_process.spawn`) or via
  `experimental_spawnPortableOutputProcess` +
  `experimental_sanitizeInheritedChildProcessEnv` (output-only children; env
  strips `NODE_ENV`/`BB_*`; `plugin-sdk/src/host.ts` L44-55,
  `packages/process-utils/src/index.ts` L174, L470).
- UI surfaces: `app.slots.messageDirective` (precedent:
  `::workflow-preview{run="…"}` renders a live run card in chat —
  `plugins/workflows/src/server.ts` L136-160, `app.tsx` L1043),
  `navPanel`, `threadPanelAction`, `app.commands.register`
  (`app-contract.ts` L1588-1684; `plugin-api-map/src/surfaces.ts`).
- Host/server split (AGENTS.md): daemon owns host-local primitives; server
  owns product policy. `HOST_DAEMON_PROTOCOL_VERSION` bump applies to core
  wire fields — a plugin's own `bb.host` contract is plugin-versioned
  (`experimental_apiVersion: 1`); no core bump is needed unless core surfaces
  change (verify at implementation).
- Rules we must honor: new public plugin-API members need `experimental_`
  prefix + `docs/api_to_audit.md` entry (we add none — consumers only); every
  feature must be reachable through SDK and `bb` CLI; CLI/config changes update
  `docs/cli-guide-and-skill.md` surfaces + plugin skill docs.

## Proposed architecture

Plugin id `pragmatic-orchestration`, CLI `bb porch`, three entries:

- **`host.ts` — Porch runner (daemon-side).** Owns every `porch` subprocess on
  the machine that holds the checkout. Vendor the complete required runtime layout, including `scripts/`, sibling `prompts/`, profile/config assets and license notices at the pinned revision. Resolve the entrypoint from
  the plugin package path (never `PATH`/cwd — mirroring SKILL.md's entrypoint
  rule). Environment: `PORCH_CONFIG` → plugin-managed config under
  `experimental_paths.dataDir`; `PORCH_STEER_DIR`, `PORCH_OUTPUT_DIR`/
  `PORCH_RUN_DIR` under `dataDir` so run ids and artifacts persist
  plugin-scoped on the host. Child env via the sanitizer; Porch itself strips
  `ACP_BACKEND` for Devin. Host methods are thin, bounded wrappers over CLI
  calls: `delegateStart` (`--detach`, capture stdout run id), `runStatus`,
  `runEvents`, `runWait` (server picks `timeoutS` under the 30-min call cap),
  `runSteer`, `runCancel`, `runList`, `runCheck`, plus `reviewAsk`/`reviewCode`/`quota`.
  On worker start and `experimental_onWorkerExit`, reconcile persisted run ids
  against `delegate list --all --json` before any retry — adopt live runs,
  surface `stale`/dead ones via `effective_status`/`--reap` semantics, never
  spawn a duplicate for an already-running task. Long-run observation uses
  porch's own supervisor/registry — we reuse that lifecycle; no parallel
  execution scheduler or reaper in the plugin. For live observation, use host `experimental_watch` notifications only as invalidations, read fresh Porch status/events with retained cursors, emit host signals, and publish server realtime invalidations. Catch up from durable records on reconnect; notifications are not durable evidence.
- **`server.ts` — product policy.** Ships the distribution's Porch profile
  set (peer implementers incl. `devin` and the Sol-aliased Codex profile),
  composes the shared task contract (context-and-intent preamble, exact cwd,
  scope/non-goals, acceptance criteria, deviation-journal path, required
  checks — the same schema for every profile), persists `task ↔ run_id ↔
  hostId ↔ cwd ↔ baseRevision ↔ checkedContent ↔ check` records in `bb.storage` + thread `pluginMetadata`, and
  owns the acceptance evaluator. Registers agent tools
  (`bb.agents.registerTool`: `porch_delegate`, `porch_run`), the `bb porch`
  CLI (`defineCli`), `bb.rpc` for the app, and realtime updates.
- **`app.tsx` — run cards + panel.** `::porch-run{run="<id>"}` message
  directive renders a live card (status, steer/cancel actions, event tail) on
  the Workflows pattern; a `navPanel` lists all runs. Cards are observers —
  they never bypass the server.

**Not built:** a "porch" provider. `experimental_acpProviderBridge` +
`acpLaunchSpec` (`provider-bridge-acp.ts`, `provider-acp`) serve real ACP
agents; Porch is an ACP *client*, so there is nothing to register. The
conversational lead stays an ordinary BB provider thread; "direct execution"
is simply the lead working without calling the tools.

**Auth:** stays native — the host entry inherits the user's per-CLI logins.
The plugin stores no provider credentials; `bb.settings` holds only
non-secret config (enabled profiles, paths).

## Launch and routing integrity (proposed)

Resolve hostId and absolute cwd from the originating BB environment or explicit CLI selection; validate them and persist both before launch. Every later lifecycle call routes to that stored host. Shared host, app-RPC, and event schemas land before parallel implementation.

Persist a unique launch intent and serialize starts per task. If the launch process starts but its Porch run ID is not durably recorded, mark the intent `uncertain` and prohibit automatic relaunch. Reconcile available registry evidence; if correlation cannot be proven, require explicit resolution. Do not claim exactly-once launch from stored IDs alone. Test the lost-ID response window.

## Acceptance gates

1. **Direct execution (slice):** a task completed by the lead with zero Porch
   runs is a valid outcome; tools are opt-in.
2. **Shared task contract (slice):** one `PorchTaskContract` schema; Sol and
   Devin launches carry identical fields; acceptance only when the stored
   contract matches the launch record.
3. **Restart reconcile (slice):** before retry/relaunch, reconcile stored run
   ids with the real registry; a live run blocks respawn, a dead one must be
   reaped/marked failed, never silently duplicated.
4. **Evidence gate (slice):** run one predeclared check independently after worker completion. Persist command, host/cwd, exit code, logs, base revision and resulting tested-content identity. Check an immutable commit/snapshot including new files; HEAD alone is insufficient for dirty edits. Failed, missing, timed-out or stale evidence leaves the task unaccepted. Direct execution uses the same evidence gate.
5. **Revision-bound review (later):** independent review records the exact
   base/head SHA at launch; acceptance requires the check ran on that
   revision. Sophisticated review orchestration remains later; the first slice already binds check evidence to tested content.

## Honest-failure mapping

Porch exits map to plugin verdicts, never flattened to success:
`wait` 0+non-empty final → completed; 124 → still running; 130 → cancelled;
70 → supervisor died; 74 → no answer; review exit 2/3/4/5 →
partial/failed/config/usage, all non-accepting. `events` exit 0 is an
observation success, not a run verdict. Steer `accepted` means mailbox
persistence only. Spec/check failures are reported, not counted as success.

## Deviations and open questions

- Windows: Porch delegate needs Git Bash + native Python; slice targets
  Linux/macOS (README platform scope).
- `wait` can block past the 30-min host-call cap for unbounded runs; the
  plugin bounds every wait with `timeoutS` and re-invokes — Porch-native
  semantics preserved (124 ≠ failure).
- Confirm `bbPluginSdk` engine range supports every used surface
  (`experimental_client`, `messageDirective`, `defineCli`) — checked at
  implementation, not here.
