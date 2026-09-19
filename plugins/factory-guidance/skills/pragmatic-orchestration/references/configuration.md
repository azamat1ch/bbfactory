# Configuration and execution

## Prerequisites

- A running BB server with at least one configured provider (Codex, Claude
  Code, OpenCode, Devin, or another configured provider).
- Authentication stays with each provider's own account/login; this bundle
  never handles credentials.

There is no per-skill config file or `PORCH_*` environment. Configuration is
native: provider selection, model, reasoning level, and permission mode are
chosen per spawn or per workflow `agent()` call, and project defaults are
remembered per provider.

## Provider and model discovery

```bash
bb status --json                              # current thread/project context
bb provider list --json                       # configured providers
bb provider models <provider-id> --json       # selectable models per provider
bb provider models --json                     # models across providers
```

There is no fixed worker hierarchy, default review pool, or universal effort
table. Choose provider/model/reasoning by task suitability and availability;
record the reason for consequential assignments. Do not infer capability from
price or provider name, and do not treat a disabled or unauthenticated
provider as an implicit fallback.

## Selection flags

Per-thread selection on spawn or per-message overrides on `tell`:

| Flag | Purpose |
|---|---|
| `--provider <id>` | Provider for the thread/message |
| `--model <model>` | Model id; omit to use the project's remembered default |
| `--reasoning-level <level>` | `low`, `medium`, `high`, `xhigh`, `max` (provider-dependent) |
| `--permission-mode <mode>` | `accept-edits`, `auto`, or `full` |
| `--service-tier <tier>` | `fast` or `default` |
| `--environment <id-or-path>` | Existing environment id or unmanaged workspace path; omitting it selects the project default — the caller's cwd does not |
| `--parent-self` / `--parent-thread <id>` | Link worker to this or another thread |

In a workflow, `agent()` inherits the origin's provider/model/reasoning; an
override requires the complete `{provider, model, reasoningLevel}` tuple,
validated against the live catalog at spawn time. A provider that disappears
between authoring and execution fails the call rather than silently
substituting another model. Every `agent()` call also inherits the run's
origin permission mode — the calling thread's mode snapshotted at run start —
with no per-call override, so a workflow fan-out cannot be made more or less
permissive than its origin thread.

## Permission modes

`--permission-mode` is the real access boundary; prompt wording is not.

| Mode | Meaning |
|---|---|
| `accept-edits` | Conservative: the worker asks before broader actions |
| `auto` | Default interactive behavior for the provider |
| `full` | Broadest tool access within the provider's sandbox model |

Grant the least permissive mode the task allows. None of these modes is a
universal read-only sandbox — what each permits is provider-specific, and a
"read-only" task instruction without a matching permission mode does not
mechanically prevent
edits — verify the result independently (record repository status before
launch, compare after). Unknown or provider-unsupported modes fail rather
than silently downgrading.

## Shell-safe prompts

Prefer `--prompt-file`, `--message-file`, stdin (`-`), or a single-quoted
heredoc for prompts containing backticks, `$`, `!`, or quotes. Double-quoted
positional prompts are shell-expanded and may accidentally execute
substitutions or corrupt Markdown before `bb` sees the text.

```bash
bb thread tell <thread-id> --message-file steer.md
cat brief.md | bb thread spawn --project "$BB_PROJECT_ID" --prompt-file - ...
```

## Environment variables

| Variable | Purpose |
|---|---|
| `BB_THREAD_ID` | This thread's id; target of `--self` and `--parent-self` |
| `BB_PROJECT_ID` | Current project id |
| `BB_ENVIRONMENT_ID` | Current environment id |
| `BB_THREAD_STORAGE` | Per-thread storage directory for materialized artifacts |
| `BB_SERVER_URL` | Non-default server target for a standalone CLI |

BB imposes provider/workflow limits that upstream Porch did not: workflow runs
carry a total-run timeout and per-call bounds, and providers apply their own
context/output limits. Check `bb workflows --help` for the effective limits
before promising unbounded execution.

## Usage and capacity

Use `bb settings usage --json` for host-local provider usage, optionally with
`--machine <id-or-name>`. This calls the same native `system.usageLimits`
primitive and does not include the aggregated shared-account view.

For the Provider Usage projection, call `bb plugin rpc call provider-usage
getUsage --input-file request.json --json`, with
`{"force":false,"machineIds":null,"providerId":null,"maxAgeMs":60000}` to
list inventory. Selecting a providerId and its machineIds fetches that
source's measurements lazily. Reuse the plugin's pool/identity deduplication;
never sum host and shared-account rows yourself.

Neither command guarantees every subscription has a usage source. Unknown,
unsupported and stale values remain explicit; do not infer quota from a model
name or thread output. There is no command named `bb quota`.
