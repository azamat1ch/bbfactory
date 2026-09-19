# Configuration and execution context

## Prerequisites

- A running BB server with at least one configured provider (Codex, Claude
  Code, OpenCode, Devin or another configured provider).
- Authentication stays with each provider's own account or login; Factory
  never handles credentials.

There is no per-skill config file. Selection is per assignment or per spawn:
provider, model, reasoning level, service tier and permission mode, with
project defaults remembered per provider.

## Provider and model discovery

```bash
bb status --json                              # current thread/project context
bb provider list --json                       # configured providers
bb provider models <provider-id> --json       # selectable models per provider
bb provider models --json                     # models across providers
bb provider enable|disable <provider-id>      # provider availability for new work
```

There is no fixed worker hierarchy, default review pool or universal effort
table. Choose provider/model/reasoning by task suitability and availability;
record the reason for consequential assignments. Do not infer capability from
price or provider name, and do not treat a disabled or unauthenticated
provider as an implicit fallback. Installed, authenticated, model-discovered
and capacity-known are separate facts.

## Selection

Assignment profiles (`providerId`, `model`, `reasoningLevel`,
`serviceTier`) in `bb factory assign` are validated against the live catalog
on the destination host. Ad-hoc `bb thread spawn` takes the same choices as
flags:

| Flag | Purpose |
|---|---|
| `--provider <id>` | Provider for the thread |
| `--model <model>` | Model id; omit to use the project's remembered default |
| `--reasoning-level <level>` | `low`, `medium`, `high`, `xhigh`, `max` (provider-dependent) |
| `--permission-mode <mode>` | `accept-edits`, `auto`, or `full` |
| `--service-tier <tier>` | `fast` or `default` |
| `--environment <id-or-path>` | Existing environment id or unmanaged workspace path; omitting it selects the project default — the caller's cwd does not |
| `--parent-self` / `--parent-thread <id>` | Link worker to this or another thread |

`bb thread tell` accepts per-message `--model`, `--service-tier`,
`--reasoning-level` and `--permission-mode` overrides.

## Permission modes

`--permission-mode` is the real access boundary; prompt wording is not.

| Mode | Meaning |
|---|---|
| `accept-edits` | Conservative: the worker asks before broader actions |
| `auto` | Default interactive behavior for the provider |
| `full` | Broadest tool access within the provider's sandbox model |

Grant the least permissive mode the task allows. None of these modes is a
universal read-only sandbox — what each permits is provider-specific, and a
"read-only" task instruction without a matching mode does not mechanically
prevent edits — verify the result independently (record repository status
before launch, compare after). Unknown or provider-unsupported modes fail
rather than silently downgrading.

## Environment variables

| Variable | Purpose |
|---|---|
| `BB_THREAD_ID` | This thread's id; target of `--self` and `--parent-self` |
| `BB_PROJECT_ID` | Current project id |
| `BB_ENVIRONMENT_ID` | Current environment id |
| `BB_THREAD_STORAGE` | Per-thread storage directory for materialized artifacts |
| `BB_SERVER_URL` | Non-default server target for a standalone CLI |

## Usage and capacity

Use `bb settings usage --json` for host-local provider usage, optionally with
`--machine <id-or-name>`. For the pooled Provider Usage projection, call
`bb plugin rpc call provider-usage getUsage --input-file request.json --json`
with `{"force":false,"machineIds":null,"providerId":null,"maxAgeMs":60000}`.
Selecting a provider id and its machine ids fetches that source's
measurements lazily. Reuse the plugin's pool/identity deduplication; never
sum host and shared-account rows yourself.

Neither command guarantees every subscription has a usage source. Unknown,
unsupported and stale values remain explicit; do not infer quota from a model
name or thread output.
