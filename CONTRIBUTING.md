# Contributing

Follow [setup](README.md#install-and-run), then read [AGENTS.md](AGENTS.md).

1. Define the behavior and relevant checks. Keep changes focused and preserve unrelated work.
2. Work on a branch. Give concurrent writers separate worktrees or non-overlapping scopes.
3. Run relevant checks through Turbo using the actual package name:
   `pnpm exec turbo run typecheck test --filter=@bb/<package> --concurrency=1`.
   Bound test-runner parallelism and coordinate expensive checks across the host.
   Documentation-only changes need link/content review, not a full rebuild.
4. Review the combined diff and open a coherent PR describing the change and verification.

Keep durable implementation documentation beside its package. Factory stores
versioned specs and evidence; temporary notes belong in thread storage, not the
repository. Never commit credentials, local runtime state or provider sessions.
Preserve component licenses when reusing code.

See [repository layout](docs/repository-overview.md),
[debugging and QA](docs/debugging-and-qa.md), and
[CLI and skill surfaces](docs/cli-guide-and-skill.md).

Release publishing, signing and update feeds require distribution-specific setup;
the documented source installation does not depend on a published desktop release.
