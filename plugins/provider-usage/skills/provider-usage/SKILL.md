---
name: provider-usage
description: Inspect subscription limits, account usage, reset times and freshness across enabled providers and pooled accounts.
---

Use `bb usage limits --json` to read the
same aggregate as Provider usage. All eligible provider resources are measured,
with at most three resource requests in flight. Recent cache is accepted for
one minute. Use `bb usage limits --force --json` for a fresh attempt.

The discoverable `provider-usage` RPC `readLimits` accepts
`{"force":false,"machineIds":null,"maxAgeMs":60000}` through
`bb plugin rpc call provider-usage readLimits --input-file request.json --json`.
`machineIds` can restrict collection to host IDs or `source:<plugin-id>` groups;
`maxAgeMs` is between zero and 300000. SDK clients use `sdk.plugins.callRpc`.

The response contains `snapshot` and per-resource `observations`. `observedAt`
is the source's successful observation time; `fetchedAt` is when the aggregate
received it. A fresh fetch can return an older source observation. Failed
refreshes retain previous measurements and set `refreshFailed`. Disconnected
machines and disabled providers are not fetched. Unsupported, unmeasured,
unauthenticated and expired states do not mean zero or unlimited usage. Empty
quota windows mean no reported limits. Known identities are deduplicated within
locations; do not add the same account's quota across machine and pool groups.

These queries do not change account routing, choose workers or switch accounts.
Use the Account Pooler skill for supported Codex/Claude routing configuration.
