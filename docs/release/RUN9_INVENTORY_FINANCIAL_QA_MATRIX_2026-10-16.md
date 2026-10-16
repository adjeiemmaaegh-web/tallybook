# V19 Run 9 — Inventory costing and independent financial reconciliation QA

**Authored 2026-10-16; execution: NOT RUN.** This acceptance drill is for a disposable test checkout and synthetic business data only. No production database, actual customer transactions, stock, payment processor, or live Supabase modifications are authorized.

## Scope and equipment

Use pinned Node 24.19.0, pnpm dependencies already installed in a disposable V19 checkout, Chrome/Edge on an affordable CPU-only Windows device (8 GB RAM target), optional Firefox/WebKit on separate disposable browser profiles, and two synthetic business workspaces. Record the exact Git SHA, product versions, browser/storage implementation, RAM/disk limits, file hashes, OS date/timezone and screenshot/log identifiers. The script `scripts\RUN9_WINDOWS_READONLY_QA.cmd` prepares focused Node-style tests, selected Vitest, TypeScript checks and local build **without** deployment; also run the complete repository test suites, native QA and browser checks against the same exact SHA. Do not run the destructive fault-injection matrix against anyone's daily-use browser profile.

## Required stock, invoice and money checks

| Fixture / fault | Expected result | Required evidence |
| --- | --- | --- |
| FIFO: opening 2×100 minor, receive 3×200, sell 4 | Sale COGS 600; current known stock value 200; 1 physical unit | Saved immutable cost events and movement/receipt links, sale lines and period CSV |
| Full sale reversal with all stock restored | One matching per-line FIFO reverse event, as-of stock restored, signed period COGS reversed once | Sale, reversal, original issue, stock movement, reverse-cost event |
| Delete reverse-cost event but keep negative money reversal | Report and backup parse reject; never claim verified negative COGS | Same synthetic records unchanged except injected defect |
| Alter reverse-cost quantity, source ID, timestamp or original sale | Fail closed even if journal elsewhere looks plausible | Exact error and no mutation from read-only report |
| Partial return matching saved cash-refund and cost | One-to-one sale line, quantity and source-movement, no new invented receipt cost | Cash partial return journal, original issue, cost restoration, product quantity |
| Duplicate partial return cost reference / overlapping full refund | Reject double-cost credit and conflicting financial correction | Negative tests and unchanged original ledger |
| Supplier invoice 2×300 and matching stock receipt | Verified purchase cost evidence count increments; added FIFO layer retains 300-per-unit | Purchase line total, purchase record total, movement, cost receipt |
| Tamper purchase line price/total or FIFO unit price | Supplier-cost report and portable restore preflight reject | Byte-level fixture diff and exact rejection |
| Tamper purchase unit quantity or linked stock source | Reject mismatch and do not show certified inventory assets | Saved invoice/movement/event triples |
| Purchase currency mismatches business currency, or missing with new cost receipt | Refuse to coerce a foreign/unknown currency into selected financial report | GHS vs USD distinct saved currencies, no automatic FX |
| Old pre-cost-ledger purchase without FIFO events | Mark unverified legacy purchase, do not invent receipt costs | Historical fixture with no new event |
| Legacy stock of 3 with unknown unit acquisition cost | Known partial value excludes unverified units; complete value unavailable | `unknownCostUnits=3`; no multiplication by editable product.costPriceMinor |
| Stock with no history and zero units | Zero current physical stock, zero known value, no fabricated opening receipt | Saved empty product cost-event list |
| Change editable product price after receiving stock | Historical asset cost/COGS do not change | Before/after immutable events and reports |
| Re-run idempotent checkout and supplier purchase | No second issue/receipt, sale or invoice; changed intent rejected | Event and cost receipt counts remain constant |
| Two simultaneous checkouts exhausting stock | Only one commits; cost layers and movement balance remain nonnegative | Cross-tab locks and IndexedDB commit/rollback |
| Backdated supplier purchase date | Store recorded `purchaseDate`, but FIFO sequence and immutable `createdAt` chronology remain authoritative; no silent retroactive recosting | Current timestamps, sequence and saved purchase date |
| Fraudulent receipt allocation / layer cost / duplicated source | FIFO replay rejects before report/backup acceptance | Corrupt fixture and error, no mutation |
| Foreign company product, purchase or cost event in selected snapshot | Fail cross-tenant validation; no leakage into report | Both synthetic company identities and scoped snapshots |
| Overflow / fractional quantity / negative asset stock | Fail-safe integer checks and prevent negative resulting stock | Extreme boundary and no partial write |
| Encrypted Run 8 backup containing tampered cost | Decrypt succeeds when file is correctly re-encrypted for test, but ledger validation rejects wrong return/purchase cost | Tampered synthetic file, valid encryption, failed schema/cost preflight |
| Storage/quota fault after cost event and before receipt/stock commit | IndexedDB transaction rolls back all money, stock and cost writes | Before/after table row digests and aborted-transaction error |
| 10k+ receipt/sale-line synthetic history | Report remains responsive on low-spec Windows; per-product and per-sale indexing avoids naive repeated full scans | Measured elapsed time, peak RAM, responsiveness, source version |

## Accounting display contract

The `inventoryValuation` field is **as-of current persisted stock**, independent of the selected report period. It includes `knownValueMinor`, `unknownCostUnits`, `unverifiedProducts`, `trackedProducts`, and `totalValueMinor` **only when every physical stock unit has verified receipt cost**. It is neither sale proceeds, cash, replacement cost, an independent inventory count nor a statutory asset balance. Historical legacy stock without cost evidence is not valued at current product price.

The `purchaseCostEvidence` counts purchases with all invoice lines matched to FIFO receipts and distinguishes legacy invoices without cost-event lineage. It does not certify external supplier payment or bank settlement. If a purchase carries saved unit costs in another currency, do not silently convert or sum it into GHS. The existing currency-specific supplier payable report and tax policy remain independently governed.

Verify sale COGS period conservation separately from this **as-of** inventory asset snapshot. In reports and CSV, checked period sale price minus verified FIFO COGS is before expenses and not statutory profit. Refund policy stays independently configurable per client company; Run 11 remains responsible for policy snapshots and broader authorized returns.

## Evidence and decision

Capture: exact-head native Node, full `pnpm test`, `pnpm check`, build and browser logs; 53 focused pure/static test results and 12 new Vitest/IndexedDB tests; two-company fixture manifests; lossless table digests for products, movements, cost events, purchase lines, sales/lines, refunds, payment evidence and restored file; positive and tamper-probe screenshots with synthetic data; low-spec Windows performance measurements; third-party review findings. A bare 53/53 V8 mock result or a passing CSV screenshot is not acceptance.

Document unresolved test failures and DO NOT update the historical 47-blocker / 82-acceptance classifications without observed exact-final-SHA evidence. **Current run acceptance NOT PASSED. V19 release NO-GO.**
