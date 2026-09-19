# Core chat experience and demo

Status: Team preference control implemented in the bundled `factory-team` plugin; the task/evidence timeline and full demo below remain targets. Team is guidance to the lead, not scheduler admission enforcement.

## Product and implementation boundary

bbfactory is a preconfigured BB distribution. Plugin packages are the implementation boundary for orchestration, state and UI contributions; small fork changes may be needed for a coherent default chat. A plugin can supply the main product experience. Merely installing a runner or rendering worker cards does not establish a new orchestration method.

Inherited: BB workspace, provider/model selection, extension surfaces, workflow cards and inspectors. Adapted: Pragmatic Orchestration task briefs, steering, supervision, review and handover. Execution uses native BB facilities first. Added/proposed: a unified lead/team policy in normal chat, independently verified outcomes linked to task requirements, and measured allocation choices across available subscriptions. No novel algorithm or efficiency gain has been demonstrated.

## Core chat

The chosen lead remains the conversational model. Changing a worker assignment does not change that lead.

- Lead: provider/model/reasoning controls for the main conversation; initial preference Astra, user-selectable.
- Team: Auto, Off or Selected in a nested dropdown beside the existing lead picker. Selected uses the same native provider/model picker, including installed Devin. Each provider/model can appear once, with its reasoning/tier configuration; profiles are eligibility, not fixed worker counts. Agent-managed or fixed reasoning does not need a separate control.
- Scope: thread preferences persist; the new-thread composer edits a labelled project default, snapshotted into new conversations. Current user instructions override the preference for a task. Auto can keep coherent work in the lead; Selected also permits direct work. There is no separate Execution selector.
- Workers: reuse native worker progress and transcripts. Capacity remains a separate surface; account rotation is not implemented by the Team selector.
- Context: a compact accepted task/spec summary linked to existing project documents, with no mandatory replacement directory structure.
- Timeline: ordinary discussion plus factual task cards showing assignment, brief, handover, cross-review findings and evidence. Expand to inspect native worker output.
- Result: distinguish worker completion, review state, required check results and acceptance. Evidence identifies the tested content; a failed or missing check is not success.
- Later exploration: plan/lineage visualization for long goals, reading the same native records. Keep the existing BB conversation as the default, with shared responsive menus and no bespoke drawer.

Proposed compact controls:

```text
[existing provider/model picker]     Team: 2 profiles
Task: Add event capacity and waitlist     Checks: 0/3

You: Add a waitlist when the event is full.
Astra: [clarifies behavior, then records a task contract]

Implementation — Devin     Review — Sol
Check: final available seat is assigned once
[Open changes] [Inspect checks] [Expand team]
```

This is an illustrative layout, not a screenshot or live run. Card fields must come from persisted runtime/evidence records; model prose cannot manufacture successful status.

## Verified BB extension candidates

- `apps/app/src/components/promptbox/ExecutionControls.tsx`: current combined provider/model/reasoning picker for the conversation.
- `examples/plugins/composer-customization/README.md`: `app.composer.customize` actions, plus menu and banners.
- `plugins/workflows/README.md`: existing chat directives, active-composer cards and inspector panel.

Reuse these surfaces where they fit. Inspect exact slots before promising an in-place replacement for the current model picker. A small core change is acceptable when extensions cannot express the chosen layout.

## Proposed two-minute demo

Use an existing event-booking fixture app and one specified feature: capacity limit plus waitlist. Prepare reproducible starting state and independently declared behavior checks.

- 0:00–0:20: show the app and request; choose Astra lead with Sol/Devin enabled. The accepted behavior is visible in the conversation.
- 0:20–0:40: show the actual direct/delegate decision and a compact task brief. Delegate coherent implementation to one worker; assign the other independent review when ready. Only parallelize genuinely independent work.
- 0:40–1:10: show edits and one substantive review/check result, such as two requests competing for the last place. If showing recovery, use a deliberately injected interruption labelled as such; never pretend it was a provider quota outage.
- 1:10–1:40: show a detected failure, correction, then checks on the final content. A worker saying done must visibly leave acceptance pending until checks finish.
- 1:40–2:00: operate the completed feature in the app preview. Show requirement-level evidence and actual observed resource usage where available; unknown telemetry stays unknown.

This sequence is the full product demo target, beyond the one-worker first slice. Record a real completed run and label time compression; do not imply the entire build takes two minutes. Do not claim quota savings without a comparable direct-run baseline that includes supervision, review and failed attempts.
