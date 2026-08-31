# Stage 11 Completion Report — Multiple Local Companies on One Phone

**Status: Stage 11 implemented and ready for owner testing.** This release implements the owner-approved Option 1: more than one named company can be managed on one phone while the existing local-first IndexedDB/Dexie engine remains the source of truth. It does not introduce cloud sign-in, remote identity, cross-device access, automatic upload, synchronization, or ownership transfer.

## Delivered outcome

The owner can create and select multiple local companies from Business settings. The active company is visible in the shared header and desktop rail, and the operating routes continue to use the selected company’s local records. The company-management workspace explains that records remain on the device and separates company selection, new-company creation, and the destructive clear action.

All relevant business services now use the active company scope: products and inventory movements, customers and derived debt, sales and sale lines, payments and receipts, repayments, Mobile Money providers, suppliers and purchases, expenses, reports, sharing inputs, and company management. Switching companies changes the active local preference and refreshes the selected profile and derived views; it does not submit or mutate a business transaction.

## Database and migration changes

Schema version 11 adds explicit `businessProfileId` indexes and scope to child records that previously relied on parent relationships, including sale lines, payments, receipts, customer activities, and purchase lines. Existing scoped records are preserved. The migration deterministically backfills child scope from its saved parent and keeps the legacy `primary` profile as the first local company. The active company is stored as the `appMeta` preference `activeBusinessProfileId`; this is a device-local selection preference, not an identity credential.

The clear operation deletes only records whose `businessProfileId` equals the selected company id, deletes that company profile in the same Dexie transaction, and then selects a remaining company or returns to first-company setup. The application does not perform a generic database wipe.

## Backup and clear safeguards

Backup export is company-scoped. The exported file contains the active company profile and only its directly or indirectly scoped records, including inventory, customers, sales, payments, receipts, repayments, Mobile Money provider/reference snapshots, suppliers, purchases, expenses, and relevant metadata. Existing legacy backup parsing remains supported, including older backups that predate later record tables and child scope fields.

The clear action is disabled until the active company has a recorded company-specific export. It also requires the owner to type the exact company name and uses a button whose accessible name includes that company. The final transaction removes only the selected company’s local records. The browser validator confirmed that the other company and its product remain after clearing the selected company.

During final review, a legacy expense-backup validator still required `businessProfileId === "primary"`. That was corrected to accept any non-empty validated company id, and a regression test now proves that an expense belonging to a non-primary company can be exported and parsed.

## Validation results

| Validation | Result |
| --- | --- |
| Full Vitest regression suite | **Passed — 28 test files, 87 tests** |
| Targeted backup regression | **Passed — 4 tests**, including non-primary expense export/parse |
| TypeScript check (`pnpm check`) | **Passed** |
| Production PWA build (`pnpm build`) | **Passed**; manifest and service worker generated |
| Production dependency audit (`pnpm audit --prod`) | **0 vulnerabilities** across 177 production dependencies |
| Two-company browser/offline validator | **Passed** against the production PWA preview |
| Offline switch isolation | **Passed**; active company changed without mixing seeded records |
| Pre-backup clear guard | **Passed**; clear remained disabled before company export |
| Company-scoped export | **Passed**; export status named the selected company |
| Exact-name clear | **Passed**; matching company name enabled only the selected clear action |
| Selected-company deletion | **Passed**; cleared company disappeared while the remaining company and product stayed |
| Offline PWA reopen | **Passed**; cached shell reopened with the remaining company and without the cleared company |
| Desktop visual review | **Passed** at 1280px width |
| Mobile visual review | **Passed** at 390px width; controls stacked without horizontal overflow |
| Diff/whitespace check | **Passed** with `git diff --check` |

The browser scenario used disposable loopback IndexedDB data and never operated on the owner’s actual records. It exercised the production PWA preview, waited for service-worker control, emulated offline conditions, switched between two seeded companies, exported the selected company, verified the clear guard, cleared only the selected company, and reloaded through the cached shell.

