# Subscription Team: concrete build order

Status: historical planning source, superseded September 19, 2026. Read the
[current specification](../spec.md) and [first slice](../first-slice.md) for
implementation. This file preserves original reasoning, including choices
later corrected; it is not a second set of requirements. References to LifeOS
or the external workspace below describe the original planning environment.

## Current agreed direction

Ship BB with the orchestration capabilities assembled and available: the user chooses a conversational lead model; the lead can work directly or delegate through real coding harnesses. Sol and Devin are peers and can cross-review. Delegation is optional and must justify its coordination overhead.

Reuse project docs with progressive disclosure and avoid duplicate specifications or a mandatory folder layout. Planner/worker skills guide behavior without forcing a wizard. Executable acceptance means connecting agreed observable requirements to real checks using the project's tooling; Given/When/Then prose alone is not executable. BB's existing widgets and extension surfaces provide the IDE experience.

The plan is ready for an initial integration. Exact BB API choices, runner behavior, and packaging should be established through a working slice, not more speculative product planning. The documentation tree below is an example, not a required project convention.

## What we will build

A personal product distribution of BB, with an orchestration plugin that adapts Pragmatic Orchestration and coordinates real Devin and Codex Sol workers. Astra plans and resolves difficult decisions. Sol and Devin are peer implementers and reviewers. Either can own a lane, integrate, or cross-review the other; choose by availability and relevant context, without assuming a performance hierarchy. The team builds the product using the same practices that the product will eventually automate.

Use a thin BB fork and keep product behavior in a clearly owned plugin/package. Keep upstream history, licenses, and an upstream remote. First make the product's docs, defaults, navigation, and installed capabilities coherent. Remove upstream code only after mapping dependencies and proving removal does not break the selected distribution.

## Step 1: establish the workspace and actual workers

Create an independent project repository for the fork. Pin a known BB revision and run its existing application and appropriate baseline checks before changing behavior. Record pre-existing failures separately.

Install/pin Pragmatic Orchestration in a managed dependency location or clearly attributed vendor directory; do not make edits in a global plugin cache the source of truth. Verify the actual CLI and configured worker profile names. Preserve authentication in each native harness.

Prove one real Devin task and one real Codex Sol task in disposable working copies. Capture start, observation, output, failure, and stop behavior. Verify simultaneous sessions, workspace isolation, quota behavior, and shared configuration before increasing concurrency. Don't assume every provider supports the same resume/steer capabilities.

Local check during planning: Codex was on PATH. Linking the installed Devin desktop CLI into ~/.local/bin made `devin --version` return `3000.10.31`. Authentication was subsequently verified as logged in. A temporary upstream Pragmatic Orchestration checkout successfully launched a real Devin SWE-2-high inspection through Porch; run `run_silver-pine-c37c` completed successfully in 335 seconds against BB revision `c1a64f4`, with a clean checkout afterward. No global Porch installation was made.

Exit: stock BB runs; the team can deliberately start, observe, and stop the intended workers, with unsupported capabilities documented.

### First real orchestration trial, September 19

Used upstream Pragmatic Orchestration from a temporary checkout to launch Devin SWE-2-high through ACP on a read-only BB integration investigation. The worker invoked Code That Fits in Your Head. Parent inspected progress, sent corrective steering, collected the final answer, and confirmed no checkout changes. Launch/observation/result collection worked; steering was exercised, but it did not immediately prevent scope drift. No product code or live BB integration has been built yet.

Parent-verified starting seam: a BB plugin host entry invokes the Porch CLI on the repository host; server-side plugin storage correlates the actual Porch run ID with its origin; agent tools and CLI expose operations; a plugin card displays recorded state. Use Porch's existing durable run lifecycle rather than building a competing process supervisor. A BB thread ID or subprocess PID is not a Porch run ID. The worker initially conflated these routes, so its raw output is research, not an accepted architecture specification.

First acceptance cases: a launch returns a recoverable Porch ID; completion preserves inspectable output; a failed required check keeps the task unaccepted. Acceptance execution must use the run's repository and record the checked revision. Real BB wiring and recovery still need implementation tests.

## Step 2: give agents a small, clear project handbook

