# Tallybook production-readiness assessment — 2026-11-05

Baseline: `main` @ `8f29671` (cloned fresh). Toolchain: Node 24.19.0, pnpm 10.34.0, `pnpm install --frozen-lockfile`.

**Verdict: NO-GO for production release.** The website is safe for stakeholder demos of sign-in, business creation and invitations. However, the owner-to-attendant journey the release depends on does not exist end to end yet. That is an architecture gap, not a bug.

## Update — same day: decisions taken and work done

As lead/manager I chose the **server-authoritative shared shop** for multi-user businesses. The earlier QA-project path (device enrollment, signed sale pull, remote replay into each owner's IndexedDB) has been in progress since 13 October. It has produced no working journey, and its own handover lists replay, conflict handling and hosted upload as unbuilt. The new path reuses the pattern already live in production: one session-bound SECURITY DEFINER operation, no browser table access.

| Item | Status |
|---|---|
| B1 attendant sales reach the owner | **Built.** `supabase/migrations/20261105100000_shared_shop_ledger.sql` + `public.tallybook_shop` RPC; `/shop` screen for owner and attendant |
| B2 cloud store assignment | **Built.** `shop_stores`, `shop_store_assignments` (cascades on membership revoke) |
| Exactly-once sale after retry | **Built.** Unique `(business, submission_key)` + request hash; write-ahead outbox in the browser; retries on reconnect, every 20 s while waiting, and on return to the app |
| Stock, payment, receipt, financial records | One transaction: stock rows locked, oversell refused, server prices the sale, sequential receipt numbers, append-only history (triggers block UPDATE/DELETE) |
| Permission enforcement | Checked at write time on the server: not assigned / archived store / revoked member / other business / signed-out session all refused, including for sales queued offline before the change |
| Invitations | Owner invites by **email** (no more UUID copy-paste); attendant enters the one-time code; members are shown by email |
| B4 hard-coded production URL | **Fixed.** The database operation is the default on every project; only an explicit QA endpoint uses HTTP |
| Voice input | **Fixed 2 bugs.** Words lost on iOS Safari/early stop ("didn't hear anything"); duplicated words on Android Chrome |
| Business setup UX | Dead end for attendants removed ("Open shared shop"); email instead of account ID; consistent buttons |
| B3 migration drift | **Open.** Needs the live project's `supabase_migrations.schema_migrations` to place the invitation SQL under its recorded version |
| Applying to Supabase | **Open.** Needs dashboard access: apply to test project `lmneuqxfyxplrxjswpma`, run the hosted journey with 2 demo accounts, then production `qfyydfxwvifdvffdfgeu` |
| Frontend deploy | **Open.** `vercel.json` disables git deploys; deploy after the migration is live (until then `/shop` says the server doesn't support it yet) |

New evidence: `qa/shared-shop-ledger.test.mjs` runs the full owner→attendant journey on real PostgreSQL (PGlite). `client/src/cloud/shopOutbox.test.ts` (6) and `client/src/pages/SharedShopPage.test.tsx` (6) cover the client. Screens were reviewed at 1280 px and 390 px in Edge.

Known limits of v1, by decision: single-tender sales, no attendant discounts or credit sales in the shared shop, and no refunds yet. Refunds are the next financial feature. An offline attendant can't see stock changes made by others until reconnecting; a queued sale that would oversell is refused on arrival and shown for review, never silently dropped. Invite-by-email tells the owner whether an email has an account, which is an accepted enumeration trade-off limited to business owners.

## What was verified earlier today

| Check | Result |
|---|---|
| `pnpm check` (tsc) | Pass |
| `pnpm build` (Vite + server bundle) | Pass. Main chunk 1.17 MB (353 kB gzip) |
| Invitation/membership SQL on real Postgres (PGlite): `qa/stakeholder-membership-rpc`, `run3-membership-company-scope`, `cloud-membership` | 3/3 pass |
| Full vitest suite | 137 files / 1067 tests pass |
| Live site `tallybook-eight.vercel.app` | Loads the sign-in gate, no console errors, HSTS/nosniff/DENY/no-referrer headers present |
| Signed-in hosted journey | **Not run.** It needs real demo accounts. Creating accounts on the production project from automation is not appropriate, so the owner has to supply or sign in to the demo accounts |

## Blocking findings

### B1. Attendant sales never reach the owner (architecture)
- Cloud membership is identity only. The UI says so itself: `CloudBusinessPanel.tsx:135` ("account membership only, not a local staff unlock. Record synchronization is not active yet") and `Run3MembershipPanel.tsx` ("No sync or local POS permission is granted"). `companyAccessPolicy.ts:30` has the same statement.
- All sales, stock, payments and receipts are written only to the device's IndexedDB (`client/src/features/sales/sales.ts`, `completeSale`).
- `features/sync/supabaseUploader.ts` has no transport ("transport itself is NOT supplied by this module"), and nothing in the app calls it.
- Vercel serves only `dist/public`. `server/*` (central ingest, device enrollment, sync routes) is **not deployed**.
- Effect: an attendant who accepts an invitation and makes a sale updates *their own browser's* ledger. The owner's stock, payments and reports never change. "Updates stock, payment, receipt and financial records exactly once" cannot be proven because the shared record does not exist.

### B2. No cloud store assignment
Production cloud tables (`businesses`, `business_members`, `company_member_invites`, `company_membership_audit`) have no shop or store dimension. Store assignment exists only locally (`storeAssignments` in Dexie). A `tb_shop_assignments` table exists in `001_core_tables.sql`, but no client code uses it.

### B3. Migration drift: the repo is not the source of truth for production
- The invitation schema was applied to production from `docs/security/stakeholder_membership_candidate.sql`, not from `supabase/migrations/`. A fresh environment built from `supabase/migrations` would have no invitation tables or RPC.
- `001`–`003` define a parallel `tb_*` schema whose header says "Apply only to isolated test project". `supabase/README.md` says these filenames match production versions. Both statements need to be checked against the live project, using `supabase migration list` and `\dt public.*`.

### B4. Production project URL hard-coded in client logic
`client/src/cloud/run3MembershipClient.ts:32` picks the RPC path or the HTTP path by comparing `VITE_SUPABASE_URL` with the literal production URL. A staging or preview project therefore uses a different code path than production, so it can't validate production behaviour. Fix: replace the literal comparison with an explicit env flag, e.g. `VITE_TALLYBOOK_MEMBERSHIP_TRANSPORT=rpc`.

## Non-blocking findings
- **Invitation UX:** the owner must type the attendant's raw auth **user UUID**. The attendant has to find and send it out of band, which is not workable for real users. Consider email-targeted invitations that are resolved server-side.
- **Local exactly-once is solid:** `completeSale` dedupes on the unique `[businessProfileId+submissionKey]` index and refuses a reused key that carries a changed cart or payment. `SalesPage` keeps a pending-checkout journal for recovery. This is a good base for server-side idempotency.
- **No Content-Security-Policy** header in `vercel.json`. Add one in report-only mode first; it has to allow Supabase and Google OAuth.
- **Bundle size:** `index-*.js` is 1.17 MB. Code-split the routes.
- **`vercel.json` has `git.deploymentEnabled: false`.** Deploys are manual, so confirm who deploys and from which commit.
- **Documentation sprawl:** 147 root-level `.md/.json/.txt/.cmd` files and 223 under `docs/`. Many contain conflicting "latest/status" claims. Move them to `docs/history/` and keep one current `STATUS.md`.
- Open items from the brief are confirmed still open: offline returning-user unlock, encrypted ledger storage integration, migration of existing browser data, and full regression run.

## Recommended path to release (in order)
1. **Decide the sync architecture** (B1/B2). Option A: attendants write sales directly to Supabase through one `record_sale` SECURITY DEFINER RPC that is session-bound and idempotent on `(company_id, submission_key)` and checks membership plus store assignment in-transaction, with an offline outbox that replays to it. Option B: deploy the existing `server/` central-ingest stack as a separate service. Option A fits what is already live and is much smaller.
2. Put every schema change into `supabase/migrations/` with versions matching production (B3). Add a CI step that applies the migrations to PGlite or a disposable Postgres and runs `qa/*.test.mjs`.
3. Implement cloud stores, store assignment and the `record_sale` RPC, with negative tests: wrong store, revoked attendant, replayed key with a different payload, cross-company access.
4. Run the hosted journey with two demo accounts on a **staging** Supabase project, then repeat it on production.
5. Then: offline unlock, encrypted storage, local-data migration, docs consolidation.

## Test suite
`pnpm exec vitest run`: **137/137 files, 1067/1067 tests passed**, exit 0, 724 s on Windows 11 / Node 24.19.0. The default reporter prints nothing until the run ends, so use `--reporter=verbose` locally to see progress. These are unit and integration tests against fake IndexedDB. They do not cover cross-device sync (B1), which has no implementation to test.
