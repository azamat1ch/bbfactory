# bbfactory

Your AI coding subscriptions, working as one development team.

bbfactory is a BB distribution being built around a simple workflow: discuss
what you want with your chosen lead, let it work directly or coordinate other
agents, and inspect the result against agreed checks. The aim is more accepted
work from the subscriptions you already have, including the cost of planning,
communication, retries and review.

**Current status:** the BB foundation builds and runs. The bbfactory execution
policy, subscription-aware routing, verification and redesigned chat are
specified but **not implemented**. The current preview is inherited BB.

## Run this checkout

Use Node **22.19.0 or newer** (`.nvmrc` pins 22.19.0) and **pnpm 9.15.0**.
Authenticate the coding harnesses you want to use through their normal setup.

```bash
git clone https://github.com/azamat1ch/bbfactory.git
cd bbfactory
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by the launcher. Each checkout gets separate development
data and ports, so don't assume a fixed port. This is a private repository;
cloning requires access. See [configuration](docs/configuration.md) for providers
and [debugging](docs/debugging-and-qa.md) for the development runtime.

For the optimized browser/server build:

```bash
pnpm start:worktree
```

For the Electron shell, leave `pnpm dev` running and use another terminal:

```bash
pnpm exec turbo run dev --filter=@bb/desktop
```

The browser/server path was smoke-tested on Linux; Electron startup has not yet
been tested here. Both upstream surfaces are retained. There is no published
bbfactory installer yet; `npx bb-app` and BB's downloads install upstream BB.

## Product and development

- [Status and next work](docs/product/README.md)
- [Product specification](docs/product/spec.md)
- [Architecture](docs/product/architecture.md)
- [First implementation slice](docs/product/first-slice.md)
- [Contributor setup](CONTRIBUTING.md) and [agent instructions](AGENTS.md)

The product will support a user-selected lead, interchangeable worker profiles,
visible subscription capacity and native task/check views. Codex, Claude Code,
Cursor, Devin, OpenCode and GLM/Z.ai are the target integrations; their execution,
usage reporting and account switching have separate readiness checks. Installing
a provider does not establish all three.

## Foundations

Built on [BB](https://github.com/get-bb/bb). We adapt delegation, supervision and
review practices from [Pragmatic Orchestration](https://github.com/CodeAlive-AI/pragmatic-orchestration).
The implementation starts with BB's native threads, workflows and plugins;
Porch is not a required product runtime.

See [provenance](docs/product/provenance.md) for pinned sources, preserved history
and ownership. The upstream [MIT license](LICENSE) and copyright remain intact.
Internal BB package names and platform documentation are retained where they
still describe the code.
