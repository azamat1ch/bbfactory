# bbfactory

A BB distribution for working with your AI coding subscriptions: discuss a task,
refine an executable spec, implement directly or with a team, then review and approve.

## Install and run

Requires Node **22.19.0 or newer** and **pnpm 9.15.0**.
If needed, install pnpm with `npm install -g pnpm@9.15.0`.

```bash
git clone https://github.com/azamat1ch/bbfactory.git
cd bbfactory
pnpm install --frozen-lockfile
pnpm start:worktree
```

Open the URL printed by the launcher. The first launch builds the app; each checkout
gets separate data and ports. In Settings → Providers, configure and authenticate
the coding harnesses you want to use. See [configuration](docs/configuration.md).

**Factory is bundled and enabled by default.** It includes remembered Team
preferences, specs, native assignments, review, approval and the `factory` skill.
Provider integrations remain separate plugins. Standalone Workflows is optional
and disabled on fresh installs; Factory does not require it.

This source checkout is the installation path for this distribution. Upstream
BB downloads and `npx bb-app` install upstream BB, not this fork. The browser/server
path has been exercised on Linux; desktop packaging is not a tested release here.

## Develop

Use `pnpm dev` for hot reload. See [contributing](CONTRIBUTING.md) for focused checks
and [debugging](docs/debugging-and-qa.md) for runtime logs and ports.

- [Factory](plugins/factory/README.md): workflow, commands and upgrade behavior.
- [Repository map](docs/repository-overview.md): applications and packages.
- [System overview](docs/system-overview.md): server, host daemon and providers.

Built on [BB](https://github.com/get-bb/bb). Distributed under the [MIT license](LICENSE);
component license notices remain with their source.
