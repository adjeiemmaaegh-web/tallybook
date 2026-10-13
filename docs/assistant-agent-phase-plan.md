# Assistant Agent Phase Plan

**Status: implementation approved by owner on 2026-10-03; current stage is Phase 1 only.**

## Owner outcome
Provide safe local transaction simulations and audit-preserving sale reversals without rewriting historical records.

## Stages
- [x] Requirements review and explicit owner scope
- [x] Scope definition
- [ ] Data/migration analysis
- [ ] Phase 1 implementation
- [ ] Phase 1 verification
- [ ] Release handover
- [ ] Owner acceptance gate
- [ ] Phase 2: mixed plans and dependency execution
- [ ] Phase 3: complete evidence/provenance
- [ ] Phase 4: backup/integrity and replay improvements
- [ ] Phase 5: optional local-model runtime

## Phase 1 inclusions
- Read-only sale, purchase, and repayment simulations.
- Additive reversal records with unique submission keys.
- Atomic reversal execution that preserves the original sale, restores stock, and records the correction.
- Derived report/debt behavior that explicitly accounts for reversals.
- Backup/restore and migration coverage.

## Invariants
- Original sale, sale lines, payments, receipts, and inventory movements remain immutable.
- Reversal execution is confirmation-gated and idempotent.
- No cloud, sync, or second editable balance is introduced.
- Invalid or duplicate submissions leave no partial changes.

## Exclusions from Phase 1
Mixed read/write plans, full source-record evidence UI, and local-model execution remain blocked until this stage is validated.
