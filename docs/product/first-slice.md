# Native delivery slice

The delivery slice is implemented in native Workflows and one composed Factory
plugin. It is not a one-worker restriction. Direct work, shared read-only review
and isolated concurrent implementers are valid choices.

## Local evidence

| Boundary | Executable evidence |
| --- | --- |
| Durable execution identity, environment choice and conservative stop | [Workflows policy tests](../../plugins/workflows/src/service-policy.test.ts), [execution contract tests](../../plugins/workflows/src/execution.test.ts) |
| Factory → Workflows integration, selected parallel assignments and acceptance | [Native integration test](../../plugins/bbfactory/src/native-integration.test.ts) |
| Versioned requirements, linked evidence, stale/restart/stop handling and human guards | [Factory service tests](../../plugins/bbfactory/src/service.test.ts) |
| Real checks, descendant containment and unsupported capture | [Factory host tests](../../plugins/bbfactory/src/host.test.ts) |
| Task details, uncertainty and human judgment UI | [Task UI tests](../../plugins/bbfactory/src/app.test.tsx) |
| Existing Team upgrade, composed tools/skills and CLI | [Composition test](../../plugins/factory-team/factory-server.test.ts), [Team tests](../../plugins/factory-team/server.test.ts) |
| Guidance links/preserved prompts and review collector | [Bundle tests](../../plugins/factory-guidance/bundle.test.ts), [collector tests](../../plugins/factory-guidance/review.test.ts) |

Run relevant tests/typechecks with Turbo. Build `bb-plugin-factory-team`'s
`prepare:bundled` task to verify the composed server, host, UI and staged skills.
These checks use local fixtures and actual SQLite or host processes where
applicable; provider execution itself still needs account-specific proof.

## Integrated app check

A fresh optimized instance loaded the composed Factory tools, skills, CLI and
Workflows by default. Its native Codex conversation rendered a task card. Factory
ran the real Provider Usage suite through the host service: 26 tests passed,
exit 0, confirmed check containment. Applying the implementation commit made the
previous evidence stale; rerunning from the task panel restored acceptance for
the new fingerprint. This demonstrates the records/check/UI path, not autonomous
feature delivery or a full provider recovery matrix.

The existing installation was then upgraded without resetting conversations or
Team preferences. A real Codex/Astra research assignment launched through Factory
and Workflows, returned its source-based result, and produced a durable completion
event. Worker success left the task unverified; running the linked Provider Usage
suite from the browser produced acceptance. Factory, Workflows, Provider Usage
and Account Pooler were running together. Live Codex and Devin limits were observed;
only one Codex account was available, so account fallback was not exercised.

The combined gate passed 340 tests across Workflows, Factory records/host/UI,
Team composition, guidance and usage, plus their typechecks and the full build.

## Remaining acceptance

The living-spec follow-up adds a draft/start boundary, evidence-backed agent
reviews, atomic human review batches, versioned notes, a larger-spec card and
individual provider controls. Focused backend and provider checks passed; the
final card and combined result still need verification. Test/build suites and
the isolated QA app were stopped at the user's request to protect host memory.
Do not treat the earlier integrated-app evidence above as acceptance of these
new changes. Subsequent verification must use bounded, serialized checks.

Complete a real feature through the running app: agree requirements, implement
directly or delegate, review, correct findings, and verify the final integrated
content. Exercise restart and uncertain stop through the same runtime. A canned
fixture or static UI inspection does not establish that whole route.

Then assess the [parity map](parity-map.md) behavior by behavior. External session
history readers/analytics, broader review-plan orchestration and the full
provider/platform supervision/recovery matrix remain gaps. Preserved prompts and
135 mapped IDs do not prove behavioral equivalence. Keep evidence and unresolved
requirements visible instead of reporting a percentage from source counts.
