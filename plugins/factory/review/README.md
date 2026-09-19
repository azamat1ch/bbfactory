# Review processing

`review.ts` collects attributed reviewer outputs, retains failures, checks quotes
against supplied snapshots and validates optional judge output. It does not
launch reviewers or grant acceptance. Use `bb factory review collect --help`.

Operational guidance lives in the single [Factory skill](../skills/factory/SKILL.md).
Original source notices remain in [LICENSE](LICENSE) and
[developer provenance](../../../docs/product/provenance.md).
Historical port records live under `docs/developer/factory-history`.
