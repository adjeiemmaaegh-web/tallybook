# Tallybook V19 — Run 4 whole-run implementation: AuthGate and session lifecycle

**Development increment:** 2026-10-16  
**Base:** Run 3 draft head `e68619ff14937d4ce19951002f5a4c5e12f5f897`  
**Development branch:** `v19/run4-session-lifecycle-20261016` (draft, unmerged)  
**Development disposition:** Entire Run 4 source scope authored in this increment; **acceptance NOT PASSED / NO-GO**.

## Owner's working rule

Implement each whole V19 run in one development increment, not a string of narrowly scoped fixes. Where native Node, Vite, browser, test devices, approved Supabase or PostgreSQL cannot be run, document exact **DEFERRED / NOT EXECUTED** acceptance items and continue coding the roadmap. Do not confuse source completion or mocks with independently verified acceptance. No production database modification, deployment, payment, `main` merge or automatic cloud data activation is authorized.

## Run 4 source delivered

1. **Ephemeral, verified cloud session state** — `client/src/auth/run4SessionController.mjs` with adjacent `.d.mts` contract and `useRun4CloudSession.ts`. A Supabase Auth state event or browser `getSession()` is never authority by itself: `getUser()` must verify the user on the auth server, then an unchanged cached access token, matching user and unexpired JWT deadline are rechecked. No localStorage offline-identity authorization marker is persisted or read.
2. **Sign-out, expiry, cross-tab, race safety** — every sign-in/out or token event invalidates old generation and pending authorization. A signed-out barrier rejects stale scheduled refreshes until a newly validated SIGNED_IN event. In-memory expiry timer invalidates sessions, then attempts safe refresh. Browser online/offline, focus and visibility changes initiate revalidation. Stale async results cannot reauthorize a previous tenant. `runVerified()` rejects work whose token/generation/user changed during execution and verifies again after the operation.
3. **Real session-row authority for cloud-only gated access** — `server/run4SessionProbe.mjs` composes the existing Supabase `getUser(accessToken)` JWT/session-id verifier with private `auth.sessions` PostgreSQL lookup. POST only, exact Origin, bearer token, direct TLS, no cookies or caching, generic denials and bounded per-address request throttling (30/minute). The server registers the endpoint **disabled by default** in `server/index.ts`; no live pool or secrets are connected. The cloud-only AuthGate requires this private session proof, binding user identity and JWT deadline, before rendering cloud UI. An unavailable endpoint prevents cloud access, not offline business access.
4. **Offline-first AuthGate** — `client/src/auth/AuthGate.tsx` no longer globally redirects or blocks local ledger routes under `VITE_TALLYBOOK_REQUIRE_AUTH`. It protects only `/cloud-account` (new `CloudAccountPage.tsx`), which is itself disabled unless `VITE_TALLYBOOK_RUN4_CLOUD_ACCOUNT_PREVIEW=true`. Local /sales, /inventory, /backup, /reports and other device data remain usable offline without Supabase identity. A cloud sign-out does **not** erase or encrypt local IndexedDB and is never presented as device confidentiality.
5. **Sign-in/out and switch-account UX** — `GoogleSignInPage.tsx` uses verified Run 4 hook state; signs out before selecting another Google account, denies switching if sign-out was not confirmed, and displays offline/local-data boundary information. The old `SupabaseSignInPage.tsx` now reuses this path rather than maintaining a separate getSession-only identity shortcut.
6. **Stale cloud response protection** — `run3MembershipClient.ts` and `run2OwnerLink.ts` subscribe to account lifecycle changes for each request, revalidate Supabase getUser and identical access token after the HTTP response, and discard responses from stale accounts. `verifyCloudCompanyAccess.ts` revalidates the user and the same access token after membership queries. Run 3 membership UI is keyed by account + company, preventing old selected-tenant state persisting in the next view.
7. **No cloud/local binding side effects** — sign-in, sign-out and company switching perform no automatic local company migration, backup upload, encryption claim, or financial replication. Run 2 identity linking remains explicitly owner-approved and unauthenticated cloud routes remain unavailable.

