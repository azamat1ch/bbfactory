---
name: bbfactory
description: Coordinate one bounded task via the bb_factory tool or `bb factory` CLI — create, run directly or delegate to a provider worker, verify with declared checks, inspect evidence. Use when the user asks to run a bounded task, delegate a change to another provider, or check factory task status.
---

# bbfactory

Manage the durable task record. Worker completion is never acceptance — `verify` runs the task's declared checks independently and binds evidence to actual workspace content.

## Tool actions (`bb_factory`)

- `create` — `goal` (required), `scope`, `requirementIds`, `checks` (array of `{argv: [program, ...args], id?, timeoutMs?}`; run on the workspace host after the writer finishes). Returns the task and a `previewDirective` — emit it exactly once on its own line so the task card renders.
- `status` — `taskId` for one task's detail, or omit to list this thread's tasks.
- `start` — `taskId`, `mode`: `direct` (you execute in this thread) or `delegate` (`providerId` required; `model`, `reasoningLevel`, `permissionMode` optional).
- `complete` — `taskId`; reports the running attempt done. Only succeeds when the writer thread is confirmed terminal (idle/error/deleted); a still-active or merely archived writer is rejected.
- `verify` — `taskId`; re-runs declared checks on the latest completed/verified attempt.
- `cancel` — `taskId`; stays `cancelling` until the writer reaches a terminal state. Cancelling a writer that was stopped by request, failed, or was deleted leaves the attempt `halted` and the workspace still claimed — detached processes may survive, and this slice cannot prove otherwise.

## CLI equivalents

`bb factory task create|list|show|update`, `bb factory start|complete|verify|cancel` — same fields as flags (`--check` repeatable, JSON argv array or plain command line; `--mode`, `--provider`, `--model`, `--reasoning`, `--permission`). Output is JSON.

## Rules

- One active writer per workspace across all tasks, enforced atomically. `uncertain`, `cancelling`, `completed`, `verifying`, and `halted` attempts still own the workspace; only `verified` and `settled` (organically finished, cancelled) attempts release it.
- An archived writer is not terminal proof — ownership is retained until `idle`/`error`/`deleted` is observed. Writers stopped by request, failed, or deleted become `halted` and keep the lease: a requested stop does not prove detached children died.
- Incomplete workspace snapshots (unreadable or oversize files), lost check RPC replies, and unsettled check process trees fail closed to `blocked`+`halted`, never `accepted`. A restart with a check in flight halts rather than silently rerunning.
