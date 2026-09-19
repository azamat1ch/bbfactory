# Contributing to bbfactory

Start with [README.md](README.md) to run the checkout and
[product status](docs/product/README.md) to see what exists. Read
[AGENTS.md](AGENTS.md) before editing code, then load only the relevant product
contract and package documentation. This repository uses its own collaboration
process; upstream BB's Discord contributor-approval process applies only when
submitting changes upstream.

## Make a change

1. Agree the behavior and relevant acceptance checks before implementation.
   Use the existing project test tooling; a Given/When/Then paragraph alone is
   not an executable check.
2. Use a `codex/` branch for agent work. Give parallel writers separate
   worktrees and bounded scopes. Freeze shared interfaces before dependent work.
3. Run relevant checks through Turbo, for example
   `pnpm exec turbo run typecheck test --filter=@bb/<package>`, using the actual
   package name. Use `pnpm build` and `pnpm typecheck` for integrated validation
   when the scope warrants it. Documentation-only edits need link/content
   review, not a full application rebuild.
4. Review the diff, preserve unrelated changes, and commit a coherent change
   with its reason and verification. Follow the PR template when opening a PR.

No local runtime state, tokens, provider sessions or task transcripts belong in
commits. Keep product contracts under `docs/product/`; implementation details
belong beside their package. Preserve the upstream license and record adapted
sources in [provenance](docs/product/provenance.md).

## Building with an agent team

This is our development process, distinct from the product we are building.
Astra owns decomposition and integration decisions. Devin, Sol and other
eligible implementers take bounded tasks; neither has a fixed seniority over
the other. External Porch is available for development delegation without
becoming a shipped dependency.

Maintain one task queue with scope, base revision, owner, dependencies, required
checks, current state and artifact references. Each worker returns changes,
verification evidence, unresolved issues and a short handover. One integration
owner combines accepted work and checks the actual combined revision.
Independent Astra reviews architecture and each outcome gate; peer workers can
cross-review implementation before that gate.

Twenty workers is a possible pool, not a default fan-out. Start a small wave
with independent scopes; grow only when tasks, provider limits, machines and
review capacity permit it. Stop launching when verification backs up. If an
interface changes, block or refresh affected tasks rather than silently allowing
stale implementation. Never replace a writer before its stop is confirmed.

Briefs carry only relevant intent, paths, contracts and checks. Progress updates
carry deltas and evidence links, not repeated full transcripts. Inspect full logs
on exceptions. Both sides still spend tokens on instructions, context and
responses; CLI/file transport is not free model context. Include failed attempts,
supervision and reviews in measurements. No savings ratio has been measured.

## Repository map

- [Repository overview](docs/repository-overview.md): applications and packages.
- [System overview](docs/system-overview.md): server, host daemon and runtime.
- [Configuration](docs/configuration.md): settings and provider setup.
- [Debugging and QA](docs/debugging-and-qa.md): logs, ports and test environments.
- [CLI and skill surfaces](docs/cli-guide-and-skill.md): required updates for
  user-facing commands and configuration.

Inherited GitHub Actions are disabled on this repository. Product CI, release
identity, signing, update feeds and distribution defaults must be configured
before publishing. Inherited Dependabot scheduling was removed during setup;
enable a project-owned policy alongside CI.
