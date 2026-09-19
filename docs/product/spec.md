# bbfactory specification

Status: repository product direction, not a synchronized task spec. Factory SQLite
is authoritative for versioned executable specs and acceptance evidence.

## Outcome

Help a developer complete more specified software using the AI subscriptions
they already pay for. Scarce premium capacity is one constraint; quality,
elapsed time and human effort also matter. Fewer tokens alone is not success.

The user discusses the feature with a lead they choose. The lead helps clarify
requirements, works directly when that is sensible, or coordinates suitable
workers. The user receives an integrated result with evidence for the agreed
behavior and an honest account of what remains unresolved.

## Confirmed shape

- Product name: **bbfactory**, a coherent BB distribution. Preserve desktop,
  browser, CLI, plugins, widgets and customization.
- Lead: user-selected provider/model/reasoning. Astra is an initial preference,
  not a hard dependency. Planning and orchestration are roles, not compulsory
  separate conversations.
- Workers: interchangeable eligible profiles. Codex, Claude Code, Cursor,
  Devin, OpenCode and GLM/Z.ai are targets. Sol and Devin are peers and may
  cross-review; no built-in quality hierarchy between them. Implementation,
  review and research are assignments to the same native subagent mechanism.
  A task may have several implementers; there is no one-worker product limit.
- Team control: Auto, Off and Selected in normal chat. Auto considers coordination
  cost; Off prefers direct work; Selected limits eligible implementer models,
  not worker count. Explicit task instructions override the saved preference.
  Use BB's native provider/model/reasoning/tier catalog, including installed
  Devin. Each provider/model appears once; effort and tier configure that entry.
  Keep the lead selector unchanged. Direct work follows the same acceptance
  contract; a separate Execution selector is not required.
- Factory skill: preserve useful original practices with one maintained entry
  point and on-demand references. Factory internalizes existing execution
  machinery; standalone Workflows is optional and defaults off.
- UI: normal chat exposes lead, team, available capacity and task/check state.
  Default to the existing BB conversation and native worker activity, with
  compact nested selectors and shared menu motion. Avoid a bespoke drawer or
  dashboard as the default. Expanded plans/lineage remain a later exploration.
- Project context: discover existing instructions, docs and tests. Use progressive
  disclosure. Do not require users to reorganize their repository into our layout.

## Required behavior

| ID       | Outcome                              | Acceptance condition                                                                                                                       |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| SPEC     | Agreed definition of success         | Tasks reference a versioned specification, requirement IDs, scope and checks; material changes are explicit                                |
| EXEC     | Direct or delegated execution        | Either route can produce an accepted result; switching a worker does not switch the user's lead                                            |
| TEAM     | Bounded collaboration                | Workers get relevant context, ownership, interfaces and checks; independent workers cannot overwrite each other                            |
| REVIEW   | Review proportional to risk          | Peer findings retain their evidence; unresolved required findings block acceptance; no automatic endless review rounds                     |
| VERIFY   | Result matches the accepted behavior | Required checks run on the final integrated content; worker completion alone never means acceptance                                        |
| RECOVER  | Progress survives interruption       | Preserve changes and a concise handover; confirm the previous writer stopped before replacement; uncertain state prevents duplicate launch |
| CAPACITY | Honest subscription state            | Track source, units, observation/reset times and shared pools; unknown or stale values stay visible                                        |
| ROUTE    | Accountable resource choices         | Filter by access, permissions, tools, context and capacity; explain consequential assignments; respect configured bounds                   |
| UI       | Understandable work                  | Chat, dashboard and CLI show the same persisted tasks, attempts, decisions and evidence; transcripts are available on demand               |
| EXTEND   | Customizable workflow                | Reuse BB plugins and project conventions; persistent workflow changes are reviewable and reversible                                        |

A profile identifies harness, model, reasoning, tools, account/quota pool,
execution environment and permissions. A model name alone cannot establish
capability. Account switching, cross-harness reassignment and model selection
are different operations with different prerequisites.

## Delegation and resource policy

Compare the whole route: planning, context preparation, worker execution,
communication, supervision, rework, integration and verification. An available
worker is not automatically a better choice than the lead finishing directly.
Premium models may implement difficult work as well as plan it.

Use explicit briefs, relevant context links, risk-based direction checks, bounded
progress observations and delta steering. Reuse healthy sessions when supported.
A retry needs a diagnosis or new information. Silence alone does not prove a
worker is stuck. Concurrency follows independent scopes, review capacity and
actual resource limits, not the number of agents available.

Worktrees are optional. The lead, worker or workflow may choose checkout reuse,
separate worktrees or another supported environment. Read-only work can share
an environment; concurrent writes need coordinated scopes or isolation. A
preference for a shared checkout does not establish that competing writes are
safe. Record the chosen environment and ownership with the assignment.

The lead chooses suitable models from the configured team and can inspect
subscription limits when useful. Preserve one capacity view and supported
Account Pooler fallback. An automatic quota optimizer, premium-reserve policy
and Conserve/Balanced/Fastest allocation modes are not required. No automatic
paid fallback is agreed. Do not invent remaining-token budgets from incompatible
provider units or count the same pool twice.

## Specifications and drift

Keep the chain small:

`intent → accepted requirements → behavioral scenarios → tasks → code and evidence`

Given/When/Then is a useful way to describe behavior. It becomes executable only
when a real automated check exercises it. Use the project's existing tooling;
Gherkin and a dedicated BDD framework are optional.

