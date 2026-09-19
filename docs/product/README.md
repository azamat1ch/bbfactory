# Product status

bbfactory is a BB distribution for working directly or coordinating coding agents
with existing subscriptions. One Factory plugin combines Team preferences,
Pragmatic guidance and requirement-linked task checks. Workflows owns execution.

| Area | Implemented and locally tested | Still to prove |
| --- | --- | --- |
| Factory | Existing Team picker/preferences, task/spec versions, check mapping, immutable evidence, findings and guarded human judgments; compact task/check UI; real host tests run from the browser, accepted → stale → accepted checked | Real feature completed and reviewed through the integrated app |
| Native execution | Discoverable Workflows execution, durable guidance receipts and completion waits, canonical checkout locking, isolated concurrent worktrees and conservative settlement; live Codex assignment returned through Factory | Broader real-provider/platform recovery matrix and full supervision behavior parity |
| Guidance | Bundled skill/references/prompts; attributed review collector, quote checks and judge validation | Observed instruction compliance; external session-store inspection and analytics |
| Packaging | Fresh optimized boot and existing-install upgrade verified; one Factory plugin with both skills; original Team preferences retained; Workflows enabled | Electron smoke and published distribution |
| Providers/capacity | Live Codex/Devin limits and Devin icon; lead-facing usage tool/CLI; Account Pooler enabled with one Codex account; [support matrix](provider-support.md) | Actual fallback requires another eligible account; wider provider matrix and efficiency remain unproven |

Automated slice tests are evidence for the cases they exercise, not complete
product acceptance. Unsupported verification environments, stale content and
uncertain execution remain visibly unverified. No 95% parity claim is established;
135 inventory IDs are a source map, not a behavioral pass rate.

Read [specification](spec.md) for decisions, [architecture](architecture.md) for
ownership, and [delivery slice](first-slice.md) for implemented checks and remaining
proof. [Acceptance](acceptance.md) defines the gates. Consult the large
[parity map](parity-map.md) and [source inventory](coverage.md) only for a behavior
under review. [Provenance](provenance.md) preserves upstream attribution and history.

## Living-spec changes awaiting integrated acceptance

The living-spec branch adds provider enablement controls, draft/start lifecycle,
three acceptance methods, grouped human decisions, versioned notes and a compact
card for large requirement sets. Backend and provider-focused tests passed before
the user requested a stop to protect host memory. Final UI and combined verification
remain pending; the new feature is not yet accepted or deployed to the active app.
See [integration notes](../tmp/2026.09.20_factory-integration_deviations.md).

## Where specifications live

The repository's [spec.md](spec.md) is the product contract. Per-task specs and
their revisions, assignments and evidence are stored by Factory in the active
BB data directory at `plugins/factory-team/data.db`. They are visible in the
task card and through `bb factory`; they are not automatically written to Git.
An agent can explicitly incorporate agreed decisions into repository docs.
There is currently no automatic synchronization between those two stores.
