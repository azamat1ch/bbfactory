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
| Chat | Inherited BB UI; [compact workspace prototype](prototypes/README.md), using illustrative data | Connect lead/team/execution controls and requirement evidence to native records |
| Efficiency | No measured improvement yet | Compare complete accepted runs including coordination, retries and review |

Provider presence is source evidence, not a successful run with the user's
account. Usage reporting and account rotation must be verified independently.
Native Devin support, the first task/check runtime and the native guidance bundle
are in separate implementation worktrees. None is accepted into this branch yet.

## Read only what you need

1. [Specification](spec.md): product outcomes, confirmed choices and invariants.
2. [First slice](first-slice.md): the next buildable deliverable and its checks.
3. [Architecture](architecture.md): native BB capabilities, gaps and ownership.
4. [Chat and demo](chat-and-demo.md): the proposed interaction and demo target.

For acceptance review, use [acceptance.md](acceptance.md). For adapting an
upstream behavior, consult the relevant rows of [parity-map.md](parity-map.md)
and its underlying [source inventory](coverage.md).
That large inventory is a source reference, not mandatory onboarding reading or
a requirement to reproduce Porch internals. [Provenance](provenance.md) records
source pins, historical plans and the repository history reset.

For provider execution, usage and rotation, see the source-reviewed
[support matrix](provider-support.md). It separates source behavior from reported
local probes and unverified subscription paths.

The next implementation task is the native one-task delivery slice. Establish
its integration contract, then split server policy, host verification and UI
work behind that contract. Broader allocation and parallel-worker features
follow the same product specification.
