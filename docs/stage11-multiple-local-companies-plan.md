# Stage 11 Implementation Plan — Multiple Local Companies on One Phone

> **Plan only. No Stage 11 code, schema, local-data migration, sign-in, company switcher, clear action, PWA configuration, or deployment behavior has changed.**

## 1. Owner-approved direction

The owner selected **Option 1: multiple local companies on one phone while keeping the local-first architecture**. One person should be able to keep more than one company in the same installed app, choose the active company, and see the active company name clearly. If a company is sold, the owner should be able to remove that company’s local records safely without deleting another company.

This plan intentionally does **not** pretend that a local company selector is internet authentication. There will be no account server, remote identity, automatic upload, cloud sync, or cross-device sign-in in this stage. The words **Choose company**, **Active company**, and **Clear this company from this phone** are safer than claiming that the device has verified a person’s identity.

## 2. The practical owner outcome

The owner can create or keep two or more named companies on one phone, switch between them, and operate each company as if it has its own ledger. Sales, customers, stock, suppliers, purchases, expenses, receipts, repayments, reports, and sharing messages must use only the active company’s records.

The owner can also select one exact company in Business settings, make a fresh verified backup of that company, confirm its name by typing it, and clear only that company from the device. The clear action is irreversible from the device after confirmation. It must never clear all companies by default and must never imply that a remote copy was deleted.

## 3. Scope and exclusions

| Included in Stage 11 | Explicitly excluded from Stage 11 |
| --- | --- |
| Multiple company profiles in the existing local database. | Remote accounts, cloud workspaces, backend authorization, or cross-device sign-in. |
| Active-company header identity and a clear company switcher. | Automatic upload, synchronization, sync queues, or conflict resolution. |
| Safe creation and selection of a company on the same phone. | Device registration, device limits, remote sign-out, or remote access revocation. |
| Company-scoped operations, reports, backup/restore, integrity, and sharing. | A buyer account, automatic company transfer, contact invitation, or payment provider API. |
| A guarded clear-this-company action after a fresh verified backup. | Full accounting, new debt rules, profit rules, or changes to sales/payment meanings. |
| Migration of the existing single `primary` company into the multi-company model. | Any Stage 12 or later feature. |

The existing five primary operating routes—Home, Stock, Customers, Sales, and Reports—remain in place. Company management remains contextual under Business settings and does not displace Backup or the primary navigation.

## 4. Proposed local data model

The existing `businessProfiles` store becomes the local company/workspace list. Its `id` changes from the current literal-only type to a validated string company identifier. The existing profile with id `primary` remains the same company and is not renamed during migration.

A new local metadata value, `activeBusinessProfileId`, records which company is selected on this phone. It is a UI/device preference, not a business record and not an identity credential. If it points to a missing or archived company, the app must stop at a clear company-selection state rather than silently choosing another company.

All business data must be scoped. Records that already have `businessProfileId` keep their value. For child records that currently inherit scope through a parent—sale lines, payments, receipts, customer activities, and purchase lines—the proposed v11 migration adds an explicit `businessProfileId` derived from the existing parent relationship. This makes filtering, backup, integrity checks, and clear-company deletion auditable and avoids relying on an unsafe implicit join during a destructive action.

| Store or record | Company-scope rule |
| --- | --- |
| `businessProfiles` | One row per local company; id is the company identifier. |
| Categories, products, inventory movements, customers | Keep and validate existing `businessProfileId`. |
| Sales, repayments, Mobile Money providers, suppliers, purchases, expenses | Keep and validate existing `businessProfileId`. |
| Sale lines, payments, receipts, customer activities | Add `businessProfileId` derived from their saved sale/customer relationship. |
| Purchase lines | Add `businessProfileId` derived from their saved purchase relationship. |
| `appMeta` | Add the active-company preference and retain backup metadata without treating it as business history. |

No migration may invent a new sale, payment, customer, stock movement, purchase, expense, receipt, or repayment. If a child record cannot be linked deterministically to an existing company, migration must fail safely, preserve the original database, and show recovery guidance rather than guessing.

## 5. Migration proposal: v10 to v11

