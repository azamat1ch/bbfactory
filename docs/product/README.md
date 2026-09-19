# Factory

Factory is one BB plugin for working directly or coordinating ordinary coding
agents around a versioned executable spec. Start in chat, refine a spec when
useful, implement, review/fix proportionately, then ask for human approval.
The lead and model remain the user's choice; no fixed pipeline is required.

Use the [Factory skill](../../plugins/factory/skills/factory/SKILL.md) as the
operational entry point and [package guide](../../plugins/factory/README.md) for
commands and upgrades. [Architecture](architecture.md) explains ownership and
[behavior mapping](factory-skill-mapping.md) records what was preserved or
simplified from the original guidance. Historical source attribution lives in
[provenance](provenance.md).

## Specifications and evidence

SQLite is authoritative for task specs and their revision, finding and evidence
history, under the preserved `plugins/factory-team/data.db` storage identity.
The card and `bb factory` expose those records. Repository product documents
record design context; they are not a synchronized second task-spec database.
Executable checks stay in the repository. Spec export/import preserves meaning
and source revision attribution without transferring acceptance.

A requirement may combine automated, agent and human verification. Current
coverage is distinct from human delivery approval and historical delivery.
Unknown content, failed checks and unresolved ownership remain visible.

## Verification limits

Focused tests validate their exercised cases, not every provider or platform.
BB-prepared context diagnostics cannot inspect skills/tools added by the harness.
Periodic content observation cannot detect changes entirely between observations.
Host check containment currently relies on Linux user systemd.

The migration preserves original ownership of legacy Workflows runs and blocks
unsafe owner disablement. It conservatively requires the peer owner to drain
before a new launch. The internal execution source is currently vendored, so
shared fixes must also reach standalone Workflows. Runtime reviews and human
sanity checks remain necessary; no text-retention or 95% behavioral parity claim
is made.
