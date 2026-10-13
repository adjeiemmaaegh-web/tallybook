# Stage 9 Limited Local Release Scope — 2026-10-10

**Decision:** Gate unfinished cross-device and inventory-posting functions. Stage 9 is **INCOMPLETE**; this is **not** production sign-off or a certified release.

## Included local development capabilities
- Store directory and company-scoped store records
- Existing staff-to-store assignment workflow
- Append-only physical stock *observations* (not sellable balances)
- Transfer *requests* and cancellation (no reservation/movement)
- Local administrative activity summaries (not profit or sales totals)

## Hard-disabled product capabilities in `stage9ReleaseScope.ts`
- Authoritative store stock balances
- Executing actual inter-store transfers
- Multi-device/mobile attendant checkout
- Remote event replication
- Consolidated multi-store financial reporting

The release scope is a UI/product availability boundary **only**. It is not server authorization; any future financial write or remotely synchronized mutation MUST pass independent company, staff, device, inventory and idempotency checks. No disabled functionality should be enabled by changing a flag alone.

## Acceptance gates before production or full Stage 9 completion
1. Merge/certify Stage 2 historical costs, atomic stock allocation and Stage 3 accounting reconciliation.
2. Complete Stage 8 authenticated device sync with durable acknowledgements, revocation and replay-safe reconciliation.
3. Implement and test authoritative store balances, transfers, attendant checkout and owner financial reports.
4. Install dependencies; run full Vitest suite, semantic TypeScript, production Vite build, IndexedDB migration and backup restore tests.
5. Run real-browser offline, device, printer and concurrency E2E scenarios; audit security and financial attribution.

**Stage 10 has not started.** Record all earlier-stage blockers in final Stage 12 hardening; they are not waived by this limited scope.
