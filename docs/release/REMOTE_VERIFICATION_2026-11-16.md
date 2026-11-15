# Tallybook — remote release verification (16 November 2026)

**Scope:** evidence-only, no real shop sales, no customer data reads, no production database mutations, no device resets. The production deployment is a controlled-pilot candidate, **not** unrestricted commercial acceptance.

## Pinned reference
- GitHub: `adjeiemmaaegh-web/tallybook` main `175204d15c6d77a3ae9cadee505dfa1cf5821ac6`.
- Vercel production: `dpl_GNFjqmKWZZU1YnREPEBTUas2H3Zp`, **READY**, exact commit `175204d15c6d77a3ae9cadee505dfa1cf5821ac6`.
- Production alias: https://tallybook-eight.vercel.app .
- Release validation: https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/43752226476 — **success** at pinned SHA.
- Security code audit: https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/43752226533 — **success** at pinned SHA.
- Supabase project: Tallybook, `qfyydfxwvifdvffdfgeu`, **ACTIVE_HEALTHY**, 37 recorded applied migrations, most recently `telegram_daily_summary`.

## Read-only production access-control audit
Queried `pg_class` and `has_table_privilege()` for all `public.shop_%` ordinary/partitioned tables without reading business rows.
- 47 shop tables inspected for the `anon` role; **zero** granted direct SELECT/INSERT/UPDATE/DELETE; **zero** without RLS.
- 47 shop tables inspected for the `authenticated` role; **zero** granted direct SELECT/INSERT/UPDATE/DELETE; **zero** without RLS.
- This is a direct-table-access result, **not proof** that privileged RPCs cannot leak data or permit unauthorized operations.

Security advisor findings at review: 56 informational RLS-without-policy findings (intentional function API design, still review grants); 1 warning for anonymous execution of `tallybook_guest_order` (designed public bearer-token flow, but independently probe abuse/rate-limiting); 11 warnings for authenticated SECURITY DEFINER functions; 1 warning: **leaked-password protection disabled**. URLs:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Automated evidence (not field acceptance)
The pinned GitHub Release validation job completed every step successfully, including native/server regressions, client/IndexedDB tests, TypeScript, build, Chromium functionality, auth negative cases, fresh-start, 320/360px phone layout, accessibility, built-app offline acceptance, performance sampling and dependency audit. The repository includes crash/recovery fixtures, backup restoration tests and receipt layout tests.

**Evidence boundary:** Automated/headless tests do **not** establish physical Android/iOS offline reliability, real employee logins, printer output, live mobile-money/card settlements, a successful hosted backup restore, or operating hours in a genuine shop. A Vercel READY deployment does not establish an independent HTTP/browser smoke check: external network access from this execution environment could not resolve the production hostname.

## Release-risk register
1. **Blocker — physical owner/attendant signoff:** separate phones, account switching, cashier attribution, refund requests, quotations, accounts, controlled offline/reconnect scenarios. No actual physical test performed.
2. **Blocker — hosted backup restoration:** confirm backup schedule/retention/PITR plan and successfully restore a safe copy into an *isolated* destination, never over production. Provider backup settings are not exposed through the available connector.
3. **Blocker — production authentication setting:** enable Supabase leaked-password protection; verify site URL/allowlisted redirects and password recovery on a real phone. No change made to hosted Auth configuration.
4. **Blocker — physical printing/scanning:** verify printer, barcode scanner and (if installed) cash drawer on supported real hardware.
5. **Feature boundary — electronic collection:** manual tender recording is not evidence of actual provider settlement. The inspected `server/paymentGateway.mjs` explicitly says local mock or disabled; **do not claim a live MoMo/card processor**. A real payment-provider deployment requires a separate authorization, credentials, compliance, supported device, webhook and reconciliation acceptance.
6. **Security improvement — device ledger:** the standalone IndexedDB ledger is not yet encrypted at rest, though specific queues/caches are sealed.
7. **Performance/maintainability:** split oversized shared-shop page and continue to monitor low-spec hardware only after pilot evidence, without destabilizing release.

## Safety and handoff
- **Do not** turn on `VITE_TALLYBOOK_FRESH_START_EPOCH`: it can erase browser-local data without a verified backup. The production deployment made no such change.
- **Do not** restore into or reset the original shop/device.
- **Do not** put customer names, phone numbers, auth tokens, real receipts, backup exports, staff PINs or raw production data into public GitHub issues/PRs.
- Continue with [Field acceptance runbook](FIELD_ACCEPTANCE_2026-11-16.md). All physical/owner-only gates remain **NOT RUN / BLOCKED**, not passed.