The migration must be additive and transactionally safe. Before touching records, the app should confirm that the legacy `primary` business profile exists and that every existing scoped record points to `primary`. It should then add the new indexes and child `businessProfileId` fields using deterministic parent lookups, set `activeBusinessProfileId` to `primary`, and leave all original ids, totals, timestamps, names, prices, snapshots, movements, and historical meanings unchanged.

A representative v10 database containing business details, products, customers, sales, payments, receipts, repayments, suppliers, purchases, expenses, and Mobile Money snapshots must reopen as one company named exactly as before. The migration must be tested with empty, populated, and malformed legacy fixtures. A failed migration must not leave a partially upgraded local database.

New companies receive a new id before their profile is saved. Company creation and active-company selection must use a single local transaction for the profile and active preference where both are changed together. A company name is descriptive data, not a unique security identity; duplicate names should therefore be allowed only if the interface makes the identifier unambiguous, or else rejected with a plain explanation. The safer initial choice is to require distinct names on one device while showing the immutable internal id only in recovery diagnostics, not in ordinary business copy.

## 6. Active-company isolation rules

A shared active-company context must be established before operating pages read data. Every service query must receive the active company id or a scoped database helper. No feature may fall back to `primary` once multiple companies exist, except the one-time legacy migration and explicit backward-compatible backup parsing.

The following invariants are mandatory:

1. The header, desktop rail, mobile shell, Business settings, Backup, and destructive dialogs visibly name the active company.
2. Switching company clears page-local drafts and in-memory derived summaries before loading the next company. It must not submit a sale, repayment, expense, purchase, or adjustment during switching.
3. A sale can use only products, customers, and Mobile Money providers belonging to the active company. The same rule applies to purchases, repayments, expenses, reports, and sharing messages.
4. Derived debt, dashboard totals, Business Health totals, low-stock lists, reports, and End of day summaries must be recalculated after switching and must not retain the previous company’s values.
5. A route opened with a stale company id, missing company, or invalid active preference must show a safe selection/error state and must not guess.
6. Backup, restore, integrity, and clear actions must be explicitly scoped and must report the company name and record counts before any replacement or deletion.

## 7. Safe clear-company workflow

“Clear all the data” must be presented as **Clear this company from this phone**, never as a generic wipe button. The workflow is deliberately multi-step:

| Step | Safeguard |
| --- | --- |
| Select | Show the company name, currency, record counts, and active status. A user must select one company. |
| Preserve | Require a fresh export of that company and a successful parse/verification before enabling clear. Existing backup files remain owner-controlled. |
| Review | Show the exact categories of records that will be removed: products, stock movements, customers, sales, payments, receipts, repayments, suppliers, purchases, expenses, and company settings. |
| Confirm | Require the owner to type the exact company name, with case-sensitive matching and a visible Cancel action. |
| Execute | Delete only records with that company id in one local transaction. Do not delete another company or the app shell. |
| Finish | Select another remaining company, or show the first-company setup state if none remain. Explain that recovery depends on the verified backup. |

The clear transaction must verify the company still exists and that the confirmation still matches immediately before deletion. It must not run while an export or restore is in progress. If any deletion fails, the transaction must roll back. The audit must never auto-repair or silently remove malformed records; if a company has integrity issues, the UI should require a verified export or owner decision before continuing.

The first Stage 11 implementation should not add a local PIN and should not describe the feature as identity security. A PIN could be considered separately only with an explicit threat model, recovery design, and owner approval.

## 8. Backup and Restore contract

The current Backup/Restore behavior must remain recoverable and truthful while becoming company-aware. The proposed backup format version increases additively only if required by the final record shape. Existing v1 single-company backups must remain readable and be treated as the legacy `primary` company. New backups must include the company id and scope explicitly.

For ordinary use, the safest Stage 11 UI is **Back up this company** from the active-company context. The export must include that company’s profile and all directly or indirectly scoped records, including Mobile Money provider/reference snapshots, sales, payments, receipts, customers, repayments, products, movements, suppliers, purchases, expenses, and relevant local metadata. Restoring a company must preview its name, currency, and counts, then replace only a company scope in one transaction; it must never merge records by guessing.

