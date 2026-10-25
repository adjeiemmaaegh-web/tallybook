# Implementation and dependency assessment — 2026-10-24

## Source analyzed

`TALLYBOOK_V19_BATCH7_INTEGRATED_SOURCE_2026-10-24.zip`, 952 files, no installed node_modules. Its Dexie `DATABASE_SCHEMA_VERSION` is **29**. An independently accessed later GitHub branch had reported v33; this package must **not** be merged into that branch without three-way comparison. No work here changes GitHub or Supabase.

## Confirmed already present

Local sales with sale/payment/receipt, staff and optional shift, discount approvals, fixed-currency money checks, local provider registry, local device registry, store assignment, sale reversals and narrow cash returns, shift cash variance, an opt-in **non-networked** `syncOutbox`, a file-journal sync server, and a single-store Watchdog CSV bridge. The CSV currently cannot attribute unproven historical stores, which is appropriate.

## Confirmed gaps and source contradictions

1. New sales allow no staff when a business has no staff accounts; owner/supervisor sales may lack a shift. MoMo reference can be absent and duplicate checks are missing. Mandatory rules are a **breaking behavior change** for current blank-staff onboarding/tests.
2. No dedicated authoritative no-sale drawer journal/table. Client-local device ID is only a registry ID, not server authentication.
3. No Supabase migrations or authorized ingestion pipeline, no confirmed real RLS test; a Supabase package and sign-in preview do not constitute connected sync.
4. The local outbox stores IDs and digest but no durable transport payload; it cannot upload a full transaction unmodified. A state-machine bridge is needed inside the local sale transaction before claiming reliable minutes-to-central delivery.
5. The supplied brief references Dexie v29, consistent with this ZIP, but previous branch was v33. Additive v30 locally is not safe to cherry-pick on top of v33 without a migration conflict review.
6. Watchdog export is **single-store only**, missing new no-sale, cash counts, day filtering, and schema/header manifest v1. This is a safe pilot preview, not the full shared data contract.
7. Incoming real-world MoMo statements, genuine trusted device attestation, full refund settlement, full migration/restore/real-browser tests, RLS negative tests and tenant/operator management remain unverified.

## Dependency order and this increment

A: contract/docs, PostgreSQL schema, deny-by-default RLS and draft read-only reports. B: new-sales staff and MoMo validator, new local no-sale journal skeleton where feasible. C: persistent payload + trusted ingestion + test-cloud RLS requires selected device/auth design and actual isolated PostgreSQL environment. D: exports/reports after authoritative provenance. Keep C/D blocked rather than invent verification. No live project mutations.
