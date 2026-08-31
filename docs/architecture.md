# Architecture

## Stage 6 decision

Tallybook remains a static React and TypeScript PWA with no application backend, account, or cloud database. Stage 6 adds a `repayments` ledger store and a credit service that derives each customer’s balance from completed sale debt less saved repayments. The UI reads that derived summary in the customer detail view and writes repayment records only through `recordRepayment()`.

| Layer | Current responsibility | Primary implementation |
| --- | --- | --- |
| Customer detail | Derived balance, debt history, and mobile repayment entry. | `client/src/pages/CustomersPage.tsx`. |
| Credit service | Validate repayment, calculate debt, prevent overpayment, and write repayment atomically. | `client/src/features/credit/credit.ts`. |
| Sales service | Preserve original per-sale outstanding amounts. | `client/src/features/sales/sales.ts`. |
| Local database | Version 7 `repayments` store with customer/method/key indexes. | `client/src/db/TallybookDB.ts`. |

## Enhancement Roadmap — Stage 1 Mobile Money decision

Database version 8 adds `mobileMoneyProviders`, a local table keyed by provider ID and indexed by the single business profile and normalized provider name. Provider configuration belongs to the Business settings page. A provider contains its owner-entered name, normalized name, availability flag, and timestamps; it does not contain credentials, a payment account, or a remote connection.

`completeSale()` still owns the one local read-write transaction. For a nonzero Mobile Money payment it checks the selected active provider inside that transaction, then writes its ID, provider-name snapshot, and optional reference on the `payments` row alongside the sale, lines, receipt, customer activity, stock update, and inventory movements. The `mobile` method value is retained; no historical payment is rewritten merely to change its visible label.

Backup and atomic replace restore include the provider store. The parser accepts a version-7 backup without that new table and restores it with an empty provider list. The integrity audit is read-only: it accepts historical Mobile Money rows with no provider details, but flags a non-Mobile-Money row with Mobile Money fields or an unknown provider reference.

## Enhancement Roadmap — Stage 3 receipts and easy sharing

Stage 3 adds a read-only `receiptDetail` resolver that joins an existing receipt to its completed sale, immutable sale-line snapshots, optional payment snapshot, local business profile, and saved customer. The resolver and share formatter do not write data. A shared receipt is plain text because the recipient has no access to the owner’s local records; it includes factual business fields only and omits database identifiers and application internals.

The receipt dialog is a presentation surface invoked from saved-sale confirmation and recent sales. Native sharing, clipboard fallback, manual-copy display, and browser printing are user-triggered browser capabilities only. No schema version, backup format, backend, cloud asset, or receipt mutation is introduced.

## Balance derivation

The customer debt formula is:

> **Outstanding = Σ completed customer-sale outstanding amounts − Σ verified repayments**

There is no mutable customer balance column. The service reads the customer, their completed customer sales, and prior repayments in the same read-write transaction before writing a new repayment. It rejects a missing/archived customer, zero/invalid amount, no debt, or amount above the derived balance. IndexedDB supplies the transactional local store for this record model. [1]

## Idempotency and future extension

Repayments use a unique submission key, so a repeated browser submission returns the already-saved payment rather than applying it twice. Due dates, interest, reminders, refunds/write-offs, and repayment allocation rules are not implied by this stage; they require a separately approved financial model.

## References

[1]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API "MDN Web Docs — IndexedDB API"

## Stage 7 reporting decision

The reporting service is a **read-only derived layer** over existing IndexedDB stores. `getDashboardSummary()` and `getReportsSnapshot()` calculate values from sales, sale-completion payments, later repayments, customers, and active products. They do not add a report table, cache mutable totals, or write to business records. This keeps reports reconciled to the same local facts that drive sales, debt, and inventory screens.

The dashboard refreshes when Today receives focus or becomes visible. The Reports page uses explicit owner-selected date periods and labels its local calendar boundary. No background worker, server, account, or external analytics is introduced.

## Stage 8 recovery decision

The app shell is precached by the service worker, while business data remains exclusively in IndexedDB. The runtime does not use localStorage as a business-record fallback. The shared status badge reports database readiness first, then reports a browser offline event as **Working offline** when the local ledger is ready. This is recovery guidance, not a synchronization system.

Tests exercise database close/reopen, a version-6-to-7 upgrade, invalid schema metadata healing, and a failed atomic sale. The browser scenario additionally turns the loaded page offline, records a sale through the real UI, confirms a cached shell request, restores connectivity, and opens a fresh local page.

### Restored-connection notification

`ConnectionRestoredNotifier` is a presentation-only component at the application root. It observes browser `offline` and `online` events, then uses the existing toast provider only when an offline session becomes online. It does not access sales, IndexedDB records, a network endpoint, an account, or a synchronization queue.

## Stage 9 local backup architecture

`features/backup/backup.ts` is the single local backup boundary. It reads every authoritative IndexedDB store into a versioned `tallybook-local-backup` JSON document, validates that document before any restore work begins, and replaces all record stores inside one Dexie transaction. The Backup page owns browser file selection and download; it does not contain data conversion logic.

The backup artifact is a portable file controlled by the owner. It has no remote endpoint, token, account, cloud provider, queue, background worker, or merge behavior. Restore is deliberately replace-only because a merge could silently duplicate sales or corrupt stock history.

## Stage 10 presentation boundary

Stage 10 stays in the presentation layer. `AppShell` adds the main landmark, keyboard skip link, and route announcement; pages add polite feedback semantics to existing saved/loading messages. These adjustments do not modify the IndexedDB schema, services, transaction boundaries, backup document, or report derivation.

## Stage 11 hardening decision

`auditLocalIntegrity()` runs entirely inside a read-only IndexedDB transaction. It cross-checks sale lines, totals, outstanding amounts, sale-completion payments, receipts, customer activities, repayments, inventory movements, profile count, and schema metadata. The service returns an issue list rather than changing records; only an owner-approved restore can replace data.

The production static-server fallback now uses middleware after static assets, which preserves client routing with the current Express runtime without relying on a legacy wildcard route matcher. No record API was introduced.

## Stage 12 release boundary

Stage 12 does not change the static React, PWA, IndexedDB, or local-file architecture. The release candidate remains a client-first application whose installation and offline behavior must be tested on the owner’s target browser and device before it is called production-ready.

## Stage 6 approval repair

Checkout uses the shared minor-unit money parser for both the live payment preview and the atomic sales service. This accepts grouped inputs such as `10,000.00` consistently. Sales refresh runs after the receipt state is committed and no longer holds the visible completion lock; a bounded completion guard releases the action with a retry-safe error if a local operation does not settle in time.

### Blocking control repair

The checkout control now derives its native `disabled` attribute solely from the in-progress submission state. Cart readiness is represented as an explanatory presentation state, while `complete()` remains the single validation authority that reports an absent item, a missing named customer, or an invalid amount.
