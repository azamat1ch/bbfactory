# Subscription Team — product and engineering proposal

Status: historical planning source, superseded September 19, 2026. Read the
[current specification](../spec.md) and [first slice](../first-slice.md) for
implementation. This file preserves original reasoning, including choices
later corrected; it is not a second set of requirements. References to LifeOS
or the external workspace below describe the original planning environment.

## 1. Product thesis

Turn the AI coding subscriptions you already pay for into one coordinated team that delivers specified software while conserving scarce premium capacity.

The primary pain is personal: Azamat has multiple subscriptions, values the speed and quality of frontier models, and reports exhausting their limits in one or two days of intensive work. Other capacity remains available, but assigning it effectively requires management. An unsuitable assignment can cost more overall through repeated context, failed attempts, and expensive supervision. Sol and Devin are peer implementers and reviewers, with cross-review in either direction and no presumed performance hierarchy. Astra supplies planning and difficult-decision support.

The product owns that allocation and delivery loop. The human still specifies intent, resolves product ambiguity, and accepts meaningful requirement changes. The system helps write specifications and keeps implementation tied to them.

Three connected capabilities:

1. Subscription allocation: use available capacity where it produces accepted work; preserve premium capacity where substitutes are adequate.
2. Spec-driven delivery: delegate, supervise, integrate, and verify against a versioned definition of success.
3. Adaptive workspace: present the relevant decisions, previews, usage, and evidence through a customizable interface hosted in BB.

Success is more accepted work from a fixed subscription portfolio, within acceptable quality, elapsed time, and human-intervention limits. Token minimization alone is not the objective.

## 2. Positioning and ownership

Public sentence: **Your AI subscriptions, working as one development team.**

Benefit: **More finished software from the capacity you already pay for.**

Technical description: a BB plugin that adapts Pragmatic Orchestration's delegation practices, adds a resource policy and spec-to-evidence tracking, and exposes the process through an adaptive workspace.

BB is the execution and extension foundation. Its existing runtime, provider integrations, workflow controls, and account features should be reused where suitable. The contribution includes adapting structured delegation into BB, not merely adding an allocation dashboard. The exact integration surface must be checked against a pinned BB version before implementation.

Pragmatic Orchestration is a reference implementation and source of reusable practices. Its published guidance covers explicit task contracts, early supervision, bounded observations, delta-only steering, preserving partial work, and verifying results. This addresses several causes of waste, but its advertised efficiency is not proof of savings in this product or workload.

Existing foundations must remain visibly credited. Each shipped behavior should have an ownership record: inherited, adapted, or newly implemented.

## 3. User journey

1. Connect existing authenticated coding harnesses. Discover usable model profiles and available telemetry. Distinguish model, harness, provider/account, and quota pool.
2. Open a repository and select a delivery policy. Read the project's existing instructions, product context, and verification commands.
3. Write or import the feature specification. The lead identifies unresolved choices and proposes concrete acceptance scenarios. Human judgment resolves material ambiguity.
4. Accept a version of the feature contract. The system proposes assignments and explains the important tradeoffs. Routine authorized assignments can proceed automatically.
5. Execute the feature. The workspace shows verified milestones, active work, resource observations, and decisions requiring attention.
6. Respond to a proposed requirement change, inspect a preview, or steer the policy while work continues. Changes create explicit versions and affect only relevant tasks.
7. Receive an integrated result with requirement-level evidence, remaining limitations, and observed consumption. Merge and publication follow the project's configured authority.

The recurring interaction is specifying and accepting outcomes. Reading agent transcripts remains available through progressive disclosure.

## 4. Subscription model and allocation policy

A worker profile consists of harness, model, reasoning setting, tools, account or pool, execution environment, and applicable project permissions. A model name alone does not determine capability.

Record capacity as reported by its source: model-family bucket, session window, weekly window, credits, rate limit, or unknown. Store observation time, reset time where known, and whether the value is measured, estimated, stale, or unavailable. Several profiles may share the same quota pool; reservations must prevent double counting.

Three user policies:

| Policy | Behavior |
| --- | --- |
| Conserve premium | Prefer competent substitutes and reserve premium capacity for tasks where it materially changes the outcome |
| Balanced | Trade elapsed time, capacity, and expected quality according to explicit user preferences |
| Finish fastest | Use the strongest or fastest suitable route within the user's spending and access bounds |

