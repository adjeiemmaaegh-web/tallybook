# Tallybook ↔ Central Workspace ↔ Alchemy Watchdog — Data Contract (draft v1)

**Status:** Proposed; development-only, not yet implemented end-to-end or accepted by Watchdog. Tallybook owns financial facts and policies. Watchdog correlates authenticated events with video; it must not recalculate authoritative balances or infer theft.

## Source and compatibility

- Canonical source: Tallybook's local Dexie transaction, never a Watchdog observation. Cloud mirrors immutable business operations after local commit and server-side validation.
- Envelope `schema_version: 1`, `event_id` stable across retries, `operation_id` globally unique for the business and originating device; payload changes under the same operation key must be rejected. Assign `received_at_utc` only on the server. `occurred_at_utc` is untrusted device time.
- Event types: `sale`, `payment`, `discount`, `void`, `return`, `refund`, `shift_open`, `shift_close`, `cash_count`, `no_sale`, `drawer_open`, `sync_receipt`.
- Required provenance: `business_id`, `shop_id`, `staff_id`, `device_id`, `shift_id` for shift-bound events; `register_id` where a registered till can be proven. IDs must resolve server-side to an authorized membership and registered device; never trust client-submitted IDs alone.
- Optional identifiers: `sale_id`, `receipt_number`, `original_event_id`, `approval_id`, `refund_disbursement_id`. Missing historical identifiers remain *unknown*, never invented.
- Monetary amounts: signed or nonnegative **integer minor units** as specified by event type, with an ISO 4217 currency code; never JS floating point for accounting or binary SQL float. Amounts must be in signed-safe range and checked for overflow. `reversed_received_minor` is an accounting reduction, **not evidence of refund disbursement**.
- MoMo: provider ID, receiving merchant account ID, normalized reference, claimed amount, statement-confirmation status, and independent settlement evidence when available. A reference alone is not proof of receipt; uniqueness is provider/merchant-account/company scoped, subject to provider reference semantics.
- Policies: business-scoped version and sale-time decision snapshot for void, discount, refund, shift, and PIN requirements; preserve historical evidence rather than silently recalculating under current settings.
- `occurred_at_utc` and `received_at_utc`: ISO 8601 UTC `Z`, with store-local date handled separately using a saved IANA timezone. Server receipt timestamp is authoritative for arrival ordering, not proof the sale occurred at that time.
- Append-only audit: actor, action, operation and source IDs, approval context, device and shop, timestamp, payload digest, and immutable correction/original link. Never include raw PIN, secrets, or unnecessary personal customer data.

## Upload semantics

Local completed transaction → durable outbox operation (same local transaction for genuine durability) → authenticated server ingest RPC → database uniqueness and validation → receipt with original operation ID and digest → local ACK. Network delivery is *at least once*; financial effects are *effectively once* through unique keys and payload equivalence. Unknown timeout: query status or safely retry SAME operation ID, never create a new one. Revoked-offline operations enter manual review and are not silently discarded or forged as accepted.

## Watchdog v1 offline bridge

Daily per-shop CSV/JSON is based on a verified store-specific ledger. Stable event IDs, schema version and row count travel in a manifest (or a dedicated JSON envelope). Required columns: `event_id,event_type,business_id,shop_id,register_id,staff_id,shift_id,receipt_number,occurred_at_utc,received_at_utc,amount_minor,currency,payment_method,momo_provider,momo_reference,reason,approved_by,device_id`. Blank `received_at_utc` means not synced. Multi-store historical events without proven shop ID are **excluded with an error report**, not attributed by guesswork. CSV cells must be formula-injection safe; exports contain no customer PII.

## Breaking changes

New payload fields may be optional within a version. Event meanings, currency, required identifiers and replay semantics require a schema version bump plus migration/backfill protocol. No migration may silently rewrite old offline transactions. Watchdog and Tallybook developers must agree on any v2 event changes.

## Local integration preview addendum (2026-10-24)

The Reports page now offers **Watchdog daily JSON (UTC, preview)**. Its `format` is `tallybook.watchdog.local_preview`, `schema_version: 1`, `contract_status: partial_unverified_provenance`, with `utc_day`, `row_count` and deterministic sorted `events`. Event IDs are stable across file re-exports, but `generated_at_utc` is intentionally new per export. The export is single-store and read-only; it does not transmit data and is **not** certified for the Watchdog importer. The legacy CSV button and columns remain unchanged.

Extra events added in this preview: `shift_open`, `cash_count`, and `refund` from the preexisting staff-confirmed **cash-only** return journal. `momo` remains a local compatibility event type outside the final normalized event enum, requiring agreement with the Watchdog developer. Refund events explicitly state that independent cash disbursement is unverified. Local no-sale device identifiers, when present, are claims, not authenticated attestation; `provenance_verified` is always false. Unknown `received_at_utc` and `register_id` remain null. Shift monetary fields may lack historical currency snapshots; this output must not be used for authoritative financial recalculation.

Do not claim the preview satisfies the full earlier Watchdog v1 contract; contract negotiation, historical register/device provenance, local store timezone cutoffs, cross-shop export, provider settlement and importer E2E tests remain open.

## Reconciliation checkpoint (2026-10-26)

Dexie v37 now saves new-sale `centralSaleEvents` in the checkout transaction. These are local-only payloads with no trusted device ID or server receipt. See `docs/central/2026-10-26_LOCAL_CENTRAL_CHECKPOINT.md` for the exact storage and backup boundaries. The synthetic exported file is `qa/fixtures/tallybook-watchdog-preview-v1.json`; the connected Alchemy-Watchdog repository at `11acc820493f303a669fb849a311f4edb47f6497` contains no importer, so no final contract agreement or actual importer acceptance can be recorded yet.
