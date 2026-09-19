# Factory tasks, checks and evidence

Factory is the product owner for Team preferences, task specifications,
assignments, review findings and acceptance evidence. Specs, revisions and
records live in the Factory SQLite store in the active BB data directory; they
are visible in the task card and through `bb factory`, and are not written to
Git automatically. There is no second worker registry, quota optimizer, fixed
model hierarchy or mandatory planning conversation.

## Task tools and CLI

`bb_factory` takes `{ "action": ACTION, "input": INPUT }`. The corresponding
CLI is `bb factory ACTION --input '<JSON>'`; use a prepared JSON file with
`--input "$(cat task.json)"` for multiline data. The shell does not
re-evaluate command substitutions inside file contents. Never interpolate
untrusted text into the command itself.

Actions: `create`, `update`, `status`, `list`, `verify`, `assign`, `cancel`,
`finding`, `resolve`, `start`, `agent-review`, `note`. Read the exposed
schema before supplying fields. `approve`, `deliver`, `judge`, `judge-many`,
`resume`, `export` and `import` are UI/CLI-only — human attestations and
delivery records are never agent actions. A minimal direct-work
specification is:

```json
{
  "threadId": "<current-thread-id>",
  "spec": {
    "goal": "Reject an invalid identifier before writing data",
    "scope": "Identifier validation and its focused tests",
    "requirements": [
      {"id": "reject-invalid", "text": "Invalid identifiers produce no write", "criterion": "automated"}
    ],
    "scenarios": [],
    "checks": [
      {"id": "focused-test", "requirementIds": ["reject-invalid"], "testRef": "<actual-test-path>", "argv": ["<actual-project-test-command>"], "timeoutMs": 60000, "required": true}
    ]
  }
}
```

Replace every example placeholder with verified project values. Each check
must reference real requirements and an actual project command. A spec also
accepts optional `problem`, `outcome` and a `teamPlan` of explained proposed
assignments (`{id, title, role, profile, requirementIds, rationale}`).
Given/When/Then scenarios are prose unless a check exercises them. Creation
saves a draft. Once scope is agreed, `start` takes `taskId` and
`expectedVersion` and activates that same task without launching workers.
`verify` takes `{ "taskId": "<id>" }` and runs the declared checks
independently of worker claims; `status` takes the same input and `list`
takes `{ "threadId": "<id>" }`. An `update` includes `expectedVersion`, the
complete spec and `changeReason`; changed requirements or checks require
fresh evidence.

Each requirement carries a `criterion` (`automated`, `agent` or `human`) or a
`verificationMethods` list. An empty list means the legacy `criterion`
applies; a non-empty list requires **every** listed method — an `automated`
route can be planned via `reviewInstructions` before its executable check
exists. Define the exact combination semantics while refining the draft.

Human criteria use `judge` with `requirementId`, `accepted`, `actor`,
`rationale`, `humanConfirmed: true`, and the `expectedVersion` and
`expectedFingerprint` shown for the current task; `judge-many` applies one
attestation to an explicit `requirementIds` list. `approve` records a
delivery-level or selected-requirement approval: `scope` `delivery`
snapshots all requirement ids (empty list), `scope` `selected` takes an
explicit unique non-empty `requirementIds` list — plus `accepted`, `actor`,
`source` (`ui`, `cli` or `chat`), `sourceRef` and `rationale`. A decision
given in chat must carry `source: "chat"` with its `sourceRef` so the record
is attributable. `deliver` records an immutable delivered snapshot with an
optional `mergeUrl`; it does not imply approval or passing checks.
`resume` clears a legacy stop only after native settlement and launches
nothing; `export`/`import` move a spec between tasks — an import starts as a
fresh draft with no evidence or approvals, keeping only historical
provenance. Changed content or specification rejects stale judgments and
approvals. Never invent human approval. A successful worker or review judge
is not acceptance: recheck final integrated content — stale, failed,
unmapped and unknown requirements stay visible.

## Assignments and supervision

`assign` takes `taskId`, a stable `launchId`, `assignments` and an optional
`overrideReason`. Each assignment has `id`, `role` (`implement`, `review`,
`research`), `prompt`, `title`, `profile` (`providerId`, `model`,
`reasoningLevel`, `serviceTier`), `environmentId`, `permissionMode`, `scope`
and `ownership` (`read-only` or `exclusive`). Use an actual native
environment id: an existing shared checkout is valid for compatible work;
create an isolated worktree or environment before requesting competing
writes. Scope and ownership descriptions are coordination contracts, not
filesystem confinement.

Factory validates each assignment against the saved Team preference (Off
blocks delegation, Selected restricts profiles; an explicit `overrideReason`
records a user-directed exception), the target project's environment, the
live provider/model catalog on the destination host, and canonical workspace
ownership so two environments cannot silently alias the same files. Reusing
a `launchId` replays only the identical stored launch request; a changed
payload under the same identity is rejected.

Factory records the association between each assignment and its native run,
call and thread. Inspect `bb factory status --input '{"taskId":"<id>"}'` for
per-assignment `nativeStatus`, `threadId`, `result` and `error`.

Execution-level supervision uses the `bb factory execution` command group:

