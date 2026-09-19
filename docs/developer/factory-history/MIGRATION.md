> Historical port record, retained for developer provenance. This is not operational guidance. Current entry point: [Factory](../../../plugins/factory/skills/factory/SKILL.md). Historical paths refer to the original source snapshot in Git.

# Migration manifest — Pragmatic Orchestration → Factory Guidance

Upstream source: `CodeAlive-AI/pragmatic-orchestration`, pinned at
`061bcd6b58a596bc0e1e5403c6aa5c0bdb195ae5`, MIT license (copied to
`LICENSE`). This manifest accounts for every upstream asset under
`skills/pragmatic-orchestration/` plus the extracted role text in
`scripts/lib/common.sh`. Reviewers should diff the actual files, not trust
this summary.

Dispositions: **preserved** (verbatim or near-verbatim),
**adapted** (narrowly changed, reason given), **pending** (behavior preserved
as intent; no shipped native surface), **excluded** (proposed exclusion with
rationale).

## `SKILL.md` → `skills/pragmatic-orchestration/SKILL.md`

| Upstream section | Disposition | Notes |
|---|---|---|
| Frontmatter `name` | preserved | Same skill name; directory matches. |
| Frontmatter `description` | adapted | Providers listed generically; Porch named entities removed; same trigger intents. |
| Intro paragraph | adapted | `Resolve the entrypoint`/`"$PORCH"` replaced by "shipped BB surfaces"; adds explicit "direct execution is valid". |
| `Platforms` | adapted | Porch Python/Bash/Windows-shim matrix removed; BB runs wherever the CLI runs. RUN-17 exclusion honored. |
| `Entrypoint resolution` | replaced | No `$PORCH` exists; replaced by `Execution context` (`bb` CLI, `BB_*` env vars, `bb skill list` → resolved id → `bb skill show <id> --path`/`files <id>` for asset discovery — show/files take the hashed installed id, not the skill name). |
| `Prompt transport is part of the launch` | adapted | Same rule restated for `--prompt-file`/`--message-file`/stdin on `bb thread spawn`/`tell`. |
| `Recommended review defaults` | replaced | Fixed profile pool, Grok/Astra/Fable/Devin profile mandates and model rankings removed (product: user-selected profiles, no hierarchy). Depth table preserved as logical plans; `specialists`/`super`/`ultra` labelled as compositions, not shipped commands. |
| `Mandatory repository context seed` | preserved | Verbatim XML block, triage rule, and primary-source/web rules; `--related` flag replaced by "include the block in the prompt". |
| `Decision map by intent` | adapted | Same intents; each row now names a real BB command or an explicit "not shipped" gate (sessions, quota). |
| `Delegation context and intent` | preserved | Verbatim. |
| `Parent supervision: first-minute check and adaptive follow-up` | preserved/adapted | Verbatim prose; `delegate events` → `bb thread log --format json --limit/--after-seq`, `delegate steer --mode auto` → `bb thread tell --mode auto`, `status --json` → `bb thread show --json`; added stop-confirmation (`stop` + `show`). |
| `Mandatory: delegating to a less capable model` | preserved | Verbatim incl. user-designated example pairs and deviation-journal contract; added "projects keep their own documentation layout" clause per product spec. |
| `Stateful Grok research workflow` | adapted | Grok mandate removed (no fixed researcher); read-only contract, Answer/Evidence/Context-map/Gaps format, snapshot-compare, and remote-checkout caution preserved verbatim for any selected provider. |
| `Default launch commands` | replaced | All examples are real `bb thread`/`bb workflows`/`bb provider` commands verified against `apps/cli` sources. |
| `Parallel waiting and follow-up work` | adapted | `wait-any` gated as absent; loop-per-id or `parallel()` workflow given as the partial flow. `--acknowledged` semantics preserved as caller-side collected-id tracking. |
| `Keeping the parent active` (subsection) | adapted | Preserved intent (no "agents are running" conclusion); Codex `exec_command`/`write_stdin` harness specifics replaced by bounded `bb thread wait` + `--parent-self` event reporting. |
| Codex `--persist-session`/`--continue-run` | adapted | Replaced by native `bb thread tell` continuation on the same thread — works on every provider, no opt-in flag. Failure/uncertainty rules preserved verbatim. |
| `Changing approach and preserving work` | preserved/adapted | Verbatim prose plus native stop-confirmation (`bb thread stop` → `show --json`). |
| Grok/Devin steer-semantics paragraphs | adapted | Replaced by verified BB bridge facts: `steerMode: "inject"` (Codex/Claude/Pi) vs `"queue"` (ACP: cancel-and-reprompt); no interrupt mode — `bb thread stop` is the abandon path. |
| `Detail map` | adapted | Same rows minus `ACP-RESEARCH.md`; descriptions updated. |

