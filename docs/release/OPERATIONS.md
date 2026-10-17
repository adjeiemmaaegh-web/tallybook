# Local operation, validation and future staging

Release state: **NO-GO / INCOMPLETE**. The owner authorized local testing, mock payments and configurable taxes off by default. No external deployment or live payment action is authorized.

## Cross-tab recovery/browser requirement (current source)

Before initiating backup restore or deleting a company, use a secure-context browser with `navigator.locks` / Web Locks support and ensure other Tallybook tabs have stopped editing. The operation will fail closed when a browser has no Web Locks support, or another tab owns the lock. Ordinary offline assistant writes still work without Web Locks, but destructive two-database operations cannot run safely there. Startup detects pending journals and requires exclusive Web Locks recovery; never delete the marker manually or clear browser storage as a workaround. All multi-tab crash, IndexedDB and hardware acceptance remains unverified; **do not use a live business dataset**.

## Local use

Use the Node version in `.node-version` and pnpm version in `package.json`. Run `pnpm install --frozen-lockfile`, then `pnpm dev --host 127.0.0.1`. For the production PWA, run `pnpm build`, then `pnpm preview --host 127.0.0.1`. Localhost is required for browser secure-context features. Browser tests use isolated contexts and synthetic data; they never open the owner's normal browser profile.

New business setup defaults to Ghana, GHS and Mobile Money. Owners can change country, currency and provider labels. Labels record payment methods accepted manually; they neither connect nor approve an online gateway. Only record a manual payment actually received. An absent cloud account must not prevent local retail.

Tax is off by default. In Business → Tax settings, an authorized owner can supply registered status, an optional registration number, a label, a rate and inclusive/exclusive pricing. The implementation supports one rate for all items, calculated after manual and loyalty discounts and rounded half up once per invoice. It does not implement exemptions, compound levies, jurisdiction-specific statutory invoices, tax returns or input-tax credits. Enable only for a business whose owner has established that these supported rules apply. No Ghana rate is inferred. Receipts snapshot the rule and tax amounts; later changes affect future sales. A stale checkout tax review is rejected. Historical transactions without tax evidence remain historical and are not backfilled.

Positive inventory corrections with no purchase evidence carry unknown cost. Legacy stock has unknown opening cost; current product cost is never substituted. COGS stays unavailable when evidence is incomplete. Backdated records before the ledger cutover do not become verified history. Review Financial intelligence for cost reconciliation and recorded tax; these are management figures, not full accounts or statutory profit.

