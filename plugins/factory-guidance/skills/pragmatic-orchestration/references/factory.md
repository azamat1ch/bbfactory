# Factory task and execution contract

Factory is the product owner for Team preferences, task specifications, review
findings and acceptance. Native BB threads and Workflows own execution. This
reference describes the integration contracts in this change; confirm that the
Factory and Workflows tools are exposed in the installed build before use.
There is no Porch runtime, quota optimizer, fixed model hierarchy, or mandatory
separate planning conversation.

## Choose the working mode

- **Direct:** work in the lead thread when decomposition adds no value, or Team
  is Off. A Factory task can still record requirements and independently run
  checks; creating a task does not require assigning a worker.
- **Planner:** resolve material ambiguity, identify acceptance checks and freeze
  shared interfaces before implementation. Keep the plan proportional. Preserve
  the user's goal, constraints and unresolved decisions in the project's own
  existing documentation layout; do not create a competing spec tree.
- **Lean implementer:** use one bounded assignment with a relevant context seed,
  explicit owned files/interfaces, checks and a compact handover. Do not copy
  the entire parent transcript. Ask the worker to report conflicting constraints
  and deviations; it may keep doing independent in-scope work.
- **Orchestrator:** use independent assignments only when their benefit exceeds
  coordination cost. Establish interfaces first, isolate competing writers with
  native environments or non-overlapping ownership, and retain one integration
  owner. Reviewer, researcher and implementer are roles, not provider ranks.

Read `bb_team_get` or `bb factory team get --json` before selecting workers. Honor
Auto/Off/Selected and explicit user overrides. Selected limits eligible
profiles, not the number of workers. Discover actual provider availability and
reasoning choices. Never silently substitute a profile, reset a saved preference,
or change a running worker after a Team preference update. Sol and Devin are peers.

## Task tools and CLI

`bb_factory` takes `{ "action": ACTION, "input": INPUT }`. The corresponding
CLI is `bb factory ACTION --input '<JSON>'`; use a prepared JSON file with
`--input "$(cat task.json)"` for multiline data. The shell does not re-evaluate
command substitutions inside the file contents. Never interpolate untrusted
text into the command itself.

Actions: `create`, `update`, `status`, `list`, `verify`, `assign`, `cancel`,
`finding`, `resolve`, `start`, `agent-review`, `note`. Read the exposed schema before supplying fields.
`judge` and `judge-many` are UI/CLI-only human attestations, never agent actions.
A minimal direct-work specification is:

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

Replace all example placeholders with verified project values. Every check must
reference real requirements and actual project checks. Given/When/Then is prose
unless exercised by a check. Creation saves a draft. Once the scope is agreed,
`start` takes taskId and expectedVersion and activates that same task without
launching workers. `verify` takes `{ "taskId": "<id>" }` and runs the
declared checks independently of worker claims. `status` takes the same input.
An `update` includes expectedVersion, the complete spec, and changeReason;
changed requirements/checks require fresh evidence. Human criteria use `judge`
with requirementId, accepted, actor, rationale, humanConfirmed:true, and the
expectedVersion and expectedFingerprint shown for the current task. Changed
content or specification rejects it. Never invent human approval.
A successful worker or review judge is not acceptance. Recheck final integrated
content; stale, failed, unmapped and unknown requirements stay visible.

## Assignments and supervision

`assign` takes taskId, stable launchId, assignments and optional overrideReason.
Each assignment has id, role (`implement`, `review`, `research`), prompt, title,
profile (providerId, model, reasoningLevel, serviceTier), environmentId,
permissionMode, scope and ownership (`read-only` or `exclusive`). Use an actual
native environment id: an existing shared checkout is valid for compatible work;
create a native worktree/environment before requesting isolated writes. Scope
and ownership descriptions are not filesystem confinement.

Factory records associations with the native run/call/thread. Never maintain a
second worker registry. Inspect the initial interpretation within the first
minute; follow adaptively as described in delegate.md. Use bounded native thread
logs and Workflows history, preserve partial results, and collect every requested
worker's success or failure. A timeout ends observation, not the task.

The supported SDK cross-plugin seam is Workflows RPC, plugin id
`workflows`: `experimental_executionStart`,
`experimental_executionInspect`, `experimental_executionCancel`,
`experimental_executionGuide`, `experimental_executionGuideStatus`, and
`experimental_executionWait`, called through `bb.sdk.plugins.callRpc`.
Identity is originThreadId + callerTaskId + launchId. Do not import Workflows'
private service/database or shell out from a server to start workers.

Execution Guide adds a stable guidanceId, assignmentId, message and mode
(`steer` or `followUp`). A durable receipt records delivery=`submitted` or
`uncertain`, always with compliance=`unverified`. An identical retry returns the
saved receipt without sending again; changed content for that guidanceId is
rejected. GuideStatus retrieves the receipt after reconnect. Observe artifacts
to establish compliance; uncertain delivery is not permission to send a duplicate.
Existing native
thread CLI communication is `bb thread tell <id> --mode auto --message-file FILE`.
The old generic workflow `agent()` path inherits origin access; the new execution
assignment explicitly records environment and permissionMode. Neither supplies
a portable read-only sandbox.

