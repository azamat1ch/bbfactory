# Product status

bbfactory is a BB distribution for working directly or coordinating coding agents
with existing subscriptions. One Factory plugin combines Team preferences,
Pragmatic guidance and requirement-linked task checks. Workflows owns execution.

| Area | Implemented and locally tested | Still to prove |
| --- | --- | --- |
| Factory | Existing Team picker/preferences, task/spec versions, check mapping, immutable evidence, findings and guarded human judgments; compact task/check UI; real host tests run from the browser, accepted → stale → accepted checked | Real feature completed and reviewed through the integrated app |
| Native execution | Discoverable Workflows execution, durable guidance receipts and completion waits, canonical checkout locking, isolated concurrent worktrees and conservative settlement | Real-provider/platform recovery matrix and full supervision behavior parity |
| Guidance | Bundled skill/references/prompts; attributed review collector, quote checks and judge validation | Observed instruction compliance; external session-store inspection and analytics |
| Packaging | One Factory plugin with guidance assets; Team identity/database retained; fresh optimized app boot and default-on Workflows verified | Existing-install rollout and Electron smoke |
| Providers/capacity | Native providers, usage display and optional account pooling; [support matrix](provider-support.md) | Account-specific execution, usage and fallback checked separately; no efficiency claim |

Automated slice tests are evidence for the cases they exercise, not complete
product acceptance. Unsupported verification environments, stale content and
uncertain execution remain visibly unverified. No 95% parity claim is established;
135 inventory IDs are a source map, not a behavioral pass rate.

Read [specification](spec.md) for decisions, [architecture](architecture.md) for
ownership, and [delivery slice](first-slice.md) for implemented checks and remaining
proof. [Acceptance](acceptance.md) defines the gates. Consult the large
[parity map](parity-map.md) and [source inventory](coverage.md) only for a behavior
under review. [Provenance](provenance.md) preserves upstream attribution and history.