## `references/`

| Upstream file/section | Disposition | Notes |
|---|---|---|
| `review.md` — review-is-read-only, independence, caller-judges | preserved | Verbatim intent; enforcement now stated as permission mode + independent verification, not prompt alone. |
| `review.md` — `Ask` examples | adapted | `review ask` → `bb workflows run` `parallel(agent())` example and `bb thread spawn` example (with explicit `--environment`); Workflows is `defaultEnabled: false` so an enablement check and thread fallback are documented. |
| `review.md` — context seed rules | preserved | Verbatim. |
| `review.md` — depth table (`basic`/`specialists`/`super`/`ultra`) | preserved/adapted | Same depths and "choose one" rule; reframed as composed plans with bundled prompt assets; added a **pseudocode-labelled** workflow skeleton (judge pass = `super` depth, not `specialists`), validate-and-run-the-same-`--file` flow, and an explicit manual-composition contract (index/provenance assignment, CDATA escaping, roster/failure attribution, degraded judge fallback, schema-as-shape-not-validator). |
| `review.md` — profiles/`--list-agents`/env effort table | adapted | Replaced by `bb provider list/models` + `--model`/`--reasoning-level`/agent-opts; per-backend env vars dropped. |
| `review.md` — progress styles / `PORCH_PROGRESS` | adapted | `bb workflows status` (compact) + `history` paging; `bb thread log` minimal. |
| `review.md` — exit codes 0/2/3/4/5 | adapted | Replaced by native result semantics: `null` in `parallel()`, last-turn outcome plus idle/error reconciliation, roster honesty, empty-vs-zero findings rule preserved. |
| `review.md` — Grok `/review` prohibition | dropped | Porch/Grok-CLI specific; no native equivalent needed. |
| `delegate.md` — intro/mode rules | adapted | `-a` exact-id, YOLO, Gemini-review-only replaced by explicit spawn flags + permission modes + provider-neutrality. |
| `delegate.md` — steerable/detached runs, `--detach`, registry | adapted | Server-owned durable threads; `bb thread list --parent-thread` recovers ids. |
| `delegate.md` — bounded/group waiting, `wait-any`, `--acknowledged` | adapted/pending | `bb thread wait` semantics incl. native exit codes; `wait-any` gated absent with manual loop/`parallel()` flow. |
| `delegate.md` — keeping the parent active | adapted | Same loop; tool-wait specifics replaced by `bb thread wait` deadlines. |
| `delegate.md` — durable Codex follow-ups | adapted | `bb thread tell` continuation; all preserved rules (latest-successful-only, no replay on uncertainty). |
| `delegate.md` — required caller workflow | preserved/adapted | Same numbered discipline on native commands; `accepted`-means-mailbox caveat → send-ack-is-not-applied caveat. |
| `delegate.md` — context and intent example | preserved | Verbatim. |
| `delegate.md` — first-minute check / adaptive supervision | preserved | Verbatim except command substitutions. |
| `delegate.md` — less-capable-model protocol + journal template | preserved | Verbatim incl. journal instruction block. |
| `delegate.md` — changing approach / preserve work | preserved/adapted | Verbatim + native stop semantics: settle reports `idle`/`error` (no `cancelled` marker), reconcile last turn + queued guidance, ambiguous stop blocks overlapping successor, `idle` ≠ detached provider command exited. |
| `delegate.md` — observation model table | adapted | Same prove/does-not-prove structure on native commands. |
| `delegate.md` — VCS observation | preserved | Verbatim (git/jj commands unchanged). |
| `delegate.md` — bounded event observation | adapted | `delegate events` → `bb thread log --format json --limit/--after-seq`. |
| `delegate.md` — wait/watch exit table | adapted | Native `bb thread wait` exits 2/3/4 documented; observer-vs-worker distinction preserved. |
| `delegate.md` — OpenCode permission-blocker notes | dropped | Porch adapter-specific; BB permission model described instead. |
| `delegate.md` — steering modes + Grok/Devin adapter detail + mailbox lifecycle | adapted | Modes table on `steer`/`queue`/`auto`; per-bridge inject-vs-queue facts; ack≠applied preserved; Porch mailbox state names removed. |
| `delegate.md` — retry-safe steering (`--client-id`) | adapted | No idempotency key exists; rule becomes "inspect before resend, never blind-retry a send". `bb thread retry` documented. |
| `delegate.md` — registry/artifacts, secrets warning | adapted | Private-registry details removed; "prompts persist in thread history, no secrets in briefs" preserved. |
| `configuration.md` — prerequisites | adapted | BB server + configured providers; Python/harness list removed. |
| `configuration.md` — agent profiles/config.json/`PORCH_CONFIG` | adapted | Replaced by native provider/model discovery + per-call selection flags; no fixed catalog. |
| `configuration.md` — env overrides (CODEX_/CLAUDE_/… `*_MODEL`/`*_EFFORT`) | replaced | Native spawn flags + workflow agent tuples; dated env aliases dropped. |
| `configuration.md` — specific model facts (grok-4.6, gpt-6-astra, fable-5-1, swe-2-high, opencode-go privacy note) | excluded | Historical fixed model/profile facts are not product policy; catalog discovery replaces them. |
| `configuration.md` — shell-safe prompts | preserved/adapted | Same rule on `--prompt-file`/`--message-file`/stdin. |
| `configuration.md` — `PORCH_*` env table | replaced | `BB_*` env vars only. |
| `configuration.md` — quota inspection | adapted | `bb settings usage --json` exposes host-local usage; Provider Usage `getUsage` RPC exposes the pooled projection. Unsupported subscriptions remain unknown. |
| `runtime-contracts.md` — streams/artifacts, closed event schema, debug tape, backend/mode contracts, workflow plans, run ids, resource limits, Grok one-shot contract | adapted/replaced | Porch-internal machinery (files, PIPESTATUS, mailbox, tape, human ids) replaced by the verified native contract: thread lifecycle (incl. stop→`idle` settle), steering delivery, workflow run/call model (`defaultEnabled: false`, `bb_workflow_run` vs `bb_workflow_result` roles, origin permission-mode inheritance), retries, sandbox limits, at-least-once notifications. Preserved invariants: result/progress separation, bounded observation, failure honesty, untrusted-input layering, no hidden deadline claims. |
| `runtime-contracts.md` — diagnostic credential redaction guarantee | pending | Upstream redacted URL credentials, sensitive query params, auth headers, and credential fields from diagnostics (suppressing on failure). No verified BB equivalent on thread log/output or workflow history; preserved as an explicit "not verified — treat output as unredacted" warning. |
| `runtime-contracts.md` — layered prompts order | preserved | `framework_policy → mode_contract → role → output_schema → repository_facts → user_input → framework_recap` mapped to bundled prompt files. |
| `session-history.md` — all sections | pending/preserved | Substantive contract (roots→list→grep→show algorithm, store map, fragment schema, turns/flags/stats, classification, safety) kept near-verbatim with a top-level "not shipped" gate and `porch sessions` examples marked upstream-only. |
| `testing.md` | adapted | Upstream suite not shipped; offline-bundle validation steps + opt-in live-smoke separation preserved; native fake-provider harnesses named. |

