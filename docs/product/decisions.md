# Current product choices

- Preserve BB's existing desktop and browser paths. Use the easiest local path for early verification; do not remove either surface.
- Initial configured lead: Astra. Lead model remains user-selectable.
- Sol and Devin are peer implementers/reviewers. Use available eligible workers; direct in-thread execution remains supported.
- Explore Jev for worker selection and compare against simple rules. No assumption yet that it improves routing; no provider credentials or spending authorized by this note.
- Reflect orchestration in the core chat: conversational lead, separate worker team and execution choice, task context, review and verification. Layout remains a proposal in [core chat and demo](chat-and-demo.md).
- Prototype both compact task cards and a team dashboard against the same run state. User wants to see both before choosing the default.
- Product name confirmed by user: bbfactory. GitHub repository: https://github.com/azamat1ch/bbfactory (private).
- Premium escalation policy remains a configurable proposal; no numeric spending/quota budget has been agreed.

## Jev routing experiment (proposal)

Official docs checked September 19: https://docs.typesafe.ai/introduction . Jev offers typed Choice/Score/Noul responses; documentation recommends separate narrow judgments combined in code. Test scoring a task's ambiguity, verification difficulty and parallelizability using concise task state. Deterministic code first filters workers by enabled profile, capability, actual availability and configured budget; Jev may rank only eligible candidates. Neither model invents quota observations. Compare against simple availability/context rules using accepted outcomes, overhead, retries and premium use. No live API call made, no routing accuracy established. Keep deterministic fallback for absent credentials, errors or uncertain results.