All policies preserve the accepted quality requirements. If conserving capacity cannot meet them, expose the tradeoff instead of silently reducing quality.

Allow a user to reserve reported premium capacity through a chosen horizon, protect capacity for final integration, and disable unapproved API overage. Such reserves are best-effort when telemetry is coarse, delayed, or affected by other sessions. Enforce call, elapsed-time, concurrency, or API-spend caps where technically available, and label these as local controls rather than exact subscription predictions.

Allocation sequence:

1. Filter by access, tools, permissions, availability, and task dependencies.
2. Assess ambiguity, relevant context, integration coupling, failure consequence, and verification quality.
3. Compare direct execution, delegation, and independent parallel execution.
4. Estimate total completion burden, including coordination, review, expected retries, and handover.
5. Select a suitable route and record a short reason plus uncertainty.
6. Reconsider at meaningful checkpoints, not after every token.

Start with transparent rules and user-supplied specialties. Learn estimates only from recorded accepted outcomes. Sparse evidence must not be presented as an optimal routing model.

## 5. Avoiding the false economy of cheap workers

The decision is whether the whole route is better:

`delegation burden = decomposition + worker execution + communication + supervision + expected rework + integration + verification`

Compare that with the expected burden of a suitable model completing the task directly. Keep premium allowance, other subscription consumption, API dollars, wall time, and human time as separate dimensions unless the user supplies explicit weights. Input/output token counts alone do not establish subscription cost.

Practical policy:

- Use a strong model directly for highly ambiguous, tightly coupled work when splitting it creates more coordination than useful independence.
- Delegate coherent tasks with clear boundaries and checks; avoid turning every edit into a new agent session.
- Prepare a shared repository map once per relevant revision, with evidence links. Invalidate affected entries after changes.
- Give each worker the relevant intent, contracts, files, and acceptance checks. Allow targeted retrieval for missing context.
- Reuse a healthy native session where supported. Switching workers carries a context-reconstruction cost.
- Send only new guidance during steering. Deliver complete initial context to a new session.
- Prefer event-driven supervision, with adaptive liveness checks and early direction checks. Silence is not proof of failure.
- Route worker-to-worker information through versioned interface artifacts and concise deltas. Let independent work continue without requiring a manager to rewrite every message.
- Cap unproductive retries. A retry needs a diagnosis or new information; otherwise escalate, revise the decomposition, or ask about the unresolved requirement.
- Review according to risk and acceptance requirements. Stop adding review rounds once their purpose has been satisfied.
- Include UI generation, classifiers, review, failed runs, and fallback calls in consumption accounting.

Premium use is not limited to planning. If a strong model can finish a difficult implementation with less total burden, assign it the implementation.

## 6. Spec and drift control

Maintain a small hierarchy:

`product intent and invariants → accepted requirements → acceptance scenarios → task contracts → code and evidence`

Every task references a spec version, requirement IDs, a base revision, scope, relevant dependencies, acceptance checks, and budget policy. Workers propose changes to requirements; they cannot silently redefine them.

Detect several kinds of drift:

| Drift | Detection and response |
| --- | --- |
| Missing behavior | Requirement lacks passing evidence; keep delivery incomplete |
| Invented behavior | Diff review against scope; remove or request a requirement decision |
| Architectural erosion | Types, interface contracts, dependency checks, and targeted review |
| Weakened verification | Flag changes to protected acceptance artifacts and compare with the accepted version |
| Stale context | Task/spec/base-revision mismatch; refresh affected tasks before accepting results |
| Cross-worker incompatibility | Integration checks on the assembled candidate revision |

Tests and evidence attach to the exact code revision, spec version, and relevant environment. A new change invalidates affected evidence. Final required checks run against the integrated candidate, not only each worker branch.

Keep independent acceptance examples outside the implementing worker's control where appropriate. Worker-written tests complement existing contracts, property checks, supplied examples, and human evaluation. Visual quality and product judgment require explicit criteria and human review where automation is insufficient.

Example feature: event capacity and waitlists. Acceptance covers the full-event path, cancellation promotion, and two concurrent requests for the final place. Passing a happy-path UI test cannot establish the concurrency requirement.

