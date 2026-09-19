# Product status and navigation

bbfactory is a preconfigured BB distribution for coordinating coding agents and
existing subscriptions. Product behavior lives in native BB plugins and small,
justified core changes. Users should experience one coherent workspace.

## What exists

| Area | Verified now | Still to build |
| --- | --- | --- |
| Repository | Private `azamat1ch/bbfactory`; `kametayturar` has write access; canonical product docs in this repo | Product CI and release packaging |
| Foundation | Frozen install, 50 build tasks, 98 typecheck tasks and browser/server smoke; [baseline](baseline.md) | Electron smoke; future runtime changes need their own checks |
| Orchestration | BB has native threads and durable Workflows; external Porch/Devin runs helped bootstrap this repo | Integrated task/spec contracts, supervision policy, cross-review and verified delivery |
| Providers | Inherited Codex/Claude and ACP providers, including Cursor/OpenCode | Real account checks; Devin integration; validate a GLM/Z.ai execution route |
| Capacity | Inherited usage UI and experimental Codex/Claude account pooling | Coherent subscription view, pool-aware allocation and recovery across supported providers |
| Chat | Inherited BB UI | Lead/team/execution controls, requirement evidence, compact and expanded views |
| Efficiency | No measured improvement yet | Compare complete accepted runs including coordination, retries and review |

Provider presence is source evidence, not a successful run with the user's
account. Usage reporting and account rotation must be verified independently.
No bbfactory orchestration source or executable acceptance suite exists yet.

## Read only what you need

1. [Specification](spec.md): product outcomes, confirmed choices and invariants.
2. [First slice](first-slice.md): the next buildable deliverable and its checks.
3. [Architecture](architecture.md): native BB capabilities, gaps and ownership.
4. [Chat and demo](chat-and-demo.md): the proposed interaction and demo target.

For acceptance review, use [acceptance.md](acceptance.md). For adapting an
upstream behavior, consult only the relevant rows of [coverage.md](coverage.md).
That large inventory is a source reference, not mandatory onboarding reading or
a requirement to reproduce Porch internals. [Provenance](provenance.md) records
source pins, historical plans and the repository history reset.

The next implementation task is the native one-task delivery slice. Establish
its integration contract, then split server policy, host verification and UI
work behind that contract. Broader allocation and parallel-worker features
follow the same product specification.
