# Tallybook V19 Run 11 — Company return policy, authorization and crash/restore QA matrix

**Authored 2026-10-16; execution status: NOT EXECUTED.** Use a disposable Windows 10/11 account and isolated browser profile containing only generated synthetic company, customer, receipt, inventory, wallet and staff records. Never clear or rewrite any real company's IndexedDB, activate provider payments, apply Supabase SQL, issue external refunds, merge to main, stage or deploy.

## Before testing

Log exact draft-head Git SHA, pinned Node **24.19.0**, pnpm and browser versions, OS timezone, test company IDs, clock adjustments, synthetic fixture digests and physical CPU/RAM/disk specs (8 GB RAM CPU-only Windows baseline). Clone Run 11 in a test checkout with existing pnpm dependencies and run `scripts\RUN11_WINDOWS_READONLY_QA.cmd` to capture focused native/TypeScript/Vitest/build logs. The script does **not** itself exercise browsers or claim commercial readiness. Run **all repository tests** and supported browsers separately at the exact head.

## Company ownership and policy behavior

| Test scenario | Required observed behavior |
|---|---|
| Existing company upgraded from no policy history | Return state is **disabled**; no false implied entitlement to refunds |
| Newly created company with no policy | Same default-off behavior; independent of all other companies |
| Owner deliberately permits full refunds but not partial | Full reversal can proceed only for matching eligible original sale; partial cash path remains blocked |
| Owner deliberately permits cash-only partial but not full | Cash restock is restricted to genuine previously paid cash walk-ins, while full reversal refuses |
| Owner sets no refunds at all | All new full/partial return posting fails before any money, stock or benefit mutation |
| Owner disables refunds after an eligible original sale | Any new return is blocked; earlier completed returns remain historically recorded |
| Owner enables refunds after a sale recorded under no-refund policy | Prior sale is **not** retroactively eligible; new sales capture enabled terms |
| Original sale predates Run 11 and lacks a policy snapshot | New automated refund fails closed, historical sale stays readable; future separate owner-reviewed legacy recovery needed |
| Same original sale under 1-day terms, current policy later expanded to 30 days | Original 1-day entitlement remains binding |
| Original sale under 30-day terms, current policy narrows to 1 day | Current stricter limit is enforced at posting |
| Original sale outside max return interval | Reject regardless of available stock, permission, apparent refund amount or override |
| Owner changes the policy twice at the exact same millisecond or with backdated timestamps | Reject ambiguous chronology; maintain existing saved revision history |
| Owner edits name/phone/currency via ordinary profile form | Return-policy history is retained intact, not overwritten by form values |
| Company A permits refunds, B forbids refunds | Active-company switch cannot use A's revision to authorize B; cross-company sales/returns are blocked |
| Staff cashier/supervisor lacking owner permission attempts changing policy | Reject; no revision or staff audit created |
| Owner changes policy while a refund checkout is pending | IndexedDB transaction and origin Web Lock recheck current company record; stale approval cannot commit |
| Policy history is truncated, reordered, assigned duplicate revision, made future-dated or structurally corrupt | Refuse financial report/backup validation; do not silently default to enabled or rewrite history |
| Saved original sale policy snapshot tampered | Reject backed-up or reported verification of return terms |
| Saved full reversal or cash return decision snapshot changed or replaced with another company's revision | Reject; do not hide corrupt record |
| Historical cash refund previously posted without policy evidence | Preserve financial/cost/stock records, label **legacy policy unverified**, never claim Run 11 authorization |
| New refund posted under allowed policy, then policy disabled | History audit keeps earlier refund verified against decision-time revision, current policy refuses new posting |

## Financial and inventory invariants

| Scenario | Required observed behavior |
|---|---|
| Valid full reversal of eligible sale | Exact signed money/receivable reversal, original FIFO layers and batch quantities restored once, immutable policy evidence stored on reversal |
| Valid cash-only restockable partial return | Exact saved invoice allocation/tax/discount/physical cash acknowledgment/FIFO restock, plus immutable policy evidence |
| Duplicate return submission key/repeated physical cash refund | Reject second posting and staff informs operator that prior refund already exists |
| Full reversal attempted after a partial return for same sale | Reject duplicate/conflicting refund or stock correction |
| Partial return after full reversal | Reject |
| Customer/credit/points/wallet/provider-funded partial return attempted in initial cash-only lane | Reject unsupported flow even if company policy allows cash partial refunds |
| Service, batch-stock, unknown currency, unverified original tax policy | Reject unsafe cash partial return; not silently substitute other disposition |
| Bad original receipt or payment evidence | Reject before cash return journal is recorded |
| Altered stock movement/FIFO original issue/restoration, supplier costs or refund tax | Financial report and backup preflight reject inconsistent evidence |
| Staff permission or open shift revoked during posting | Deny operation under staff gate; no partial financial write |
| Storage/quota abort or simulated browser kill around a local refund commit | All affected IndexedDB money, inventory and policy evidence transact atomically or fail with preserved original records |
| Cross-tab: one business disables refunds as another attempts posting | Relevant company profile in same Dexie transaction protects permission snapshot; check exact winner and no unauthorized post |
| No browser Web Locks or raw third-party writer | Document unsupported adversarial cross-tab behavior; do not infer safety from isolated mocks |
| Restoring an earlier encrypted Run 8 file | Return policy history, original-sale snapshot and recorded refund decision all survive; older legacy refunds remain labeled unverified |
| Reinstall to another disposable device/browser profile | Verify policy revisions, original sale terms, return journal, staff audit, tax/cost and cash totals using stable record digests |
| 10k+ historical returns, revisions and stock rows on 8 GB Windows | Measure report performance, browser responsiveness, memory, crash and quota behavior; no unsafe auto-approvals |

## Distinct legal and financial requirements

The per-company no-refunds choice describes **application policy**, not a legal determination: statutory consumer rights and jurisdiction-specific obligations may override chosen terms. Do not claim legal compliance or implement a universal return interval. Owner-configured terms are different from staff permission. In a legacy zero-staff bootstrap company, the app's earlier permissive owner bootstrap still exists; owner identity proof is not cryptographically secured, and is an open security gate.

The initial **partial** posting lane supports only local, confirmed physical cash already given for a fully paid, noncustomer cash sale with supported tax, stock and FIFO evidence; it is **not** a payment provider refund or bank payout. Broader credit/provider/wallet/services/damaged goods refunds need separately authorized implementations and tests; do not reinterpret the owner toggle as activating unsupported channels.

Device-local policy history can be tampered with by someone who directly controls local IndexedDB; this is not tamper-proof record custody. A full immutable external audit, live device cross-tab/browser/performance testing and appropriate legal policy review are open acceptance criteria.

## Required evidence for review

Collect `node --test` output for **48 focused policy/source checks**, all **12 Run 11 IndexedDB/Vitest cases**, previous cash return, credit reversal, FIFO/receivable/prepaid, business setup, backup and report suites, complete native and pnpm/TypeScript/build/Playwright, exact-final-head Actions and actual Windows multi-tab/power-loss simulations. Record time order, before/after record counts and digests, synthetic stock/customer balances, draft PR SHA, source versions and reviewer signature.

Do not promote historical **47 blockers / 82 acceptance units** without witnessed evidence. **Runs 2–11 acceptance NOT PASSED; V19 commercial NO-GO.** The 20-run plan proceeds in development cadence only.
