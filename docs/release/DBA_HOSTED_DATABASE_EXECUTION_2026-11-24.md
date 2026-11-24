# Tallybook hosted database — DBA execution and cutover handoff

**As-of:** 2026-11-24 (UTC). **Repo main used:** `63d70aec7f924b69c1aaa03c0a7562b2c3dd2725`.
**Scope:** Supabase SQL / hosted database. No GitHub merge, Vercel deployment, payment activation, production migration, or live-data reset was carried out.

## Project inventory (read directly from Supabase)
| | Staging | Production |
|---|---|---|
| Name | Tallybook Staging | Tallybook |
| Reference | `yfbtwuptiudmeferjgko` | `qfyydfxwvifdvffdfgeu` |
| Postgres | 17.12 | 17.11 |
| Recorded migrations | **43** | **37** |
| Public application tables | **72** | **59** |
| Hosted application data | 0 users, 0 businesses, 0 sales | **real data exists; do not reset** |
| Status | Schema staged and statically gated | **NO-GO until backup, field checks and owner cutover approval** |

## Actual changes made on staging
1. Applied the 37-migration baseline, skipping the already-present `restrict_rls_helper` after verifying its statement against source.
2. Applied the previously missing six migrations, in this exact order: 
   `20261117052213_business_type_active_session`;
   `20261117060608_guest_order_price_snapshots`;
   `20261120090000_connected_commerce_platform`;
   `20261121090000_connected_commerce_discover`;
   `20261121120000_payment_settlement_ledger`;
   `20261121150000_shift_cash_reconciliation`.
3. Reconciled **staging-only** Supabase migration-history versions to the canonical repository timestamps inside an atomic, SHA-guarded transaction. Also appended one missing terminal newline to the historical `restrict_rls_helper` stored statement. Follow-up Git blob-SHA verification found **43/43 exact source-byte matches**. No app rows were touched by this metadata edit.
4. Ran transient PostgreSQL savepoint rollback rehearsals for Shift, Payment, Discover and the full Commerce stack. After each, verified all objects were restored and migration history remained at 43. Security fixes #1/#2 are intentionally forward-only and must not be rolled back.
5. Re-ran release checks on the final staging state. Every public application table had RLS enabled; the 13 new CC/payment tables also use `FORCE ROW LEVEL SECURITY`, and anonymous/authenticated direct access to them is denied.

## Source-to-hosted parity and security evidence
- The baseline **59 public table names/RLS settings and all 497 column definitions** are equal to production.
- Of the first 37 migration functions, all shared signatures are present. Eight differences disappeared when SQL comments/formatting were normalized. The one substantive difference is the intentionally upgraded `private.set_cloud_business_type`, whose active-session proof is now required on staging.
- Production's platform-managed `ensure_rls` event trigger and `public.rls_auto_enable()` helper are absent from this newer staging Supabase project; this is an infrastructure discrepancy, **not** an unprotected existing table. The connected `postgres` role is not a superuser. We did not try to emulate platform-owned superuser objects with unsafe ad hoc DDL. The read-only release gate blocks any missing application-table RLS.
- Only three identity tables grant authenticated direct `SELECT`, with explicit owner/membership policies. No other application table exposes direct client DML. Anonymous `SECURITY DEFINER` grants are restricted to the intentional guest-order and public Discover RPCs; malformed anonymous actions were refused. Authenticated `private` grants are limited to `create_owned_business` and `set_cloud_business_type`, both requiring internal checks. All security-definer functions specify `search_path`.
- Latest advisers: security **2 anon-definer WARN + 16 authenticated-definer WARN**, **69 no-policy INFO** (primarily intentionally RPC-only tables); performance **113 unindexed-FK INFO + 44 unused-index INFO**; health **0 findings**. Warnings require change-by-change code and authorization review, not indiscriminate revocation or 113 index creations. The absence of real users prevents two-account ownership tests.
- Payment intents/events remained empty, and payment ledger client table reads are denied. Connected Commerce and payment execution still require separate feature flags/credentials/approvals; schema presence is not activation.

