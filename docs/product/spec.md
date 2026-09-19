# bbfactory specification

Status: canonical product direction; see the status map for implemented slices. This consolidates
the original LifeOS Subscription Team plan and subsequent user corrections.

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
- Pragmatic Orchestration: adapt its useful practices extensively. Use BB's
  execution facilities first; no commitment to vendoring Porch or translating
  all of its implementation. Development tools do not define product runtime.
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

Use explicit briefs, relevant context links, early direction checks, bounded
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
without a matching check remain unverified unless an explicit human-review
criterion applies. A passing command alone does not establish requirement
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

Target near-complete useful Pragmatic Orchestration behavior, originally
expressed as 95%+. Map the source inventory to native equivalents and explicit
gaps before claiming a percentage. Internal file layouts, exit numbers or
transport shims are not separate customer benefits. Do not remove useful
behaviors from the denominator merely because they are difficult to implement.
An independent reviewer must assess the mapping and acceptance evidence.

The product contribution is the integrated policy, native interaction,
subscription-aware choices and spec-linked verification. BB's existing workflow
engine and Pragmatic Orchestration's practices remain credited. No novel routing
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