A full-device multi-company backup can be considered only if the owner explicitly wants it. It should be a separately labelled action from a single-company backup so the owner understands whether the file contains one company or all companies. No downloaded file should be called a completed transfer to a buyer until the recipient independently restores and verifies it.

## 9. UX and accessibility

The active company name should be visible in the top bar and desktop rail, with a compact **Switch company** control near Business settings. On mobile, the company name must remain readable without displacing the saved-on-device/offline status. The switcher should be keyboard reachable, have an accessible label, use an opaque surface, and announce the newly active company.

Business settings should contain three separated areas: company list, create/select company, and the dangerous clear action. Clear should use a strong warning surface, a text input with an explicit label, a non-destructive Cancel action, and a final button whose name includes the selected company. Empty states should explain how to create the first company. Error states should say what was not changed and direct the owner to Backup or retry.

The app should continue to use the established compact cobalt operating UI, solid readable surfaces, visible focus, skip navigation, screen-reader announcements, and truthful local/offline status. No “synced,” “securely stored in the cloud,” or “available on every device” wording may be introduced.

## 10. Validation strategy

| Area | Required proof |
| --- | --- |
| Migration | v10 with a populated `primary` company opens as v11 with every record unchanged and active company set to `primary`; malformed linkage fails without partial upgrade. |
| Isolation | Two companies with similarly named products/customers produce separate stock, sales, debt, purchases, expenses, receipts, reports, and Business Health totals. |
| Switching | Switches are refresh-safe, clear drafts, recompute summaries, preserve the previous company, and never write a record accidentally. |
| Sales and debt | A sale cannot use a product/customer/provider from another company; repayments affect only the active company’s derived debt. |
| Purchases and expenses | Purchase stock-in and manual expenses remain separate and company-scoped; no records cross the boundary. |
| Backup | Legacy v1 backup restores as `primary`; new company-scoped backup previews correct counts and preserves all snapshots. |
| Clear | Exact-name confirmation removes only the selected company, rolls back on failure, requires fresh verified backup, and preserves another company exactly. |
| Integrity | Read-only audit reports missing/wrong company links and never repairs or deletes them. |
| Offline/reopen | Create, switch, export, clear, and reopen with the shell cached; no network, upload, or sync claim appears. |
| Accessibility | Keyboard company switching, focus visibility, labels, announcements, dialog cancellation, and mobile touch targets pass. |
| Regression | All Stage 1–10 workflows remain valid, including Mobile Money, debt, receipts, End of day, purchases, expenses, sharing, Backup, and restore. |

The owner-data browser checks must use a disposable database or isolated profile only. No test may clear or restore the owner’s actual records.

## 11. Risks and controls

The main risk is **cross-company contamination**: one company’s sale, stock, debt, or report appearing in another company. The control is a single active-company context, explicit scope on every record, scoped service queries, and two-company browser fixtures.

A second risk is **unsafe deletion**. The controls are fresh verified backup, exact company display, typed confirmation, a separate clear action, a one-company transaction, rollback on failure, and no automatic remote deletion.

A third risk is **false security expectations**. The control is plain wording: this is local separation and organization, not account authentication. A person with access to the unlocked phone may still access local data unless a separately approved device-lock design is added.

A fourth risk is **backup leakage or accidental full-device replacement**. The control is explicit scope in export previews and restore dialogs, legacy parsing tests, count previews, and no guessed merge behavior.

## 12. Owner decisions required before implementation

Please confirm the following decisions:

1. **Scope:** multiple named local companies on one phone only, with no true remote sign-in or cross-device access.
2. **Active company:** show the active company name in the header and require deliberate switching.
3. **Legacy migration:** preserve the existing `primary` company and its records exactly as the first company.
4. **Clear behavior:** clear only one selected company, require a fresh verified backup and exact typed company-name confirmation, and never clear all companies by default.
5. **Backup scope:** begin with an explicit **Back up this company** workflow; consider an all-companies device backup only as a separately approved follow-up if needed.
6. **Security language:** do not call the local selector sign-in or identity verification, and do not add a PIN in this stage.

> **Approval gate:** After the owner confirms these decisions and explicitly approves this implementation plan, Stage 11 implementation may begin. Until then, no authentication, company-scoping schema, switcher, clear action, or backup behavior will be changed. Stage 12 remains blocked.
