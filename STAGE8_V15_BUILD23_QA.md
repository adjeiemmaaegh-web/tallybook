# Stage 8 V15 — Build 23: explicit client event-staging transport

Status: development increment; Stage 8 INCOMPLETE. No Stage 9 work.

## Implemented
- `client/src/features/sync/outboxDelivery.ts`: explicit one-event HTTPS POST to `/api/sync/events/stage`, credential-free URL validation, no redirects or cookies, metadata-only payload, scoped authorization headers supplied by caller, bounded JSON receipt validation.
- Consent, active-device, company scope, and pending-status rechecked before request. Existing transactional acknowledgement service is used only after a successful matching server receipt.
- `outboxDelivery.test.ts`: eight Vitest cases for HTTPS restrictions, metadata-only transmission, redirect-origin mismatch, receipt/status mismatch, network failure, and malformed credentials.
- No background scheduler, credential persistence, automatic retries, UI wiring, browser session acquisition, or financial-data replication. The caller must obtain server-issued credentials and use trusted HTTPS and the configured cross-origin policy.

## Checks run
- `node --test server/tests/*.test.mjs`: **109 passed, 0 failed**.
- TypeScript compiler syntax parse: **2/2 passed**.
- `npm run build`: **BLOCKED**, `vite: not found`.
- `npm run check`: **BLOCKED**, missing `node` and `vite/client` type definitions.
- `npm test`: cannot run because Vitest is not installed; new tests **not executed**.
- ZIP integrity verification performed during packaging.

## Remaining Stage 8 blockers
- Authenticate and acquire scoped client sessions/capabilities without persisting secrets insecurely, cross-origin policy, browser HTTPS integration, delivery UI/consent and actual IndexedDB tests.
- Business record replication and financial-safe conflict remediation still unimplemented.
- Production identity/database resilience, encryption and backup end-to-end/browser QA, full builds/semantic checks and security audit pending.
- Local-first POS remains untouched; staging receipts acknowledge metadata only.
