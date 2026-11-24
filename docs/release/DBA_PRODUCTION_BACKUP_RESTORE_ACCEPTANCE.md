# Tallybook production database backup and recovery acceptance

**STATUS: UNEXECUTED. No real backup has been produced, downloaded, restored or verified by the connected DBA tools.**

## Scope and threat model

Production Supabase project: `qfyydfxwvifdvffdfgeu` (Free plan). The migration target is **production**, not the empty Tallybook Staging project `yfbtwuptiudmeferjgko`.

Supabase's current Free-plan documentation recommends periodic off-site `supabase db dump` exports. Do **not** assume PITR, a downloadable hosted backup, or a rollback to pre-migration customer data. Never copy production customer records into Tallybook Staging, which must remain synthetic-only.

## Operator prerequisites

- Authorized operator on a trusted computer with the **current Supabase CLI and Docker**, or a compatible isolated PostgreSQL client and destination. Check `supabase --version` and `supabase db dump --help` on that machine before running anything.
- Production **database connection string obtained privately from the Supabase dashboard's Connect UI**. Do not put the password, access token, or connection string in ChatGPT, GitHub, issue comments, shell history, logs, or PRs. Use secure environment-secret injection. Do not use or expose the `service_role` key as a substitute for a database connection credential.
- Encrypted, restricted, **off-device/off-site** storage with known owner, retention and access controls. Enough disk space for at least two copies and a disposable restore target. This account's Free-plan project quota is already occupied, so do not create another hosted project without a separate cost/limit decision.
- Freeze or explicitly identify in-flight application writes during cutover and record the exact schema/app release commit.

## Create a logical export from production (documented commands)

Once the production connection URL has been securely injected as `PROD_DB_URL`, perform from a private working directory:

```sh
supabase db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$PROD_DB_URL" -f schema.sql
supabase db dump --db-url "$PROD_DB_URL" -f data.sql --data-only --use-copy
```

This is a **base logical export**, not evidence of a fully recoverable Supabase service. Supabase CLI intentionally excludes managed schemas such as `auth` and `storage` from its standard schema/data dumps. Separately inventory and capture **auth.users, auth.sessions, authentication settings, storage metadata/actual files and any private/custom schemas** using a supported secure process and document their restoration compatibility. Supabase Storage object bytes are not included in Postgres-only exports. Edge Function code and required deployment secrets also require independent redeployment records; never include secret values in this repository.

For a full DB snapshot, a directly compatible, securely authorized `pg_dump` may be used **in addition** to the CLI's filtered dumps, but it can include Supabase-managed objects that cannot be blindly restored. Test the exact restore procedure against an isolated target running compatible PostgreSQL/Supabase versions. Do not attempt `pg_restore --clean` into production as a validation test.

For each backup artifact, capture its filename, size and SHA-256 via a trusted local hashing tool. Move the encrypted bundle off-site, verify the SHA-256 on the destination, and record time, owner and secure location **without revealing credentials or customer data**.

## Independent restore drill (mandatory)

1. Use a disposable, isolated, **nonproduction and non-staging** PostgreSQL/Supabase instance, private networking, and no webhook, mail or external worker integrations.
2. Follow the current Supabase restore documentation appropriate to that target; restore roles/schema/data **and separately captured managed/auth/storage portions** according to tested compatibility. Preserve user UUIDs, memberships, relationships, and audit evidence.
3. Validate that a schema equivalent to the pre-upgrade production baseline is present. Compare counts and checksums for key business, user, sale, tender, refund, and audit objects; check FK integrity and active RLS/grants. Do not publish individual customer records or raw hashes of secret values.
4. Test an owner sign-in and a separate unrelated account, tenant isolation, a read-only sale/report query, and a restore of at least one backup-held Storage object if Storage is in use.
5. Produce a **signed/dated acceptance record**: export time, storage media, cryptographic SHA-256s, target isolated instance type, restore commands/revisions, counts, security/privacy checks, observed errors and completion verdict. A backup file existing without a proven successful restore is **not enough**.

## Production migration cutover

Only after the independent backup/restore drill is **PASS**, a low-traffic change window is arranged, the latest **read-only** `qa/supabase-production-preflight-20261124.sql` passes against `qfyydfxwvifdvffdfgeu`, and the owner explicitly approves this exact production change:

1. Apply the six exact `supabase/migrations/*.sql` files in dependency order as detailed in `docs/release/MIGRATION_STAGING_PLAN_2026-11-22.md`.
2. Verify each migration's recorded version, expected objects, RLS, permissions, data invariance, errors and Supabase security/health advisers before proceeding. Halt immediately on a mismatch.
3. Preserve all existing customer data. Keep payments and Connected Commerce disabled until their external/legal/product gates are authorized. Do not deploy the Telegram cron route or send alerts as part of the database change.
4. Keep the pre-upgrade data export available throughout, with a recovery owner; security repairs are forward-only and some financial/consent data-bearing rollback scripts fail closed. Do **not** automatically execute a destructive rollback.
5. Run real Supabase-issued JWT owner and unrelated-account acceptance in the approved window; then record final hosted history, data counts, source SHA and release gating status.

## Connected-tool limitation

The connected Supabase tools can read schema/history, execute SQL, inspect Edge Functions and advisors, **but do not expose the project's private DB password, `pg_dump`/CLI export, backup-download or independent restore tools**. Accordingly, the DBA cannot truthfully attest this entire backup/restore step as completed through this connection. The staging SQL savepoint rollback rehearsals do not substitute for disaster-recovery testing.

### Official source references
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
