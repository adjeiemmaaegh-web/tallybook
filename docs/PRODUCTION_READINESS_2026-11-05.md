# Tallybook production-readiness assessment — 2026-11-05

Baseline: `main` @ `8f29671` (cloned fresh). Toolchain: Node 24.19.0, pnpm 10.34.0, `pnpm install --frozen-lockfile`.

**Verdict (end of day): READY FOR STAKEHOLDER ACCEPTANCE on the live site, not yet a commercial release.** The owner-to-attendant journey is built, deployed and verified on production Supabase (rollback dry run, 7/7 stages). Remaining before calling it commercially released:
1. hands-on acceptance with two real accounts on two phones
2. enabling leaked-password protection in Supabase Auth
3. ~~refunds in the shared shop~~: built and live, see below
4. ~~migrating existing browser data into the shared shop~~: built as an opening-balance move and live, see below
5. the remaining open items from the brief: offline returning-user unlock, encrypted local storage, and consolidating the historical docs

*Morning verdict, kept for the record: NO-GO. The owner-to-attendant journey did not exist end to end.*

## Update — the full till in the shared shop (live on production)

**Why:** a competitor review (Stockdey) showed the biggest gap was having two systems. The shared shop synced staff and stores but was a bare till; the phone's own books had credit and discounts but only for one person. The shared shop now has both.

Built in `supabase/migrations/20261105120712_shared_shop_full_till.sql`. Every rule is enforced on the server.

**Discounts**
- Applied per sale, and a reason is required.
- The owner can always give one. An attendant only can if the owner allowed it, up to that attendant's own maximum percentage (Team tab).
- The discount is spread across the lines, so refunds pay back exactly what was paid, rounding included.

**Split payments**
- Up to 5 parts per sale (cash, mobile money, card, credit), which must add up to the total.
- Change comes only from cash, and mobile money needs its reference.

**Credit**
- Only to a named customer of this business, within the credit limit the owner set.
- Only the owner, or an attendant the owner allowed, can sell on credit.
- Attendants can register a new customer, but only the owner sets how much they may owe. Until then the customer can't buy on credit.
- Balances change only through permanent entries: a credit sale, a repayment, or a refund.

**Repayments**
- Each repayment is recorded once, even if retried.
- A repayment can't be more than what the customer owes.
- Each customer has a statement (Customers tab).

**Refunds on credit sales:** a refund first reduces what the customer still owes on that sale, and the rest goes back as money (cash first).

**Compatibility:** sales queued on phones in the earlier single-payment format still go through, using the earlier duplicate-check calculation.

**Evidence**
- `qa/shared-shop-full-till.test.mjs`: 4 tests on real Postgres.
- The earlier ledger and refund/import tests now also run with this migration applied.
- 5 new screen tests in `SharedShopPage.test.tsx`.
- Test project: migration applied, and the hosted dry run extended with a full-till stage gave `DRYRUN PASS: 10 journey stages verified`.

**Live**
- Production database: applied with owner approval as `20261105120712`. All 8 function bodies match the repo (comment- and whitespace-insensitive md5). The 10-stage rollback dry run passed on production, with data unchanged afterwards (6 users, 1 business, 0 sales, 0 customers).
- Frontend: `main` @ `87a5700` deployed (`dpl_7VtV1oXkSYUcNcshsBKDAdr4SRLQ`, READY, bundle `index-BLfQDtrq.js`). `/shop` loads with no console errors and shows the update notice to browsers on the old build. The live API refuses anonymous `recordRepayment` calls and anonymous reads of `shop_customers` (42501).

**Not done**
- Screens not reviewed at phone width in a real browser.
- No customer statement print or share yet.

## Update — refunds/voids and one set of books (live on production)

**Refunds and voids (blocker 1).** `supabase/migrations/20261105110003_shared_shop_refunds_and_opening_import.sql`, action `refundSale`.
- Owner only. Attendants see refunds on their sales but can't issue them, so refunds are a loss-prevention control.
- A refund never edits the sale. It is a new append-only record (`shop_refunds`, `shop_refund_lines`) priced from the sale's own lines, returned by the sale's own payment method, with a required reason.
- "Put the items back in stock" is on by default; untick it for damaged goods.
- A void is a refund of everything not yet refunded. Partial refunds can't exceed what is left on each line.
- Exactly once: keyed by `refundKey` plus a request hash, so a retry after a dropped connection replays. The screen keeps the key until the server answers.
- Receipts and the Sales tab show each refund and the net amount kept.

**One set of books (blocker 2). Decision: the shared shop becomes the live record. Each phone's past books stay on that phone as history before the switch.**
- Facts behind the decision:
  - The phone's books hold full history with features the shared shop doesn't have (credit, discounts, FIFO cost).
  - Replaying that history into a server-priced, append-only ledger would invent receipts and could misstate money.
  - What the owner needs to keep trading is the catalogue, prices and stock on hand. That is the standard opening-balance cutover.
- How it works: Stock page → "Move to the shared shop". It is behind the phone's own owner unlock (`requirePermission("staff")`), so a cashier on a shared phone can't export the books.
- It sends the stocked, unarchived products, open stores and units on hand to action `importOpening`, in one transaction (all or nothing).
- What it never changes:
  - It reuses stores and products with the same name and never overwrites a shared-shop price.
  - It only opens stock where that store/product has no shared-shop history, so running it twice adds nothing.
  - It refuses a currency mismatch.
