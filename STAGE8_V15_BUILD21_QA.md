# Stage 8 — Build 21: Authenticated metadata staging and durable journal acknowledgements

**Stage status: INCOMPLETE. No Stage 9 changes.**

## Implementation
- Added separate signed capability scope `sync:stage`; read-only `sync:inspect` and `backup:write` cannot stage events.
- Validates active human session, organization membership, active device, event schema, and matching company/device scopes before accessing journal.
- Opt-in `POST /api/sync/events/stage`, disabled unless `TALLYBOOK_SYNC_EVENT_STAGE_ENABLED=true` and directory/session/journal files configured. Direct TLS required (reverse-proxy TLS headers are not trusted).
- Limited response: `201 stored`, `200 identical duplicate`, `409 conflict`; immutable response includes financialReplicationEnabled=false. No transaction, payment, inventory, or ledger payloads are stored or transmitted by this endpoint.
- Journal is single-host file backed; journal-staging receipt is not a cross-device application of business records.

## Evidence
`node --test server/tests/*.test.mjs`: 109 passed, 0 failed (9 new metadata-staging tests). `node --check server/syncEventDelivery.mjs` passes. Archive integrity verified with `unzip -t`.

## Blockers
- No end-to-end client outbox delivery/acknowledgement reconciliation; a staged event is not proof of successful business-data sync.
- No safe financial conflict resolution, remote authoritative financial state, or interoperable multi-server database.
- Identity/session issuance and shared rate limiting require production hardening.
- Browser/device/IndexedDB/HTTPS deployment tests, semantic TypeScript checks, full Vitest, and production Vite build remain necessary. Do not claim stage completion until executed successfully.
