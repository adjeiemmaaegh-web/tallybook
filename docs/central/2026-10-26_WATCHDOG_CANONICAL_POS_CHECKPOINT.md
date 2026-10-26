# Watchdog canonical POS subset — 2026-10-26

The earlier direct probe found that neither existing Tallybook export could be imported by the supplied Watchdog desktop source. This increment adds a **separate, UTC-day POS CSV** whose eight columns and row kinds match Watchdog Stage 17. It does not change the older Tallybook CSV or the full daily JSON preview.

The Reports page labels the new download **Watchdog POS import CSV (UTC day)**. It uses the same company/staff report authorization and verified single-store snapshot as the existing exports. Supported events are sale, discount, cash refund, accounting void, and no-sale. Unknown future event types fail closed. Shift open/close, cash count, and MoMo claims are omitted from this POS subset; the page displays their count and kinds after download and points to the full daily JSON preview. They are not reclassified as payments or discarded from Tallybook. If no supported POS rows exist, no CSV is downloaded. The CSV has stable event IDs, exact minor-to-decimal conversion, no customer PII, CSV text guards, and blank historical register IDs. A blank register means Watchdog cannot claim register-level camera correlation from those rows.

## Direct importer evidence

`node qa/generate-watchdog-preview.mjs` produces `qa/fixtures/tallybook-watchdog-canonical-pos-v1.csv` from the same serializer as the Reports action. In the supplied Watchdog source, both `parse_canonical_csv` and `prepare_batch` accepted all **3** supported synthetic rows. The existing JSON and legacy CSV still fail the importer's format checks; this is expected. See `docs/central/evidence/watchdog-real-importer-probe-2026-10-26.json` for exact hashes and results.

`python -B qa/test-watchdog-import-roundtrip.py <WATCHDOG_SOURCE_DIRECTORY>` used Watchdog's real `MultiStoreConsole` and a disposable SQLite database inside this workspace. The input included the UTF-8 BOM added by the browser download. It inserted 3 rows, inserted 0 on exact replay, denied the wrong store and viewer role, rejected malformed money, rolled back a changed-payload replay, and denied a revoked manager. See `docs/central/evidence/watchdog-canonical-roundtrip-2026-10-26.json`. No Watchdog source or customer database was changed.

## Remaining contract work

- This is an **offline POS subset**, not the full shared event contract. Watchdog still lacks an importer for shift, cash-count, MoMo and trusted device/server receipt evidence. The full JSON preview remains `partial_unverified_provenance`.
- A real shop import requires manager authorization in Watchdog, a confirmed store mapping and synchronized clock. Historical register IDs are unknown; camera correlation must remain unavailable until recorded register evidence exists.
- The importer source was supplied from a local folder, with no Git revision in that folder. Recheck the exact importer implementation/hash when a version-controlled Watchdog desktop repository or updated executable becomes available.
- No live Supabase synchronization, physical-device acceptance or production deployment was performed. The Tallybook project remains a development checkpoint.
