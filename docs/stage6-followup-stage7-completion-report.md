# Stage 6 Follow-up and Stage 7 Completion Report

**Status:** Implementation and validation complete. Deployment pending final release verification. **Stage 8 has not started.**

## Delivered scope

The Stage 6 follow-up makes the End of day page easier to read by separating four concepts visually: **Sales recorded today**, **Money actually received today**, **Still unpaid from today’s sales**, and **Named customers served**. The first three financial concepts use independent headings, short explanations, colours, and top accents so their totals cannot be mistaken for one another.

The End of day page now has a **Print / Save as PDF** button. It invokes the browser’s native print dialog; the owner can select a printer or use the browser/device’s standard Save as PDF option. Printing reads the rendered local summary only. It does not create a receipt, database record, local copy, upload, or external export. Printed output includes this required disclaimer:

> **End of day summary — not a receipt, invoice, tax document, or accounting statement.**

Stage 7 adds a local **Purchases** workspace. Owners can save suppliers, archive suppliers, record a multi-line purchase, and review completed purchase history. A completed purchase records supplier name, product name, quantity, unit cost, line total, overall cost, date, optional note, and a linked `purchase` stock-in movement. The Stock page includes a Purchases entry point and identifies these movements as **Purchase received**.

| Capability | Delivered behaviour |
| --- | --- |
| Suppliers | Local create, edit, and archive actions with active-name duplicate protection. |
| Purchase completion | Active supplier and active products only; at least one product; each product permitted once per purchase; positive whole quantity; valid unit cost. |
| Stock integrity | One atomic local transaction creates purchase/lines/movements and increases every product count together. Failure rolls back all of those writes. |
| Duplicate protection | A persisted purchase `submissionKey` returns the already completed purchase on retry, preventing another stock increase. |
| Historical facts | Completed purchase records are read-only. Supplier and product names are immutable snapshots, unaffected by later supplier changes or archiving. |
| Costs | Historical purchase cost only. It does not update selling price, product cost price, profit, tax, valuation, supplier balance, or accounting. |
| Local resilience | Purchases function against saved local records while disconnected after an initial application load. Reconnection does not upload anything. |

## Explicit exclusions

This release does **not** add a close-day control, day lock, reset, cloud sync, sync queue, accounts, remote database, automatic upload, payment API, QR payment, supplier balance, supplier debt, supplier repayment, invoice, purchase order, expenses, accounting, profit calculation, tax calculation, inventory valuation, or Stage 8 feature. The existing Backup feature and presentation remain unchanged.

## Database and migration

The local Dexie schema advances from **v8 to v9**. It adds three record stores: `suppliers`, `purchases`, and `purchaseLines`; it also indexes `purchaseId` on the existing `inventoryMovements` store and adds `purchase` as a supported movement type.

The migration is additive. It does not rewrite existing business data. A v8-to-v9 regression fixture preserved business profile, product, sale, payment, receipt, Mobile Money provider/reference snapshot, and existing sale movement records exactly, while the three new stores began empty.

Backup/Restore now exports and restores the three new tables atomically with the original record set. It accepts valid older backups without these tables as empty purchase data. The read-only integrity audit now reports missing supplier links, absent/invalid purchase lines, mismatched purchase totals, missing linked stock-in movements, and invalid purchase-movement links; it never repairs or changes records automatically.

## Validation evidence

| Validation | Result |
| --- | --- |
| Focused local regression | **5 files / 16 tests passed** for End of day print, routes, suppliers/purchases, Backup/Restore, and integrity. |
| Full automated regression suite | **25 files / 76 tests passed.** |
| TypeScript | `pnpm check` passed with no errors. |
| Production/PWA build | `pnpm build` passed; manifest, service worker, and Workbox artifact were generated. |
| Production dependency audit | `pnpm audit --prod` reported **No known vulnerabilities found**. |
| Stage 7 browser workflow | Passed on the dev app and production PWA preview: offline purchase with one supplier/one line created one purchase, one line, one positive purchase movement, and stock `2 → 5`; it persisted after reopen and the restored-connection notice confirmed nothing was uploaded. |
| Real browser UI flow | Created **Stage Seven Wholesaler**, completed **4 × Stage 3 Cooking Oil at GHS 8.50 = GHS 34.00**, observed immutable purchase history, then verified Stock showed count `10` and `Purchase received · +4 units · Purchase from Stage Seven Wholesaler`. |
| End of day print safety | Real browser print control invoked; before/after counts across sales, payments, receipts, repayments, products, movements, suppliers, purchases, and lines were identical. |
| Stage 4 regression | Offline Mobile Money part-payment sale, provider/reference, receipt, repayment, stock, reconnection no-upload notice, and reopen persistence passed. |
| Stage 5 regression | Home totals, debt, low stock, best seller, repayment activity, offline wording/no-sync, and unchanged Backup route passed. |
| Stage 6 regression | Daily sales/received/unpaid meanings, methods, low stock, links, offline visibility, and no-close-day boundary passed. |
| Backup/Restore regression | Existing owner backup and recovery validation passed. |
| Integrity browser regression | Existing local record-check interface passed. |
| Keyboard regression | Skip-link focus and main-content navigation passed. |
| Responsive review | Phone-size screenshots were captured for End of day, Purchases, and Backup. The protected preview lacked a business profile, so those pages correctly displayed their setup gates. Real browser validation used a configured business for live workflows. |

## Known non-blocking advisories

The production build continues to warn that the main JavaScript chunk exceeds 500 kB after minification. The build also reports stale `baseline-browser-mapping` data, and pnpm reports that legacy `pnpm.patchedDependencies`/`pnpm.overrides` fields are not read by the installed pnpm release. These are pre-existing toolchain advisories; they did not prevent type checking, testing, PWA artifact generation, audit, browser workflows, or deployment.

## Owner acceptance checklist

1. Open the deployed release and go to **Stock → Purchases**.
2. Add a supplier. Add a second active product in Stock if you want to test a multi-line purchase.
3. Record a purchase with supplier, date, one or more products, positive quantities, and unit costs. Confirm its total before completion.
4. Complete it once. Verify Stock counts increase exactly once and Stock history shows **Purchase received** with the supplier name.
5. Return to Purchases. Confirm the completed history shows the original supplier, product, quantity, unit cost, and total. Edit or archive the supplier and confirm old purchase history keeps its original supplier name.
6. Create a local backup, then confirm its summary includes supplier/purchase counts. If you perform a restore test, make a fresh backup first because Restore replaces the current device record.
7. In End of day, compare the four top panels after a part-paid or Credit sale and a customer repayment. Confirm recorded sales, money received, and unpaid amounts remain distinct.
8. Press **Print / Save as PDF** and check that the browser print preview has the current local summary and the printed disclaimer. Cancel safely if you do not want a paper/PDF copy.
9. After first loading the app, place the device/browser offline. Record a small purchase and confirm the local status remains clear. Restore connectivity and confirm there is no sync/upload claim.
10. Refresh/reopen and confirm the completed purchase, stock quantity, and purchase movement remain available.

> **Waiting for owner testing. Do not begin Stage 8 until the owner has personally tested this deployed release and explicitly approved it.**
