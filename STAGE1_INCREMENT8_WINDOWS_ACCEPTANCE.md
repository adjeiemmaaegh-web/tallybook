# Stage 1 Windows 11 Browser Acceptance Checklist

**Status:** Prepared; not executed. Stage 1 remains **NO-GO** until a human runs this checklist on Windows 11 with Chrome or Edge and records evidence. This checklist does not claim browser or Windows validation from Linux.

## Safety and test setup

Use an isolated Windows user profile and a fresh browser profile or disposable application origin. Use synthetic company, customer, product, sale, supplier, and expense records only. Do not use live payment methods, production data, or a real merchant account. Before recovery/destructive tests, export a backup and verify that it can be read. Do not edit or delete a real owner's IndexedDB database.

Record the Windows build, browser name/version, Node and pnpm versions, app build identifier, date, tester, and the exact source ZIP/patch SHA-256. Keep the browser console and app/server logs available. Capture screenshots or screen recordings only of synthetic data.

## Test cases

| ID | Procedure | Pass condition | Result / evidence |
|---|---|---|---|
| WIN-01 | Start the built app locally in the disposable profile. Create companies A and B and a small set of synthetic records in each. | App loads without uncaught errors; saved records appear in their respective company only. | Not run |
| WIN-02 | Reload the page, close/reopen the browser, and repeat the reads while offline after the app has loaded once. | IndexedDB-backed records persist; each company still sees only its own records; no unsaved operation is reported as committed. | Not run |
| WIN-03 | Open two tabs on the same origin. Keep a transaction ready in A, switch the selected company in the second tab, and attempt the operation. Repeat for sale, expense, purchase, repayment, and refund using disposable fixtures. | Stale company context is rejected or the entire transaction rolls back; no partial stock, cash, audit, or ledger writes remain after reload. | Not run |
| WIN-04 | Use the explicit application backup/export flow to create a backup. Restore it into a separate clean disposable profile, then compare company and ledger record counts and representative records. | Restore reports success; expected records and company boundaries match; the source profile is unchanged. | Not run |
| WIN-05 | In a test build or supported QA harness only, interrupt a sale, purchase, repayment, and refund after an initial table write but before transaction completion. Reopen the app and inspect all related tables/visible state. | Each incomplete operation leaves no partial record/stock/FIFO/audit changes. Do not simulate this by terminating a production browser with real data. | Not run |
| WIN-06 | In a test build or supported QA harness only, add a synthetic corrupt reference and an unsafe money value, run the explicit diagnostics, then restore the clean fixture from backup. | Diagnostic marks the scan as complete with the expected findings, makes no automatic repair, and the clean backup can be restored. If the application has no supported way to invoke/inject this test, mark Blocked rather than using production DevTools. | Not run |
| WIN-07 | With two tabs, create or update the same synthetic record concurrently and exercise the app's normal conflict/retry behavior. | No duplicated financial posting or cross-company record; any unresolved state is surfaced for manual review. | Not run |

## Sign-off

For each ID, record `PASS`, `FAIL`, or `BLOCKED`, add a short observation, and link the corresponding log/screenshot/video. Any partial write, cross-company visibility, silent repair, or unexplained lost record is a **FAIL** and blocks acceptance. Any case that cannot be run safely with the available build/harness is **BLOCKED**, not passed.

**Overall Windows browser recovery:** Not run.  
**Tester / date:** Pending.  
**Evidence location:** Pending.
