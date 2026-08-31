# Project Initialization Review

**Project:** African Micro-Business Operating App  
**Review date:** 24 August 2026  
**Status:** **Awaiting approval to begin Stage 1**

## Purpose and stage discipline

This review follows the supplied project brief’s required first action. It assesses the available environment, the local workspace, repository access, technical approach, data layer, risks, and a proposed Stage 1 plan. It does **not** begin Stage 1 business functionality. In particular, no business profile, product, stock, customer, sale, payment, credit, receipt, dashboard, or cloud-sync feature has been implemented.

The product will be built one approved stage at a time. The next implementation work will begin only after an explicit instruction equivalent to: **“Stage 1 approved. Proceed to Stage 1.”**

## 1. Environment and workspace findings

The current workspace is a managed project at `/home/ubuntu/business-app`. It is a client-only React application using TypeScript, Vite, Tailwind CSS, Wouter routing, and a library of accessible UI primitives. The server directory is only a static-serving compatibility layer; no application backend, server database, account system, or paid service is currently present.

The scaffold started successfully, and its baseline type-check and production build both passed. The production build emitted a bundle-size warning from scaffold dependencies; it is not a build failure, but Stage 1 should remove the unused example content before treating the shell as a lean mobile application.

| Area | Finding | Implication |
| --- | --- | --- |
| Application runtime | React 19, TypeScript, Vite 7, Tailwind CSS 4, Wouter | A lightweight browser application can be delivered without an application server. |
| Current data storage | No business database is installed yet | A proper IndexedDB-based data layer is still required before Stage 1 is complete. |
| Current test tooling | Vitest is available, but no `test` command or test suite exists | Stage 1 must add a runnable test command and focused database/navigation tests. |
| Current PWA support | No service worker or web manifest has been configured | Stage 1 must add an offline app shell; the app will need one successful online load before a browser can install/cache its service worker. [2] |
| Local version control | Local branch `main` exists at bootstrap commit `12fe8f1`; the managed remote is an internal artifact remote | Work is locally versioned, but it is not linked to the requested GitHub repository. |
| Design preparation | `ideas.md` records the selected **Tactile Ledger** direction; original logo and supporting visual assets are reserved for later use | The interface will be mobile-first, calm, legible, and non-ERP-like. No UI feature has been built from this direction yet. |

## 2. GitHub repository review

The GitHub connection was enabled so the requested repository could be inspected. The connected account is authenticated, but the repository name `business-app` could not be resolved under that account, and no accessible organization membership was returned. The external repository therefore remains **unconfirmed**: it may not exist yet, it may be owned by a different user or organization, or its owner may need to be specified.

| Required question | Result | Current status |
| --- | --- | --- |
| Is `business-app` present under the connected account? | No exact accessible repository was found. | **Not confirmed** |
| Is it private? | Cannot be checked until the repository can be identified. | **Not confirmed** |
| Is it empty? | Cannot be checked until the repository can be identified. | **Not confirmed** |
| Is the managed workspace linked to it? | No. The local remote points to the managed project artifact store, not GitHub. | **No** |

Before committing Stage 1 to GitHub, please provide the exact `owner/business-app` repository path or create the private repository under the connected account. No repository has been created, changed, or pushed during this review.

## 3. Recommended technical stack

### Recommendation

Use a **static React + TypeScript progressive web application (PWA)** with **IndexedDB** as the authoritative local database, accessed through **Dexie**, an IndexedDB-focused TypeScript wrapper. Use **Vite PWA / Workbox** to cache only the app shell and static assets. There will be no traditional application backend, cloud database, account requirement, or AI dependency in the initial product.

IndexedDB is appropriate because browsers provide it as a transactional client-side store for substantial structured data with indexes; it is specifically a better fit than small key-value web storage for durable business records. [1] Dexie is proposed to keep the IndexedDB schema, transactions, migrations, and tests readable without replacing IndexedDB with a remote service. The app-shell cache will be separated from business records: Workbox-style precaching makes the built application resources available to a registered service worker for offline request handling, while business data remains in IndexedDB. [2]

