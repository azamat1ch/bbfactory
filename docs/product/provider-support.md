# Provider and subscription support matrix

Status: audited 2026-09-19 on this worktree (base commit `223015a69`). Evidence
tiers: **source** = read in this repo's code/docs, **reported probe** = worker-reported local CLI observation; sanitized raw
receipts were not retained, so these observations are not independently
reproduced here. A fresh Astra reviewed the source claims; corrections below
separate catalog presence from execution and subscription support. Native Devin provider work is in flight on the
`codex/native-devin` branch; its files were deliberately not read and every
Devin row below is marked **pending** that review.

Harness, model, account and pool are separate facts. A profile is
`harness + model + reasoning + account/pool + environment + permissions`; a
model name alone proves nothing about capacity. "GLM/Z.ai" is a model/provider
family reachable through harnesses, not a standalone harness.

## Local availability observed today

| Harness | CLI | Auth state | Usage observable locally |
| --- | --- | --- | --- |
| Codex | `codex` 0.153.0 (min 0.136.0) | `codex login status`: ChatGPT | ChatGPT reader implemented; live quota retrieval not evidenced |
| Claude Code | `claude` not on PATH | — | No (not installed) |
| Cursor | `cursor-agent` not on PATH | — | No (not installed) |
| Devin | `devin` 3000.10.31 | `devin auth status`: Devin Pro | Plan tier only; no quota surface found |
| OpenCode | `opencode` 1.1.51 | `opencode auth list`: 0 credentials | No usage source; reported catalog included free `opencode/*` models. Other auth paths not checked |
| GLM/Z.ai | no standalone CLI | — | Listed in Devin catalog; execution and separate Z.ai subscription unverified |

Note: `hermes` is on PATH but broken (`cannot execute: required file not
found`); Hermes is not a target anyway.

## Matrix

| | Codex | Claude Code | Cursor | Devin (pending native provider) | OpenCode | GLM/Z.ai |
|---|---|---|---|---|---|---|
| Integration | `provider-codex` plugin, drives `codex app-server` (generated v2 schema) | `provider-claude-code` plugin via `@anthropic-ai/claude-agent-sdk` | `provider-acp` → `cursor-agent acp` (always listed) | `devin acp` over stdio (reported probe); native plugin in flight; `customAgents` entry is a viable fallback | `provider-acp` → `opencode acp` (listed when installed) | GLM catalog entries are reported in Devin. A separate Z.ai subscription requires its own verified harness/auth path |
| Discovery/auth | `codex login`; BB reads the Codex auth file, detects ChatGPT vs API key, expiry | `claude` OAuth; BB reads keychain / `~/.claude/.credentials.json`. API-key-only setups read as `unauthenticated` even if the CLI could run | `cursor-agent login`; token from macOS keychain or `~/.config/cursor/auth.json`; email from `state.vscdb` | `devin auth login` (browser); `auth status` shows tier. Reported probe: ACP `initialize` OK, `authMethods: devin-browser` | `opencode auth login` per provider; ACP `authMethods: opencode-login` probed | Via the host harness's auth. A direct Z.ai plan routed through Claude Code would misreport usage (OAuth-only reader); unverified |
| Model selection | `model/list` via app-server; `customModels` config; 2 service tiers; reasoning low–ultra | Native catalog; `customModels` accepted; reasoning low–max + ultracode | Parameterized picker + `cursor-agent --list-models` | Reported probe: `session/new` returns `configOptions` category `model` with 385 options; bridge selects via `session/set_config_option` | Reported probe: `session/new` `models` list; `session/set_model`; the BB bridge can skip a requested ID absent from that catalog — configure and validate models in OpenCode, not merely `customModels` | Devin exposes `glm-5-2*`, `glm-5-3*`, `glm-5-3-flash*`, `fusion-*-sidekick-glm-5-2` (reported probe) |
| Permissions | accept-edits / auto / full; approvals runtime-enforced | accept-edits / auto / full; `approvalEnforcedBy: provider` | accept-edits / full only (`auto` throws); bridge-mediated `fs/write_text_file` requests reject lexical paths outside workspace roots; this does not establish confinement of all agent actions or symlink targets | Same ACP subset. Devin's own modes (smart/ask/plan/bypass) are not mapped by the bridge | Same ACP subset | Inherits host harness |
| Observe/steer/stop/resume | Full delta stream; steer injects into live turn; stop + `thread/resume`, checkpoint fork, archive/rename | Full stream; steer inject; stop + resume, checkpoint fork; no archive/rename | Stream; steer = `session/cancel` + re-prompt (declared `steerMode: queue`); resume via `session/load` only when advertised; declared fork `none` | Reported probe: `loadSession: true`, session `list`/`delete`, no fork. Steer/stop inherit ACP behavior; verify resume through BB end-to-end | Reported probe: `loadSession`, `fork`, `list`, `resume` all advertised; steer/stop inherit ACP behavior | Inherits host harness |
| Quota units/freshness | ChatGPT `wham/usage`: 5h + weekly windows, `plan_type`, reset times; API-key auth → explicit "no subscription usage" state | `api.anthropic.com/api/oauth/usage`: 5h, 7d, per-model-family weekly limits; plan + `max_Nx` multiplier | Cursor DashboardService: plan usage % + on-demand spend in USD cents; `accountKey` is null → cannot be deduplicated across machines | None found: no `provider/usage` implementation, no documented quota CLI; `devin models list` shows per-1M-token prices — treat remaining capacity as **unknown**, not zero | None: `provider/usage` returns unsupported (no maintenance dialect); `opencode stats` is local token telemetry, not quota | Unknown. A GLM model selected through Devin uses a Devin route; billing/quota attribution has not been measured; a direct Z.ai plan has no usage source in BB |
| Pool/rotation | Account Pooler: import/login, priority order, 98% threshold, `CODEX_OPENAI_BASE_URL` route, OAuth refresh | Account Pooler: Anthropic Messages endpoint, model-family detour, session pins (30 idle min), `ENABLE_TOOL_SEARCH` | None | None | None | None |
| Dedup identity | `openai:chatgpt:<accountId>` | `anthropic:account:<uuid>` | none | none | none | n/a |