Proposed product-owned documentation (exact package location follows BB's conventions):

```text
README.md                         product entry, run instructions, ownership
AGENTS.md                         short navigation and operating rules
docs/product/README.md            map of current product docs
docs/product/intent.md            purpose, vocabulary, constraints, non-goals
docs/product/architecture.md      module ownership and interfaces
docs/product/specs/               accepted feature contracts and scenario IDs
docs/product/decisions/           decisions that affect future implementation
docs/product/tasks/               active assignments and evidence links
<product-plugin>/AGENTS.md        plugin-specific rules
<product-plugin>/tests/acceptance/ executable behavior tests
```

Preserve upstream contributor instructions needed to work safely; add clear product routes instead of replacing them wholesale. Each worker receives the small entry document and relevant task contract, then follows links to details. Every canonical check should be available through one documented project command, using the repository's existing test tooling where practical.

Exit: a fresh worker can find the spec, owned files, relevant patterns, and acceptance command without reading a giant context dump.

## Step 3: write the first feature contract and make one path work

First feature: **delegate one specified repository task from BB and return a verified result**.

The product plugin accepts a task contract and selected worker, starts that worker through Porch, observes its progress, preserves the resulting changes, runs a defined acceptance check, and shows the outcome in BB.

Keep Porch's runner initially. Adapt the delegation instructions and add a small BB-facing adapter. Port runner internals only when a concrete integration limitation justifies it. Native provider support can be used later behind the same execution interface.

The bridge must have one owner of launches, cancellation, and retries. BB is the host; Porch controls the worker attempt where used. Do not let two schedulers retry one attempt independently.

Use a small fixture repository for development. The fixture must require an actual code change, and the accepted result must be bound to a revision and check output. A worker saying 'done' is insufficient.

Exit: user starts a task in BB, a real worker changes code, and BB shows inspectable acceptance evidence. Begin with either worker, then demonstrate the same contract with the other.

## Step 4: divide into independent implementation lanes

Astra defines shared records and boundaries first. Use these agreed interfaces before allocating parallel implementation.

| Lane | Owner and workers | Concrete output |
| --- | --- | --- |
| Runner integration | One Sol or Devin owns the boundary; a peer reviews it | Start, observe, steer where supported, cancel, collect; normalized attempt events |
| Spec and verification | One Sol or Devin implements; an independent peer reviews acceptance integrity | Versioned requirements, task contracts, checks, revision-bound evidence |
| Product interface | Sol or Devin workers own independent components; one designated peer integrates | Feature screen, worker progress, changes, failure and result views |
| Resource allocation | Astra sets policy; Sol or Devin implements; a peer reviews | Known/unknown quota observations, worker eligibility, reservations, routing reasons |

Start with one worker per independent lane. Add Sol or Devin workers when queued tasks have clear scope, stable inputs, separate ownership, and an acceptance check. A designated Sol or Devin coordinates integration for a lane when needed; it need not rewrite every worker message. Astra reviews contracts, architecture changes, hard failures, and milestone evidence.

Use isolated worktrees for parallel writers. One integration owner assembles accepted changes. Dependencies unblock on the agreed evidence, not on a chat message. Track consumption and corrections for the team building this product from the first real run.

## Step 5: add reliable orchestration

Add dependencies, bounded supervision, delta steering, context retrieval, diagnosed retries, and safe handover. A stopped observation call must not imply a stopped worker. A replacement writer cannot begin overlapping work until the previous writer has relinquished ownership.

Add budget and capability-aware selection. Strong direct execution remains an option when delegating the work would be more expensive overall. Record why a worker was chosen, what telemetry was available, and whether the assignment succeeded.

Exit: multiple workers finish a real feature, and an injected interruption can be recovered without duplicate writers or lost accepted work.

## Step 6: make the workspace feel like the product

Configure the fork's default entry, enabled extensions, and workflow around feature delivery. Bundle the product plugin so a fresh install needs one documented setup path rather than a collection of manual modifications.

Build a stable feature view with spec, app preview, team progress, available capacity, and decisions. Add generative composition from a fixed card catalog. Runtime records supply all status and resource values.

Natural-language view changes come first. Persistent workflow or plugin modifications follow as versioned, tested changes. Keep raw agent sessions available through drill-down.

Exit: a user can specify, follow, intervene in, and accept a feature through one product experience.

## Step 7: use it to finish itself

Bootstrap using Astra plus external Porch-run Devin/Sol workers. Once the single-task product path is reliable, use the plugin to implement a bounded part of its own interface. Then use it for more independent product work.

Run the supervisor from a known-good build while workers change another checkout. Integrate and verify before restarting into the new build. Keep external runner access as recovery if the product breaks; label that intervention in measurements.

Use real traces from building the product in the demo: requirements, assignments, useful handovers, failures detected, acceptance, and observed usage. Compare with direct strong-model and fixed-delegation baselines. Account for all coordination and failed attempts.

Exit: the product has delivered its own accepted features and another repository's feature, with reproducible evidence.

## Step 8: trim and ship a coherent distribution

Map the included upstream subsystems. Disable unused features first. Remove code only where the product no longer depends on it, checking startup, build, provider operation, and acceptance after each coherent removal. Keep a short record of intentional upstream divergence.

Own the product name, docs, onboarding, defaults, feature workflow, plugin behavior, tests, release process, and support story. Retain upstream attribution and license notices. Packaging is complete when another machine can install it, connect a supported harness, and complete the first verified task through documented steps.

## Initial SDD and BDD

SDD: write a short accepted feature contract before implementing each feature. BDD: express its observable behavior in executable tests. Use the existing test runner initially; Given/When/Then does not require adding a separate framework.

The following scenarios are proposed specifications, **not runnable tests yet**. Wire each into the real plugin boundary as the corresponding feature is implemented. Fast tests use deterministic worker/provider fixtures; separately run live smoke tests with real Devin and Sol. A fake-worker test cannot prove CLI integration.

### D1: verified delegated completion

Given an accepted task contract, a selected available worker, and a repository where its acceptance check fails,
when the user runs the task and the worker changes the repository,
then the product runs the check against the resulting revision and marks the task accepted only if the required evidence passes.

### D2: unsuccessful result remains unfinished

Given a worker reports completion,
when an acceptance check fails, is unavailable, or was not run,
then the task remains unaccepted and the actual failure or missing evidence is visible.

### D3: safe replacement

Given a worker has partial changes and becomes unavailable,
when the product replaces it,
then the first writer must be confirmed stopped before an overlapping writer begins, and the new worker receives preserved changes, the spec version, checks, and remaining work.

### D4: no silent spec drift

Given a task uses spec version 1,
when an accepted change creates version 2 affecting that task,
then old affected evidence cannot accept the task and the assigned worker receives the changed requirement.

### D5: honest resource policy

Given two worker profiles share one quota pool and another worker's quota is unknown,
when the scheduler selects work,
then it does not count the shared allowance twice, does not represent unknown allowance as available capacity, and records the selection under the configured policy.

### D6: restart without duplicate work

Given an attempt is active and the supervisor restarts,
when execution resumes,
then the supervisor reconciles the existing attempt before launching anything and duplicate events cannot cause duplicate integration.

### D7: delegation is optional

Given a coherent task whose configured routing evidence favors direct strong-model execution,
when allocation runs,
then the policy can select that route rather than obligatorily decomposing or delegating it, and records the reason.

### D8: test changes cannot manufacture acceptance

Given an accepted scenario rejects the current implementation,
when a worker weakens or deletes its protected check without an accepted requirement change,
then the delivery remains unaccepted and the verification change is flagged for review.

## First actual assignments

1. Astra: produce the short product intent, first feature contract, shared records, and ownership map.
2. One Sol or Devin: prove stock BB runs and document the smallest plugin integration point and real worker lifecycle.
3. A peer worker: after that interface is agreed, implement the bounded Porch adapter or a specified part of it, with fixtures and a live smoke path.
4. Another Sol or Devin: implement the first task/result card against the agreed record shape.
5. A designated integration owner: integrate and run acceptance, with Sol and Devin cross-reviewing work they did not author; Astra resolves any product or architecture ambiguity.

Only after this path works do we expand the worker pool. The goal is to create enough independent, verifiable work to use many workers profitably.

## Sources

- [BB](https://github.com/get-bb/bb)
- [Pragmatic Orchestration usage and supported harnesses](https://github.com/CodeAlive-AI/pragmatic-orchestration/blob/main/skills/pragmatic-orchestration/README.md)
- [Delegation protocol](https://github.com/CodeAlive-AI/pragmatic-orchestration/blob/main/skills/pragmatic-orchestration/references/delegate.md)

Public documentation supports reusing Porch for real Codex and Devin harness calls. The precise behavior of the locally installed versions remains to be tested.
