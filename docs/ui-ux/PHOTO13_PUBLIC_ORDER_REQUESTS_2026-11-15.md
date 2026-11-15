# Photo 13 — real guest order REQUEST intake, 2026-11-15

## What this change actually provides
A business owner can issue an unguessable, store-specific, revocable public link. An anonymous visitor can view at most 200 active products (product name, public category, public price, goods/services kind), select 1–30 distinct items, enter a name and phone, and send a bounded order request. The server computes all prices from live company-scoped stock-keeping product records and ignores submitted prices. The submitted request is persisted with an idempotency key in a private table. The verified owner alone can list the customer details and convert the request to an ordinary existing Tallybook online order (whose existing acceptance and sale-linking workflow remains unchanged) or decline it.

This **does not process funds, accept orders automatically, reserve stock, ship goods, promise delivery or create a financial sale**. The public UI explains all of these limitations. Guest contact fields are visible to the authenticated owner and must be handled under the shop's privacy policy. No browser receives other guests' details, staff lists, supplier data, costs, credit records or inventory quantities.

## Security/integrity properties
- No active public links by default. Existing stores, accounts, and POS remain private until an owner explicitly issues a link. One unrevoked link per store. SHA-256 of the 128-bit random UUID token is stored; raw bearer token is returned only once. Revocation immediately disables browsing and submissions.
- Two new separate RPCs: guest actions restricted to catalog/submit and owner actions authenticated with existing session-bound canonical business membership. Tables are RLS-forced and have no direct anon/authenticated table permissions.
- Every guest request has a unique (share, submission key). Exact retry returns the existing receipt; a different payload using the same key is denied. Request payload 1–30 distinct goods/services, each 1–100 units, bounded text and total. Token share row is locked before the per-share 8-per-minute throttle to avoid races.
- A guest order request never writes to sales, payments, stock or accounting. Owner conversion is transactional and delegates to the existing owner online-order function; if server price changed, conversion fails and rolls back, preventing silent repricing.
- UI routes /order#<UUID> through a separate lazy public component. URL fragment keeps the token out of the HTTP request path and typical Referer headers. The client holds a pending submission UUID in sessionStorage, not customer contact details, and provides a same-request retry path.
- The new migration has a **refuse-if-data** rollback, preserving even declined requests and revoked links.

## Verification and external dependencies
- Source tests: policy contract assertions, client validation, React guest/owner widgets, actual disposable PostgreSQL engine tests for privacy/owner access, server prices, duplicate/malformed submissions, atomic conversion, revocation, rate cap and rollback.
- Mandatory CI: exact-head Node 24 native, Vitest, TypeScript, Vite bundle, Chromium functional, macOS WebKit, Windows Edge and visual integration. Security review and real privacy/legal acceptance are separate.
- The per-link 8/minute limit is not a per-device anti-bot mechanism; sophisticated abuse protection (WAF/Turnstile/reputation and monitoring) must be added and validated before broad public commercialization. No live payment gateway is configured or authorized.
- Applying the migration to any external project, promotion to Vercel, changing owner account configuration, releasing a share link, and live-merchant acceptance are **not performed by this development branch**. A live public guest order must not be described as working until authorized deployment and real-browser/server testing.

## Rollout order
Review the exact migration and clear regression suite, apply it only to an explicitly authorized isolated test database first, verify RLS grants and owners/attendants/anon from the actual Supabase Auth provider, then approve a production migration and release. Validate public link revocation and spam controls before advertising any public ordering.
