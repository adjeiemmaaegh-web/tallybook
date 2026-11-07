# Tallybook

Tallybook has two ledgers. The device workspace stores its own sales, stock, purchases, customer balances and reports in IndexedDB. The shared shop records team operations through session-checked PostgreSQL functions. A local backup, a shared-shop invitation and an opening-stock import each serve different purposes.

## Run locally

Use Node 24.19.0 and pnpm 10.34.0 (pinned in `.node-version` and `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local Vite address. For a standalone device leave both Supabase settings empty and both account-enforcement flags false. Open **Set up business**, save the business, follow **Go to staff unlock**, create the first owner and unlock with the local PIN. The device must be under the owner's control during first enrollment. Unlock again after a full reload. Protect the browser profile and keep verified backups.

For shared-shop use, configure the public Supabase URL and publishable key for the intended project. Sign in at `/signin`, create or join a business and open `/shop`. Cloud-configured device routes require a verified owner. Signed-out device requests route to `/welcome`. Existing device bindings survive configuration changes. See [.env.example](.env.example).

## Build and verify

```sh
pnpm check
pnpm build
pnpm test --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000
node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test
pnpm exec playwright test -c playwright.auth.config.mjs
pnpm exec playwright test -c playwright.offline.config.mjs
pnpm exec playwright test -c playwright.visual.config.mjs
pnpm exec playwright test -c qa/reference-integrated-ui.config.mjs
pnpm audit --audit-level moderate
```

The build creates the PWA in `dist/public` and the Node server bundle in `dist/index.js`. Browser offline tests serve the production build. Database tests use disposable embedded PostgreSQL with simulated Supabase Auth tables. Real-device and hosted Auth acceptance require separate evidence.

## Review material

- [Architecture, migration compatibility and operating boundaries](docs/release/RC_INTEGRATION.md)
- [Branch and PR reconciliation](docs/release/RC_RECONCILIATION.md)
- [Verification evidence and remaining gates](docs/release/RC_QA.md)