| Layer | Proposed technology | Why it fits this product | Explicitly not used initially |
| --- | --- | --- | --- |
| Interface | React 19 + TypeScript + Tailwind CSS | The current scaffold already supports a maintainable, responsive mobile interface. | Native mobile app framework, complex design system replacement |
| Navigation | Wouter | Already present; small client-side routing surface for the app shell. | Server-side routing |
| Local business data | IndexedDB, accessed with Dexie | IndexedDB provides structured indexed storage and transactions in the browser. [1] Dexie keeps the data-access code small and testable. | `localStorage` as the primary business database, remote database |
| Offline shell | `vite-plugin-pwa` with Workbox-generated service worker | Enables installable PWA behavior and carefully versioned cache updates. [2] | Offline caching of arbitrary network data |
| Validation | Zod and React Hook Form, already in the scaffold | Keeps form rules close to the user interface and makes invalid data explicit. | Server-only validation |
| Testing | Vitest + fake IndexedDB test environment | Allows repeatable tests of migrations, database reads/writes, and transaction failure behavior without a server. | Untested manual-only behavior |
| Future backup | Versioned export files, then one optional OAuth-authorized cloud file provider | Preserves user ownership and avoids using cloud files as the live database. | Automatic multi-provider sync, cloud database |

### Alternatives considered

| Option | Strength | Why it is not recommended for the MVP foundation |
| --- | --- | --- |
| Browser `localStorage` | Very simple for preferences | It is a string key-value store, not an appropriate primary record system for sales, stock movements, balances, and transactions. [1] |
| Direct IndexedDB APIs | No extra dependency | Correct but verbose; it would add low-level asynchronous code and make transaction/migration tests harder to read. |
| SQLite compiled to WebAssembly | Familiar relational model | It increases download, caching, and persistence complexity before the business workflow requires relational SQL. |
| Traditional cloud database | Easy remote backup and multi-device access | Conflicts with the brief’s local-first, low-cost, no-unnecessary-backend principle and makes internet availability part of the daily workflow. |

## 4. Proposed local database design

### Stage 1 database boundary

Stage 1 will create and test a versioned `TallybookDB` database with a small `appMeta` store. This proves that the local database opens, upgrades safely, and remains independent of a backend without prematurely creating incomplete business records.

The future domain schema will be documented in Stage 1 but introduced incrementally with the related stages and database migrations. This avoids a large, speculative database while preserving a consistent model for future work.

| Future store | Introduced no earlier than | Integrity rule |
| --- | --- | --- |
| `businessProfiles` | Stage 2 | One active profile per local app installation unless a later approved multi-business model is introduced. |
| `categories`, `products` | Stage 3 | Archive records rather than silently deleting records that may later be referenced. |
| `inventoryMovements` | Stage 3 | Stock changes are append-only movements with a reason and timestamp; stock is not overwritten without a trace. |
| `customers` | Stage 4 | The outstanding balance is derived or transactionally maintained from authoritative records, never manually edited as a loose total. |
| `sales`, `saleLines`, `payments`, `receipts` | Stages 5–6 | A completed sale, payment, stock change, customer history entry, and receipt sequence update must execute in one local transaction. |

All future records will use stable generated IDs, ISO timestamps, explicit schema versions, and integer minor currency units rather than floating-point money. Business-changing operations will go through one data-access layer rather than allowing pages to write stores directly.

## 5. Offline, backup, and recovery approach

The service worker will cache the compiled application shell and selected static assets. IndexedDB will hold the local business records. These are deliberately separate: deleting a cache must not delete records, and an app update must not overwrite business data. Service worker updates will be versioned and user-visible only when a refresh is needed.

The PWA’s first visit needs a successful network load to obtain and register the service worker; after that, the cached shell can start without connectivity. [2] The browser can still impose storage quotas or remove non-persistent site data in some situations, so the product will clearly explain this limitation, request persistent storage where supported, and later add tested export/restore before any cloud-provider integration. [1]

At Stage 9, the first export format will be a versioned, self-describing business-data package containing a schema version, export timestamp, records, and an integrity check. Import will validate the package before it replaces local data. Only after export/restore tests pass will the project evaluate one owner-authorized cloud-file provider for backup copies. Cloud storage will not become the live database and multi-device synchronization will not be promised before conflict handling is designed and tested.

## 6. Security and privacy baseline

The initial local-only architecture deliberately avoids storing authentication credentials or business data on an application server. It does not make a shared smartphone secure by itself: anyone who can use an unlocked device/browser profile may access the local app. Stage 1 will document this limitation, keep sensitive values out of source control, validate untrusted form input from the beginning, and use safe error boundaries that do not expose raw database data.

Backup encryption, app-level locking, multi-user authorization, and third-party OAuth will not be added speculatively. Each needs an approved user experience and threat model before implementation.

## 7. Technical risks and mitigations

