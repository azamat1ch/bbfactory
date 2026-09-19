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

Read `bb_team_get` or `bb team get --json` before selecting workers. Honor
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
`finding`, `resolve`, `judge`. Read the exposed schema before supplying fields.
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
unless exercised by a check. `verify` takes `{ "taskId": "<id>" }` and runs the
declared checks independently of worker claims. `status` takes the same input.
An `update` includes expectedVersion, the complete spec, and changeReason;
changed requirements/checks require fresh evidence. Human criteria use `judge`
with requirementId, accepted, actor and rationale; never invent human approval.
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
`builtin:workflows`: `experimental_executionStart`,
`experimental_executionInspect`, `experimental_executionCancel`, and
`experimental_executionGuide`, called through `bb.sdk.plugins.callRpc`.
Identity is originThreadId + callerTaskId + launchId. Do not import Workflows'
private service/database or shell out from a server to start workers.

Execution Guide adds assignmentId, message and mode (`steer` or `followUp`);
its result says delivery=`submitted`, compliance=`unverified`. Observe artifacts
to establish compliance. Do not retry an uncertain send blindly. Existing native
thread CLI communication is `bb thread tell <id> --mode auto --message-file FILE`.
The old generic workflow `agent()` path inherits origin access; the new execution
assignment explicitly records environment and permissionMode. Neither supplies
a portable read-only sandbox.

Cancellation requests stop; inspect stopConfirmed and the native threads.
A settled thread is not proof that detached provider-side processes stopped.
Block overlapping replacement writers while ownership remains uncertain. Preserve
useful partial changes, reconcile failures and queues, then issue an explicit
remaining-work brief. Continue a healthy native thread for related follow-up;
reconcile failed or uncertain state before replay. There is no claim of a Porch
continuation lease or idempotent guidance ledger.

## Review processing

Use `bb_review_collect` for deterministic collection after native reviewers
finish. It takes `passes`: `{id, agent, role, output, error}` (explicit null for
missing output/error), optional `sources`: `{path, content}` snapshots, and
optional `judge`: the raw judge JSON string. The same operation is exposed as
`bb review collect --input '<JSON>'` and discoverable RPC `collectReview` in the
internal guidance package. These surfaces run no agents.

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