- Every run is logged in `shop_imports`, and opening stock is posted as `opening` movements.

**Evidence.**
- `qa/shared-shop-refunds-import.test.mjs`: 3 tests on real Postgres.
- `client/src/cloud/localBooksExport.test.ts` (3) and `MoveToSharedShopPanel.test.tsx` (3).
- 3 new refund tests in `SharedShopPage.test.tsx`.
- Hosted dry run on the test project, extended with refund, retry, void and import stages: `DRYRUN PASS: 9 journey stages verified`, nothing left behind.

**Live:**
- Production database: applied with owner approval as `20261105110003`. The same 9-stage rollback dry run passed on production, with data unchanged afterwards (6 users, 1 business, 0 refunds, 0 imports).
- Frontend: `main` @ `e626407` deployed (`dpl_1Hm16qYogJY3CuJRFG8gP4Tfn2D5`, READY, bundle `index-C0zNYAzE.js`). `/shop` loads with no console errors, and the live API refuses anonymous `refundSale` calls and anonymous reads of `shop_refunds` (42501).

**Not done:**
- Showing a "moved to shared shop on <date>" marker inside the phone's own books.
- Refunds for sales still recorded in the phone's own books keep using the phone's existing return flow.

## Update — same day: decisions taken and work done

As lead/manager I chose the **server-authoritative shared shop** for multi-user businesses. The earlier QA-project path (device enrollment, signed sale pull, remote replay into each owner's IndexedDB) has been in progress since 13 October. It has produced no working journey, and its own handover lists replay, conflict handling and hosted upload as unbuilt. The new path reuses the pattern already live in production: one session-bound SECURITY DEFINER operation, no browser table access.

| Item | Status |
|---|---|
| B1 attendant sales reach the owner | **Built.** `supabase/migrations/20261105070036_shared_shop_ledger.sql` + `public.tallybook_shop` RPC; `/shop` screen for owner and attendant |
| B2 cloud store assignment | **Built.** `shop_stores`, `shop_store_assignments` (cascades on membership revoke) |
| Exactly-once sale after retry | **Built.** Unique `(business, submission_key)` + request hash; write-ahead outbox in the browser; retries on reconnect, every 20 s while waiting, and on return to the app |
| Stock, payment, receipt, financial records | One transaction: stock rows locked, oversell refused, server prices the sale, sequential receipt numbers, append-only history (triggers block UPDATE/DELETE) |
| Permission enforcement | Checked at write time on the server: not assigned / archived store / revoked member / other business / signed-out session all refused, including for sales queued offline before the change |
| Invitations | Owner invites by **email** (no more UUID copy-paste); attendant enters the one-time code; members are shown by email |
| B4 hard-coded production URL | **Fixed.** The database operation is the default on every project; only an explicit QA endpoint uses HTTP |
| Voice input | **Fixed 2 bugs.** Words lost on iOS Safari/early stop ("didn't hear anything"); duplicated words on Android Chrome. **Offline (live, `33293d3`, `dpl_BywYWPHHVEa7fNTx2k4LWHTxY4qV`):** where Chrome offers on-device recognition (experimental `SpeechRecognition.available/install` with `processLocally`) the owner can download the language pack on tap and speak offline; elsewhere, offline points to the phone keyboard's microphone. Not yet checked on a real phone |
| Business setup UX | Dead end for attendants removed ("Open shared shop"); email instead of account ID; consistent buttons |
| B3 migration drift | **Fixed.** `supabase/migrations` now mirrors production's recorded history exactly (3 missing migrations added under their real versions; the never-applied `001`–`003` `tb_*` files moved to `docs/history/unapplied-migrations/`) |
| Hosted test | **Passed** on test project `lmneuqxfyxplrxjswpma` after bringing it to production parity: `qa/supabase-shop-dryrun.sql`, running as the real `authenticated`/`anon` roles, gave `DRYRUN PASS: 7 journey stages verified`, rolled back with 0 rows left. Covers setup, invite by email, wrong-account accept refused, unassigned/other-store/owner-only/stranger/expired-session refusals, sale, retry replayed, changed retry refused, oversell refused, exactly one sale/payment/movement, stock 5→3, no direct table or anon access, revocation removes store access |
| Production database | **Live.** Applied with owner approval as `20261105070036_shared_shop_ledger`. The same rollback dry run on production gave `DRYRUN PASS: 7 journey stages verified`; data unchanged afterwards (6 users, 1 business, 0 shop sales) |
| Auth setting | Supabase advisor: leaked-password protection is **off**. Owner should enable it (Authentication → Policies) |
| Frontend deploy | **Live.** `main` deployed to production; latest `c2bb073` (`dpl_C9vdhxaiZRYusWptuZ9zzoZ4VzeW`, READY, aliased to tallybook-eight.vercel.app). Deploy with the Vercel connector **without** a teamId (the team-scoped calls return 403). `/shop` loads with no console errors; the live API refuses anonymous calls to `tallybook_shop` and to `shop_sales` (42501) |
| Stale app after deploy | **Fixed in follow-up.** The "update ready" notice only rendered inside the local workspace shell, so visitors on the sign-in screen and `/shop` kept the old cached version until all tabs closed. It now renders on both screens |
| Hands-on acceptance | **Owner to do.** Two real accounts on two phones: invite by email → assign store → sell → airplane mode mid-sale → reconnect, and confirm the owner sees one sale, one receipt and the stock drop |

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
