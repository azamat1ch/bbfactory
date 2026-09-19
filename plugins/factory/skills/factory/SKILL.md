---
name: factory
description: "Specify, implement and review work in BB with Factory: turn a request into a versioned executable spec, work directly or delegate bounded assignments to BB worker threads, supervise them, and collect review evidence for human approval. Use for feature work, delegated implementation or research, and independent review. Not for simple questions answerable directly from docs or the current codebase."
---

# Factory

Factory owns the working agreement — a versioned spec with requirements,
checks and evidence — and the assignments that carry it out. The lead stays a
normal conversation on the user's chosen model; workers are ordinary BB
threads. There is no separate orchestration runtime, mandatory pipeline or
fixed agent roster. Direct execution is always valid; delegate only bounded,
independent work whose benefit exceeds its coordination cost.

## The working loop

1. **Chat and explore** against the actual repository.
2. **Draft or refine the spec.** Significant or ambiguous work gets one draft
   Factory task, created and refined conversationally; small, well-scoped,
   low-risk fixes stay direct. Ask the user only about material choices.
3. **Implement** — directly or through bounded assignments, whichever needs
   fewer agents while covering the work.
4. **Review and fix proportionately.** Depth follows risk; feed material
   findings back to the implementer.
5. **Human approval.** The user approves the delivery. Checks, agent reviews
   and worker completion are evidence — never acceptance on their own.

## Specifications and actions

`bb_factory` (agent tool) and `bb factory` (CLI) share most actions —
`create`, `update`, `status`, `list`, `verify`, `assign`, `cancel`,
`finding`, `resolve`, `start`, `agent-review`, `note` — as
`{ "action": ACTION, "input": INPUT }` or `bb factory <action> --input
'<JSON>'`. Human-attestation and delivery actions are **CLI/UI only**:
`approve`, `deliver`, `judge`, `judge-many`, `resume`, `export`, `import`.

`create` saves a **draft**; `update` refines it in place with stable
requirement ids and a `changeReason`. Drafting never authorizes
implementation, a spec-only request stays draft, and prior implementation
authorization must not gain a new approval gate. Each requirement declares
`criterion` or a `verificationMethods` list — a non-empty list requires
every listed method (`automated`, `agent`, `human`). `start` activates the
agreed version without launching workers; `verify` runs linked checks on
final content.

## Team, assignments, supervision

Read the saved Team preference (`bb factory team get --json`) before choosing
workers: **Off** stays direct unless overridden, **Auto** permits
discretionary delegation, **Selected** restricts eligible profiles without
requiring any launch. Explicit user directions for the current task override
it. Never silently substitute an unavailable profile; providers are peers.
See [references/team.md](references/team.md).

Delegate through `bb factory assign`. Each assignment is a bounded brief:
purpose, exact `environmentId`, scope and non-goals, owned files or
interfaces, profile, permission mode, expected result and acceptance checks.
Isolate competing writers; keep one integration owner. Supervise by risk —
completion events, compact status and artifact inspection over polls —
through `bb factory execution inspect`/`guide`/`guide-status`/`wait`; steer
only to correct a concrete problem. [references/delegate.md](references/delegate.md)
covers launch, waiting, steering, continuation and recovery.

## Review, evidence, recovery

Match review to the work: the lead reviews manageable changes; add
independent reviewers only where uncertainty or risk justify them. Lenses —
correctness, security, performance, architecture, test quality, BDD
coverage, QA behavior, simplification — are prompts, not stages; one
reviewer may hold several. Feed findings back for typically one to three
correction rounds, neither quota nor cap. `bb factory review collect` merges
attributed outputs and validates an optional judge pass.
[references/review.md](references/review.md) details lenses and recipes.

Record evidence against requirement ids, spec version and tested content —
scope, reviewer or executor, verdict, artifacts, limitations — via
`agent-review`, `finding`, `resolve`, `note`. Approval (`approve`, `judge`,
UI) requires the user's explicit action; a chat decision carries its
`sourceRef`. Changed code or spec marks evidence stale. A quiet log,
timed-out wait or stopped thread does not prove failure — preserve partial
work and hand over only the remainder. When workers share a host, run one
heavy check at a time when cost is unknown — see
[references/resources.md](references/resources.md).

## References

- [references/tasks.md](references/tasks.md) — spec/task schema, all `bb factory` actions, assignments, evidence, review collection
- [references/team.md](references/team.md) — Team modes, precedence, persistence, CLI
- [references/delegate.md](references/delegate.md) — assignment lifecycle, supervision, steering, continuation, recovery, VCS observation
- [references/review.md](references/review.md) — review lenses, prompt assets, optional depth recipes, result collection
- [references/resources.md](references/resources.md) — cooperative host-resource safety for expensive checks
- [references/configuration.md](references/configuration.md) — provider/model discovery, permission modes, prompt transport, usage
- [references/runtime-contracts.md](references/runtime-contracts.md) — thread and steering guarantees, prompt layering, limits, diagnostic caution