| Risk | Why it matters | Mitigation and decision point |
| --- | --- | --- |
| Browser storage eviction or user-cleared data | Local records can be lost outside the app’s control. | Request persistent storage where supported, explain device/storage limits, and prioritize tested export/restore in Stage 9. |
| Incomplete multi-record writes | A sale could otherwise alter stock, balances, and payments inconsistently. | Use Dexie/IndexedDB transactions for business workflows starting in Stage 5; test both success and failure paths. |
| Schema migration failure | An update could make existing data unreadable. | Version each database migration, run fixture-based upgrade tests, and never make destructive changes without recovery planning. |
| PWA cache/data confusion | An update may appear to lose data if caching is poorly designed. | Cache shell assets only; keep records in IndexedDB; add explicit update and recovery states. |
| Device loss or shared-device privacy | Offline local data remains on the device. | Document the limitation now; evaluate optional local lock/encrypted backup only with a defined threat model. |
| Repository ambiguity | Stage work cannot be committed to the specified private GitHub repository until it is identified. | Provide the exact GitHub owner/path or create the private repository before the Stage 1 Git handoff. |
| Scope expansion | ERP-style features can delay the core workflows. | Enforce the supplied twelve-stage gate and limit Stage 1 to foundation work. |

## 8. Proposed Stage 1 implementation plan

### Scope

Stage 1 will establish a working, mobile-first, offline-capable foundation. It will **not** implement a complete business workflow or a business-setup form.

| Work package | Proposed implementation | Evidence of completion |
| --- | --- | --- |
| Tooling and dependencies | Add Dexie, a PWA plugin, a fake IndexedDB test environment, and a `pnpm test` command; remove unused scaffold example code. | Clean dependency lockfile, runnable tests, type-check, and production build. |
| Project structure | Add dedicated `app`, `db`, `routes`, `features`, `components`, and `test` areas with a small, documented import boundary. | Source tree communicates where future business rules and UI live. |
| PWA foundation | Add manifest, install metadata, service-worker registration, and an intentionally scoped app-shell precache. | Production build contains PWA output and can load its shell offline after initial installation. |
| Local database foundation | Add typed `TallybookDB`, version 1 `appMeta`, a database readiness check, and a migration convention. | Automated test opens the database, writes/reads metadata, and handles initialization failure safely. |
| App shell and navigation | Replace the scaffold sample page with a mobile-first ledger shell, accessible route structure, bottom action rail, and honest “coming in a later stage” routes. | Navigation works on a phone-sized viewport without presenting unfinished business features as complete. |
| Error-handling conventions | Add a user-friendly application error boundary, database error state, and user-visible offline/saved-status language. | Error paths are testable and do not expose raw technical details to an owner. |
| Documentation | Create and synchronize `product-spec.md`, `architecture.md`, `database.md`, `offline-first.md`, `security.md`, `testing.md`, and `changelog.md`. | Each document reflects the Stage 1 implementation and known limitations. |
| Version control | Commit logical milestones after tests and documentation; link or prepare the private GitHub repository once its exact path is available. | Meaningful commit messages and commit hash in the Stage 1 Completion Report. |

### Proposed Stage 1 acceptance checks

| Acceptance criterion from the brief | How it will be checked |
| --- | --- |
| Application starts successfully | Start the development server and open the shell. |
| Opens on a mobile browser | Check the responsive shell at a phone-sized viewport and, where available, install/use it as a PWA. |
| Basic navigation works | Automated route smoke test plus manual navigation between the Stage 1 shell routes. |
| Local database initializes correctly | Automated test of `TallybookDB` open, metadata read/write, and initialization error handling. |
| Operates without a backend | Confirm no business API endpoint or remote database is required; manually start the cached app shell after initial registration. |
| Automated tests can run | Run the new test command in a clean local test environment. |
| Project builds successfully | Run `pnpm check` and `pnpm build`. |
| Git repository contains initial implementation | Commit the approved Stage 1 work; push only once the specified private repository is identified. |
| Documentation explains the architecture | Review the required docs against the final code and include the exact architecture decision in the Stage 1 report. |

## 9. Decision requested

Please review the proposed stack and Stage 1 boundary. The recommended approach is deliberately local-first: **React + TypeScript + PWA shell + Dexie/IndexedDB + Vitest**, with no backend and no AI feature.

If you approve this approach, reply:

> **Stage 1 approved. Proceed to Stage 1.**

If the intended repository exists under a different owner or organization, include its exact path, for example `organization/business-app`, before or with that approval. I will then implement **only Stage 1**, test it, update the required documentation, commit logical milestones, provide the Stage 1 Completion Report, and stop for your next approval.

## References

[1]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API "MDN Web Docs — IndexedDB API"
[2]: https://vite-pwa-org.netlify.app/guide/service-worker-precache "Vite PWA — Service Worker Precache"
[3]: https://dexie.org/docs/Dexie/Dexie.transaction/ "Dexie — transaction API"
