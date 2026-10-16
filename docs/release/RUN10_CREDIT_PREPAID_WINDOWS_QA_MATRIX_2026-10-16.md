# Tallybook V19 Run 10 — Customer credit and prepaid-money acceptance drill

**Authored:** 2026-10-16. **Execution:** NOT EXECUTED. This is a synthetic-data test protocol, not permission to change any production customer, financial, or cloud records.

## Isolated environment

Use an isolated checkout at the exact Run 10 draft SHA, disposable Windows 11/10 account and distinct browser profile, pinned Node **24.19.0**, pnpm dependencies already installed, CPU-only low-spec Windows baseline (target 8 GB RAM), fresh IndexedDB sample-company fixtures, no production Supabase/payment provider/real customer data. Never reset the owner's personal browser site storage or business's current financial ledger. Log OS timezone, browser version, RAM/disk, SHA-256 of fixtures, commit SHA, test account and captured evidence. `scripts\RUN10_WINDOWS_READONLY_QA.cmd` runs a subset of native, Vitest, TypeScript and local build checks with no deployment. It is not the full acceptance contract; also run the **entire** repository tests, Playwright, security reviews and exact-head CI.

## Required negative and positive reconciliation cases

| Scenario | Expected outcome / proof |
| --- | --- |
| Two customers, each GHS 20.00 credit | Two separate outstanding receivables; no customer-level leakage or swapped IDs |
| Customer A repays 5.00 while customer B owes 20.00 | A 15.00, B 20.00, total 35.00 in debt screen, management report, daily report and CSV |
| Customer A's saved repayment illegally exceeds A's debt while B still owes | Company-wide report and backup parser fail closed instead of showing a deceptively positive aggregate |
| Customer A repayment falsely linked to B's sale | Post and portable restore rejected; unchanged saved money/stock |
| Two saved repayment IDs or submission keys collide | Refuse duplicated cash receipts even if overall debt remains nonnegative |
| One valid 7.50 partial repayment linked to original sale | Exactly 7.50 sale allocation, original saved sale balance maintained and company debt reduced once |
| Legacy repayment without `saleAllocations` | Retain as customer-only evidence; never invent invoice settlement or change original sale links |
| Older unallocated payment followed by fresh linked payment | Follow existing fail-closed target selection; no retroactive guess |
| Sale-linked repayment dated before its sale | Reject time-inconsistent historical payment evidence |
| Full reversal of unpaid credit sale | One exact negative reversal, no phantom repayment, credit exposure released only once |
| Full reversal of already-linked paid sale | Reject until reconciled; no money/stock posting silently reversed twice |
| New customer cash repayment retried with identical submission key | Exactly one saved posting; a changed amount or allocation rejects |
| Competing repayment tabs and simultaneous new credit sale | Shared Web Locks plus same-store IndexedDB transactions preserve one coherent debt; no overpayment/over-limit |
| Company switched while posting | Abort before commit; no collection attributed to wrong company |
| Company one known GHS, another customer known USD in same single-currency report | Cross-currency management total refused; no implicit conversion |
| Historical money missing currency | Local debt inspection shows denomination unverified; new currency-denominated collection refused |
| Prepaid cash deposit 25.00, wallet checkout 20.00 | Real external cash inflow 25.00 once; wallet consumption 20.00 is **not** new cash; saved liability 5.00 |
| Wallet funded sale fully reversed | Original wallet consumption credited to customer liability, **without** another external deposit |
| Recorded prepaid cash refund of 2.00 | Transfer and benefit debit both reduce stored liability by 2.00; requires separate business refund authorization |
| Alter transfer amount without changing wallet benefit delta | Read report and backup parse fail; no forged liability accepted |
| Missing benefit, orphan wallet credit or two transfer keys | Reject and retain evidence; do not auto-correct a customer's funds |
| Same instant encoded `Z` and offset-form with opposing wallet deltas | Accept only if exact-epoch wallet audit has no overdraft and all source links reconcile |
| Partial/failed IndexedDB repayment write, quota exceeded or closed tab | Complete transaction rollback, including staff audit; no acknowledged payment without persisted evidence |
| Backup restored to separate disposable profile | All company/customer IDs, credit allocations and prepaid funding reconcile; no live cloud identity or wallet assumptions |
| Unknown/malformed/foreign-company historical credit rows | Fail closed; preserve original portable evidence for manual review |
| 10k+ sales, multi-customer repayment and prepaid transactions | CPU-only Windows memory/latency measured and no cross-company data leaks |
| Read-only dashboard and CSV export after inserted corrupted customer payment | No misleading net totals or claim of bank-confirmed prepaid funding |

## Saved-data reconciliation and audit trail

For each test capture stable fixture digests and counts of customers, sales, saleLines, payments, repayments, saleReversals, customerBenefits, walletTransfers, inventoryMovements, staff audits, businessProfiles and appMeta journal before/after any attempted write. Manually reconcile **each customer**: saved original outstanding sale amounts less exact full reversals less saved repayments. Compare the sum of customer-level balances to the management report and dashboard. For linked repayments, prove each positive allocation is to that customer's saved sale, has matching denomination, does not precede original posting and cannot exceed that sale's remaining debt. For unallocated historic repayments, preserve unknown invoice attribution.

For prepaid accounts, separately reconcile recorded deposits less recorded external refunds, and wallet-sale consumption less refunded/fully reversed wallet spending; these must equal the **per-customer ledger-replayed stored-value liability**, not merely a net total that can mask an overdraft on an individual customer. No external cash confirmation, payment gateway settlement, banking reconciliation or FX conversion is implied.

Measure real concurrent tabs and browser Web Locks contention; no cross-tab correctness can be inferred solely from mocked functions. Run fault injections using only disposable sample data, and preserve sticky recovery journals after unexpected edits rather than clearing them.

## Acceptance evidence and decision

Native `node --test` for 42 new focused cases, all 12 new saved-data client Vitest tests, prior credit/wallet/refund/backup/finance suites, pinned semantic TypeScript `pnpm check`, Vite build, Playwright, Chrome/Firefox/WebKit, 8 GB Windows, actual power-loss test and exact-head GitHub Actions all require independent logs. Link each PASS/FAIL to SHA and immutable fixture hash. Record reviewer sign-off, CPU/RAM, complete database consistency and user-visible failure messages.

Historical 47 blocker/82 acceptance-unit classifications remain **unchanged until observed evidence**. Runs 2–10 acceptance remain OPEN / NOT PASSED. Commercial V19 stays **NO-GO**. Run 11 policy-specific returns/refunds remain an independent development and acceptance boundary.
