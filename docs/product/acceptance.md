# Acceptance and independent review

These gates separate setup, implementation and product claims. The bootstrap
has evidence; bbfactory runtime behaviors still need implementation and tests.

| Gate | Required evidence |
| --- | --- |
| Clean foundation | Pinned source and preserved attribution; reproducible install/build/start; clear entry docs; no unexplained code deletion |
| Native integration | Real selected-provider run through BB; correct host/workspace; observable lifecycle; one execution owner |
| Verified delivery | Direct and delegated paths use independently executed checks bound to the accepted spec and exact resulting content |
| Recovery | Lost replies, restart, duplicate notifications and uncertain cancellation cannot create duplicate writers or acceptance |
| Collaboration | Bounded scopes, peer review, isolated concurrent writes and checks on the assembled result |
| Subscription policy | Traceable observations, no shared-pool double counting, visible stale/unknown values, justified routing including direct execution |
| Pragmatic coverage | Source behavior mapped to native equivalents or explicit gaps; independent review of denominator and observed evidence before any percentage claim |
| Product experience | Coherent chat and capacity views; UI, tools and CLI agree; tested surfaces distinguished from retained but untested ones |
| Efficiency claim | Matched accepted tasks, all overhead/failures counted, no savings multiplier inferred from raw token prices |

Independent Astra review should inspect the diff, source and execution evidence,
not only worker summaries. Classify findings as verified, proposed, blocked or
implemented-and-tested. An instruction's presence proves documented guidance;
behavioral enforcement needs a trace or test. Read the relevant
[first-slice scenarios](first-slice.md) and [coverage rows](coverage.md), not the
entire document tree for every task.

## Three outcome gates

1. **Clean BB foundation:** a new collaborator can clone, follow one README,
   locate current specs and run the app. Setup checks and provenance are recorded;
   stale plans cannot masquerade as current instructions. Independent Astra
   inspects navigation, diff and startup evidence. This does not accept the
   future product UI or untested desktop packaging.
2. **Near-complete native orchestration:** map the full upstream behavior
   inventory, implement useful equivalents and demonstrate delegation, steering,
   review, session/context handling, quota observation and recovery. Independent
   Astra approves the mapping and verifies all required behaviors plus the
   agreed 95%+ coverage threshold. A successful one-worker demo is insufficient.
3. **Coherent bbfactory experience:** a fresh configured instance exposes the
   lead/team controls, subscriptions, specs and evidence in normal use. Exercise
   direct execution and a cross-provider feature, with interruption and failed
   checks handled honestly. Independent Astra reviews runnable evidence;
   Azamat chooses between UI prototypes and judges the product feel.

Track capability support separately for each target integration: discovery/auth,
real execution, model selection, observe/steer/stop/resume, usage freshness and
account rotation. Unsupported columns remain explicit. Jev and extra browser
plugins are optional later experiments, not hidden blockers for these gates.