## `prompts/`

| Asset | Disposition | Notes |
|---|---|---|
| `broad-analyst.txt`, `broad-lateral.txt`, `probe-generic.txt`, `specialist.txt`, `judge.txt` | preserved | Byte-identical copies; `{{…}}` placeholders documented in `references/review.md` as caller-substituted data templates. |
| `review-framework.txt` | adapted | `[PORCH — INDEPENDENT ADVISORY MODE]` → `[FACTORY — INDEPENDENT ADVISORY MODE]`; body verbatim. |
| `review-recap.txt` | adapted | `[PORCH REVIEW CONTRACT — FINAL REMINDER]` → `[REVIEW CONTRACT — FINAL REMINDER]`; body verbatim. |
| Role text in `scripts/lib/common.sh` (`*_ROLE_PROMPT`, 8 roles) | preserved | Extracted verbatim to `prompts/roles.txt`; shell machinery not shipped. |

## Excluded upstream assets

| Asset | Disposition | Rationale |
|---|---|---|
| `ACP-RESEARCH.md` | excluded | Historical transport research whose no-ACP-migration decision must not read as a ban on BB's native ACP providers (parity-map BND-01). |
| `scripts/**` (porch CLI, supervisor, adapters, tests) | excluded | Porch runtime; product policy forbids a second scheduler. Declarative role text extracted (above); fixture intent carried by `references/testing.md`. |
| `config.example.json`, marketplace/plugin manifests | excluded | Porch-specific configuration and release plumbing; native selection is provider/model flags. |
| `README.md` install/marketplace steps | excluded | Not active skill instructions. |
| `remote-agents` skill | excluded | Out of scope (BND-08: separate host-provisioning concern). |

