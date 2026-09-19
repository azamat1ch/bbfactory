# Testing and validation

This bundle contains guidance and pure review processing, not a worker runtime.
Validation means checking that the
packaged instructions and assets resolve and that every runnable example uses
a shipped command. The upstream offline test suite (fake provider CLIs
covering steering, mailbox lifecycle, review depths, and quota parsing) is not
shipped here — its fixture intent maps onto the native fake-provider harnesses
in the bbfactory repository (`plugins/provider-codex`'s fake app-server,
`packages/provider-bridge-acp`'s fake ACP agent, and the Workflows runtime
tests).

## Offline checks for this bundle

- Package manifest and bundled output:
  `pnpm exec turbo run prepare:bundled --filter=bb-plugin-factory-guidance`
  (validates `package.json` `bb` metadata and produces `.bundled-runtime`).
- Skill frontmatter and discovery: the server validates `name`/`description`
  frontmatter and requires the directory name to match `name`.
- Internal links: every `references/…` and `prompts/…` link in `SKILL.md` and
  the references must resolve inside the bundle.
- Command audit: every runnable example must be a real `bb`/`bb workflows`
  command or an exposed agent tool (`bb_workflow_run`). Gated, unavailable
  automation (group wait, external session history, packaged review depths) must be labelled as such, never presented as runnable.

## Live checks

Live provider smoke (a real delegated thread, a real composed review) spends
subscription capacity and requires user-authorized credentials — it is opt-in
and separate from acceptance, exactly as upstream kept its real-backend smoke
separate from the offline suite. When running it:

- Use one bounded, specified task with a pre-declared check.
- Record provider/model/reasoning, permission mode, thread/workflow ids,
  commands, and observed outcomes.
- Verify the result content independently; a worker's own report is not
  evidence.
- Do not run live checks in an unattended or CI context without explicit
  authorization.

## Executed collector and asset tests

Run `pnpm exec turbo run test typecheck prepare:bundled --filter=bb-plugin-factory-guidance`.
`review.test.ts` covers attributed partial failures, empty versus zero findings,
quote mismatches, malformed/incomplete/duplicate judge indices, provenance and
summary mismatches, semantic-judge duplicate pointers, severity downgrade and
CDATA escaping. `bundle.test.ts` checks links, preserved prompt hashes, all eight
roles, and the no-Porch-runtime boundary. These tests do not prove live provider
compliance, current content acceptance or missing external session readers.
