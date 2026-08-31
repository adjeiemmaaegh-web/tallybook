# Security and Privacy

## Stage 6 posture

Repayment amounts, methods, and notes are local-only financial records. Stage 6 adds no server, payment processor, account, cloud token, or remote customer data. The repayment service validates the customer, current balance, amount, and method inside one local transaction before saving.

| Protection area | Stage 6 decision | Known limitation |
| --- | --- | --- |
| Balance integrity | Derived from completed sale debt minus immutable repayments. | No due-date, interest, or refund model exists yet. |
| Overpayment | Service rejects an amount above current debt. | Shared-device and multi-device access are not controlled. |
| Duplicate action | Unique submission key returns one existing repayment. | It does not replace multi-device conflict handling. |
| Local privacy | No repayment leaves the device through the product. | Browser/device access protections remain the owner’s responsibility. |

## Non-claims

Stage 6 does not provide encryption at rest beyond browser/device protection, payment processing, a PIN, tamper-proof audit signing, secure cloud backup, or cross-device synchronization.

## Stage 6 approval repair

Normalizing grouped money input occurs before validation and still rejects non-numeric or excessive payment amounts. A slow sale operation remains idempotent through its submission key, so releasing the busy control does not permit a duplicate completed sale.

The control remains natively disabled only while a submission is in progress. Invoking it with no item writes no record and exposes only the existing validation feedback.

## Enhancement Roadmap — Stage 1 payment safeguards

Stage 1 does not process or initiate payments. Provider names and optional transaction/reference text are owner-entered local business data. The sale service only accepts Mobile Money metadata for a `mobile` payment, requires an active local provider for a nonzero Mobile Money payment, and writes the provider snapshot in the same local transaction as the receipt and stock change. Repeated completion with the same submission key returns the existing sale rather than duplicating a payment.

Historical `mobile` records without provider data stay valid. The integrity audit remains read-only and reports a stale provider ID, missing provider-name snapshot, or Mobile Money fields attached to another payment method. It does not repair, delete, transmit, or expose records outside the device.

## Stage 7 reporting integrity

Report functions are read-only and do not write a derived total back into local storage. Labels explicitly avoid profit, tax, cash-on-hand, and other accounting terminology that cannot be substantiated by the stored records. This prevents report viewing from changing a sale, payment, repayment, customer, or stock record.

## Stage 8 integrity posture

Offline mode does not relax business validation. The same local transactions and submission keys apply with or without network access. A rejected insufficient-stock sale remains atomic after reopen: no sale, payment, receipt, or stock reduction is left behind. The offline badge deliberately does not expose sensitive records or imply encrypted backup, remote sync, or permanent retention.

The restored-connection toast makes the absence of upload explicit. It does not disclose record values or indicate that a remote copy exists.

## Stage 9 backup security boundary

The exported JSON may contain customer contact details, sales, receipt, payment, and debt information. It is unencrypted in this stage so it remains simple and portable; the owner must store it privately. A malformed, unsupported, or duplicate-record file is rejected before current local data is cleared. Restore requires an explicit replacement confirmation and does not perform a merge, upload, or remote sync.

## Stage 10 safety impact

Removing non-functional header controls reduces misleading interaction paths. Visible focus and explicit save/loading status improve owner feedback without exposing new data, weakening validation, or changing the local-only privacy boundary.

## Stage 11 hardening

Unused audited dependencies for HTTP requests, markdown rendering, and chart rendering were removed because current product code did not use them. The shipped static-server runtime was upgraded to Express 5.2.1, and Nano ID was upgraded to 5.1.16. The dependency audit must be rerun before release; audit status is a dependency snapshot, not a guarantee that a device is safe.

The owner-facing integrity check is read-only. It reports relationship or calculation inconsistencies and explicitly avoids automated repair, record deletion, backup upload, or remote diagnosis. See [Security Review](./security-review.md) for the local-device limitations and recovery rule.

## Stage 12 privacy handover

The release pack includes plain-language privacy and troubleshooting guidance. It reiterates that local records stay in the browser profile and that exported backups are readable, private files under the owner’s control. No new secret, account, cloud credential, or data-sharing path is added.
