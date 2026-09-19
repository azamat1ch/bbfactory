# bbfactory

Coordinate one bounded task from a lead chat thread: propose it, run it directly or delegate it to a native worker thread on a selected provider, run the task's declared checks independently, and inspect the evidence. A worker finishing never accepts the task — only declared checks passing on unchanged workspace content do.

## What it does

- The `bb_factory` agent tool and `bb factory` CLI share one durable task record: `create`, `status`, `start`, `complete`, `verify`, `cancel`.
- `create` returns a `previewDirective` (`::factory-task{task="bft_…"}`); sending it to the thread renders a live task card with attempt state, check results, and evidence.
- Delegated attempts spawn a normal bb worker thread attributed `origin: "plugin"`, `originPluginId: "bbfactory"` via `pluginMetadata`, so a background reconciler can rediscover workers after a lost spawn reply instead of relaunching blindly.
- Workspace ownership is exclusive and atomic: a partial unique index on `(host_id, workspace_path)` admits at most one active attempt per workspace across all tasks. `completed`/`verifying` attempts still own the workspace, so no new writer can overlap the verification snapshot.
- A spawn exception marks the attempt `uncertain` — not `failed` — because a lost transport reply can leave a live writer. `uncertain`, `cancelling`, and `archived-but-active` writers all keep ownership until a terminal state (`idle`/`error`/`deleted`) is observed. There is no abandon escape hatch.
- Checks run on the environment's host via `runCheck`, outside the worker's claims. Evidence binds check identity to a content fingerprint taken before and after the run; content or spec changes, incomplete snapshots (unreadable or oversize files), and unsettled check process trees all fail closed — never `accepted`.
- Direct mode means the lead thread itself is the writer; cancelling a direct task waits for the lead turn to settle and never stops the user's thread.
- After a restart, accepted tasks are recaptured and compared against `acceptedFingerprint` before being shown as accepted; watcher gaps fail closed to `blocked`.

## Requirements

- Commands must run inside a bb project thread.
- Check argv runs on the environment's host with the workspace as cwd.

## Local smoke

```sh
# create a task (prints a preview directive you can send to the thread)
bb factory task create \
  --goal "Add a /healthz endpoint" \
  --scope "src/server.ts" \
  --requirement "GET /healthz returns 200" \
  --check '["pnpm","exec","vitest","run","test/healthz.test.ts"]'

# start it — direct on the lead thread, or delegated:
bb factory start <taskId> --mode direct
bb factory start <taskId> --mode delegate --provider claude --model sonnet --reasoning high --permission auto

# inspect durable state
bb factory task list
bb factory task show <taskId>

# report the running attempt done (requires the writer thread to be
# confirmed terminal) or re-run declared checks on a completed attempt
bb factory complete <taskId>
bb factory verify <taskId>

# cancel — stays pending until the writer reaches a terminal state
bb factory cancel <taskId>
```

## States

Task: `proposed → running → awaiting_checks → accepted|failed|blocked`, `cancelling → cancelled`.
Attempt: `spawning → uncertain|running → completed → verifying → verified`, `cancelling`, `halted`, `settled`.

`uncertain`, `cancelling`, `completed`, `verifying`, and `halted` attempts still own the workspace. A new attempt — on this task or any other task sharing the workspace — is rejected until the writer reaches a verified-stop state (`verified` or `settled`).

Important: `halted` is permanent in this slice. A writer that was stopped by request, failed, was deleted, or whose check process tree was never proven settled may still have detached children writing to the workspace — the SDK cannot prove otherwise, so the lease is retained rather than guessed released. Cancelling a `halted` attempt marks the task `cancelled` but does not free the workspace.

## Tests

```sh
pnpm exec turbo run test --filter=bb-plugin-bbfactory
pnpm exec turbo run typecheck --filter=bb-plugin-bbfactory
```
