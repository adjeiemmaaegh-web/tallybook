# Original checkout posting evidence

New local sale events now optionally carry versioned postingEvidence alongside the existing version-1 sale envelope. Checkout captures its stock movements, inventory cost issues and receipt allocations, store quantity entries, resulting batch records, customer activity and wallet/points entries in the same IndexedDB transaction as the sale. Existing events remain byte-for-byte unchanged; absent evidence is historical unknown, not evidence of zero stock or money movement.

Validation binds every captured record to the company, sale/line, product, stock movement and shop; checks quantity conservation and cost allocation totals; requires store entries when store accounting is active; and matches wallet/loyalty redemption against the sale. Failure aborts checkout. The evidence is included in portable backups as part of the existing centralSaleEvents record and covered by its exact signed payload bytes. Large events still obey the existing 64 KiB upload bound; this increment does not weaken that limit or truncate records.

Verification: focused checkout, inventory-cost and wallet-recovery suites passed 37/37. The sale test compares the event's evidence with the committed database rows and rejects a changed stock delta or omitted cost issue. The existing event-insert failure test verifies checkout/stock rollback. TypeScript semantic verification was run for the implementation.

This is not permission to replay a remote sale. Prior inventory receipts/cost history, customer/product identity, commerce reservations, other operation types, deterministic ordering and cross-device stock allocation still need reconciliation. No remote financial posting has been enabled.

Additional claim-storage hardening retains the cloud-auth listener until the local quarantine transaction completes. Account changes during hash validation or commit now abort the operation; the verified cloud user is also re-read after payload validation. This change preserves local staff and company checks.
