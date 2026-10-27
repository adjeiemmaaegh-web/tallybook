# V42 UUID ownership sync candidate — 2026-10-27

The resumed Supabase inspection confirmed the live UUID `businesses` / `business_members` baseline. This checkpoint adds an **isolated candidate** for signed-sale ingestion against that model. No SQL was applied to the connected project, no HTTP endpoint was mounted, and no cloud upload was enabled.

## Implemented

- `docs/security/CENTRAL_SALE_UUID_BASELINE_ISOLATED_SCHEMA.sql` adds company-scoped store, staff, assignment and device-key records plus immutable signed-sale upload claims. The event's `(company_id,local_company_id)` foreign key ties the local company identifier to the existing binding table. Every new table has RLS enabled; browser roles cannot write them. Owners alone can read uploaded claims. A database receipt remains `upload_claim_only`, not payment or physical-sale proof.
- `server/centralSaleIngestUuidPostgres.mjs` maps an authenticated actor and local company ID to exactly one verified UUID company inside the same serializable transaction as session checking, signature verification, directory checks and insert. Ambiguous reused local IDs fail closed. Directory reads lock membership, binding, store, staff, assignment and approved device key rows. Exact retries use the existing idempotent ingestion service; conflicting signed payloads are rejected.
- `server/centralSaleUuidIngestCoordinator.mjs` composes the verified Supabase session resolver and private PostgreSQL pool. It is not called by an HTTP route.
- `qa/central-sale-uuid-schema.test.mjs` runs the schema and adapter in PGlite using synthetic owners and an attendant, exercising company binding, foreign keys, owner-only reads, browser write denial, signed ingest, exact replay, device revocation and ambiguous-ID denial.

## Verification

The focused eight-test native run passed: `qa/central-sale-uuid-schema.test.mjs`, `qa/central-sale-ingest-isolated.test.mjs` and `server/tests/centralEventTrust.test.mjs`. Evidence: `docs/central/evidence/v42-uuid-ingest-2026-10-27.txt`. TypeScript semantic checking passed with no diagnostics; see `v42-typescript-2026-10-27.txt`. `npm run build` passed; see `v42-build-2026-10-27.txt`. The full client suite and real Supabase behavioral tests were not rerun for this isolated server/SQL change.

## Remaining before cloud activation

The candidate schema still needs migration review against a disposable project, not just PGlite. Public-key enrollment and rotation must be connected to the owner-approved invitation/grant lifecycle. Attendant sign-in, local staff binding, consented durable delivery, an authenticated and protected HTTPS route, all other approved event kinds, direct Data API negative tests, revocation/lost-ACK races, and Windows/Android acceptance remain open. The connected live project had one Auth user and no companies at inspection, so a true two-account RLS test could not be performed there. The server uses a private privileged pool; its deployment credentials and least-privilege permissions are not configured here.

The old draft `tb_*` adapter remains isolated for comparison. Do not apply its schema to the live UUID project. This checkpoint does not authorize production sync, deployment, live payments, or a PR merge.