The claim is visible, controlled drift with traceable acceptance; no finite test suite guarantees the absence of all drift.

## 7. Supervision, communication, and recovery

Use one execution owner per task. BB and any adapted runner must not independently launch retries for the same attempt.

A durable task lifecycle should distinguish ready, running, blocked, awaiting verification, accepted, failed, and cancelled. Attempts have their own lifecycle; one task can have multiple attempts without losing history.

Each active writer has exclusive ownership of its assigned work scope. Use isolated worktrees where independent changes warrant them, and a single integration owner. Dependencies unblock on accepted artifacts or explicit interface commitments, not merely on a worker's successful exit.

Recovery sequence:

1. Classify the event: quota limit, transient provider error, missing permission, test failure, unclear requirement, or uncertain progress.
2. Inspect actual evidence and partial effects. Do not assume a lost connection means the process stopped.
3. Resume or steer the same healthy session when that is cheaper and supported.
4. Before replacement, stop and confirm the old writer, revoke its ownership, and preserve accessible files/commits.
5. Build a handover containing accepted spec version, base/current revision, completed changes, checks, remaining work, unsuccessful approaches, and unresolved decisions.
6. Assign only the remainder; verify the integrated result after continuation.

Worker output is data, not authority to expand permissions or launch unrelated work. Plugin actions obey project and account authority. Credentials stay in the existing credential mechanism rather than prompts, artifacts, or usage reports.

Durable state and idempotent launch/retry identifiers protect against duplicate work after a restart. A replayed completion event must not trigger a second integration or delivery action.

## 8. Jev's role

Jev provides typed choices, scores, and truth-probability questions. Its natural role is cheap semantic triage of compact, relevant state.

Initial use: classify substantive worker updates as ordinary progress, likely blocker, requirement conflict, or likely need for stronger reasoning. Explicit tool errors and quota events go through deterministic rules.

Additional candidates after measurement:

- Rank context fragments for a task or handover.
- Identify updates relevant to a particular requirement.
- Flag possible scope drift for inspection.
- Select a suitable exception card from an approved UI catalog.

Jev does not generate summaries, design architecture, transport messages, or certify correctness. Another model writes summaries; code applies permissions and checks; a strong model handles difficult diagnoses.

Debounce repetitive events, cache unchanged inputs, and include classifier overhead in measurements. Optimize for missed consequential blockers as well as false alarms. Classifier uncertainty should trigger inspection rather than suppress a necessary intervention. Native completion, errors, and critical state changes remain visible regardless of classification.

## 9. Adaptive UI and customization

The user-facing object is a feature and its delivery state. Keep navigation stable. Default surfaces:

- **Build:** the current spec, working preview, and requirement-level completion evidence.
- **Team:** assignments, relevant specialties, dependency state, and reasons for important allocation decisions.
- **Capacity:** separate quota pools, freshness, reset windows, policy reserves, and unknowns.
- **Decisions:** concrete choices that need the user's judgment, with supporting evidence.

Generate contextual views from a constrained component catalog: requirement cards, previews, assignment comparisons, handovers, test failures, change proposals, and delivery receipts. Runtime records determine status, counts, and available actions. AI can choose composition and explanation; it cannot invent passing status or usage values.

An instruction such as “show only blocked work and decisions that need me” changes the view. “Require an independent review for database migrations” proposes a versioned workflow-policy change. Keep display changes separate from changes to execution authority.

Distinguish fast generative views from persistent plugins. Creating a new plugin means generating code, validating it in isolation, and installing it through the existing extension mechanism. Never imply every requested new capability can safely appear instantly just because a card can render quickly.

Reuse installed BB plugins and expose their relevant results in the workspace. Later, support natural-language customization of role profiles, policies, and persistent plugins with reviewable changes and rollback.

## 10. Engineering architecture

Implement a focused BB plugin with a small, testable domain core. Avoid a BB fork unless the pinned extension API has a demonstrated gap.

Modules:

