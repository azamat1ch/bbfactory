# Bootstrap baseline

Verified September 19, 2026 against BB revision `c1a64f4b49b0659e92a7aa4434e79d062b3e814f` on Linux x64.

- Existing toolchain: Node 24.13.0, pnpm 9.15.0. Node meets the package engine requirement; `.nvmrc` pins 22.19.0. Electron desktop was not tested.
- `pnpm install --frozen-lockfile`: completed, including generation tasks; lockfile unchanged.
- `pnpm build`: 50 tasks successful.
- `pnpm typecheck`: 98 tasks successful.
- `pnpm start:worktree`: isolated checkout data, loopback server and host daemon started. App HTML and system-version endpoint returned HTTP 200; projects endpoint returned an empty list for the fresh database. Clean shutdown verified.
- Full test suite was not run. No orchestration implementation or acceptance tests exist yet.

Independent Astra reviewed the setup artifacts and source state. Original logs are retained in the development workspace, not committed here. Numeric exit codes were not separately preserved for the worker-run commands; completion claims use their logs and observed HTTP responses.

Desktop and browser support remain intact. No source files were removed. This baseline records a tested checkout, not a released bbfactory package.
