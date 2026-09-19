---
name: team
description: Read or change the saved Team delegation preference and eligible implementer profiles for a BB conversation or new project conversations.
---

Read the current Team preference with `bb_team_get` before each new user task.
For CLI access, use `bb factory team get --json`. In another scope pass
`--thread <id>` or `--project <id>`; project scope is the default for new
conversations, not an update to existing conversations.

`bb factory team set --mode auto|off|selected --json` updates the saved preference.
Selected mode requires profiles. Use `--profiles '<JSON array>'` with each
profile containing `providerId`, `model`, `reasoningLevel`, and optional
`serviceTier` (`default` or `fast`). Discover actual provider/model IDs through
BB; do not infer them from display labels. Omitted profiles retain the saved
list. A provider/model can only appear once, even with different reasoning
or service tiers. Pass `--revision <revision from get>` when editing an earlier read to
reject intervening changes. The UI always checks the revision.

Auto allows direct work or delegation according to task suitability and cost.
Off means the lead works directly. Selected constrains delegation to those
profiles, not one worker per profile. Direct work remains valid in Selected.
Explicit instructions in the current conversation override the preference
for that task; only persist a change when the user requests a new default.

The control is guidance to the lead, not a launch-permission gate. Validate
current provider availability, permissions and workspace isolation before
launching a native worker. Never silently substitute an unavailable model.
Preserve the lead, report actual native worker progress, and keep worker
completion separate from acceptance checks. The plugin does not launch workers,
rotate accounts, enforce quotas, or implement task acceptance itself.
