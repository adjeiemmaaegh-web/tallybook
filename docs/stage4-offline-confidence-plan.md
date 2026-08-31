# Enhancement Roadmap — Stage 4 Plan: Offline Confidence & Data Safety

**Plan status:** Ready for owner review. This document proposes **Stage 4 only**. No Stage 4 implementation, database change, or deployment is authorised until the owner explicitly approves this plan.

## 1. Purpose and success criterion

Stage 4 will make the application’s existing offline-first behaviour **visible, simple, and trustworthy**. The owner should immediately understand whether the app is ready and whether a completed local action is safe on this device, without being shown engineering terms such as “IndexedDB,” “transaction,” “migration,” or “cache.”

The practical success criterion is that an owner can load the app while online, go offline, continue supported local work, refresh or reopen, and verify the same products, customers, sales, payments, receipts, and stock results remain available and correct. This stage improves confidence and verification; it does not invent a second storage system or synchronization process.

## 2. Existing foundation and Stage 4 decision

Tallybook already keeps business records locally, opens the local ledger before pages operate, and shows a global **Saved on this device** / **Working offline** status. Sales remain atomic local records: sale, lines, payment when applicable, receipt, stock change, inventory movement, and customer activity are saved together. Stage 1 Mobile Money provider/reference snapshots, Stage 2 derived customer debt, and Stage 3 read-only receipts already persist locally and have automated coverage.

Stage 4 will **refine and verify this foundation rather than replace it**. The existing shared status component remains the single global source of owner-facing save/offline confidence. The Backup page remains the separate owner-controlled recovery surface; Stage 4 will not duplicate it with a new storage, sync, or “upload” feature.

## 3. Approved scope

| Area | Planned owner experience | Implementation boundary |
| --- | --- | --- |
| Global status | One persistent, easy-to-see status in the application header. | Enhance the existing shared status component; do not add a parallel dashboard or technical diagnostics screen. |
| Ready state | Use concise wording such as **Saved on this device** after local records are ready. | This means the local record area is ready; it does not imply a cloud copy or upload. |
| Offline state | Use explicit plain language such as **Offline — changes saved on this device**. | It remains visible until the browser reports that the connection has returned. |
| Starting/error state | Keep a short, human-language readiness message and an accessible retry action where local data needs attention. | Do not expose technical error jargon unless the owner actively needs recovery guidance. |
| Action confidence | Review supported create/edit/complete/payment actions and retain or improve their immediate owner-facing success/error acknowledgement. | Confirmation appears only after the existing local operation resolves; it must not claim a save before it succeeds. |
| Connectivity return | Keep the existing short **Connection restored** message, including that nothing was uploaded. | No sync queue, manual sync, upload, or remote data action. |
| Data safety | Preserve the Backup entry point and straightforward local-record reassurance. | Backup, restore, and integrity audit remain owner-controlled and unchanged except for regression validation. |

## 4. Exact status and interaction model

The global header status will have a deliberate four-state owner model:

| Situation | Owner-facing wording | Intended meaning |
| --- | --- | --- |
| App preparing records | **Getting your records ready** | Wait briefly while the app opens saved local records. |
| Local records ready and browser online | **Saved on this device** | The application is ready to use with local records. It does not mean a copy was sent anywhere. |
| Browser reports offline while local records are ready | **Offline — changes saved on this device** | Supported work continues locally. The indicator stays present rather than being a one-time message. |
| Local records need recovery | **Your saved records need attention** with **Try again** | The owner has an obvious next action without seeing implementation terminology. |

The offline state will remain visually distinct, readable in the compact phone header, accessible through a polite status announcement, and understandable without colour alone. On reconnection, the existing three-second notice remains explicit that records stayed on the device and **nothing was uploaded**.

For supported local actions, success feedback will be checked against the actual resolved operation. A product save, customer save, completed sale, repayment, or receipt action must never cause the interface to claim that data was saved if its underlying local operation failed. Receipt view/share/print/done remain read-only; they do not become “save” operations in this stage.

## 5. Data, schema, and integrity impact

**No Dexie schema migration is planned.** Database version 8, its existing local stores, and all record shapes remain unchanged. Stage 4 adds no “sync status” table, event log, cloud token, queue, last-upload time, localStorage business record, or duplicate backup mechanism.

The data source of truth remains the existing local records. Completed sales and payments remain immutable as currently designed, receipts remain stored with existing sale completion, inventory movements remain append-only, and Stage 2 customer balance remains derived from completed sale debt less immutable repayments. Stage 1 payment method value `mobile` remains unchanged and continues to display as **Mobile Money**.

Existing read-only integrity audit behaviour remains the protection mechanism for record relationships. Existing backup/export and replace-only restore remain the recovery boundary. The Stage 4 test work will prove that this data remains available while offline and after refresh/reopen, not add new data-management controls.

