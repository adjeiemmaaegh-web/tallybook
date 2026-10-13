# Stage 8 V15 — Build 6: Schema / Migration Hardening

## Implemented
- Aligned `DATABASE_SCHEMA_VERSION` with the latest declared Dexie migration, v21 (sync conflict journal).
- Updated old v13 assertions in two earlier migration regression suites to reference the current schema constant.
- Added version-20-to-21 migration regression test in `TallybookDB.test.ts`: preserves consent, outbox event and device records, creates an empty conflict table, and updates the persisted version marker.
- Kept offline checkout and remote transport unchanged. No cloud upload or remote acknowledgment enabled.

## Verification performed
- Syntax parsing using locally installed TypeScript compiler: PASS (four modified TS files).
- ZIP archive integrity: verify after packaging.
- `npm test -- --runInBand`: BLOCKED (`vitest: not found`).
- `npm run build`: BLOCKED (`vite: not found`).
- New migration regression test: WRITTEN, NOT EXECUTED.

## Remaining Stage 8 implementation and release requirements
- Authenticated remote organization/device identity and server-side permissions.
- Authenticated encrypted backup transport/recovery UI and confirmed durable delivery.
- Reliable sync queue transport, signed/validated acknowledgments, server idempotency, merge policy, and conflict remediation.
- Real browser/IndexedDB v20->v21 migration tests and cross-device disconnect/replay testing.
- Full Vitest suite, TypeScript semantic check, production Vite build, real device and security tests.

This is a development increment, NOT Stage 8 completion or production certification. Stage 9 not started.