## Exact validation commands

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test
pnpm exec playwright test --config playwright.offline.config.mjs
pnpm audit --json
pnpm licenses list --json
node scripts/audit-write-paths.mjs
```

The full Node command requires Linux/POSIX file permissions and OpenSSL for its TLS test. Windows failures are retained, not waived. CI configuration is supplied for Ubuntu but has not run remotely. There is no configured lint script; TypeScript and tests do not constitute a comprehensive lint or security audit.

Mock payments: `node --test server/tests/paymentGateway.test.mjs`. The contract factory defaults to disabled; only `{mode:'mock', environment:'local-test'}` or `local-development` creates a simulator. Its data is ephemeral, marked `simulated:true`, has no HTTP endpoint and never writes the retail ledger. It exercises intent idempotency, company isolation, timeout, failure, capture simulation, partial/full refunds and chargebacks. It does not verify a provider, a signed webhook, a bank settlement or persistent crash recovery. A production-mode mock configuration is rejected.

## Backup and recovery

1. Export each company's encrypted backup through the existing Backup screen before upgrading. Keep the passphrase separately. Confirm the company name and export time. Never use the private developer source ZIP as a customer-data backup.
2. Preserve the previous app artifact and browser profile before first opening the new schema. Schemas 26 and 27 add inventory cost events and supplier payable entries respectively; they do not backfill missing historical financial evidence. Do not reopen an upgraded browser database using older-schema software.
3. Restore into an isolated browser profile first. The main database records restore in one transaction. Validate company ownership, stock quantities, sales/receipts, repayments, cost events and tax snapshots. Restored sync consent is deliberately disabled until the owner opts in again.
4. Assistant conversation storage uses a separate database. Source-implemented preimage journals coordinate backup restore and company clear with the main database, and newer journals record exact expected before/after assistant states. Unexpected edits now cause startup recovery to stop with the marker preserved; **a global cross-tab lock and verified browser crash-atomicity are still missing**. Preserve a verified pre-operation backup and do not clear storage or manually delete the marker to force startup.
5. If validation fails, stop writes. Preserve both exports and logs. For rollback, use the previous artifact with its pre-upgrade browser profile/backup, not the newly upgraded database. Reconcile transactions recorded after the snapshot before resuming. Do not silently discard them or modify immutable cost events to force a report to balance.

Physical printer/scanner/camera, Safari/mobile hardware, WebAuthn enrollment/revocation, large-database and power-cut drills remain unexecuted. Desktop Chromium at a phone-sized viewport is not a physical-phone pass.

## Optional local POSIX identity-store safety (2026-10-10)

For **server-only, disabled-by-default development identity adapters**, put the credential JSON, session JSON, server directory snapshot and enrollment registry in private owner-only directories (`0700`); all files must be regular single-link files with mode `0600`. Parent-directory symlinks, symlink files, hard links, and group/world-readable files are rejected. The session and enrollment write adapters create exclusive `<filename>.lock` files. Multiple Node processes can now serialize local issuance/enrollment, but stale locks fail closed and must be investigated by a trusted operator before manual removal. Never automatically delete locks or weaken modes to restore service; verify no live writer or external process holds the path. This is **not** a production cross-host identity store, nor general filesystem ACL support on Windows. See `SECURITY_CONTINUATION_2026-10-10.md`.

## Staging after explicit approval

Read `STAGING_PROPOSAL.md` and `staging-manifest.json`. Keep all sync mutation flags false initially. The example manifest contains no secrets and is not an automatic deployment script. Use direct TLS; configure `TALLYBOOK_TLS_CERT_FILE` and `TALLYBOOK_TLS_KEY_FILE` using restrictive POSIX permissions. Start the built app with `NODE_ENV=production node dist/index.js` after placing environment values securely. Production mode defaults to HTTPS and must fail when certificates are missing. Verify rejection of forged forwarding headers.

Before enabling any optional access test, create synthetic credential/session/enrollment records using the documented adapter formats, with owner-only files. Exercise unauthorized, expired, revoked and foreign-company requests. Preserve every test result. Never enable stock/financial replication by relaxing file permission or TLS guards to make tests pass.

Recovery drill, only after host approval: snapshot the service data and artifact; run synthetic writes; interrupt/restart; verify durable records and duplicate rejection; restore the snapshot into an isolated instance; reconcile; switch the application back to the previous artifact and matching data snapshot; verify offline clients and service-worker behavior. Record RPO/RTO measured by the drill, not assumed targets.

Monitoring to implement and verify before release: process health, TLS expiry, disk capacity, authentication failures, rejected events, journal corruption, backup failures, restore duration and application errors. Do not log secrets, payment credentials or plaintext exported customer records. Alert delivery is not currently configured or tested.

## 11 October 2026 — interrupted backup restore (source-implemented, unverified on browsers)

Backup restore now persists a durable `appMeta.restoreRecoveryJournal` marker before changing the separate assistant database. On the next Tallybook startup, the database readiness provider attempts idempotent recovery of the assistant preimage *before* declaring the application ready. If successful, the marker disappears. If recovery cannot verify identity or encounters an error, Tallybook blocks startup instead of guessing whether money records were committed. Keep the device and data intact, preserve the error details and consult a qualified operator; **do not delete the journal, clear browser storage, reinstall or restore another backup merely to get past the error**. Full IndexedDB/client interruption verification is still required before treating this as a production recovery mechanism. No remote repair can be assumed for this offline-first application.

## 11 October 2026 — journal stale-write protection (source-implemented, client-unverified)

New recovery journals store exact before/after assistant snapshots and reject concurrent changes outside that pair of states. The assistant apply step also checks its expected preimage in the same assistant IndexedDB write transaction. If startup reports **unexpected assistant edits**, preserve the browser profile, both database files, recovery marker and prior backups; stop other tabs from writing. A qualified operator must reconcile the data and journal before attempting another recovery. Do **not** delete the journal or repeatedly clear local data. Older saved markers without an expected postimage remain readable, but a changed assistant state cannot be replayed automatically without risking newer writes; such markers intentionally fail closed. This is **not** a proof of full two-database atomicity or cross-tab safety. Dexie multi-tab, quota, browser interruption, real client/build checks have not run. See `docs/release/JOURNAL_CAS_CONTINUATION_2026-10-11.md`.


## 17 October 2026 — Run 20 final source-development operations addendum

Source `v19/run20-operations-release-development-20261017` introduces an owner-only **More tools → Release operations** (`/release-operations`) view with nonmutating recovery-marker, schema metadata, verified local backup receipt, browser storage, and optional company-scoped financial-integrity diagnostics. It stages 20 exact-source evidence worksheet gates and a hash-bound offline NO-GO export. No new staging endpoint or monitoring collector is activated.

Owner-operated future tools (NOT executed): `scripts/run20-inspect-source-config.mjs` to inspect local source flags (read-only), `scripts/run20-verify-release-worksheet.mjs --file <file> --sha <exact-git-sha>` and `scripts/RUN20_WINDOWS_RELEASE_EVIDENCE_VERIFY.cmd` for only file hashes/shape. Neither is a replacement for complete exact-head tests, physical UAT, independent issue closure or authenticated owner signoff. See `RUN20_STAGING_OPERATIONS_ROLLBACK_2026-10-17.md`, `RUN20_FULL_TRACEABILITY_AND_BLOCKERS_2026-10-17.md`, and `RUN20_FINAL_SOURCE_DEVELOPMENT_AND_NO_GO_2026-10-17.md`.

**No external account, staging, payments, cloud financial sync, public commerce, production deployment, or `main` merge is authorized; V19 remains NO-GO.**