## Source receipts

- Usage contract (states, windows, `accountKey` dedup rule, `observedAt`):
  `plugins/provider-usage/usage-source-contract.ts`; display never shows
  unavailable as zero (`plugins/provider-usage/README.md`,
  `usage-normalization.ts` shared-scope dedup wins over host).
- Codex usage: `plugins/provider-codex/src/bridge/provider-maintenance.ts`
  (`wham/usage`, ChatGPT-only, `accountKey`).
- Claude usage: `plugins/provider-claude-code/src/bridge/
  provider-maintenance.ts` (OAuth usage endpoint, family-scoped windows).
- Cursor usage: `packages/provider-bridge-acp/src/bridge/
  provider-maintenance.ts` (dashboard RPCs, spend cents).
- ACP bridge behavior: `packages/provider-bridge-acp/src/bridge/bridge.ts`
  (handshake `steerMode: queue`, `approvalEnforcedBy: runtime`;
  `session/load` fallback warns and starts fresh; steer = cancel + queued
  re-prompt; only bridge-mediated writes receive lexical path confinement in accept-edits).
- ACP known agents + custom agent schema: `plugins/provider-acp/src/
  known-agents.ts`, `agents.ts`, `docs/configuration.md` §Custom ACP Agents.
- Account Pooler: `plugins/account-pool/PLUGIN_OVERVIEW.md`, `src/quota.ts`
  (Anthropic unified rate-limit headers, threshold/family logic),
  `src/usage-source.ts`, `src/codex-adapter.ts`.
- Bridge handshakes: codex `sessionRestore+fork:checkpoint+steer:inject`;
  claude `sessionRestore+fork:checkpoint+steer:inject+approvalEnforcedBy:
  provider`; ACP `sessionRestore:false+fork:tip+steer:queue`.
- Probes (this machine, read-only, no prompt sent): `devin acp` and
  `opencode acp` `initialize`/`session/new` responses as listed above.
- Upstream hypotheses still pending native verification: `docs/product/
  coverage.md` RUN-28 (Devin ACP one-shot semantics), ORCH-16 (steer classes),
  SQ-14/15/16 (quota surfaces).

## Missing pieces

1. **Devin** — native provider plugin pending on `codex/native-devin`. Beyond
   it: no quota/usage surface was found in the reviewed ACP path/base checkout for Devin; multi-account
   rotation unsupported; verify `session/load`, steer delivery and
   `sessionRestorable` end-to-end through BB (raw ACP probe is not BB proof).
2. **OpenCode** — no usage source (unsupported by design today); locally
   unauthenticated; models come from opencode's own config/catalog.
3. **Cursor** — not installed locally; usage works in code but `accountKey`
   is always null, so a pooled or multi-machine Cursor account cannot be
   deduplicated; `auto` permission mode unavailable.
