# Offline-First Design

## Stage 6 offline behavior

Debt review and repayment recording run against the local IndexedDB database. The owner can reopen a customer, see their outstanding amount, and record a repayment without an API, account, or network connection. The service-worker cache only serves the application shell; it does not hold financial records.

| Concern | Storage location | Stage 6 rule |
| --- | --- | --- |
| Sale debt and repayments | IndexedDB | Balance is recalculated from saved local records. |
| Repayment retry | Unique local submission key | A delayed or repeated submission returns one repayment record. |
| Application shell | Service-worker cache | Requires one successful connected load before offline reuse. [1] |
| Cloud copy | Not implemented | Export/import remains Stage 9 work. |

Browsers retain their own quota and eviction policies, so Stage 6 does not claim permanent device storage. [2] The formal recovery and interrupted-write test program remains Stage 8 responsibility.

## Enhancement Roadmap — Stage 1 Mobile Money offline behavior

Provider setup, provider availability, optional payment references, and Mobile Money payment snapshots are all stored in IndexedDB. A Mobile Money sale uses the same local atomic transaction and submission key as Cash, Card, partial, and Credit sales. Once the PWA shell has been loaded, this workflow does not call a payment provider, validate a reference online, upload a record, or queue a synchronization task.

Closing and reopening the browser reads the saved provider configuration and payment metadata from IndexedDB. The service-worker cache remains an application-shell cache only; it is not a payment, provider, or business-data store.

## References

[1]: https://vite-pwa-org.netlify.app/guide/service-worker-precache "Vite PWA — Service Worker Precache"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API "MDN Web Docs — IndexedDB API"

## Stage 6 approval repair

The repair remains entirely on-device. It does not introduce a server retry, remote queue, or new data store; it makes a delayed local sale completion return to a clear retry-safe UI state while the existing unique sale submission key prevents a retry from duplicating a saved sale.

The Complete sale control can now report local readiness issues without becoming a disabled network-like wait state. No connection is required for this feedback or for the following sale attempt.

## Stage 7 offline reporting

The dashboard and reports read the same local database as operational screens, so current information remains available offline. Period filters are evaluated using the device’s local calendar boundary. Report refresh does not request a network resource, synchronize data, or rely on a remote cache.

## Stage 8 reliability validation

The production PWA precaches its app shell through Workbox, enabling a previously loaded shell to respond while offline. [1] The browser validation uses an isolated origin, loads the app, disables the network, records a real local sale, verifies the receipt and stock change, checks a cached shell fetch, then opens a fresh page after connectivity returns. Business data is verified after the reopen from IndexedDB—not from the service-worker cache.

The owner-facing boundary remains important: browser storage can be cleared by device or browser actions, so Stage 8 does not claim durable backup. Stage 9 is reserved for export/import and backup recovery.

When connectivity returns, the app provides confirmation only: **Connection restored. Your records remain saved on this device. Nothing was uploaded.** No transfer is attempted because this local-only stage has no remote destination or sync protocol.

## Stage 9 local backup and restore

Backup export and import remain available offline because they operate on IndexedDB and the browser’s local file APIs. The downloaded JSON is a user-owned copy, not a service-worker cache entry. A restore needs no internet connection; it validates the selected file and atomically replaces the local record. [3]

The browser controls where a downloaded backup file is stored. Tallybook cannot guarantee its retention, so owners should keep deliberate copies. Cloud-file storage evaluation remains a later decision after local restore is approved.

## Stage 10 offline impact

The skip path, focus treatment, route announcement, onboarding copy, and accessible status messages work locally and do not depend on connectivity. Stage 10 does not change service-worker caching, IndexedDB behavior, offline status detection, or backup export/import.

## Stage 11 offline integrity

The local record check works offline because it reads IndexedDB only. It does not send integrity details, backup contents, customer information, or sales data to a server. An integrity warning does not disable normal browsing or delete data; the owner can still create a local backup for recovery.

## Stage 12 owner test boundary

The release-candidate checklist distinguishes verified local offline behavior from target-device installation and performance checks that still require owner testing. It makes no claim that all browsers will install or behave identically offline.
