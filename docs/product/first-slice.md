# Next implementation slice

Status: revised plan after reassessing draft PR #6 against native BB/Workflows.
The old one-worker slice is not a product restriction. Follow the recommended
[ownership boundary](architecture.md) before extending its implementation.

## Prove native execution integration first

Add the smallest typed Workflows interface over its existing service, per-call
native environment/access selection, and truthful native stop/replace handling.
Factory keeps task/assignment associations and acceptance, not a second scheduler.

Build an offline fake-provider integration scenario that exercises:

| Situation | Expected result |
| --- | --- |
| Lead delegates two bounded assignments | Ordinary native subagents use selected profiles and expose native progress |
| Review/research shares a checkout | Sharing works with the chosen access policy; no mandatory worktree |
| Two implementers write concurrently | Coordinated scopes/environments prevent competing writes; worktrees are one option |
| Spawn reply is lost, then the plugin restarts | Reconcile durable native ownership; never blindly launch a duplicate |
| Stop acknowledgement fails, then retry is requested | Preserve partial work and uncertainty; no overlapping replacement writer |
| One parallel call fails | Preserve its attributed failure; a null result is not successful delivery |

These are tests to build, not claims of passing behavior. Thread settlement
must not be confused with a stronger process/write guarantee.

## Connect the product

After proving the boundary, integrate bounded work in these lanes:

1. **Guidance and Team.** Finish adapted Pragmatic guidance and consume the
   existing Team record for actual assignments. Preserve direct work, chosen
   models, explicit overrides and concise contextual briefs.
2. **Requirements and evidence.** Extend retained PR #6 records with explicit
   requirement/check links and review findings. Correct host verification
   defects and check final integrated content.
3. **Compact UI.** Reuse the Team picker and task/check card. UI, tools and CLI
   read the same records; do not add another dashboard.
4. **Real app proof.** Complete a requested feature through the app, including
   implementation, review, correction and independent verification. A canned
   delivery fixture does not substitute for building the demonstration in-app.

Acceptance examples:

- Direct and delegated work use the same acceptance checks; direct work does
  not need ceremonial extra agents or a workflow.
- A required behavior without a linked check stays unverified unless an
  explicit human-review criterion applies.
- Worker completion plus a failing required check leaves the task unaccepted.
- Changed requirements, checks or relevant files invalidate affected evidence.
- Research, review and implementation use the same subagent mechanism;
  unresolved required review findings block acceptance.
- Reconnect/restart restores durable records, not model-written status text.

Continue the [Pragmatic parity map](parity-map.md), including deeper review plans,
supervision, context/session handling and recovery. Keep limits inspectable and
configure supported account pooling. There is no quota-optimizer milestone.
Branding, package consolidation and fresh-setup verification complete the experience.
