# First vertical slice

Status: proposed implementation contract, revised after independent Astra review. No executable tests or plugin code exist yet.

A lead in BB either works directly or delegates one task through Porch. BB shows progress, collects the result, independently executes one agreed check, and distinguishes completed work from accepted work. Preserve upstream desktop/browser support.

## Boundaries and shared contracts

Land shared host method schemas, app RPC schemas, status/event schemas and plugin manifest before parallel work. Proposed plugin directory: `plugins/pragmatic-orchestration/`.

- Task: taskKey, goal, scope/non-goals, selected profile, required check argv, base revision. HostId and absolute cwd are resolved/validated by the server from the originating environment or explicit CLI selection.
- Launch intent: taskKey, unique intentId, hostId, cwd, baseRevision, state, optional actual Porch runId. Persist before launch and serialize starts per task.
- Host methods: delegateStart, runStatus, runEvents(cursor, limit), bounded runWait, runSteer, runCancel, runList, runCheck. All lifecycle calls target the stored host and cwd.
- Run record: intentId, actual Porch runId, hostId, cwd, profile, baseRevision, worker status, check evidence and acceptance status. Do not use a PID or BB thread ID as the Porch run ID.
- Check evidence: declared argv, hostId/cwd, immutable tested-content identity, exit code, timing and logs. Include all resulting edits/new files in the tested snapshot; unchanged HEAD is not sufficient. Revalidate content before acceptance.

Vendor the pinned complete runtime layout and license: scripts, sibling prompts and required profile/config assets. Preserve Porch's registry/supervisor ownership. Configure plugin-scoped persistent paths. No competing retry scheduler.

If launch may have started but its ID is lost, record `uncertain` and forbid automatic relaunch until reconciled. A correlated live run is adopted; an uncorrelatable launch requires explicit resolution. Cancellation acknowledgement remains pending until terminal confirmation.

Live updates: host file-watch invalidations trigger bounded Porch status/events reads; host signals notify the server; server realtime invalidates UI records. Store cursors and catch up after reconnect. Signals alone are not durable state.

## Ownership and ordering

1. Contract owner: `shared/`, manifest, schemas and fixture conventions.
2. Parallel host owner: `host.ts`, runner adapter and runtime packaging; server owner: `server.ts`, tools/CLI/store and acceptance evaluator; UI owner: `app.tsx`, run card consuming agreed RPC.
3. Verification owner: check execution and exact-content evidence, coordinated with host/server interfaces from step 1. This is part of the slice, not deferred.
4. Integration owner combines the pieces and runs end-to-end checks. Independent Astra reviews evidence and failures.

## Proposed behavioral scenarios (not yet runnable tests)

1. Launch a real Devin task through BB tool or CLI; persist actual Porch ID, host and cwd; observe bounded event pages and recover the same run after plugin reload. Sol uses the same contract in the next provider smoke check.
2. Complete the worker, independently run the predeclared check on the resulting snapshot, and show both worker completion and acceptance. Failed/missing/timed-out/stale checks remain unaccepted. Mutating content after a passing check invalidates that evidence.
3. Steer reports transport acknowledgement without claiming semantic compliance. Cancel remains pending until Porch confirms terminal state; cancelled work is never accepted merely because control calls succeeded.
4. Lead completes directly with no Porch run. Apply the same check/evidence gate; do not require delegation.
5. Interrupt launch after the supervisor starts but before its ID is saved. Restart must show uncertain state and prevent duplicate launch. Reconcile an identified live run without restarting it. Reconnect refreshes the card from durable state.

Defer multi-worker fan-out, review orchestration, advanced spec workflows, quota/session UI and marketplace packaging. Retain them in the full parity inventory. Existing platform support remains; only tested surfaces may be described as verified.