## Executable source-controlled DBA gates
- `qa/supabase-hosted-release-gate-20261124.sql`: **PASS on staging**. Read-only, checks all 43 hosted migration versions/names/Git blob SHAs, RLS, Data API table grants, expected policies, privileged function grants and pinned search paths, and all six resulting schema objects.
- `qa/supabase-production-preflight-20261124.sql`: **PASS on production (read-only)**. Confirms the exact 37-entry pre-upgrade history, 59 baseline tables, required functions and tables, RLS, and absence of partial six-migration objects. It intentionally refuses a changed baseline.

## Production promotion — BLOCKED, not silently authorized
The project uses Supabase Free. **Do not assume a downloadable or restorable automatic backup or PITR.** Supabase recommends offsite logical exports for Free projects: https://supabase.com/docs/guides/platform/backups

Before running even the additive six SQL files against production:
1. Obtain a fresh, encrypted, off-database `pg_dump` of the **whole real project**, including business data and auth records, store the SHA-256 and location securely, and prove restore to a disposable isolated PostgreSQL environment. Supabase Storage objects need separate handling; database dumps only include Storage metadata.
2. Verify any Free-plan project limits/costs and identify a low-traffic window; coordinate application writers and establish a recovery contact. Never copy actual production customers into this synthetic staging project.
3. Obtain explicit approval identifying **production project `qfyydfxwvifdvffdfgeu`**, migration names and execution window. Current owner direction authorizes DBA engineering, but does not itself certify a tested full backup or an interruption window.
4. Re-run the committed production read-only preflight. Apply the six **exact repository SQL files** serially; after each verify expected objects, privileges, migration record, data invariance, and Supabase security/health advisers. Stop at the first anomaly, do not automatically replay/skip.
5. Keep Connected Commerce and payments disabled unless separately approved. Run real Supabase Auth two-account/role/tenant checks and a controlled rollback/recovery drill (security repairs are forward-only). Freeze deployment only after evidence and owner acceptance.

## Remaining external dependencies
- **Production backup + independent restore proof** (tooling in this connected environment does not expose `pg_dump`, raw database credentials, or the Supabase Backup Management API; staging transactional rollback is not disaster recovery).
- **Owner-confirmed production change window**; verify backup and preserve existing live records. No production SQL writes until those conditions hold.
- **Two genuine Supabase Auth accounts and field authorization testing**, ideally one owner and one unrelated/attendant account; synthetic SQL role probes cannot replace signed-session acceptance.
- **Platform-managed auto-RLS trigger discrepancy**, if strict infrastructure parity is required, belongs to Supabase project administration, not an application-owned migration. The fail-closed SQL gate mitigates the immediate omission.
- **Independent security and operational acceptance** before release. Linter warnings on intentional security-definer RPCs still need review of all reachable actions; zero unexpected grant in a static audit does not guarantee a bug-free implementation.
- **Production-scale query plans** should drive foreign-key index additions; the current staging database is empty, making unused-index and performance warnings inconclusive.

**DBA verdict:** staging SQL migration chain/release-gate engineering verified; production migration and real-environment acceptance pending verified backup and explicit cutover approval. Product deployment remains **NO-GO**.

### Newly identified default-grant exposure on future objects
Both existing Supabase projects configure `postgres` and `supabase_admin` with broad default table/sequence/function grants in `public`. Production also has an automatic RLS event trigger; staging does not, and the connected staging DBA role is not superuser and cannot govern `supabase_admin`'s default ACL. The **current** 72 staging and 59 production public application tables remain RLS-protected. Treat every future public `CREATE TABLE` and Data API `CREATE FUNCTION` as security-sensitive: creation, explicit RLS, grants/revokes and function permission checks must be committed atomically in reviewed migrations, and the hosted gate must pass before exposure. Do **not** change platform-owned default ACLs or install a made-up superuser event trigger without a dedicated reviewed migration and Supabase platform approval.

### Connected GitHub CI at initial draft PR creation
A branch-wide security workflow's **full-history** secret scan failed on an unclassified candidate in `qa/resend-email-adapter.test.mjs`, outside the three DBA PR files and absent from `main` at this checkpoint. This is **not** an endorsement that the candidate is a secret or safe synthetic data; triage must inspect the originating branch without revealing the value. Other CI jobs may still be pending. Do not mark the PR fully CI-green from the hosted SQL checks alone.
