# Watchdog importer reconciliation — 2026-10-26

## Source and repeatable probe

The user supplied the local Watchdog desktop source at `C:\Users\adjei\Documents\Codex\2026-10-10\referenced-chatgpt-conversation-this-is-an-2\outputs\alchemy-integration\integrated`. This is a separate local development copy, not the connected Alchemy-Watchdog website repository. It was read only. The tested importer files are `src/cvapp/integrations/pos.py` (SHA-256 `4172a092558de8748e71bb27883085e4f31ed660d7dd20d1f5e1ca06f395b966`) and `src/cvapp/integrations/tallybook_adapter.py` (SHA-256 `221099e0fd9147fbfb4f0d5ef3b446aa186fc9844877327c3bfca9d422a63b02`). A different Watchdog build must be probed again.

From the Tallybook repository root:

```powershell
node qa/generate-watchdog-preview.mjs
python qa/probe-watchdog-importer.py 'C:\Users\adjei\Documents\Codex\2026-10-10\referenced-chatgpt-conversation-this-is-an-2\outputs\alchemy-integration\integrated'
```

The generator calls the same Tallybook serializers used by the Reports export actions, with synthetic records. It creates `qa/fixtures/tallybook-watchdog-preview-v1.json` and `qa/fixtures/tallybook-watchdog-legacy.csv`. The probe imports the actual Watchdog parser modules without opening a database. Its captured result is `docs/central/evidence/watchdog-real-importer-probe-2026-10-26.json`.

## Observed compatibility

| Tallybook file | Watchdog canonical CSV parser | Watchdog provisional mapped CSV adapter |
| --- | --- | --- |
| Daily JSON preview, 7 events | Rejected: `invalid CSV header; use Stage 17 template` | Rejected: `mapped source headers missing or duplicated` |
| Legacy CSV, 5 events | Rejected: `invalid CSV header; use Stage 17 template` | Rejected: `mapped source headers missing or duplicated` |

The same parser accepted a one-row synthetic canonical CSV control. Therefore the rejection is a format mismatch, not a missing importer or a failed Python setup. No import into Watchdog SQLite or GUI was attempted, because neither Tallybook file passed validation. No customer records or real shop data were used.

Watchdog requires `external_id,kind,occurred_at,store_id,register_id,reference,amount,currency`. Its supported kinds are `sale`, `refund`, `void`, `discount`, `no_sale`, `stock_adjustment`, `stock_transfer`. The mapped adapter still requires all eight source columns to exist under distinct headers; it cannot synthesize missing fields or read JSON. Tallybook's legacy CSV uses `eventId,businessProfileId,storeId,staffId,shiftId,timestamp,eventType,saleId,amountMinor,currency,reference,reason`. The JSON preview has richer event fields but no canonical CSV header. It includes `shift_open`, `shift_close`, `cash_count`, and `momo`, which Watchdog's canonical parser does not support.

## Required integration decision and implementation

1. Agree with the Watchdog maintainer on a versioned interchange format and explicit event-kind mapping. Preserve shift, cash-count, and MoMo events in the negotiated contract or declare an explicit, visible exclusion report. Do not silently drop them or reinterpret a MoMo claim as settled payment.
2. Decide whether Watchdog should add a parser for the Tallybook versioned JSON envelope or Tallybook should add a separate Watchdog canonical CSV export. Keep the existing exports stable during migration.
3. Map integer minor amounts to exact decimal strings, retain stable event IDs, and define a policy for `amount_minor` and `currency` missing on non-financial records. Historical register IDs are unknown; keep blank, and do not claim register-level camera correlation from these rows. Store identity is only inferred for a verified single-store company, as documented in `DATA_CONTRACT.md`.
4. Apply the existing Watchdog manager/store authorization and atomic replay path to a disposable SQLite database. Test full import, exact replay, changed-payload rejection, wrong-store rejection, revoked manager, and malformed input. Compare persisted records with the original synthetic Tallybook events. An importer parse alone is insufficient.
5. Negotiate real-shop acceptance separately: authorized export, clock and timezone alignment, camera/register mapping, privacy and retention, then supervised Windows GUI import. The current synthetic probe is neither that acceptance nor production readiness.

The Supabase activation and live Auth/RLS/sync steps remain in `docs/central/2026-10-26_LOCAL_CENTRAL_CHECKPOINT.md`. They are independent of this Watchdog format mismatch.
