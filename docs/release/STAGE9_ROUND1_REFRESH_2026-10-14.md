# Stage 9 / Round 1 — refreshed integration review (2026-10-14)
**Status: prepared only / NO-GO. Not a live, reviewed, executed or deployed integration.**

## Source inputs
- Main refreshed commit: `1d772d70163ce4b01d95f325321b64e651d17a81` (includes the newly merged premium-home UI).
- Cloud PR #4 pinned: `779a934fc0c4739db940e71bf2bec5f8c189154c`.
- Security PR #7 pinned: `63c2e07080bad90a173706d30baea8b9777eb940` (includes trusted Supabase session checks, recovery issuer and private Postgres ownership coordinator).
- Previous verified membership-model and 8-case focused regression: `1adec3bc9e1bb0ec6e67be5abb1b87907384e25c`.

## Merge decision
The cloud PR's `AppShell.tsx` and `AppShell.test.tsx` are deliberately **not copied**, because current main has a substantially redesigned navigation. Current main's files are retained to avoid destroying the new UI. This does not prove the cloud AuthGate route and account-link journey are usable; add explicit route and auth tests before merge.

All other 21 cloud PR changed paths and 28 security PR paths were composed from exact Git blobs. Two original cloud AppShell paths are excluded and five membership-model/corrected verification paths are retained from the earlier candidate; overlapping verifier and contract paths override the security version. No feature gates were enabled. Changes are intentionally unreferenced by branch, avoiding automatic Git push deployment.

## Vercel safeguards and observations
Direct Vercel read-only project inspection confirms `tallybook` is on Node 24.x, with SSO protection enabled for `all_except_custom_domains`; password protection disabled. Branch-filtered Vercel deployments for `stage9/multistore-integration-20261014` returned zero, but multiple other branch previews exist. This demonstrates that pushing the integration branch is likely to create a protected preview, not that it would leave Vercel unchanged. **No production or preview deploy from this candidate.**

## Continued hard blockers
- Supabase role contract is `business_members.role in (owner, attendant)`, with cloud owner-check; the old proposed `company_memberships` docs are obsolete.
- The latest PR #7 coordinator is server-only and not an active HTTP route. Its real SQL/Postgres integration and two-user adversarial tests are not certified by main CI.
- No account-to-local-IndexedDB binding/restore, two-device replicated finance, authoritative store inventory, real transfers or consolidated business finance acceptance.
- Full combined Vitest, TypeScript, build, browser and offline tests have not run on this candidate. **Do not merge**, update blockers, turn on `VITE_TALLYBOOK_REQUIRE_AUTH`, grant store financial rights or deploy.
- Premium main UI and cloud-auth AppShell compatibility still require explicit review.
