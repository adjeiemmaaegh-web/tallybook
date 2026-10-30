# V57 development continuation checkpoint

Branch `development/v19-unified-reconciliation`; local worktree `work/v19-cloud-qa`. Latest pushed commit before this note: `ef02dc8`. GitHub `main` and the Vercel production site were not changed.

## Implemented in this continuation

- Additive IndexedDB v39 QA claim inbox and cursor, with atomic page commit and restore cleanup. Claims remain `upload_claim_only` and `financialApplied: false`.
- Device-vault-scoped signed read, collision-safe composite identifiers, read-only QA claim count on the sync screen.
- Existing reports permission now guards sync diagnostics for governed companies.
- TypeScript semantic check passed after these changes. No hands-on acceptance, live QA account read, or full suite is claimed.

## Exact financial event bytes

The current server trust boundary computes `payloadSha256` from decoded `envelope.payloadBase64` bytes (`server/centralEventTrust.mjs`). The UUID Postgres adapter stores only parsed JSONB (`server/centralSaleIngestUuidPostgres.mjs`), and the QA pull RPC returns only that JSONB and the digest (`docs/security/v54_isolated_sale_pull_ascii_cursor.sql`). JSONB normalization can change ordering and formatting. A receiving device cannot prove the returned JSONB has the original digest. Therefore the v39 quarantine is **not** eligible for financial posting.

This increment adds a nullable `payload_base64` exact-byte column, persists the original bounded bytes on new UUID server ingestion, returns them in the isolated pull RPC, and verifies SHA-256, canonical JSON, event identity, local company, shop and staff on the receiving device before quarantine. Historical rows with NULL exact bytes fail closed; no bytes are invented. The two SQL migrations were applied only to isolated QA project `lmneuqxfyxplrxjswpma`. Post-migration inspection found zero claims, the column and RPC output present, authenticated RPC execution false and service-role execution true. Security advisor retained its 14 informational `rls_enabled_no_policy` notices for server-only tables; no broad browser policy was added. Targeted UUID PGlite ingestion test passed 2/2 and server trust test passed 4/4; TypeScript semantic check passed. This does not prove full sync or production readiness.

Next: implement and exercise owner-approved shop/staff/device enrollment through a service-role RPC and Edge route. The QA signed-pull source gate stays closed until enrolled-key and two-account acceptance succeeds. Then build deterministic, idempotent local financial replay with explicit conflict handling and no oversell, followed by backup/migration verification. No cloud upload route is deployed by this increment.

User-owned hands-on acceptance follows development. Automatic semantic/build and security checks still protect commits and the eventual merge. This checkpoint is not a production-ready assessment.
