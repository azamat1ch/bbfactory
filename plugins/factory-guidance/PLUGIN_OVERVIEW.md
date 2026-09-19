# Factory Guidance

An internal Factory guidance package that packages the Pragmatic Orchestration guidance,
adapted from
[pragmatic-orchestration](https://github.com/CodeAlive-AI/pragmatic-orchestration)
(pin `061bcd6b58a596bc0e1e5403c6aa5c0bdb195ae5`, MIT-licensed, see `LICENSE`)
onto native BB surfaces.

It contributes one skill, `pragmatic-orchestration`, which teaches a lead agent
how to:

- collect independent multi-provider opinions and structured code reviews,
- delegate bounded tasks to provider threads with precise briefs and context
  seeds,
- supervise workers with a first-minute check and adaptive follow-ups,
- steer, verify, and accept results without trusting worker claims.

The package adds pure review-result collection through a tool, RPC and CLI,
plus the skill assets. It owns no worker lifecycle. Factory packaging can combine
these registrations into its single feature; this internal package is not a
requirement for another independent user toggle. See `MIGRATION.md` for the per-asset
adaptation ledger against the upstream pin.