Cancellation requests stop; inspect stopConfirmed and the native threads.
A settled thread is not proof that detached provider-side processes stopped.
Block overlapping replacement writers while ownership remains uncertain. Preserve
useful partial changes, reconcile failures and queues, then issue an explicit
remaining-work brief. Continue a healthy native thread for related follow-up;
reconcile failed or uncertain state before replay. The guidance ledger prevents duplicate sends; it does not implement a Porch
provider-session continuation lease.

Wait accepts up to 32 identity targets with afterCursor and timeoutMs (0–30000).
It returns the first uncollected assignment/run completion, bounded output and
per-target cursors. Reuse each returned cursor to avoid collecting an event twice.
A timeout or disconnected observer never cancels workers. Completion does not
prove native settlement or Factory acceptance; inspect those separately.

## Review processing

Use `bb_review_collect` for deterministic collection after native reviewers
finish. It takes `passes`: `{id, agent, role, output, error}` (explicit null for
missing output/error), optional `sources`: `{path, content}` snapshots, and
optional `judge`: the raw judge JSON string. The same operation is exposed as
`bb factory review collect --input '<JSON>'` and discoverable RPC `collectReview` in the
composed `factory-team` plugin. These surfaces run no agents.

Collect without a judge first. Supply the returned unionXml to the preserved
judge prompt for super/ultra, run that judge through native execution, then
collect the same passes and snapshots with its result. All requested passes,
including failures, must be supplied. The helper cannot discover omitted workers.
Attribution comes from the caller-supplied roster, not authenticated worker
identity. It sorts and indexes findings, preserves that attribution and identical findings,
and checks quotes only against explicitly supplied snapshots. Missing snapshots
produce quoteValid=null; they are not verified. Snapshot freshness is the caller's
responsibility and Factory evidence remains separate.

Semantic deduplication belongs to the judge; upstream's file named
`dedup-findings.py` also only unions, sorts, tags and indexes. Judge output must
cover every index exactly once, preserve provenance and provide a consistent
summary. Duplicates cite a prior VALID finding. Downgrades must lower severity.
Invalid/unavailable judge output returns state=degraded and retains the complete
raw union. Explicit empty findings are valid; empty responses and malformed XML
are failed/malformed roster entries. complete reports roster completeness, not
review correctness or Factory acceptance. Human review remains responsible for
which defects matter and whether the proposed fixes are correct.


## Conversational specification and review routing

The lead owns judgment and integration. Provider infrastructure enforces
eligibility; Factory persists the working agreement and acceptance; Workflows
and native threads execute. Do not ask users to learn these components to get
work done.

Start by describing the problem and intended outcome in plain language. Create
one draft card, refine it in place, preserve stable requirement IDs, and record
why a version changed. State the target environment. Resolve only material
ambiguity with the user; handle routine implementation choices yourself. Explicit
user authorization to implement permits starting the task without asking again.
Creating or editing the draft is not an execution request.

Choose acceptance methods deliberately. Use executable checks for behavior,
`agent` for outcomes adequately established by evidence-backed inspection, and
`human` for subjective decisions or user-only knowledge. Avoid marking every UI
requirement human. Give human requirements brief `reviewInstructions` and useful
`artifactRefs`; group related judgments into a short review walkthrough.

Discover enabled providers in the intended environment before proposing a team.
Treat installed, authenticated, model-discovered and capacity-known as separate
facts. Inspect usage when it affects the choice; do not infer quotas from names,
duplicate a shared account across hosts, or interpret unsupported usage as free
capacity. Selected profiles constrain eligibility, not counts. Explain the role,
model and reason in a compact `teamPlan`; preserve the lead. An explicit request
for ten workers should become bounded assignments run within native limits,
not an invented change to concurrency or a silent reduction in requested scope.

New tasks start in draft. `start` with taskId and expectedVersion activates the
task without launching workers. `verify` runs configured executable checks;
it does not spawn reviewers. For agent review, inspect the actual current result
or arrange a bounded review, then use `agent-review` with requirementIds,
expectedVersion, expectedFingerprint, reviewer, summary, limitations,
artifactRefs and accepted. Record concrete evidence and uncertainty. Required
unresolved findings still block acceptance. Only requirements explicitly using
`agent` can be covered by this action; it never grants human approval.

Use `note` to preserve compact decisions, blockers, deviations and conclusions,
with artifact references. Keep proposed team rows distinct from actual native
assignments. After integration, rerun relevant checks on final content and
reconcile review findings. Offer a short human review guide only for the items
that need it; a user can explicitly accept a listed selected set through
`judge-many`. Never submit human judgment on the user's behalf without their
explicit attestation of the current result. Spec approval is not result approval.
