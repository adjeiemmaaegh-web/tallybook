# V44 device vault and staff provisioning checkpoint — 2026-10-27

This is a development checkpoint on `development/v19-unified-reconciliation`. **Production decision: NO-GO.** No live-project migration, deployment, payment enablement or pull request was made.

## Delivered

- A separate IndexedDB device-key vault stores a non-extractable Ed25519 private key outside portable business backups. Its key scope includes Supabase origin, Auth user, cloud/local company, staff, shop and device. Creation is add-only, so concurrent creation cannot silently replace a key. The production guard checks the current Supabase user and local company/staff before key operations. The owner invitation proof uses the server's domain-separated message and an exact receipt is required before the key becomes active. A lost key requires owner revocation and a fresh invitation; hardware attestation is not claimed.
- An unmounted, private owner-confirmed staff/shop provisioning service binds an existing Auth member to local staff and shop IDs in a serializable transaction. It rechecks the live Auth session and company ownership, denies conflicting/inactive bindings, and appends an audit row for changes. It does not create Auth users or silently promote an attendant.
- The additive audit table was migrated only to disposable Supabase project `lmneuqxfyxplrxjswpma` as `test_uuid_staff_shop_binding_audit`. The live project `qfyydfxwvifdvffdfgeu` was unchanged. Post-migration inspection found 15 public tables, 15 with RLS, zero `anon`/`authenticated` table-write grants, and zero audit rows because no real test users have been provisioned. The security advisor reports 11 informational `rls_enabled_no_policy` findings on intentionally server-only tables; the audit table is among them and has revoked browser grants. [Advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Exact verification

- Focused client vault and production-scope guard: 2 tests passed. The first attempt failed before tests ran with a Windows sandbox Temp rename `EPERM`; rerunning with `TEMP` and `TMP` pointed to a writable workspace directory passed. This is a runner environment issue, not a product assertion.
- UUID PGlite schema/coordinator integration: 2 tests passed, including owner provisioning, exact retry, one audit record and unauthorized cases.
- Chromium auth browser suite: 4 tests passed, including key persistence and signing after page reload. Raw log: `docs/central/evidence/v44-browser-key-vault-2026-10-27.txt`.
- TypeScript semantic check and production build passed. The build has pre-existing bundle size and dynamic-import warnings. Full client/native suites last passed at V43 (1,021/1,021 and 429/429); those results predate V44 and are not represented as fresh runs.

## Still required

1. Create two real disposable-project Auth accounts through supported Auth flows, one owner and one attendant. Run provisioning and invitation redemption with those sessions; test Data API RLS denial, wrong-company access, key/session revocation and signed-sale upload through the actual HTTPS transport. The current signed-sale route remains disabled and the new provisioning service is not mounted. No synthetic `auth.users` rows were inserted.
2. Integrate explicit owner/attendant onboarding, key recovery/rotation and manual delivery UI, then extend remote ingestion to approved refund, reversal, repayment, purchase, supplier and shift events. Legacy rows lacking provenance remain local.
3. Run sanitized v30–v34 customer-backup migration comparisons and Windows/Android owner/attendant acceptance. Obtain an Ubuntu security suite run after GitHub's billing/spending Actions pre-check is resolved. Complete the remaining 82-unit engineering register and Watchdog contract gates before a release decision.

Reproduce locally from the repository root with lockfile dependencies installed:

```powershell
$env:TEMP=(Resolve-Path .).Path+'\\.test-tmp'; $env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
npm test -- --run src/features/sync/deviceKeyVault.test.ts src/features/sync/verifiedDeviceKeyScope.test.ts
node --test qa/central-sale-uuid-schema.test.mjs
node_modules/.bin/playwright.cmd test --config playwright.auth.config.mjs
npx tsc --noEmit
npm run build
```
