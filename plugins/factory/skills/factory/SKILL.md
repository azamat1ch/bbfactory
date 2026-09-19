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

1. **Chat and explore.** Understand the request against the actual repository
   before drafting anything.
2. **Draft or refine the spec.** Significant or ambiguous work gets one draft
   Factory task, created and refined conversationally. Small, well-scoped,
   low-risk fixes stay direct.
3. **Implement** — directly in this thread or through bounded assignments,
   whichever needs fewer agents while covering the work.
4. **Review and fix proportionately.** Depth follows risk; feed material
   findings back to the implementer.
5. **Human approval.** The user approves the delivery. Checks, agent reviews
   and worker completion are evidence — never acceptance on their own.

## Specifications

`bb_factory` (agent tool) and `bb factory` (CLI) share the same actions: the
tool takes `{ "action": ACTION, "input": INPUT }` and the CLI takes
`bb factory <action> --input '<JSON>'`. A spec holds a goal, scope,
requirements (each `automated`, `agent` or `human`), optional Given/When/Then
scenarios, executable `checks` and an explained `teamPlan`.

- `create` saves a **draft**. Refine the same draft in place with `update`
  (a new spec version each time); keep requirement ids stable and record a
  `changeReason`.
- Choose acceptance methods deliberately: executable checks for behavior,
  `agent` for outcomes an evidence-backed inspection can establish, `human`
  for subjective judgment or user-only knowledge.
- `start` activates the agreed spec version; it does not launch workers.
  `verify` runs the linked checks against final content.
- Creating or refining a draft never authorizes implementation, and an
  explicit spec-only request stays draft. When the user already authorized
  implementation, drafting must not introduce a new approval gate.
- Apply KISS/DRY/YAGNI while refining and ask the user only about material
  unresolved choices; routine implementation decisions are yours.

See [references/tasks.md](references/tasks.md) for the full spec, check,
assignment, evidence and action contract.

## Team and delegation

Read the saved Team preference (`bb factory team get --json`) before choosing
workers — it expresses the user's delegation preference, not permission to
launch:

- **Off** — work directly unless the user explicitly overrides.
- **Auto** — delegate when it is worth the coordination cost.
- **Selected** — delegated work uses only the listed provider/model profiles;
  the list constrains eligibility, not worker count.

Explicit user directions for the current task override the saved preference.
Discover real providers and models (`bb provider list --json`,
`bb provider models <provider-id> --json`) and never silently substitute an
unavailable profile. Providers are peers: none is the scheduler and none
outranks another. See [references/team.md](references/team.md) for modes,
persistence and precedence.

## Assignments

Delegate through `bb factory assign` / `bb_factory` `assign`. Each assignment
carries a bounded brief: the purpose and how it serves the goal, the exact
working root (`environmentId`), scope and non-goals, owned files or
interfaces, a provider/model profile, a permission mode, the expected result
and acceptance checks. Give workers the context that affects their decisions
— not the conversation transcript or the whole lead manual. Isolate
competing writers in separate environments or non-overlapping scope;
compatible read-only work may share a root. Keep one integration owner who
verifies the combined result.

## Supervision

Risk sets the cadence, not a fixed schedule. Verify early that a worker
understood the task when the work is risky, novel or broad; for bounded
low-risk work, the completion event and a compact progress check may suffice.
The Factory supervision surface is `bb factory execution inspect`,
`guide`, `guide-status` and `wait`; `bb thread show`/`log`/`output`/`stop`
remain the lower-level detail layer. Prefer completion events, incremental
log pages and artifact inspection over polling loops or full transcripts.
Steer only to correct a concrete problem — one self-contained, durably
receipted guidance message at a time — and verify the effect through work
products, not the send acknowledgement. Continue a healthy worker session
for focused follow-ups instead of spawning a replacement.
[references/delegate.md](references/delegate.md) covers launch, waiting,
steering semantics, continuation and recovery.

## Review

Match review to the work. The lead reviews manageable changes directly; add
ordinary independent reviewers only where uncertainty, breadth or risk justify
them. Lenses — correctness, security, performance, architecture, consistency,
test quality, BDD scenario coverage, QA/app behavior and simplification — are
prompts and briefs in [references/review.md](references/review.md), not
mandatory stages or special worker types; one reviewer may hold several
lenses. Feed material findings back to the implementer, typically for one to
three correction rounds — neither a quota nor a hard cap; reassess scope,
context or approach when a loop goes unproductive.
`bb factory review collect` merges attributed reviewer outputs and validates
an optional judge pass; it launches nothing.

## Evidence and acceptance

Record evidence against requirement ids, the spec version and the tested
content: procedure or scope, reviewer or executor identity, verdict,
artifacts and limitations — via `agent-review`, `finding`, `resolve` and
`note`. Human judgments (`judge`, `judge-many` or UI approval) require the
user's explicit action; never record one on their behalf. Changed code or a
changed spec marks affected evidence stale. A finished worker, a passing
review judge or a merged PR is not acceptance.

## Recovery and resources

A quiet log, timed-out wait or stopped thread does not prove failure.
Preserve partial work, reconcile the last turn, and hand over only the
remaining work — never silently replay a task. When several workers share a
host, coordinate expensive checks cooperatively: prefer focused commands,
arrange one heavy run at a time when cost is unknown, and investigate
resource failures instead of blind retries. See
[references/resources.md](references/resources.md).

## References

| File | Load for |
|---|---|
| [references/tasks.md](references/tasks.md) | Spec/task schema, `bb factory` actions, assignment contract, evidence, review collection |
| [references/team.md](references/team.md) | Team modes, precedence, persistence, CLI |
| [references/delegate.md](references/delegate.md) | Assignment lifecycle, supervision, steering, continuation, recovery, VCS observation |
| [references/review.md](references/review.md) | Review lenses, prompt assets, optional depth recipes, result collection |
| [references/resources.md](references/resources.md) | Cooperative host-resource safety for expensive checks |
| [references/configuration.md](references/configuration.md) | Provider/model discovery, permission modes, prompt transport, usage |
| [references/runtime-contracts.md](references/runtime-contracts.md) | Thread and steering guarantees, prompt layering, limits, diagnostic caution |
