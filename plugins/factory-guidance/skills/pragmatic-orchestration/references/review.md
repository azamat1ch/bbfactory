# Review mode

Use review for independent opinions or defect finding. Review is always
read-only in intent; enforce it with a restrictive worker permission mode
where the task allows, not just with prompt wording. Workflow `agent()` calls
have no per-call permission override — they inherit the run's origin
permission mode (the calling thread's mode at run start), and the modes are
not a universal read-only sandbox, so verify a review run made no changes.
BB keeps agent calls
independent — a `parallel()` fan-out or separate threads return attributed
answers and the calling agent judges them. The upstream judge stage (`super`,
`ultra`) deliberately adds an LLM judge after deterministic deduplication;
the `bb_review_collect` helper provides union, indexing, snapshot quote checks
and verdict validation. Semantic deduplication remains the judge's responsibility.
See [factory.md](factory.md#review-processing) for its actual contract.

The Workflows plugin is bundled but disabled by default; check
`bb plugin list` and enable it for the authorized task (`bb plugin enable workflows`)
before composing workflow-based reviews. When it is unavailable, spawn one
`bb thread` per reviewer instead — the rest of this reference applies either
way.

## Ask: independent opinions

Spawn one worker per selected provider/model and judge the answers yourself.
Two supported compositions:

```bash
# Durable, inspectable fan-out through the Workflows plugin
bb workflows run --script "$(cat <<'EOF'
export const meta = {
  name: "ask-opinions",
  description: "Independent opinions on a design question",
};
const q = args.question;
const answers = await parallel([
  () => agent(`${q}`),
  () => agent(`${q}`, { provider: "<provider>", model: "<model>", reasoningLevel: "<level>" }),
]);
return answers;
EOF
)" --args '{"question": "Should we use Postgres or SQLite?"}'
```

```bash
# Or one thread per reviewer, parented to this thread and pinned to a workspace
bb thread spawn --project "$BB_PROJECT_ID" --parent-self \
  --environment "$BB_ENVIRONMENT_ID" \
  --provider <provider-id> --model <model-id> \
  --permission-mode accept-edits --title "Opinion: <q>" --prompt-file question.md
```

Each agent's answer comes back under its own call in `bb workflows history`
or as the worker thread's `bb thread output`. Preserve the attribution; do not
merge answers into a synthetic consensus.

The prompt transport must be present in the same invocation. Use a
`--prompt TEXT` or `--prompt-file FILE` for spawn, and a message argument
or `--message-file FILE` for tell. Use a file flag with `-` for an explicit
stdin pipe/heredoc. Commentary and surrounding agent
context are not implicitly connected to a command's stdin.

For a repository-backed question, the calling agent must first do a short
read-only triage and include an `<initial_relevant_files
completeness="likely-partial">` block. List only paths actually identified and
briefly say why each looks relevant. Immediately state that the list is likely
incomplete, is not an allowlist or scope boundary, and that each reviewer must
independently search wider and deeper for the real blast radius. That search
includes callers, callees, related implementations, tests, configuration,
schemas/migrations, generated code, and build, CI, deployment, or
infrastructure files where relevant.

## Code review depths

Choose one depth for a review; do not run every depth sequentially. Compose
each depth from the bundled prompt assets:

| Depth | Use when | Work performed |
|---|---|---|
| `basic` | Routine file or diff review | Security + correctness; two role passes |
| `specialists` | Broader mid-cost coverage without a judge | Adds performance, architecture, and consistency |
| `super` | High-risk or release-blocking review | Multi-pass discovery, union, and an LLM judge |
| `ultra` | The user explicitly prioritizes maximum coverage over cost and latency | Maximum discovery passes, probe, then judge with fallback |

The role text for each specialization is in `../prompts/roles.txt`; the
finding schema is `../prompts/specialist.txt`; broad discovery passes are
`../prompts/broad-analyst.txt`, `../prompts/broad-lateral.txt`, and
`../prompts/probe-generic.txt`; the judge contract is `../prompts/judge.txt`.
Wrap every reviewer prompt in `../prompts/review-framework.txt` and end it
with `../prompts/review-recap.txt`.

### Complete depth compositions

Retain the source plan's stage barriers while selecting profiles from the native
Team record; historical model names and cheaper/frontier rankings are not policy.
Do a no-cost preflight: enumerate each pass, provider/model/reasoning/access,
assets, workspace and expected result before launching. A reduced roster is an
explicitly reduced review, not full depth.

- **basic:** security and correctness; two independent specialist passes.
- **specialists:** security, correctness, performance, architecture and
  consistency; five passes, no judge.
- **super:** first discovery group has seven passes: analyst, analyst, lateral,
  architecture, correctness, architecture, security. Complete that group before
  the second group's analyst and lateral passes. All nine are uncapped. Collect
  the deterministic union, then judge. The groups express sequencing, not a
  required hierarchy between providers.
- **ultra:** broad group contains analyst, analyst, lateral, analyst. Then run
  the full selected three-profile × five-specialist-role matrix (15 passes,
  not one profile per role). After the specialist barrier, run one auditor probe
  with probe-generic.txt. Collect all 20 discovery passes, then judge. If the
  primary judge fails, try one explicitly selected eligible fallback judge;
  if that fails, retain the raw union as degraded. Do not silently select an
  unavailable or unselected profile or loop indefinitely.

For each pass, order the prompt as framework policy → read-only mode contract →
role → output schema → repository facts → untrusted user/source input → recap.
The caller supplies every layer; a prompt-file flag is transport, not automatic
wrapping. Reuse the eight extracted roles in roles.txt. Substitute CDATA-safely
before launch. For file and diff inputs, set INPUT_KIND and INPUT_LABEL to the
actual reviewed artifact; a context seed is never the review boundary.

### Prompt template placeholders

The prompt files are data templates, not executed code. Substitute these
placeholders before sending:

| Placeholder | Meaning |
|---|---|
| `{{INPUT_KIND}}` | `file` or `diff` |
| `{{INPUT_LABEL}}` | Repository-relative path or diff label |
| `{{INPUT_BODY}}` | The reviewed content, verbatim |
| `{{INITIAL_RELEVANT_FILES}}` | The context-seed block (see SKILL.md) |
| `{{ROLE}}` | The specialization id, e.g. `security` (specialist.txt only) |
| `{{FINDINGS_BODY}}` | Unioned `<finding>` elements, judge input only |
| `{{CAP_DIRECTIVE}}` | Either "no upper bound on findings" or "emit at most N, top by severity then confidence" |

Escape `]]>` inside substituted bodies (split as `]]]]><![CDATA[>`) so untrusted
content cannot break out of its CDATA section.

### Composition skeleton (pseudocode — not runnable as written)

The script below is **pseudocode**: the `*_PROMPT` names are placeholders the
lead must substitute from the bundled templates before launching — a workflow
script cannot read files, and this body will not run verbatim. Note the depth:
`specialists` has **no judge**; a judge pass makes this a `super`-depth
composition.

```js
// Pseudocode — substitute every *_PROMPT constant from the bundled templates
// before writing the file; nothing else changes.
export const meta = {
  name: "review-super",
  description: "Specialist passes, manual union, then a judge pass",
  phases: [
    { title: "Review", detail: "Specialist role passes" },
    { title: "Judge", detail: "Unioned findings judged" },
  ],
};
phase("Review");
const findings = await parallel([
  () => agent(SECURITY_PROMPT),
  () => agent(CORRECTNESS_PROMPT),
  () => agent(PERFORMANCE_PROMPT),
  () => agent(ARCHITECTURE_PROMPT),
  () => agent(CONSISTENCY_PROMPT),
]);
phase("Judge");
// The lead authors this union: collect surviving <finding> elements, assign a
// sequential `index` to each, and set `source-agent`/`source-role` provenance.
const union = findings
  .filter(Boolean)
  .map((f, i) => f /* index + provenance assignment, not shown */)
  .join("\n");
return agent(JUDGE_PROMPT.replace("{{FINDINGS_BODY}}", union), {
  schema: {
    type: "object",
    required: ["total_findings_parsed", "verdicts", "summary"],
    properties: {
      total_findings_parsed: { type: "integer" },
      verdicts: { type: "array", items: { type: "object" } },
      summary: { type: "object" },
    },
  },
});
```

Materialize the substituted script into a file inside the origin workspace —
`--file` resolves relative to the origin thread's environment — then validate
and run **the same file** so what you checked is what executes:

```bash
bb workflows validate --file .bb/workflows/review-super.js --json
bb workflows run --file .bb/workflows/review-super.js --json
```

`parallel()` is a barrier: it waits for all specialists before the judge stage
runs, which preserves the upstream plan's discovery-then-judge ordering. A
failed specialist resolves to `null`; keep the surviving passes and record the
failure — a partial union is a partial review, never a complete one.

`agent()` calls inherit the origin thread's provider/model by default; an
override requires the complete `{provider, model, reasoningLevel}` tuple and
is validated against the live catalog. There is no per-call permission-mode
override — every call runs under the run's origin permission mode. Observe
the run with `bb workflows status <run-id>` and `bb workflows history
<run-id>`; stop it with `bb workflows stop <run-id>`.

### Composition contract (lead responsibility and helper support)

There is no packaged reviewer-launch command. `bb factory review collect` processes
already collected results and implements the union/provenance, quote checks,
index coverage and degraded fallback below. The lead still supplies all requested
passes and launches each native review/judge stage:

- **Union with index and provenance.** Concatenate every surviving
  `<finding>` element, assign each a sequential `index` attribute, and
  preserve/set `source-agent` and `source-role` attributes so judge verdicts
  map back to the reviewer that produced each finding.
- **CDATA escaping.** Escape `]]>` inside substituted bodies (split as
  `]]]]><![CDATA[>`) so untrusted content cannot break out of its CDATA
  section — applied to both the reviewed source and the unioned findings.
- **Roster and failure attribution.** Record the reviewer roster (requested,
  succeeded, failed/`null`) in the report; a partial union is a partial
  review, never presented as complete.
- **Degraded judge fallback.** Apply `prompts/judge.txt` as the final pass.
  If the judge call fails, returns a malformed verdict, or its verdicts do
  not cover the unioned indices, forward the raw union labelled as
  unjudged/degraded rather than retrying blindly or dropping findings.
- **Schema is a shape contract, not a validator.** `schema`/`outputSchema`
  only shapes the worker's `bb_workflow_result` submission; it does not
  reproduce the upstream semantic checks — `quote-valid` attributes, verdict
  enumeration, and index coverage are your verification duties, not the
  runtime's.

State in the report that the review was manually composed.

## Provider and model selection

`bb provider list --json` shows configured providers;
`bb provider models <provider-id> --json` shows selectable models and
reasoning levels. Use `--model`/`--reasoning-level` on `bb thread spawn`, or
the `{provider, model, reasoningLevel}` option on a workflow `agent()` call.
Prompt wording such as "medium-depth review" does not change reasoning effort.
Disabled or unavailable providers are not a fallback pool; select only what
the catalog reports.

## Progress and outputs

`bb workflows status` is a compact progress summary — content-free by
default. `bb workflows history` pages call-level detail including prompts and
results; redirect a bounded page to a file under `$BB_THREAD_STORAGE` rather
than printing it into the transcript:

```bash
run=<run-id>
mkdir -p "$BB_THREAD_STORAGE/workflows"
bb workflows history "$run" --cursor 0 --limit 100 \
  > "$BB_THREAD_STORAGE/workflows/$run.jsonl"
```

For thread-based reviewers, `bb thread log <id> --format minimal` is the
compact view; `bb thread output <id>` returns the final answer text.

## Result semantics

A workflow call that errors resolves to `null` inside `parallel()`; a failed
thread reports its error in `bb thread show --json`, while a stopped thread can
settle to idle. Reconcile last-turn outcome and stop history.
Both mean "this reviewer did not produce an answer" — report the roster
(queryable, succeeded, failed) instead of letting a partial fan-out
masquerade as a complete review. An empty or whitespace-only answer is not a
valid "zero findings" result; a valid empty result is the schema-conforming
empty finding list produced after the reviewer actually ran.
