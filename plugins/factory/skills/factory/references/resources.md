# Host resource safety

Load this reference when assignments or checks are likely to be expensive —
builds, installs, typechecks, full test suites, browser runs. It is
cooperative guidance, not an enforcement layer: there is no shared queue,
permit system or resource backend, and BB's thread concurrency limits do not
bound the subprocesses or memory a worker spawns.

## Cooperative rules

Before an expensive run, inspect available memory, CPU/load and visible heavy
jobs on the owning host (for example `free -h`, `uptime` and a bounded process
listing on Linux). State when observations are unavailable or sandbox-limited.
Separate worktrees still share that host's CPU and memory.

- **Prefer focused checks.** Run the test file, package filter or targeted
  command that proves the change, not the whole suite. Repeat or broaden only
  for new changes, failures or unresolved concerns.
- **Bound the runner.** Where a tool offers parallelism controls (worker
  counts, `--maxWorkers`, turbo concurrency), use a bounded value rather than
  unbounded fan-out on a shared host.
- **One heavy run at a time when cost is unknown.** The lead coordinates
  workers so they do not launch heavy suites simultaneously — through
  assignment briefs ("report before running the full suite") and concise
  messages. This is cooperation between agents, not scheduling; the lead owns
  the sequencing decision.
- **Preserve the work, not the process.** A worker that finishes keeps its
  session for focused follow-ups; release execution resources when done.

## When something looks like a resource failure

A likely resource-related failure — OOM kill, timeout under load, runner
crash — is investigated before it is retried:

1. Inspect available evidence (exit output, logs, partial artifacts) and
   preserve logs and partial work.
2. Reduce the load (smaller scope, bounded parallelism, serial reruns) or
   report the blocker.
3. Never blind-retry the same heavy command hoping the second run passes.

## Platform knobs

The optional `concurrency-limit` plugin governs how many threads run at once
per host (`bb concurrency-limit status --json`). It is a platform
administration surface, not a Factory control, and it does not limit
subprocess memory or CPU — cite it only when an operator needs it.