This is a capability of the Factory plugin, with compact requirement/check UI,
not a separate test runner. Each check names the requirements it exercises;
the lead or a worker writes or links the actual project test. Requirements
without a matching check remain unverified unless their agreed acceptance
method is evidence-backed agent review or explicit human review. A passing command alone does not establish requirement
coverage or test quality.

For example: given one remaining event place, when two users book concurrently,
then exactly one booking succeeds and the other follows the agreed waitlist
behavior. A meaningful check submits both requests and asserts the resulting
state. A happy-path UI test does not establish the concurrency requirement.

Record the spec version, check definition, tested content including new files,
relevant environment, command, exit status and logs. Missing, failed, timed-out
or stale required checks remain unaccepted. Preserve agreed acceptance artifacts;
workers may propose changes but cannot silently weaken them. Changes invalidate
affected evidence, and combined worker changes need final integration checks.
Visual and product judgments may require explicit human acceptance. Passing
finite tests is evidence, not proof of zero possible drift.

## Scope and proof

Aim to preserve roughly 90–95% of the original guidance's useful behavior, not
its text or ceremony. The developer mapping records retained, simplified, moved
and deliberately dropped behavior. Evaluate actual delegation, review, steering
and recovery, including unnecessary follow-ups, repeated context and checks, and
human interventions. Do not claim a measured coverage percentage from a source
inventory.

The product contribution is the integrated policy, native interaction,
subscription-aware choices and spec-linked verification. BB's existing workflow
engine and original guidance retain required attribution in developer/legal docs. No novel routing
algorithm or efficiency multiplier has been established.

Compare direct lead execution, fixed delegation and adaptive orchestration on
matched tasks, starting code and checks. Include failures, all coordination and
review usage, elapsed time and human interventions. Record capacity in source
units; distinguish measured, estimated and unavailable observations. Prefer
direct execution where orchestration loses on the relevant tradeoffs.

The user should be able to request useful views and propose role, policy or
plugin changes through conversation. Display-only changes do not alter execution
permissions. Persistent changes to roles, policy and plugins must be reviewable,
versioned and reversible within the user's authority.

Jev is an optional later routing/triage experiment with a rules-only baseline.
It cannot establish available quota or correctness. Extra browser integrations
and custom widgets remain installable extensions after the core path works.


## Living specification and review

The task card is a persistent working agreement, refined in the conversation.
The lead writes a short problem statement and intended outcome, keeps scope and
non-goals readable, and records material changes with a reason on the same task.
A new task starts as Draft. Starting work is explicit; editing a draft never
launches workers. Show the target environment before work starts. Existing
records retain their historical identity and acceptance evidence.

Large specifications support at least 100 requirements and scenarios. Use
compact requirement rows, progress counts, search, method/status filters and
bounded navigation. Preserve the user's expanded context and selection through
ordinary progress updates; clear review selections when the reviewed version or
content changes. Version history is collapsed by default and explains changes.

Agree the acceptance method while refining each requirement:

- Executable checks for objectively testable behavior. Link actual tests; prose
  Given/When/Then scenarios alone do not execute.
- Agent review for inspectable outcomes where recorded review is an adequate
  criterion. Retain reviewer identity, summary, limitations, artifact references,
  specification version and content identity. A completion claim is not review.
- Human review for material subjective judgments or user-only knowledge. Keep
  this set small, with concrete inspection steps and direct artifact links.

A human can accept an explicitly selected, clearly listed set after reviewing
it. Do not require repetitive personal-attestation checkboxes or a note on every
routine acceptance. Requests for changes include useful context. Human approval
remains an explicit user action; a worker cannot impersonate it. Missing content
identity blocks acceptance with one actionable task-level explanation, rather
than repeated technical warnings in every row.

Show implementation activity separately from evidence status. Green means that
the agreed acceptance method has current qualifying evidence and no blocking
finding. Stale, failed, missing and uncertain evidence stay visible. A review
summary distinguishes checks, agent review, unresolved findings and the small
set awaiting the user's judgment. Verification runs configured executable
checks; requesting agent review routes a contextual request to the lead, which
chooses and supervises reviewers under the current Team preference.

Persist concise notes, decisions, blockers and conclusions with versioned
artifact references. Keep a proposed team distinct from actual native
assignments and their outcomes. The card summarizes delivery; raw transcripts
remain available on demand.

## Provider eligibility and decision ownership

A provider's installation, explicit user enablement, authentication, model
catalog and observed subscription usage are different facts. Unknown facts
remain unknown. A registered plugin or model catalog does not establish a paid
subscription or spare capacity.

Individual provider enablement is server policy, independent of plugin grouping.
Disabled providers are excluded from new lead/model choices, Team choices,
normal agent discovery, Auto decisions, quota views and quota polling. Settings
retains them for re-enabling. Disabling one ACP provider does not disable its
siblings. Saved disabled selections must produce an actionable error before a
new launch, never a silent substitution. Preserve existing running work and
historical attribution.

The lead makes orchestration decisions using the Factory skill; Factory stores
the specification, Team preference, proposed assignments and acceptance; BB
provider infrastructure supplies and enforces eligibility; native threads and
Factory's internal execution module execute. Skills guide judgment but cannot replace runtime enforcement.
Auto filters eligibility first, considers task fit and trustworthy capacity
observations, then briefly explains consequential choices. Explicit requested
profiles and counts take precedence over its proposal, within real permission
and concurrency limits. Ten requested Devin assignments can run in waves; the
UI must not imply ten simultaneous workers when the host cannot run them.
