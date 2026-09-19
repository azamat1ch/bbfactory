# Team preferences

Team is the user's saved delegation preference: whether the lead works
directly or may delegate, and which provider/model profiles are eligible
workers. It is guidance to the lead, not a launch-permission gate. Validate
current provider availability, permissions and workspace isolation before
launching a worker, and never silently substitute an unavailable or unselected
profile.

## Read the preference

```bash
bb factory team get --json              # this conversation (default)
bb factory team get --thread <id> --json
bb factory team get --project <id> --json   # defaults for new conversations in a project
bb factory team get --global --json     # the user-level default across projects
```

Read it before each new task and before choosing workers. Explicit user
directions for the current task override the preference for that task; do not
silently change the saved preference.

## Modes

- **auto** — work directly or delegate according to task suitability and
  coordination cost.
- **off** — the lead works directly unless the user explicitly overrides.
- **selected** — delegated work uses only the saved provider/model profiles.
  The list constrains eligibility, not worker count, and direct work remains
  valid in Selected.

## Change the preference

```bash
bb factory team set --mode auto|off|selected \
  --profiles '<JSON array>' --revision <from get> --json
bb factory team set --local ...    # scope the change to this conversation only
bb factory team reset              # restore inherited settings for this scope
```

Selected mode requires profiles. Each profile contains `providerId`, `model`,
`reasoningLevel` and optional `serviceTier` (`default` or `fast`); a
provider/model pair can appear once. Discover actual provider and model ids
through `bb provider list --json` and `bb provider models <id> --json` — do
not infer them from display labels. Omitted `--profiles` retains the saved
list. Pass `--revision` from the read when editing an earlier read to reject
intervening changes.

An ordinary `set` updates the remembered default so new conversations inherit
it across projects; `--local` records an explicit this-conversation-only
choice. `reset` clears a narrower scope back to its inherited setting.

## Precedence

1. Explicit user direction for the current task.
2. Conversation override.
3. Project override.
4. User-level (global) default.

Apply the effective preference, then check what is actually configured and
available before launching. Team changes never restart or alter active
workers, and never change the user's chosen lead model. The preference does
not launch workers, rotate accounts, enforce quotas or perform acceptance.
