# Run 12 — Supplier, expense, tax and backup real-device acceptance protocol

**Status: NOT EXECUTED (2026-10-16).** Use only synthetic, disposable data in a separate Windows profile and throwaway database. No live supplier payouts, banking, payment-provider calls, cloud finance SQL, staging, production data or external deployment.

## Device setup and reproducibility

Capture exact Run 12 Git SHA, pinned Node **24.19.0**, pnpm version, full dependency lockfile digest, Windows 10/11 edition, browser and IndexedDB versions, RAM/CPU (including 8 GB CPU-only baseline), disk quota, local timezone and locale. Execute `scripts\RUN12_WINDOWS_READONLY_QA.cmd` in an isolated checkout and archive all logs; then execute full native, client Vitest, TypeScript, Vite and browser suites separately. Reopen the browser profile after each crash/restore drill; record transaction counts and stable record digests.

## Mandatory real saved-data cases

| Area | Setup and action | Required result |
| --- | --- | --- |
| Supplier unknown | Post stock purchase without liability recognition | Outstanding is **UNKNOWN**, not zero or assumed paid |
| Supplier recognized | Owner verifies an entirely unpaid invoice and recognizes it once | Exact saved purchase amount, supplier and currency; repeated identical key idempotent |
| Supplier duplicate | Reuse recognition key on different invoice | Reject; no new liability |
| Partial payment | Pay a fraction of explicitly recognized supplier liability | Due = recognition - manual payments - credits, no inventory mutation |
| Full settlement | Pay remainder with valid tender | Due becomes zero, no negative payable |
| Overpayment | Pay 1 minor unit more than due | Reject atomically; no staff audit or settlement added |
| Supplier credit | Record credit memo without tender | Due decreases, cash outflow does not |
| Supplier credit forged as bank | Supply bank tender with credit | Reject |
| Purchase predated settlement | Save supplier payment timestamp before original purchase | Reject during report/backup validation |
| Malformed supplier timestamp | Use offset text, impossible calendar date or noncanonical UTC | Reject; no normalization that hides corruption |
| Missing purchase currency | Import legacy receipt without currency | Unknown liability, no invented GHS |
| Foreign supplier | Link settlement to wrong company, supplier or currency | Reject |
| Two businesses | Company A supplier settlement attempted after switching to B | Reject, preserve both company ledgers |
| Concurrent tabs | Two tabs settle the same outstanding invoice | Only valid aggregate up to recognized amount can commit |
| Interrupted settlement | Browser kill/quota exception after planned payable write | Atomic commit or rollback, no half staff audit |
| Expense with matching company currency | Record a genuine expense | Expense total increases, supplier payable does not change |
| Expense with wrong currency | Enter USD expense in GHS company | Reject before expense journal mutation |
| Expense staff revocation | Revoke staff/shift while expense form open | Transactional permission recheck refuses stale authorization |
| Local cash net | 100 GHS collection, 10 GHS expense, 20 GHS supplier payment | Separate 70 GHS net; supplier payment not also classified as expense |
| Foreign supplier currency | GHS company pays a USD supplier invoice | Report separately by USD, never convert or deduct USD from GHS cash net |
| Tax default | No owner tax policy | Future sales have no recorded tax snapshot; not a claim of tax exemption |
| Tax registered | Owner explicitly chooses one registered rate | Inclusive/exclusive arithmetic and saved snapshot match exactly |
| Tax not registered | Owner tries to enable tax without confirmed registered status | Reject |
| Tax policy change | Save taxable sale, then disable tax | Historical tax snapshot remains unchanged; future sale off |
| Full return tax | Reverse eligible sale under configured refund policy | Signed reversal offsets exactly the saved original tax |
| Partial cash tax | Return restockable cash line under eligible policy | Refund tax allocation agrees with original invoice; no double refund |
| Duplicate full/partial | Try both for same sale | Reject conflicting refund and stock/tax restoration |
| Legacy tax | Older sale has no tax snapshot | Historical tax unknown, never inferred zero or current rate |
| Bad tax snapshot | Tamper taxable, tax, total or registration fields | Report and backup preflight reject |
| Supplier backup | Export and import recognized liability, payments and credits | Exact currency/amount/identity/history and supplier due retained |
| Damaged backup | Tamper supplier recognition, event date, tax or refund | Refuse before any company data is replaced |
| Restore on second device | Transfer encrypted backup to disposable second browser/Windows device | Exact supplier/tax/expense money digests; no live service calls |
| Large data | 10k purchases, 10k settlements, 10k expenses, 10k taxable sales | Record latency, memory, quota, report/export/restore timings; no silent truncation |

## Evidence and owner review

Collect before/after raw journal counts, receipt/settlement/expense amounts and currencies, policy versions, original-sale tax snapshots, supplier due, cash net, tax refund components, staff audit, browser console logs, multi-tab chronology, full CI output and restore digests. Distinguish saved **manual** supplier payment attestations from bank/provider confirmation. Statutory VAT/GST, supplier input tax, tax filings and jurisdictional law review are **not implemented** and require separate explicit scope and approval.

No blocker or acceptance item may be promoted based only on the 52 V8 source checks. **Runs 2–12 acceptance NOT PASSED; V19 release NO-GO.** No live data, payment, SQL, staging or deployment authorization.
