# Stage E — Backend exit, acceptance and rollback gates

This checklist applies **only** to the backend-only Stage B–E branch. A green suite is a source engineering milestone, not an authorization to integrate, migrate, deploy or use live financial data.

| Gate | Required evidence | Source / owner status |
|---|---|---|
| E01 — Baseline provenance | Starting commit, migration names and unchanged frontend proof | Backend branch from `0314873`; check PR file diff |
| E02 — Stage B refund policy | Default disabled; owner-only opt-in, snapshots, audit, full/partial enforcement | Draft migration plus `qa/shared-shop-refunds-import.test.mjs` |
| E03 — Role and tenancy | Active Auth session, owner privilege and cross-company restriction; no direct table browser grants | PGlite `qa/backend-stage-b-e.test.mjs`; independent security audit pending |
| E04 — Financial transactions | Amount type checks, idempotent reposts, no negative stock/credit/payable or double payment | PGlite finance and stock workflows; independent financial reconciliation pending |
| E05 — Setup and summary | New owner/employee role-scoped onboarding readiness with no PII leakage | `readiness`, `salesSummary`, tests |
| E06 — Physical stock controls | Stock counts reject stale snapshots; transfers debit/credit exactly once | Stocktake/transfer PGlite tests; real shop QA pending |
| E07 — Supplier purchasing | Partial receipts never exceed ordered, payable only received goods, settlement <= outstanding | PGlite tests; user accounting validation pending |
| E08 — Orders | No stock reservation on accept; sold status linked to already posted matching POS sale | PGlite tests; external web storefront not implemented |
| E09 — Browser/server integration | Frontend calls new RPC with real accounts on two devices, proper error handling | **Not done; frontend-only prototype is separate** |
| E10 — Deployment rehearsal | Cloned staging DB migrations, down/up recovery, actual PostgreSQL extension compatibility | **Not done; no database changed** |
| E11 — Security | Supabase auth leaked-password protection, SECURITY DEFINER grants, session revocation and hostile tenant tests | Partial PGlite; live security review pending |
| E12 — Owner acceptance | Owner review and explicit GO for integration and production mutation | **Not authorized** |

## Pre-deployment migration drill (not run)

1. Create an approved isolated staging clone from a **redacted backup**. Capture current migration history, schema and hash; do not expose customer PII to CI.
2. Execute migrations in order after existing cloud shop migrations. Check no locked writers over service-level limits, confirm grants, RLS and SECURITY DEFINER search paths.
3. Replay existing sale/refund/stock/credit flows, then simulate supplier PO partial receipt, transfer dispatch without receive, stocktake concurrent sale, revoked staff and foreign-tenant IDs. Compare ledger deltas and record IDs.
4. Restart PostgreSQL/client; verify idempotent retries reuse exact IDs and totals. Run restored-backup drill on a fresh staging clone and reconcile all immutable postings.
5. Scan production-compatibility risks: high concurrency, NUMERIC/BIGINT JSON precision, table/index size, storage pressure, legal return/refund choices, zero-downtime rollout strategy and eventual cleanup.
6. Record failure logs with exact git commit and post-migration schema. Rollback of these append-only financial records **cannot safely be implemented as a blind DROP TABLE** once anything has been written; use a tested point-in-time restore/forward-fix plan.

## Engineering scope exclusions

- UI rendering and integration into existing SPA, intentionally excluded by user instruction.
- Live device-local IndexedDB ledger encryption, native device syncing and cloud-to-local migration.
- Public webshop, payment provider APIs, supplier bank transfer initiation, taxes and shipping.
- Commercial license, deployment, public traffic or release authorization.

## Evidence disclosure template

For each run, attach: repo commit SHA; migration checksum list; platform/node/pnpm versions; command; PGlite output; test count/fail/skip; postgresql staging observations; blocker register; owner approval (or explicit NO-GO).

**Current release: NO-GO / INCOMPLETE FOR PRODUCTION.** Backend source can be reviewed and further developed without waiting for physical acceptance, but no acceptance result may be invented.