4. **Claude Code** — not installed locally; API-key auth misreads as
   `unauthenticated` for health/usage; a non-Anthropic endpoint (e.g. a Z.ai
   GLM plan routed via `ANTHROPIC_BASE_URL`) would leave BB usage misleading —
   needs an explicit profile note, not silent reuse.
5. **GLM/Z.ai** — Devin catalog entries are reported, but BB execution is not
   established by those entries. Separate Z.ai subscription authentication,
   execution, usage and rotation remain unverified. Reusing a compatible native
   harness is an architectural preference, not a verified subscription path.
6. **Steer semantics differ**: inject (Codex/Claude) vs cancel-and-re-prompt
   (all ACP agents). Supervision code must not assume mid-turn injection for
   ACP providers.
7. No per-provider concurrency or rate-policy surface observed beyond
   Workflows limits and `provider-retry` (retries windowed rate limits with a
   known reset, cap 4; credit/spend limits are not retried).

## Test plan

- Contract: exercise `provider-usage.v1.listResources`/`getResource` per
  source (`bb plugin rpc list/inspect`), `bb settings usage --json` per host;
  assert unknown ≠ zero and stale `observedAt` stays visible.
- Per provider: one bounded task in a disposable checkout; record start,
  deltas, steer, stop, resume, fork; then a quota observation before/after.
  Codex (ChatGPT) and Devin have reported local authentication; Claude Code, Cursor
  and authenticated OpenCode need installs/logins.
- Devin ACP: probe `initialize`/`session/new` as done here; then a real
  `session/prompt` run through the native provider (or `customAgents`
  fallback) with `glm-5-3-*` and a Claude model to confirm model routing.
- Rotation: `bb pool` add/status/routing for Claude and Codex accounts;
  verify threshold switch, family detour, session pinning, and dedup of
  host-local vs pooled views of the same `accountKey`.
- Regression: `packages/provider-parity` replay cells (e.g.
  `recordings/acp-cursor/*`) plus the bridge conformance kit for any new
  provider bridge.

## What can parallelize after the runtime contract exists

- Per-provider verification lanes (install/auth/run/usage evidence) are
  independent and need only this matrix plus the task/attempt contract.
- Usage sources for Devin/OpenCode are independent plugin work, blocked only
  on the `provider-usage.v1` contract which is already stable.
- Account Pooler extension to any new provider is blocked until that provider
  exposes a quota signal worth switching on.
- GLM profile work first needs a verified harness, selected model and account
  path. A Devin model listing does not satisfy separate Z.ai subscription support.

## Capacity contract to reuse

Use the existing `UsageResource`, `UsageMeasurement` and RPC schemas in
[usage-source-contract.ts](../../plugins/provider-usage/usage-source-contract.ts).
Preserve the source plugin identity together with its source-local resource ID.
`provider-usage.v1` identifies a contract, not one producer.

- `scope` is `{ kind: "shared" }` or `{ kind: "host", hostId, hostName }`.
- Measurements contain nested discriminated `usage`; only `ok` carries windows,
  and `error` carries a required message.
- Windows retain `id`, `kind`, `label`, nullable model/reset and nullable
  `cost: { usedUsdCents, limitUsdCents }`.
- `observedAt` is the last **successful** measurement, not the latest refresh
  attempt. Null means never successfully observed.
- Unknown account identities must remain separate. Unsupported ACP sources may
  be absent from the inventory; absence is not evidence of zero remaining quota.

Routing must preserve these distinctions and define its freshness policy. A
future projection should be versioned explicitly rather than silently dropping
source identity or changing the existing contract's shape.

## Native ACP limits established by source review

Model config options use `session/set_config_option` with a fallback to
`session/set_model`. Without such an option, the bridge only selects a model
listed in `availableModels`; an absent requested ID can be skipped. Validate the
resolved model before claiming the requested model ran.

Steering requests cooperative cancellation and re-prompts only after the active
prompt returns. A prompt error can discard queued input. Stop has a separate
cancel/wait/timeout/kill path. Native supervisors must observe the outcome.

Resume uses advertised `loadSession` and attempts `session/load`; failure or
lack of support can produce a fresh session with a warning. The bridge's global
`sessionRestore: false` and per-session `sessionRestorable` describe different
contracts. Advertised vendor list/resume/delete extensions do not prove BB
implements those operations.

These are source findings, not live conformance results. The audit sent no
`session/prompt`; quota impact was not measured. Local versions/auth/catalogs
above remain reported observations until sanitized receipts or repeatable native
smokes substantiate them.
