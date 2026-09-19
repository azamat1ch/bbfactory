# Factory

Factory persists versioned requirements, optional behavioral scenarios, links to actual project tests, immutable check evidence, native assignment associations, review findings and explicit human judgments. Workflows owns delegated execution. Factory does not schedule, spawn, retry or stop threads itself.

Direct work needs a task and final verification; no delegated worker is required. Several implementation, research or review assignments can use the same eligible Team profile. The profile is validated against the target host model catalog, and the preference revision and explicit task override are retained. Same native environment work is serialized by Workflows. Ownership text remains advisory rather than filesystem confinement.

## Agent, SDK and CLI

The `bb_factory` tool accepts `{action, input}`. Actions are `create`, `update`, `status`, `list`, `verify`, `assign`, `cancel`, `finding`, and `resolve`. Input follows the corresponding RPC schema in [src/shared.ts](src/shared.ts). Human judgment is deliberately absent from the agent tool.

SDK consumers use `sdk.plugins.callRpc({pluginId: "bbfactory", method, input, outputSchema})` with `factoryRpcContract`. Delegation uses the public Workflows experimental execution RPC; Team preferences use the existing `factory-team` RPC. Both dependencies must be installed and enabled for delegation. Direct task verification does not require Workflows.

The CLI exposes the same records through `bb factory <action> --input '<JSON>'`, plus `judge` for an explicitly authorized human attestation. `judge` requires `humanConfirmed:true`, actor, requirement ID, accepted boolean, rationale, expectedVersion and expectedFingerprint from the displayed task. Changed content or specification rejects the attestation rather than silently applying it to a new result. These are user attestations, not cryptographic provenance: an API credential holder can submit one. Agents must never invent human authorization.

```sh
bb factory create --input '{"threadId":"THREAD","spec":{"goal":"Prevent duplicate bookings","scope":"booking service","requirements":[{"id":"R1","text":"Two requests for the last place yield exactly one booking","criterion":"automated"}],"scenarios":[],"checks":[{"id":"race","requirementIds":["R1"],"testRef":"tests/booking.test.ts#concurrent","argv":["pnpm","test","tests/booking.test.ts"],"timeoutMs":60000,"required":true}]}}'
bb factory verify --input '{"taskId":"TASK"}'
bb factory status --input '{"taskId":"TASK"}'
bb factory cancel --input '{"taskId":"TASK","archive":false}'
```

A spec update requires expectedVersion and a changeReason. Prior specifications and check definitions remain immutable. A passing command without a linked required check does not cover a requirement. `testRef` must name an existing file inside the project; check quality and requirement mapping still require review.

## Evidence and freshness

Required checks run independently on the task's final integration environment. Each evidence record retains the full check definition, spec version, canonical workspace, content fingerprint, host/environment, times, exit status and log reference. Read/list operations recapture content; a bounded background poll invalidates changed or unavailable content. No filesystem watcher is trusted to preserve green status. Identical reads do not publish another event. Evidence is historical and immutable; task status expresses whether it applies to the current observed content.

Capture hashes Git tracked and untracked nonignored files, including new files and tracked deletions, with two complete passes and per-file change guards. Ignored files are outside this content contract. Gitless roots, symlink file entries, submodules, capture errors and capture limits remain unverified; canonical root symlink aliases resolve to the same identity. Limits are 100,000 files and 256 MiB. A selected project test must itself be within the captured content set.

Checks use a Linux systemd user transient service with `KillMode=control-group`, bounded runtime/stop time, retained logs and a supervised wrapper that retains the loaded unit until explicit cleanup. Acceptance requires the systemctl stop job to finish and the recorded cgroup to be empty or removed. Detached descendants remain in that cgroup and are killed during cleanup. The command receives the sanitized daemon environment through a private transient config file, preserving tools such as pnpm without exposing environment values in argv. Missing or unsupported systemd, unknown settlement, log overflow, capture failure and changed content cannot produce acceptance. Native thread settlement alone does not assert this stronger process guarantee for worker-created background processes.

Stop/archive intent is persisted before waiting for a check or native cancellation; restart retries native cancellation. Interrupted verification remains unverified. A stopped task is not resumed implicitly. Retrying work requires a new task and the native execution owner's confirmed recovery; this slice does not expose a resume button. Human criteria require a judgment on current spec/content. Required unresolved findings block acceptance. Passing finite tests is evidence, not proof of all behavior.
