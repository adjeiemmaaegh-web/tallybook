# Next Upgrade: status against the PRD (6 Nov 2026)

**Decision: NO-GO for production.** This is a development checkpoint, not a release approval. Nothing here has been deployed, and nothing has been applied to the production Supabase project.

Branch: `feature/next-upgrade` (includes `feature/cloud-refund-policy`). Baseline: `main` at `0314873`.

## Workstream status

| ID | Workstream | State | Evidence |
|---|---|---|---|
| R1 | Sensitive offline data | **Partly done.** Shop queue and cache sealed; old plaintext migrated safely. Local device ledger and parked/pending checkout still plaintext; recovery package not built. | `docs/security/OFFLINE_DATA_THREAT_MODEL.md`, `qa/outbox-core.test.mjs` |
| R2 | Transaction and sync integrity | **Core done and tested under Node.** Browser IndexedDB/Web Locks wiring unverified in real browsers. | 15 passing tests; strict `tsc` clean on the new modules |
| R3 | Per-company cloud refund policy | **Done on server, tested on Postgres 16 and applied to the test Supabase project.** Owner screen written, not run. | migration `20261106120000`, 33 local checks, `qa/shared-shop-refund-policy.test.mjs` (not run here) |
| R4 | Release correctness | **Blocked.** Vercel team access was not approved, so the deployment, domain alias and `bb6b0292` could not be checked. `vercel.json` has `git.deploymentEnabled:false`, so pushes to `main` do not deploy by themselves. | |
| R5 | Auth and security | **Partly done.** CSP (report-only) and HSTS added with tests; authorization matrix written. Leaked-password protection still off (dashboard setting). | `qa/security-headers.test.mjs`, `SHARED_SHOP_AUTHORIZATION_MATRIX.md` |
| R6 | Real-device and cross-browser acceptance | **Not performed.** Needs two physical phones. | checklist below |
| R7 | Migration, backup, restore, DR | **Partly done.** Both new migrations have tested rollbacks that restore the exact previous function. No backup/restore drills run. | rollback round trip on Postgres 16 |
| R8 | AI safety, performance, observability | **Not started.** The 40 unindexed-FK findings are untouched on purpose (profile real queries first). | |
| UX1-UX3, UX5 | Onboarding, role-aware first run, dashboard, POS states | **Not done.** Needs a browser to build and judge safely. | |
| UX4, UX6-UX9 | Navigation, stock take, transfers, visual system | **Not done.** | |

## Decisions applied

1. Employee invitations: already single-use, account-bound, revocable and hashed; expiry extended 15 minutes to 24 hours in migration `20261106130000` (tested locally; **not yet applied to any Supabase project** because the apply step was not confirmed). No separate short code was added.
2. Providers: Google plus email/password, unchanged.
3. Default business mode, 4. landing page, 5. recovery package: **not implemented** (see above).

## Behaviour changes to know about

- Refunds are **off by default** per company. Existing owners must turn them on in Team, Refund policy before refunding. Production has no sales yet.
- A policy applies to sales made after it. Older sales keep the rules they were sold under; sales made before the migration can never be refunded here.
- The queue shows new states: sending, needs review, and "not confirmed yet".

## Blocker register

| # | Blocker | Needed to clear |
|---|---|---|
| B1 | Client code was only syntax-checked (and the new modules type-checked in isolation). `pnpm install`, `pnpm check`, `pnpm test` and `pnpm build` have not run (no network here). | Run CI on the PR. |
| B2 | `qa/shared-shop-refund-policy.test.mjs` and `qa/membership-invite-24h.test.mjs` use PGlite and were not executed here (equivalent scenarios passed on Postgres 16). | CI. |
| B3 | Vercel not authorized: R4 unchecked. | Approve the Vercel access link, then re-run the deployment check. |
| B4 | CSP is report-only. | Load sign-in, Google OAuth, PWA install and scanning in real browsers, read the violation reports, then switch to enforcing. |
| B5 | Production migration not applied. Applying the refund migration before the owner screen is deployed would leave owners unable to enable refunds. | Deploy the client first, then migrate. |
| B6 | Recovery package not built; local ledger still plaintext. | Build and drill it before any local-data encryption. |
| B7 | Leaked-password protection off. | Supabase dashboard, Auth, Password security. |
| B8 | Test Supabase project has not received `20261106130000` (apply was not confirmed). | Confirm the apply prompt or run the file. |

## Acceptance checklist (explicitly UNVERIFIED until performed)

- [ ] Owner phone + attendant phone: sell online, go offline, sell, reconnect: no lost or duplicate sale.
- [ ] Kill the browser mid-sale; reopen: sale reconciled by receipt.
- [ ] Two tabs on one device: no duplicate send.
- [ ] Revoke the attendant while their phone is offline with a queued sale: sale is rejected and parked.
- [ ] Refund with policy off / void-only / partial-only / past window; stock and totals reconcile.
- [ ] Chrome, Edge, Firefox, Safari, iOS and Android PWA; low-memory device; screen reader and keyboard pass.
- [ ] Clear browser data with queued sales: shown as needs review, not silently dropped.
- [ ] Export, import and restore round trip; corrupt backup rejected.
- [ ] Rollback drill on a copy of the project: run both `supabase/rollback` files, then re-apply.

## GO/NO-GO

**NO-GO.** Zero duplicate or lost postings and zero cross-company access are mandatory; the automated evidence supports the server side, but the browser-side evidence, CSP enforcement, onboarding UX and device acceptance do not exist yet.


## Update 2026-11-06 (late): first-run and POS states

- **UX2/UX3 (owner):** Two-step owner setup (currency, then store name; safe to retry). "Get started" checklist (store, product, opening stock, first sale) derived only from server data in `client/src/cloud/shopOnboarding.ts`. The shop is never called ready to sell until a store, an active product and stock exist, and the first-sale step stays "checking" while the sales list is unknown. Tests: `qa/shop-onboarding.test.mjs` (run), `SharedShopOnboarding.test.tsx` (not run here).
- **UX5:** Product list now shows an owner call to action when empty, an out-of-stock notice, an offline "last saved list" notice, and a retry button when refresh fails.
- **Decision 3:** creating a business from the account page now opens the shared shop.
- **Decision 4:** the signed-out `/shop` screen is a short welcome with benefits and one clear sign-in/create-account action.
- **Still open:** R4 (Vercel access), R6 device acceptance (owner testing), R7 drills, R8, local-ledger encryption/recovery package, UX4/UX6-UX9.