```bash
bb factory execution inspect --input '<JSON>'        # snapshot assignment/run state
bb factory execution guide --input '<JSON>'          # durable steering/follow-up message
bb factory execution guide-status --input '<JSON>'   # retrieve a guidance receipt
bb factory execution wait --input '<JSON>'           # bounded first-completion wait
```

Identities are `{originThreadId, callerTaskId, launchId}`; `guide` adds
`assignmentId`, a stable `guidanceId`, `message` and `mode` (`steer` or
`followUp`). `wait` takes up to 32 `targets` with per-target `afterCursor`
plus a bounded `timeoutMs`, and returns the first uncollected completion.
Exact input schemas are discoverable through the plugin's RPC contract.
[delegate.md](delegate.md) covers the supervision discipline and the native
thread surfaces underneath. Verify a worker's initial interpretation at a
checkpoint proportionate to the risk of the assignment. Preserve partial
results and collect every requested worker's success or failure; a wait
timeout ends observation, not the task.

`bb factory execution` also retains the durable script surface
(`run`, `validate`, `status`, `history`, `list`, `stop`) for composed
multi-agent work such as a staged review — see
[review.md](review.md#composed-reviews). `stop` ends a run; `cancel` is the
task-level action and is a different operation.

Task cancellation requests stop: `cancel` takes `taskId` and `archive`,
records durable stop intent, aborts running checks and requests native
cancellation — it is rejected when no execution is running (`executionRunning`
on the task view), except for archive lifecycle cleanup. Stopping alone does
not invalidate matching evidence. A settled thread is not proof that detached
provider-side processes stopped; block overlapping replacement writers while
ownership remains uncertain.

## Review processing

`bb factory review collect --input '<JSON>'` — also exposed as the
discoverable `collectReview` RPC — is a pure
result processor for reviews you already collected. It launches no agents.

It takes `passes`: `{id, agent, role, output, error}` (explicit null for
missing output/error), optional `sources`: `{path, content}` snapshots, and
optional `judge`: the raw judge JSON string. Collect without a judge first;
supply the returned `unionXml` to the judge prompt for super/ultra-depth
reviews, run that judge as an ordinary assignment, then collect the same
passes and snapshots with its result. All requested passes, including
failures, must be supplied — the helper cannot discover omitted workers.

Attribution comes from the caller-supplied roster, not authenticated worker
identity. The collector sorts and indexes findings, preserves attribution and
identical findings, and checks quotes only against explicitly supplied
snapshots; missing snapshots produce `quoteValid=null`, unverified. Semantic
deduplication belongs to the judge. Judge output must cover every index
exactly once, preserve provenance and provide a consistent summary;
duplicates cite a prior VALID finding and downgrades must lower severity.
Invalid or unavailable judge output returns `state=degraded` and retains the
complete raw union. Explicit empty findings are valid; empty responses and
malformed XML are failed/malformed roster entries. `complete` reports roster
completeness, not review correctness or Factory acceptance — the lead decides
which defects matter and whether proposed fixes are right.

## Conversational specification and review routing

The lead owns judgment and integration. Do not ask users to learn Factory's
components to get work done.

Start by describing the problem and intended outcome in plain language.
Create one draft card, refine it in place, preserve stable requirement ids,
and record why a version changed. State the target environment. Resolve only
material ambiguity with the user; handle routine implementation choices
yourself. Explicit user authorization to implement permits starting the task
without asking again. Creating or editing the draft is not an execution
request, and a spec-only request stays draft.

Choose acceptance methods deliberately. Use executable checks for behavior,
`agent` for outcomes adequately established by evidence-backed inspection,
and `human` for subjective decisions or user-only knowledge. Avoid marking
every UI requirement human. Give human requirements brief
`reviewInstructions` and useful `artifactRefs`; group related judgments into
a short review walkthrough.

Discover enabled providers in the intended environment before proposing a
team. Treat installed, authenticated, model-discovered and capacity-known as
separate facts. Inspect usage when it affects the choice; do not infer quotas
from names, duplicate a shared account across hosts, or interpret unsupported
usage as free capacity. Selected profiles constrain eligibility, not counts.
Explain the role, model and reason in a compact `teamPlan`; preserve the
lead. An explicit request for many workers becomes bounded assignments within
native limits — not an invented change to concurrency or a silent reduction
of the requested scope.

For agent review, inspect the actual current result or arrange a bounded
review, then use `agent-review` with `requirementIds`, `expectedVersion`,
`expectedFingerprint`, `reviewer`, `summary`, `limitations`, `artifactRefs`
and `accepted`. Record concrete evidence and uncertainty. Required
unresolved findings still block acceptance. Only requirements explicitly
using `agent` can be covered by this action; it never grants human approval.

Use `note` to preserve compact decisions, blockers, deviations and
conclusions, with artifact references. Keep proposed `teamPlan` rows distinct
from actual assignments. After integration, rerun relevant checks on final
content and reconcile review findings. Offer a short human review guide only
for the items that need it; the user can approve the delivery or an explicit
selected set through `approve` (or `judge-many`), and a decision stated in
chat is recorded with its `sourceRef` rather than re-entered. Never submit
human judgment on the user's behalf without their explicit attestation of the
current result; spec approval is not result approval.