## Known gaps (pending native support, never presented as shipped)

- Packaged `review` command with deterministic dedup, quote validation, and
  bounded judge fallback (P3). Manual composition flow is documented and
  labelled.
- Group `wait-any` with acknowledged-terminal semantics (P2). Manual loop /
  `parallel()` flow documented.
- `sessions`/`history` external-store readers and analytics (P4).
- Upstream quota parity (P5) is not claimed. Native host usage and the pooled
  Provider Usage RPC are available; unsupported subscriptions remain unknown.
- Idempotent steering / stable client keys on `bb thread tell` (P2).
- Confirmed-stop-before-replacement and session-lease enforcement are caller
  discipline in this bundle; runtime enforcement is a product lane.
- Diagnostic credential redaction (upstream guarantee) is unverified on native
  log/history/output surfaces; documented as "treat as unredacted".
- Group supervision has no `cancelled`/`stopped` terminal thread status — a
  settled `bb thread stop` reports `idle`/`error`; reconciliation is caller
  discipline.

## Current integration delta

Workflows now supplies durable `guidanceId` receipts, status lookup and bounded
cursor-based first-completion waits. The earlier group-wait and retry-safe
guidance gaps are superseded by these native adaptations, documented in
`references/factory.md`. Provider continuation leases and the full Porch
acknowledgement protocol remain outside this implementation.

The donor ledger above records the initial adaptation. This port additionally
adds `references/factory.md`, complete provider-neutral depth compositions, a
pure TypeScript review collector (`review.ts`), and tool/RPC/CLI registrations.
The earlier notes that union/quote/judge validation are absent are superseded
by this section: supplied result processing is implemented; native fan-out and
fallback launching remain explicit lead actions. Collector tests cover roster
failures, explicit zero findings, snapshot quotes, index/provenance validation,
duplicates, downgrade and degraded raw-union retention. It reads no host paths.

The collector adapts source `dedup-findings.py`, `code_review_validate.py` and
`validate_judge_output.py` behavior without importing their runtime. It preserves
identical findings; semantic dedup remains a judge decision. Strict normalized
quote equality replaces permissive substring matching. Unsupported source-path
reads and absent snapshots return unknown. Missing/invalid judge data never
silently drops findings. Source template hashes prove five byte-identical assets.

See PORT-COVERAGE.md for all 135 stable IDs and remaining dependencies. Bundled
registration and package consolidation are separate integration work; this
branch does not add another user toggle or modify the root lockfile.
