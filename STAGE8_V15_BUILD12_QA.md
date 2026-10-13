# Stage 8 V15 Build 12 — Server event journal (not network-enabled)

## Scope
Added `server/syncJournal.mjs`, declarations, and tests. Stores only event metadata and SHA-256 digests, never business payloads. A private append-only JSONL file supports replay-safe duplicate checks scoped by organization and detects reused event/operation IDs. Exclusive file locking serializes writes within a single host; `fsync` persists appended records. Corruption causes rejection rather than truncation. The HTTP gateway is **not connected** to the journal and remains disabled for uploads.

## Security and operating limits
This is a development persistence adapter, **not** production cloud replication. File journal has no atomic cross-machine transactions, secure network identity binding, remote acknowledgement protocol, automatic lock recovery, encrypted payload storage, or operator recovery flow. Administrative files/paths must be trusted and private. Crashed stale lock needs manual investigation, not automatic deletion. No financial records are imported or changed.

## Verification
Node tests: run `node --test server/tests/*.test.mjs` from project root. App Vitest, TypeScript and Vite build require dependencies. No remote sync tested.

## Stage 8 incomplete
Still required: trusted account provisioning, real server identity database and device enrollment, authenticated sync transport, encrypted backup transport, server/client ack protocol, conflict remediation, full build/integration/browser testing. Do not start Stage 9.
