# Bootstrap acceptance

These gates accept setup/design evidence, not a completed product.

- Platform: retain upstream desktop and browser support. Smoke-test whichever documented local path is straightforward, and distinguish tested from untested surfaces.
- Setup: upstream SHA and branch/remotes recorded; lockfile preserved; exact toolchain and check commands with exit codes/logs; startup response if successful; failures remain explicit.
- Navigation: product entry discoverable from README and AGENTS; upstream guidance and attribution retained; no redundant speculative documentation or unexplained removal.
- Coverage: upstream SHA, stable behavior IDs, source references, criticality, proposed check for each behavior; pending status; denominator and exclusions subject to independent review. All critical behaviors must pass before eventual parity acceptance.
- Integration: verified native BB host/server/tool/CLI/UI seams; real Porch IDs; reuse existing supervisor; commands on correct host/cwd; exact-revision acceptance evidence; clear ownership and first implementation slice.
- Later implementation gates: direct execution and selected lead; peer workers; cross-review; durable restart/reconciliation; confirmed cancellation; isolated concurrent writers; failed/missing/stale checks never imply acceptance.

Independent Astra reviews artifacts and source evidence before acceptance. Reports must distinguish verified, proposed, blocked, and implemented-and-tested.