## Authored regression and evidence

- `client/src/auth/tests/run4SessionController.test.mjs`: **22** focused native-style cases: verified JWT, untrusted getSession, mismatched user, expiry, offline, sign-out barrier, account switching, stale in-flight work, token rotation, delayed getUser and private server-proof revocation/mismatch.
- `server/tests/run4SessionProbe.test.mjs`: **7** focused native-style cases: default disabled, verified proof shape, TLS/Origin/cookie/bearer denial, revoked session denial and private-pool configuration.
- Exact checked-in JS sources and test modules executed in an **isolated V8 runner** with injected fake auth, synthetic request/responses and Node API shims: **29/29 passed**. **NOT native `node --test`, actual HTTP, real PostgreSQL, Supabase Auth/RLS, Playwright, Chrome, Windows or release CI.**
- `client/src/auth/AuthGate.test.tsx`: **6** authored Vitest/RTL cases for offline route bypass and guarded cloud states; **NOT EXECUTED**.
- `client/src/pages/GoogleSignInPage.test.tsx`: **4** authored Vitest/RTL cases for verified session UX, sign-out-before-switch, rejected switch on sign-out failure and lack of unverified controls; **NOT EXECUTED**.
- Existing historical Run 1 proof and Run 2/3 compatibility tests are not transferred to the Run 4 exact SHA.

## Deferred QA: mandatory acceptance before Run 4 PASS

1. Install frozen dependencies with pinned Node >=22.12 and pnpm@10.34.0 on trusted Windows/Linux runner; execute full native `node --test`, 10 authored React/Vitest cases, all pre-existing Vitest, `pnpm check`, `pnpm build`, Playwright migration/offline, dependency audit and exact-head GitHub Actions. Record outputs, counts and exact SHA; GitHub Actions on prior draft heads failed before job execution (zero steps).
2. Approved disposable Supabase project and private PostgreSQL service: create two truly independent users and two companies; verify live `auth.sessions` revocation/expiry, Refresh Token behavior, `getUser()` distinction, global vs local sign-out, RLS, tenant isolation, token replay, concurrent sign-out/HTTP request and probe failure. Do **not** apply any SQL to the named production project.
3. Independent browser/mobile/Windows cross-tab and cross-profile account switch tests, inactive/suspended tabs, system clock skew, network outage/reconnect, OAuth redirect recovery, Supabase BroadcastChannel changes and expired tokens after backgrounding. Confirm no cross-tenant cloud data remains rendered.
4. Prove the local ledger still opens and runs offline with `VITE_TALLYBOOK_REQUIRE_AUTH=true`, including sales, staff, backups/restore, inventory, reports and pre-existing local IndexedDB; no forced cloud login, auto-link, data clearing, or false 'sign-out encrypts data' messaging.
5. Test protected origin/TLS probe behind actual server host. It is currently **unconfigured and disabled**; genuine private pool/credentials and endpoint activation must be separately approved and tested. Cloud-only preview cannot pass gate without a verified session-row probe.
6. Confirm all `.mjs`/`.d.mts` imports and React component typings under exact repository TypeScript/Vite build; inspect browser events and teardown to rule out memory leaks/timer race. Check accessibility and OAuth redirects.

## Release/control dispositions

- **V19 Run 1:** historical passed commit only.
- **V19 Run 2:** source drafted; integration and acceptance **NOT PASSED**.
- **V19 Run 3:** source drafted in PR #14; acceptance **NOT PASSED**.
- **V19 Run 4:** whole-run source implementation delivered; end-to-end activation/verification **NOT PASSED**.
- Historical **47 blockers / 82 acceptance units** remain unupgraded by these source changes.
- **Commercial release NO-GO**; Stage 9 incomplete; no active cloud payments, cloud financial sync, live SQL, `main` merge, staging or deployment.

The next implementation increment under the owner's cadence is **V19 Run 5 — tenant-scoped service/data authorization**, while all deferred acceptance gates remain open.