## 6. Planned implementation work

1. **Clarify the shared header status.** Refine the ready, offline, starting, and recovery copy and ensure the offline status explicitly says that supported changes are saved on this device. Preserve the current header location, accessible semantics, and compact cobalt visual system.
2. **Check save confirmation paths.** Review existing product, customer, sales, and repayment feedback so a visible success message follows a successful local write and errors do not leave false success copy. Reuse the established toast/status components rather than adding a new notification system.
3. **Preserve connection semantics.** Retain the existing online/offline event handling and reconnection toast. Make no network request, no manual “sync” button, and no automatic upload behaviour.
4. **Modernize the offline browser validation.** Replace stale selectors and schema assumptions in the old offline browser check with the current Stage 1–3 POS, provider, receipt, and status surfaces. Keep it isolated from owner data.
5. **Keep visual language consistent.** Use the approved prototype-faithful compact cobalt interface: solid status surfaces, readable labels, clear icons with text, and touch-friendly spacing at 375 px without introducing a separate “technical mode.”

## 7. Explicit exclusions

Stage 4 will not add cloud synchronization, accounts, remote databases, provider APIs, payment processing, manual sync, upload controls, sync queues, data sharing, automatic backups, data analytics, localStorage as business storage, technical diagnostics for owners, QR payments, wallet behaviour, receipts sharing changes, or new payment/repayment data fields.

It will not modify completed sales, existing payments, Mobile Money providers/references, customer balance formulae, customer repayments, stock calculations, inventory movements, receipts, backup format, restore semantics, or integrity-audit mutation policy. It will not begin Stage 5’s daily business summary, or any Stage 6–10 work.

## 8. Test and regression strategy

| Validation layer | Planned checks |
| --- | --- |
| Status component tests | Ready, preparing, offline, error/retry, wording, accessible status announcement, and reconnection message duration/meaning. |
| Local reliability tests | Open/close/reopen retention for business profile, product, customer, completed sale, Mobile Money payment/provider/reference, receipt, repayment, stock/movement, debt, and report snapshots. |
| Atomic failure tests | A deliberately invalid or failed sale leaves no partial sale, payment, receipt, inventory movement, or incorrect stock after reopen. |
| Browser offline test | Start online, make the shell available, set offline, confirm the persistent owner-facing status, create supported local records, complete a valid offline sale, open its receipt, refresh/reopen, restore connection, and verify the no-upload reconnection message. |
| Record correctness | Confirm products and customers remain available, one offline sale creates one sale/payment/receipt, stock decreases once, Mobile Money provider/reference remains readable, partial/Credit balance rules remain correct, and no duplicate completion occurs. |
| Cross-stage regression | Run full tests for Stage 1 Mobile Money, Stage 2 debt/repayment, Stage 3 receipts/actions, backup/restore, integrity, archive, keyboard navigation, routes, reports, and select-overlay readability. |
| Responsive/accessibility | Check header status and key offline flows at 375×812 and desktop; confirm keyboard skip link, focus visibility, readable contrast, no colour-only meaning, and solid overlay surfaces. |
| Release | Run `pnpm check`, full `pnpm test`, production PWA build, manifest/service-worker check, and production dependency audit. |

## 9. Owner manual acceptance plan

1. While connected, open the app and confirm the header says **Saved on this device** when ready.
2. Create or confirm a product and a customer, then configure a Mobile Money provider if needed. Confirm each successful supported action gives clear confirmation.
3. Turn off mobile data/Wi-Fi after the application has loaded. Confirm the header persistently says **Offline — changes saved on this device**.
4. While offline, confirm existing products and customers are available. Add/edit a supported product or customer if applicable, then complete a Cash or Mobile Money sale. For Mobile Money, confirm the selected provider/reference remains available and clear.
5. Confirm the offline sale creates exactly one saved receipt, updates stock exactly once, and retains the correct paid/remaining amount. For named-customer partial/Credit sales, confirm the remaining balance is correct.
6. Open the receipt and use **Done**. Refresh or close/reopen the app while still offline. Confirm the product/customer, sale, payment, receipt, customer balance, and stock values remain correct.
7. Restore connectivity. Confirm the connection-restored message says records remain on this device and nothing was uploaded; do not expect a sync action.
8. Open **Backup**, download a local backup, and use **Check local records**. Confirm the backup remains owner-controlled and the record check is read-only.

## 10. Completion and approval boundary

After implementation, the Stage 4 completion report will list every code/documentation change, exact test counts and outcomes, browser/mobile/offline evidence, PWA/audit result, known advisories, Git revision, deployed test link, and these owner acceptance steps.

> **Approval gate:** Stage 4 remains planning-only until you explicitly approve this plan. After implementation, Stage 5 will not begin until you personally test and explicitly approve the deployed Stage 4 build.
