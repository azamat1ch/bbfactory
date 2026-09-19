# bbfactory — product entry point

bbfactory is a BB distribution under development. This checkout is its working base. Upstream bb
documentation and processes still apply unchanged; this file only records what
this distribution adds and where that work stands.

## Intent

Ship a bb distribution with:

- Native, near-complete Pragmatic Orchestration: coordinated multi-agent work
  with a user-chosen conversational lead, peer Sol and Devin implementers, and
  independent acceptance checks.
- Optional direct execution: the lead can still do bounded work itself when
  orchestration adds no value.
- Both supported surfaces preserved: the desktop app and the browser UI remain
  first-class; nothing here narrows bb to one surface.

## Status

Pending work. The distribution is a bootstrap in progress, not a shipped
product:

- Verified baseline: pinned upstream checkout, frozen-lockfile install, build
  (50 tasks), typecheck (98 tasks), and browser/server startup smoke on loopback
  with isolated data. See the portable [baseline summary](baseline.md).
- Electron desktop startup is not yet tested; both surfaces remain supported.
- Not started: orchestration features, lead/worker wiring, acceptance-check
  automation, and any source cleanup. No upstream source has been deleted or
  narrowed.

Treat every capability above as unimplemented until linked evidence says
otherwise.

## Specifications and implementation entry

These documents are the canonical product specifications. They describe planned behavior; they are not evidence of implemented features or runnable tests.

- [Core chat and demo](chat-and-demo.md) — proposed native conversation experience and two-minute demo.

1. [Product decisions](decisions.md) — agreed choices and open experiments.
2. [First implementation slice](first-slice.md) — next deliverable, interfaces, ownership, and proposed behavioral checks.
3. [Architecture](architecture.md) — verified upstream integration surfaces and proposed runtime design.
4. [Acceptance criteria](acceptance.md) — independent review and verification gates.
5. [Upstream coverage inventory](coverage.md) — detailed parity checklist; consult the relevant capability IDs rather than loading the whole inventory into every task.

Read decisions and the first slice before implementation. Follow the architecture and coverage references only as needed. Update these canonical documents when a contract changes; avoid parallel copies in task notes.

## Contributor Docs (Upstream)

Start here before changing code:

- [AGENTS.md](../../AGENTS.md) — codebase rules: boundaries, build/test
  commands, plugin API policy.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — upstream contribution gate.
- [Repository overview](../repository-overview.md) — package and app map.
- [System overview](../system-overview.md) — runtime architecture, server /
  host-daemon split, data model.
- [Configuration](../configuration.md) — env vars, data directories, ports.
- [Debugging and QA](../debugging-and-qa.md) — dev loop, smoke fixtures, QA
  launchers.
- [Provider plugin API](../provider-plugin-api.md) and
  [CLI guide and skill](../cli-guide-and-skill.md) — surfaces distribution work
  is most likely to touch.