1. **Delivery contracts:** versioned requirements, task dependencies, ownership, and evidence validity.
2. **Allocation policy:** feasible worker selection and route comparison; deterministic constraints around model recommendations.
3. **Capacity ledger:** source-specific telemetry, shared-pool reservations, observation freshness, and reconciled usage.
4. **Execution adapter:** BB-native launch, observation, steering, cancellation, resumption, and workspace operations. Add other runners only for an identified gap.
5. **Supervisor:** event reconciliation, semantic triage, interventions, and restart recovery.
6. **Verification and integration:** checks, revision-bound evidence, review requests, and integrated candidates.
7. **Workspace UI:** renders authoritative projections and bounded actions.

Core records: Project, SpecVersion, Requirement, Task, Attempt, WorkerProfile, CapacityPool, QuotaObservation, AllocationDecision, Checkpoint, Evidence, Intervention, and Delivery.

Keep large diffs, reports, and traces as referenced artifacts. Store compact durable state and indexed event history in plugin storage. Planner and supervisor context is a retrieved projection of this state, not the sole copy of the plan.

Use BB's workflow persistence if it meets the required lifecycle. Otherwise add only the missing durable coordination inside the plugin. Confirm support for provider observation, stop acknowledgements, resumption, usage attribution, UI registration, and worktrees in an integration investigation before promising parity across harnesses.

## 11. Proving the economics

Evaluate three strategies on the same representative tasks:

1. Direct suitable frontier-model execution.
2. Fixed strong-planner plus standard-worker delegation.
3. Adaptive allocation with the proposed supervision and verification policy.

Use identical starting revisions, accepted specs, tool access, and independent acceptance criteria. Include simple changes, tightly coupled difficult work, parallelizable features, and recovery scenarios. Report failed and abandoned attempts, not only successful runs. Repeat enough tasks to expose variability and separate cold from warm context conditions.

Measure:

- Accepted requirements and independent defect findings.
- Reported premium usage by its actual pool/window.
- Other subscription consumption and incremental API spend.
- Total input/output/cache usage where observable.
- Planning, communication, supervision, rework, integration, and verification overhead.
- Wall time to accepted delivery and human interventions.
- Cost and latency of handovers and false or missed supervisor escalations.

Control concurrent account activity during quota measurement where possible. Mark observations that cross resets or cannot be attributed to this run. Do not convert API-equivalent token prices into claimed subscription savings.

For the longer-term product claim, evaluate a fixed workload across a whole allowance period: how much accepted work finishes before scarce capacity is exhausted? The customer benefit is sustained productive capacity, which one feature demonstration cannot prove.

Show a tradeoff chart of quality, premium consumption, and elapsed time. A strategy that uses less premium but far more human effort may be unsuitable. If adaptive orchestration does not beat direct execution on a task class, route that class directly. Jev's contribution should also be compared with rules-only and other triage alternatives.

## 12. Build sequence and acceptance gates

These are dependency stages, not calendar deadlines.

| Stage | Build | Evidence needed to proceed |
| --- | --- | --- |
| Foundation | Pin BB; investigate plugin and provider APIs; map inherited/adapted/new behavior | Real worker can launch, be observed, stop, and return artifacts through the intended adapter; unsupported functions documented |
| Complete delivery path | One spec, one worker, one integrated result, real checks and evidence | User can inspect whether each accepted behavior was established |
| Cross-harness coordination | Explicit delegation contracts, dependencies, ownership, handovers, supervisor | Two harnesses complete a feature; interruption preserves work and cannot create overlapping writers |
| Capacity policy | Pool-aware telemetry, reserves, transparent routing, accounting | Known shared limits aren't double-counted; unknown values remain visible; policy decisions are reproducible |
| Efficient supervision | Bounded context, incremental events, Jev triage, retry diagnosis | Measured monitoring overhead and error rates; explicit errors cannot be hidden by classifier output |
| Drift control | Spec versioning, protected acceptance, impact-aware evidence invalidation | Requirement change and weakened-test attempts are caught; stale results cannot be accepted |
| Adaptive workspace | Contextual cards, previews, live capacity, progressive disclosure | Important decisions can be understood without reading raw transcripts; UI reflects actual runtime state |
| Persistent customization | Role, workflow, and plugin changes through conversation | Changes are reviewable, tested, versioned, and reversible |
| Evaluation and packaging | Baselines, representative tasks, demo recording, installation instructions | Claims have reproducible evidence and limitations; product can be installed and used on another project |

