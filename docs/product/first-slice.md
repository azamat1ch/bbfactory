# First implementation slice

Status: next implementation contract. Scenarios below are not runnable tests yet.

**Deliver one specified task through native BB execution and prove the result.**
Keep the selected lead in normal chat. It can work directly or delegate to one
eligible native worker. Show progress, resulting changes and an independently
run acceptance check. Keep worker completion separate from task acceptance.

## Before parallel implementation

Inspect the Workflows/threads integration seam and define shared contracts. Reuse
native durability; do not assume an undocumented cross-plugin service exists.
Choose the small native extension needed if the exposed SDK is insufficient.

- Task: stable ID, goal, scope, spec version, requirement IDs and agreed checks.
- Attempt: launch intent, direct/delegate mode, profile, origin thread, native
  worker/workflow identifiers, resolved host/workspace, base revision and state.
- Evidence: check definition/argv, spec version, content identity including new
  files, relevant environment, exit status, timing and log references.
- State/UI: explicit running, blocked, awaiting checks, accepted, failed and
  cancelled states. Native completion and product acceptance are separate fields.

Use the actual BB identifiers and provider capabilities. Do not put Porch IDs,
CLI exit codes or mandatory Devin-specific fields in the product contract.
The first slice has one writer per workspace, including the direct lead route.

## Work lanes

1. Contract/integration owner defines the records, integration seam and fixture
   conventions. Other lanes start once this small interface is stable.
2. Server lane implements tasks, native attempt linkage, reconciliation and
   acceptance transitions. It does not duplicate the execution scheduler.
3. Host verification lane captures tested content and executes declared checks
   on the correct host/workspace independently of the implementing worker.
4. UI lane builds one task card from the agreed records, with progress, evidence
   and access to the native worker thread. Shared actions also reach the CLI/tool.
5. Integrate and exercise the real path. An independent Astra reviews the
   result and failure evidence. Implementers/reviewers are eligible peers.

Give each writer a separate branch/worktree and bounded files. Tests target
failure modes and observable outcomes, not assertions that mirror implementation.

## Behavioral checks to implement

| Scenario | Expected result |
| --- | --- |
| A selected configured provider receives one bounded task | A real native worker runs, is observable and returns artifacts; provider-specific capabilities are accurately shown |
| Worker says done but the required check fails | Worker completion is recorded; task remains unaccepted with the failure evidence |
| Required check passes on the captured resulting content | Task can be accepted only for that spec/content/check version |
| Files, new files, agreed checks or relevant spec change after a pass | Affected evidence becomes stale and acceptance is withdrawn pending verification |
| Lead works directly | No worker is required; the same ownership and verification gate applies |
| Spawn response is lost or app/plugin restarts | Reconcile persisted native ownership; never blindly launch another writer |
| Cancel request is acknowledged but stop is uncertain | Show pending cancellation; no replacement writer until terminal confirmation |
| A completion notification arrives twice | One product transition; no duplicate integration/check launch caused by replay |
| UI reconnects | Restore the same task from durable state, not model-generated status text |

Use deterministic fakes for lifecycle failures and real checks on a fixture repo.
For native smoke, use a working authenticated profile and then repeat with a
second profile/harness as available; record precisely which were tested. Devin
is one integration candidate, not the architecture's mandatory starting point.

## Next slices

After the single-task path works: peer cross-review, isolated parallel workers
and handover; pool-aware capacity and routing; richer spec refinement/drift
controls; both chat/dashboard layouts; measured efficiency and packaging. Keep
those requirements in the [specification](spec.md) while landing small usable
increments. No additional high-level product workshop is needed to start.