## Known advisories and limitations

The application is still local organization, not authentication. Anyone with access to the unlocked phone and its browser storage may be able to access the local companies. This stage intentionally does not add a PIN, account sign-in, cloud encryption, remote revocation, or device registration.

Clearing a company is irreversible from the device after confirmation. Recovery depends on the owner retaining and successfully verifying the exported backup file. The owner should export the company immediately before clearing it if the latest local changes matter. A backup file is an owner-controlled local file and should be protected like the business records it contains.

The build reports two non-blocking warnings: pnpm ignores the legacy `pnpm` field in `package.json`, and Vite reports the main JavaScript chunk is larger than 500 kB. The build also reports that the installed baseline-browser-mapping data is older than two months. None of these warnings blocked the type-check, test suite, PWA build, or browser validation.

After service-worker-served offline reload, Chromium reported `navigator.onLine` as true even though the reload was served from the cached shell under emulated offline conditions. The validator therefore treats the pre-reload network emulation and successful cached-shell render as the offline proof, rather than relying on that browser hint after service-worker navigation.

## Explicit exclusions

This stage does not implement remote sign-in, cloud accounts, cross-device synchronization, automatic upload, conflict resolution, buyer/recipient transfer, invited users, remote ownership changes, payment APIs, new accounting rules, or any later-stage feature. No existing Stage 1–10 business meaning, receipt behavior, inventory movement history, debt derivation, offline storage model, or backup/restore contract was intentionally replaced.

## Owner acceptance steps

1. Open the deployed build using the managed version link supplied with this handover, preferably on the phone that will hold the local records.
2. Open **Business → Manage** and confirm the workspace says **On this device** and **No cloud account or automatic upload**.
3. Create a temporary second company with a distinct name. Confirm the new company starts with an empty local ledger.
4. Use the header’s **Active company** selector to switch between the two companies. Add or inspect a temporary product in each company and confirm that the product list changes with the selected company.
5. Visit Home, Stock, Customers, Sales, Reports, and Backup after switching. Confirm the active company name remains visible and that the views do not show the other company’s temporary records.
6. Select the temporary company in Business → Manage. Confirm the clear action is disabled before a backup and that the warning says a fresh backup for that company is required.
7. Open Backup, download a local backup for the temporary company, return to Manage, and confirm the company-specific fresh-backup status appears.
8. Type the temporary company name exactly. Confirm the clear button becomes enabled only after the exact name is entered. Cancel once and verify that no records were changed.
9. Repeat the confirmation, clear the temporary company, and verify that the original company remains available with its records while the temporary company is gone.
10. Turn on airplane mode or otherwise disconnect the phone, reopen the deployed app, and confirm the remaining company and its local records are still available. Keep the downloaded backup file until the owner is satisfied with the result.

**Owner decision gate:** Stage 11 remains **WAITING FOR OWNER TESTING AND EXPLICIT APPROVAL**. Do not begin Stage 12 or any later enhancement until the owner confirms the deployed build has been personally tested and approved.

## Public verification advisory

The managed checkpoint deployment reported success for version `0198c684`, and the production PWA preview passed the Stage 11 browser validator. The earlier hosted preview had stale-cache behavior during public-domain verification, so that historical verification should not be treated as the standalone release reference. The source repository and current Vercel deployment are the authoritative release path going forward.

## Release reference

The final managed checkpoint and its owner-testable project version are attached in the handover message. The checkpoint includes the source changes, tests, browser validator, visual notes, public-verification notes, and this report. No separate cloud deployment or external hosting action is required.

## References

[1]: `stage11-multiple-local-companies-plan.md` — approved Option 1 implementation plan and safeguards.
[2]: `stage11-visual-validation-notes.md` — desktop and mobile visual validation notes.
[3]: `../scripts/stage11-multiple-companies-browser-check.mjs` — disposable production-PWA browser/offline validator.
