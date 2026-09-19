Run one bounded task from your chat thread: propose it, run it directly or delegate it to a worker thread on a selected provider, then verify it with the task's own declared checks.

## What you get

- A task card in the thread with live attempt state, check results, and evidence freshness.
- A **Factory** panel listing tasks, attempts, and evidence for the thread.
- The `bb_factory` tool for agents and the `bb factory` CLI for the same durable record.
- Honest states: worker completion is never acceptance; checks run independently on the environment's host against actual workspace content, including untracked files.

## How it works

Delegated work spawns a normal bb worker thread attributed to this plugin. A background service reconciles lost spawn replies by matching plugin-owned threads — a spawn exception marks the attempt `uncertain` rather than failed, and the workspace stays owned until the writer reaches a verified-stop state. Only one active writer may exist per workspace, across all tasks. Cancelling keeps ownership until the writer reaches a terminal state; a writer that was stopped by request, failed, or was deleted stays `halted` and keeps the claim — detached processes may still be alive and the SDK cannot prove otherwise in this slice.

## Requirements

The plugin is off by default. Commands must run inside a bb project thread.