System tests should cover restart during execution, duplicate events, cancellation without acknowledgement, quota reset during a run, stale telemetry, shared-pool contention, conflicting writers, changed specs, unknown check status, classifier mistakes, and adapter capability gaps.

Do not buy or require every named subscription before establishing the adapter path. Initial profiles should use available authenticated harnesses, and provider expansion should follow demonstrated demand and compatibility.

## 13. Two-minute demonstration

Narrative: a developer has exhausted scarce premium capacity too quickly while paying for several other tools. They want a feature delivered from an explicit spec without personally coordinating all the agents.

Use an existing event-registration application. Add capacity limits and a waitlist, with independent scenarios for full capacity, cancellation promotion, and concurrent registration.

| Time | Scene |
| --- | --- |
| 0–15 seconds | Show the personal problem and connected capacity, clearly distinguishing real observations from demo fixtures |
| 15–35 seconds | Submit the spec and reserve policy; show the lead assigning coherent work with concise reasons |
| 35–60 seconds | Show implementation progress and an interface request: “show requirements, preview, and anything that needs me” |
| 60–85 seconds | A clearly labeled interruption triggers preservation and handover; show the actual resumed work |
| 85–105 seconds | An acceptance failure causes a targeted diagnosis and repair; premium use has a visible reason |
| 105–120 seconds | Try the feature; show acceptance evidence and measured resource use |

If the run takes longer, label time compression. A prerecorded genuine execution is acceptable presentation evidence; simulated quota events must remain labeled. Do not guarantee a natural defect will occur: use a disclosed fault-injection scenario for a repeatable recovery demonstration.

Use a prerecorded matched baseline as supporting evidence only after measurement. Do not invent an X-times improvement or imply that cheaper routing makes all coding instantaneous.

## 14. Pitch draft

“I pay for several AI coding subscriptions, but the models I trust most can exhaust my allowance in a couple of days. The other tools still have capacity, and I become the person trying to make them work together.

Giving everything to a cheaper model does not automatically help. It can spend longer, repeat mistakes, and use up the premium model's time fixing them.

We are building a development workspace that manages that tradeoff.

You provide a specification and choose how you want to use your subscriptions. The system decides which work deserves a frontier model and which work can be delegated. It keeps shared requirements, supervises progress, and adapts when a worker gets stuck or becomes unavailable.

The interface brings together the current app, the remaining requirements, the available capacity, and the few decisions that need you. You can customize those views and the team's working process through conversation.

Here, a worker is interrupted halfway through a feature. Another continues from its progress. An acceptance check catches a defect, and the system directs the repair before presenting the finished result.

We built on BB and adapted structured orchestration into its workspace. We measure the whole process, including communication, retries, and verification.

Our goal is more finished software from the subscriptions you already pay for, while keeping the result tied to your specification.”

## 15. Decisions and open evidence

Recommended starting choices: BB plugin; strongest suitable model on demand; explicit spec acceptance; rules before learned allocation; Jev for intervention triage; separate quota pools; no claimed multiplier until tested.

Still to establish through implementation and evaluation: BB adapter capabilities at the chosen version; actual provider telemetry; task-specific worker quality; attributable quota consumption; routing thresholds; and which forms of interface customization improve user decisions.

No additional high-level user choice is needed to start drafting a detailed implementation specification. Building the product remains a separate action from this planning request.

## Sources checked

- [BB repository](https://github.com/get-bb/bb): execution platform and project positioning.
- [BB configuration](https://github.com/get-bb/bb/blob/main/docs/configuration.md): plugin storage, workflow controls, and experimental account pooling. These are current upstream capabilities, not a guarantee for an unpinned installation.
- [Pragmatic Orchestration](https://github.com/CodeAlive-AI/pragmatic-orchestration): reference approach and runner.
- [Delegation guidance](https://github.com/CodeAlive-AI/pragmatic-orchestration/blob/main/skills/pragmatic-orchestration/references/delegate.md): supervision, bounded observations, steering, acceptance, and preservation of partial work.
- [TypeSafe introduction](https://docs.typesafe.ai/introduction): typed decision primitives and atomic questions.
- User-provided posts: role separation, shared project documentation, executable specifications, component showcases, and human judgment. The posts' speed and productivity figures are author reports, not measurements for this proposal.
