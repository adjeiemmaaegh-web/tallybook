# Stage 1 Checklist

- [x] Verify the linked GitHub repository and reconcile the local workspace safely.
- [x] Add the PWA, local database, and testing dependencies with locked versions.
- [x] Implement the mobile-first application shell, navigation, accessibility foundations, and error states.
- [x] Implement the versioned Dexie/IndexedDB database foundation and migration conventions.
- [x] Configure offline app-shell behavior, manifest, and service-worker registration.
- [x] Add Stage 1 automated database, routing, and offline-foundation tests.
- [x] Create and synchronize the required documentation files.
- [x] Run type-check, tests, production build, offline checks, and responsive visual verification.
- [x] Create meaningful Stage 1 commits, push to the approved private repository, and record the commit hash.

# Stage 2 Checklist

- [x] Define the business-profile schema and safe local migration from Stage 1.
- [x] Implement offline business setup and business-profile editing with clear validation.
- [x] Persist profile changes through the local database and reflect the saved business identity in the app shell.
- [x] Add regression tests for creation, editing, invalid input, and database persistence.
- [x] Update product, architecture, database, offline-first, security, testing, and changelog documentation.
- [x] Run mobile visual checks, type-check, tests, and production PWA build.
- [x] Commit and push Stage 2 changes, then provide the required completion report.

# Stage 3 Checklist

- [x] Define product, category, stock summary, and append-only inventory-movement schema with a safe local migration.
- [x] Implement product and category creation, editing, archiving, stock adjustments, and low-stock indicators.
- [x] Ensure every stock change creates an inventory movement atomically and cannot silently overwrite inventory history.
- [x] Add regression tests for product lifecycle, stock increase/decrease/correction, low stock, persistence, and migration.
- [x] Update product, architecture, database, offline-first, security, testing, and changelog documentation.
- [x] Run mobile visual checks, type-check, tests, and production PWA build.
- [x] Commit and push Stage 3 changes, then provide the required completion report.

# Stage 3 Approval Fixes

- [x] Reproduce and inspect archive visibility controls and shared select-menu rendering.
- [x] Make archive/show/hide behavior visible, stateful, and accessible while preserving historical movements.
- [x] Give the shared select dropdown content an opaque, readable surface on desktop and mobile.
- [x] Add archive visibility regression coverage and update Stage 3 documentation/changelog.
- [x] Run targeted tests, type-check, full test suite, production PWA build, and mobile visual verification.
- [x] Complete user-facing archive and dropdown interaction retest before Stage 3 approval.

# Stage 3 Archive Discoverability Repair

- [x] Make the archived-record access control persistently visible from the Inventory screen whenever archived records exist.
- [x] Verify archiving makes the active-list change and archived-record access immediately obvious.
- [x] Extend archive UI regression coverage and update the Stage 3 repair notes.
- [x] Run type-check, full tests, production PWA build, and responsive visual verification.
- [x] Commit and push the archive-discoverability repair, then request Stage 3 approval again.

# Stage 3 Archive Live-State Correction

- [x] Diagnose the archived-record count/render path against the live Inventory state.
- [x] Make the Archived records entry point visible even before the current-page state refresh completes.
- [x] Add regression coverage for archive visibility after refresh/reopen and update repair notes.
- [x] Run type-check, full tests, production PWA build, and responsive verification.
- [x] Commit and push the correction, then wait for Stage 3 approval without starting Stage 4.

# Stage 4 Checklist

- [x] Define customer records, customer activity entries, and a safe Stage 3-to-4 local database migration.
- [x] Implement offline customer creation, editing, archiving, search, and clearly bounded customer-history views.
- [x] Establish a balance-safe customer model that does not fabricate balances before approved sales and payment stages.
- [x] Add regression tests for customer lifecycle, validation, archive behavior, persistence, search, and migration.
- [x] Update product, architecture, database, offline-first, security, testing, and changelog documentation.
- [x] Run mobile visual checks, type-check, tests, and production PWA build.
- [x] Commit and push Stage 4 changes, then provide the required completion report.

# Stage 5 Checklist

- [x] Define sale, sale-line, payment, receipt, and customer-activity records with a safe Stage 4-to-5 migration.
- [x] Implement an atomic sale-completion service that validates stock, writes related records, updates inventory, and leaves no partial state on failure.
- [x] Build a mobile sale workflow with product quantities, customer or walk-in selection, payment method, payment amount, discount, and receipt confirmation.
- [x] Add regression coverage for cash/card/mobile/credit sales, partial payment, multiple products, insufficient stock, cancellation, persistence, and migration.
- [x] Update product, architecture, database, offline-first, security, testing, and changelog documentation.
- [x] Run mobile visual checks, type-check, tests, atomic-transaction checks, and production PWA build.
- [x] Commit and push Stage 5 changes, then provide the required completion report.

# Stage 5 Approval Repairs

- [x] Reproduce the partial-payment entry and stuck completion behavior from the actual sales interface.
- [x] Make payment amount controls explicit for named-customer partial and credit sales, with clear checkout guidance.
- [x] Ensure sale completion clears loading state on success and failure and prevents duplicate submissions.
- [x] Add UI and service regression coverage for partial payment, duplicate clicks, failure recovery, and one-time inventory/receipt/customer updates.
- [x] Run cash, partial-payment, credit, insufficient-stock, persistence, customer-balance, and duplicate-click checks.
- [x] Run full tests, type-check, production PWA build, and mobile interaction verification.
- [x] Commit and push the Stage 5 repair, then provide an updated completion report while waiting for approval.

# Stage 6 Checklist

- [x] Define repayment records, repayment activities, and a safe Stage 5-to-6 local database migration.
- [x] Implement a mobile debt ledger with customer balance summaries, repayment entry, payment methods, notes, and clear debt status.
- [x] Derive customer outstanding balance from completed sales minus verified repayments; prevent overpayment and detached repayments.
- [x] Add regression tests for full/partial repayments, multiple repayments, overpayment rejection, customer isolation, persistence, and migration.
- [x] Update product, architecture, database, offline-first, security, testing, and changelog documentation.
- [x] Run mobile visual checks, type-check, tests, balance-integrity checks, and production PWA build.
- [x] Commit and push Stage 6 changes, then provide the required completion report.

# Stage 6 Approval Repairs — Business Identity and Sale Completion

- [x] Reproduce the missing saved-business-name display on the Today and operating screens with isolated local data.
- [x] Repair business-name presentation wherever the completed local business profile should be visible.
- [x] Reproduce the Complete sale loading-state failure from the actual partial-payment workflow and identify the underlying error path.
- [x] Ensure Complete sale resolves to a saved sale or a visible error, always leaves loading state, and never creates duplicates.
- [x] Add focused regression coverage for business-name display and sale-completion failure recovery.
- [x] Run full tests, type-check, production PWA build, and isolated browser checks for both reported issues.
- [x] Update repair documentation, commit, push, and wait for renewed Stage 6 approval without starting Stage 7.

# Stage 6 Blocking Repair — Live Complete Sale Control

- [x] Capture the live browser properties and computed disabled/busy state of the Complete sale control after a valid customer sale is ready.
- [x] Identify and remove the condition that leaves the real completion control disabled or on a waiting cursor.
- [x] Add a browser-level regression that confirms the control is clickable before save and returns from busy state after save or a validation error.
- [x] Run full tests, type-check, production PWA build, and the repaired live-style browser workflow.
- [x] Update repair documentation, commit, push, and wait for renewed Stage 6 approval without starting Stage 7.

# Stage 7 Checklist

- [x] Review the Stage 7 specification and define reconciled dashboard measures from completed local sales, payments, repayments, inventory, and customer records.
- [x] Implement a mobile-first Today dashboard that reports only saved local facts and provides clear route-outs to the supporting records.
- [x] Add basic offline reporting views with transparent date/time boundaries and reconciliation rules.
- [x] Preserve Stage 1–6 workflows and ensure no report can mutate a sale, stock record, customer, or repayment.
- [x] Add regression coverage for report totals, reconciliation, empty states, persistence, and local-only operation.
- [x] Update product, architecture, database, offline-first, security, testing, and changelog documentation.
- [x] Run full tests, type-check, production PWA build, and responsive browser verification.
- [x] Commit and push Stage 7 changes, then provide the required completion report while waiting for approval.

# Stage 8 Checklist

- [x] Review the Stage 8 specification and map the critical offline, refresh/reopen, migration, interrupted-write, and invalid-data recovery scenarios to current local workflows.
- [x] Verify business setup, product/inventory changes, customer updates, sales, repayments, dashboard, and reports remain usable from local records without a network dependency.
- [x] Add or improve owner-facing local-storage recovery guidance without claiming cloud backup or permanent device storage.
- [x] Add regression coverage for restart persistence, migrated local data, invalid recovery input, and atomic sale failure safety.
- [x] Run isolated browser checks that create data, disconnect-style reload/reopen the application, and verify no local business record is lost or duplicated.
- [x] Update product, architecture, database, offline-first, security, testing, and changelog documentation.
- [x] Run full tests, type-check, production PWA build, and responsive recovery guidance verification.
- [x] Commit and push Stage 8 changes, then provide the required completion report while waiting for approval.

# Stage 8 Approval Repair — Connection Restored Notification

- [x] Add a concise toast only when a previously offline local session regains connectivity.
- [x] Keep the message truthful: connection restored does not upload, synchronize, back up, or change saved local records.
- [x] Do not add a manual sync button, server call, account, cloud destination, or any Stage 9 backup/export work.
- [x] Add regression coverage for offline-to-online notification behavior and verify no toast appears on initial online load.
- [x] Run type-check, full tests, production PWA build, and an isolated browser connection-transition check.
- [x] Update repair documentation, commit, push, and wait for renewed Stage 8 approval without starting Stage 9.

# Stage 8 Final Connection Feedback

- [x] Set the connection-restored toast to dismiss automatically after three seconds.
- [x] Make the header show a persistent offline indicator for the whole offline session, returning to saved-local status when connectivity returns.
- [x] Retest online/offline transitions, local records, and the connection-restored toast.

# Stage 9 Checklist

- [x] Review the Stage 9 specification and define a versioned local backup format, validation rules, overwrite confirmation, and post-import verification contract.
- [x] Implement a mobile-first backup workspace that exports all local business records without a server or account.
- [x] Implement guarded local import/restore with file validation, explicit owner confirmation, atomic replacement, and a clear success or error outcome.
- [x] Verify restored business details, products, inventory, customers, balances, sales, payments, repayments, receipts, dashboard, and reports after an isolated reset.
- [x] Add regression coverage for export, invalid import, backup version handling, replace confirmation, atomic restore, and full-record reconciliation.
- [x] Do not add cloud storage or a provider integration until a later explicit approval after local restore reliability is demonstrated.
- [x] Update product, architecture, database, offline-first, security, testing, changelog, and owner backup guidance documentation.
- [x] Run full tests, type-check, production PWA build, and isolated browser export/restore validation.
- [x] Commit and push Stage 9 changes, then provide the required completion report while waiting for approval.

# Stage 10 Checklist

- [x] Review the Stage 10 specification and audit completed screens for mobile navigation, keyboard access, focus visibility, form labels, readable feedback, and recovery clarity.
- [x] Improve mobile touch targets, focus treatment, skip navigation, semantic landmarks, and accessible status/error announcements without altering business-record behavior.
- [x] Improve practical onboarding and empty states so owners understand the next operational action without fabricated data or marketing filler.
- [x] Add automated checks for critical accessible names, keyboard navigation, visible focus behavior, and no-regression sales/backup workflows.
- [x] Update product, architecture, database, offline-first, security, testing, changelog, and accessibility/product-polish documentation.
- [x] Run full tests, type-check, production PWA build, mobile/desktop screenshots, keyboard checks, and local workflow verification.
- [x] Commit and push Stage 10 changes, then provide the required completion report while waiting for approval.

# Stage 11 Checklist

- [x] Review the Stage 11 specification and audit local data validation, input handling, backup integrity, database migrations, error boundaries, dependency posture, privacy boundaries, and known limitations.
- [x] Strengthen proportionate client-side validation and restore integrity checks without adding unnecessary accounts, servers, authentication, or security theater.
- [x] Add database integrity audit/recovery guidance that identifies inconsistent local records safely and never silently deletes owner data.
- [x] Add regression coverage for malformed input, corrupt/inconsistent backup data, uniqueness failures, migration safety, atomic transaction failures, and integrity-audit behavior.
- [x] Document the local-device threat model, honest security limitations, backup handling risks, migration strategy, and recovery guidance.
- [x] Run dependency audit, full tests, type-check, production PWA build, isolated integrity/recovery checks, and mobile review.
- [x] Commit and push Stage 11 changes, then provide the required completion report while waiting for approval.

# Stage 12 Checklist

- [x] Review the Stage 12 specification and audit the release scope, route coverage, documentation completeness, known limitations, local-data boundaries, and production-readiness state.
- [x] Prepare a concise in-app release-candidate handover panel or final owner checklist without adding new operational business features.
- [x] Verify all critical owner workflows: setup, inventory, customer, cash/part-paid/credit sales, repayments, dashboard/reports, offline mode, backup/restore, integrity audit, and accessibility controls.
- [x] Run final TypeScript, full regression, dependency audit, production PWA build, service-worker/manifest, production-route, offline, backup/restore, keyboard, integrity, responsive browser verification, and a local timing sample.
- [x] Update product, architecture, database, offline-first, security, testing, changelog, release-candidate, and owner handover documentation with accurate known limitations.
- [x] Commit and push Stage 12 changes, then provide the final release-candidate report while waiting for final human approval.

# Stage 12 Deep Quality Audit

- [x] Reconfirm the release scope and inspect the static-app architecture, IndexedDB boundaries, local-data safeguards, PWA settings, and dependency posture.
- [x] Run expanded static and production checks, including type-check, full regression suite, build-artifact inspection, route fallback, dependency audit, and source-level unsafe-pattern search.
- [x] Exercise isolated browser scenarios for first-run setup, archive persistence, cash/partial/credit sale recovery, repayment, reports, offline reopen, backup restore, integrity review, keyboard navigation, and mobile layout.
- [x] Test release-resilience cases: malformed route, refresh/deep-link fallback, repeat actions, unavailable connection, invalid backup input, and representative local performance.
- [x] Record every finding honestly, apply only confirmed release-blocking fixes, and rerun relevant checks before updating the owner.

# UI/UX Reference Planning — Approval Required

- [x] Inspect the supplied Claude prototype’s navigation, dashboard, sales, customers, stock, reports, forms, overlays, visual hierarchy, and mobile behavior as a UI/UX reference only.
- [x] Compare the reference patterns with the current React/Dexie application and identify what can be adopted without weakening offline persistence, atomic transactions, data integrity, accessibility, or the approved stage discipline.
- [x] Prepare a short owner-approval UI/UX implementation plan naming adopted patterns, retained production foundations, changed screens/components, protected workflows, regression targets, and affected stages.
- [x] Do not implement the major UI/UX redesign until the owner explicitly approves the plan.

# Owner-Approved Mobile UI/UX Refinement

- [x] Apply the clarified scope: refine the current application now, keep the production architecture authoritative, and fix any confirmed existing workflow failures without adding future business features.
- [x] Rebuild the shared mobile shell around five clear primary destinations, reusable top/bottom navigation, touch-safe controls, and opaque shared overlays while retaining contextual Business and Backup access.
- [x] Rework Sales and Checkout before other work; make total, paid now, remaining, payment method, customer, saving, success, error recovery, receipt, and one-time completion visibly clear.
- [x] Refine Home/Dashboard, Customers, Stock/Archive, Reports, Business Setup, and Backup in the owner-required order using only existing product capabilities and data.
- [x] Test actual browser workflows for business setup, stock adjustment, archive/show/hide/persistence, cash/part-paid/credit sales, receipt, debt, refresh persistence, mobile country/currency select, and all five primary destinations.
- [x] Run full automated, type, production PWA, offline, accessibility, route, integrity, and dependency checks; document known issues, commit, and wait for owner approval.

# Owner-Approved Prototype-Faithful Visual Redesign

- [x] Preserve the existing React, TypeScript, Dexie/IndexedDB, offline/PWA, atomic sales, receipts, inventory movements, debt/repayment, backup/restore, integrity, and accessibility engine without service or schema replacement.
- [x] Rebuild the shared visual system and mobile shell to closely follow the supplied prototype while branding the product as Tallybook Africa.
- [x] Create a distinct desktop sidebar/dashboard workspace while retaining a prototype-style mobile operating interface for Home, Sales, Stock, Customers, and Reports.
- [x] Redesign Home and the Sales/POS checkout sheet with prototype-faithful structure while preserving full payment, part payment, credit, retry recovery, receipt, and one-time completion behavior.
- [x] Redesign Stock, Customers, and Reports with prototype-faithful card/list/filter structures while preserving archives, stock movements, derived debt, repayments, and read-only reconciliation.
- [x] Validate all current business workflows, mobile/desktop layouts, opaque overlays, keyboard access, offline/PWA behavior, backup/restore, integrity, and production build before requesting human approval.

# African Small-Business Product Enhancement Roadmap

- [x] Stage 1 planning only: review existing cash, card, credit, partial-payment, receipt, customer-debt, and idempotent sale safeguards against the new Mobile Money requirements.
- [x] Stage 1 planning only: define configurable local Mobile Money provider/reference data, payment-history presentation, and migration/transaction approach without hard-coding a country or provider.
- [x] Stage 1 planning only: identify affected existing workflows, regression coverage, manual acceptance scenarios, and honest known risks.
- [x] Present the short Stage 1 plan and wait for explicit owner approval before implementing Stage 1; do not begin Stages 2–10.

# Stage 1 — Mobile Money & Better Payment Experience

- [x] Preserve the existing internal `mobile` payment value and historical payment/sale records; show the owner-facing label as Mobile Money after the explicit schema migration.
- [x] Add configurable, local-only Mobile Money provider management to Business settings without hard-coding a country or provider.
- [x] Add an optional Mobile Money reference and immutable provider display snapshot to payment history while preserving Cash, Card, Credit, partial payment, receipt, and duplicate-submission behavior.
- [x] Let checkout select an existing provider and optionally add a provider in context without losing its current cart, selected customer, payment amount, or payment plan.
- [x] Test schema compatibility, provider setup, Cash/Mobile Money/Card/full/partial/Credit sales, refresh persistence, mobile layout, offline operation, and repeat completion before reporting Stage 1.
- [x] Do not begin Stage 2 or any later roadmap stage until the owner explicitly approves Stage 1.

# Stage 1 — Approved Release

- [x] Create a deployment checkpoint from the approved Stage 1 GitHub revision.
- [x] Verify the accessible deployed version exposes the local Mobile Money provider workflow.
- [x] Send the owner the deployed test link and Stage 1 testing reminder; do not begin Stage 2.

# Enhancement Roadmap — Stage 2: Customer Debt / Who Owes Me?

- [x] Read the owner-approved Stage 2 roadmap requirement and reconcile it with the Stage 1 local-first data model.
- [x] Define the proposed Stage 2 scope, explicit exclusions, data/schema impact, workflow, migration, integrity, backup, regression, and manual-acceptance approach.
- [x] Present the detailed Stage 2 plan and wait for explicit owner approval before changing application code, database schema, or deployed behavior.
- [x] Improve mobile debtor discovery, customer balance detail, and Home-to-debt navigation without creating a second ledger or editable balance.
- [x] Make repayments use plain Customer owes / Customer pays / New balance language and consistent Cash, Card, and Mobile Money method labels without adding provider/reference fields.
- [x] Preserve derived balances, immutable completed sales and repayments, overpayment prevention, duplicate-repayment protection, local-first persistence, Stage 1 payment history, backup/restore, receipts, and stock integrity.
- [x] Add Stage 2 and Stage 1 regression coverage, then run type-check, full tests, production PWA build, audit, mobile/browser, offline, backup, integrity, and accessibility validation.
- [x] Commit and deploy the owner-testable Stage 2 build, provide the completion report, and wait for explicit Stage 2 approval before beginning Stage 3.

# Enhancement Roadmap — Stage 3: Receipts & Easy Sharing

- [x] Read the owner-approved Stage 3 roadmap requirement and reconcile it with existing saved receipts, payments, local backup, and offline persistence.
- [x] Define the proposed receipt view, download/share behavior, data and integrity boundaries, PWA/browser support, regression coverage, and owner acceptance approach.
- [x] Present the detailed Stage 3 plan and wait for explicit owner approval before changing application code, receipt records, generated files, or deployed behavior.
- [x] Build a read-only receipt detail from the existing saved receipt, completed sale, immutable sale lines, payment, customer, and business profile; do not add a second business ledger or receipt store.
- [x] Add View receipt, Share receipt, Print, and Done controls after sale completion and from saved recent sales, with native share, clipboard, and visible manual-copy fallback.
- [x] Preserve original sale paid/outstanding values, Stage 1 Mobile Money provider/reference history, Stage 2 debt behavior, offline local persistence, backup/restore, stock, receipts, and non-mutating receipt actions.
- [x] Add receipt detail, Cash/Mobile Money/Credit/part-paid, action non-mutation, share fallback, print, backup/restore, integrity, Stage 1–2 regression, responsive/mobile, offline, TypeScript, full-test, PWA, and audit validation.
- [x] Commit and deploy the owner-testable Stage 3 build, provide the completion report, and wait for explicit Stage 3 approval before beginning Stage 4.

# Enhancement Roadmap — Stage 4 Planning Only

- [x] Read the owner-approved Stage 4 roadmap requirement and reconcile it with the existing local inventory, sales, reports, backup, receipt, and audit model.
- [x] Define the proposed Stage 4 scope, explicit exclusions, data/schema impact, workflow, migration, integrity, backup, regression, responsive, and owner-acceptance approach.
- [x] Present the detailed Stage 4 plan and obtain explicit owner approval before changing application code, local records, schema, or deployed behavior.

# Enhancement Roadmap — Stage 4: Offline Confidence & Data Safety

- [x] Reproduce and repair the View debtors action so it reliably reaches the existing debtor-only customer view without changing debt calculations.
- [x] Refine the shared ready, offline, preparing, and local-data-attention statuses with the approved plain-language and accessible owner-facing wording.
- [x] Verify supported local product, customer, sale, payment, receipt, repayment, stock, inventory-movement, and refresh/reopen behaviour while offline without adding sync or a second store.
- [x] Modernize the stale browser offline validator for the current Stage 1–3 UI and record the actual current-app browser findings.
- [x] Add focused status/debtor-navigation regression coverage and run full cross-stage tests, type-check, PWA build, audit, responsive, accessibility, browser, offline, backup, and integrity validation.
- [x] Write the Stage 4 completion report, commit and deploy an owner-testable build, verify the public release, and wait for Stage 4 owner testing before any Stage 5 work.

# Post-Stage 4 Approval and Next-Stage Planning

- [x] Record the owner’s Stage 4 approval while keeping all later enhancement implementation blocked pending a separately approved plan.
- [x] Investigate why the existing deployed Backup entry point is not discoverable and define the narrowest safe repair without expanding the next roadmap stage.
- [x] Read the authoritative next-stage roadmap requirements and reconcile them with the approved Stage 1–4 baseline.
- [x] Write the detailed next-stage plan, including the Backup finding, and wait for explicit approval before implementation.
- [x] Present the detailed Stage 5 plan and obtain explicit approval before changing application code, local records, schema, or deployed behavior.

# Enhancement Roadmap — Stage 5: Daily Business Summary

- [x] Preserve the existing Backup route, controls, wording, and presentation unchanged, as explicitly directed by the owner.
- [x] Add read-only local daily-summary derivations for a best seller and recent saved activity without adding a stored summary, schema change, or second ledger.
- [x] Refine the Home daily-business summary using existing local sales, payment, repayment, customer-debt, inventory, and receipt records with clear zero/error states and existing route destinations.
- [x] Add Stage 5 calculations/component regression tests and a current-app browser/offline summary validator covering Cash, Card, Mobile Money, part payments, Credit, repayments, archived products, refresh/reopen, and no-sync language.
- [x] Run full cross-stage validation, production/PWA build, audit, responsive/accessibility/browser checks; publish an owner-testable Stage 5 build with a completion report and wait for owner approval before Stage 6.

# Enhancement Roadmap — Stage 6 Planning Only

- [x] Read the authoritative Stage 6 requirement and reconcile it with the approved local-first Stage 1–5 engine, including the owner-directed unchanged Backup surface.
- [x] Define the proposed Stage 6 workflow, data and schema boundary, integrity safeguards, exclusions, regression coverage, responsive/accessibility checks, and owner acceptance steps.
- [x] Present the detailed Stage 6 plan and obtain explicit approval before changing application code, local records, schema, or deployed behavior.

# Enhancement Roadmap — Stage 6: End-of-Day Business Summary

- [x] Add read-only end-of-day derived calculations using existing local sales, payments, repayments, customers, and active-product records, with no close-day state, schema migration, or stored summary.
- [x] Add the optional mobile-first End of day workflow and existing-destination links, preserving the Stage 5 Home, Reports, Backup, and all record-writing workflows.
- [x] Add focused calculation and component regression coverage for payment-plan sales, actual receipt money, late repayments, named customers, today-only unpaid amounts, low stock, local boundaries, and no-data/error states.
- [x] Run the complete cross-stage, offline, responsive, accessibility, browser, PWA, and audit validation; write the Stage 6 report; commit and deploy an owner-testable release; then wait for owner testing before Stage 7.

# Post-Stage 6 Approval and Stage 7 Planning

- [x] Record the owner’s Stage 6 approval while keeping all implementation blocked pending a combined follow-up and Stage 7 plan approval.
- [x] Review the End of day payment/unpaid layout and existing receipt print implementation to define a read-only visual/print-export follow-up without changing financial data.
- [x] Read the authoritative Stage 7 suppliers-and-purchases requirements and reconcile them with the approved Stage 1–6 local-first engine.
- [x] Write the combined plan: a bounded Stage 6 follow-up addendum plus detailed Stage 7 scope, data model, safety, migration, validation, and acceptance approach.
- [x] Present the combined plan and obtain explicit approval before changing application code, local records, schema, or deployed behavior.

# Pre-Implementation Protection Confirmation

- [x] Review the uploaded Stage 6 follow-up and Stage 7 protection requirements, including financial-separation, print, historical-snapshot, purchase-cost, inventory-movement, migration, recovery, and audit constraints.
- [x] Confirm accepted safeguards, planned version-9 schema changes, migration approach, identified risks, Stage 8 block, and post-delivery stop boundary to the owner.
- [x] Receive explicit authorization to implement only the confirmed Stage 6 follow-up and Stage 7 scope.

# Combined Stage 6 Follow-up and Stage 7: Approved Implementation

- [x] Improve End of day payment/unpaid visual separation and add the read-only browser-native Print / Save as PDF action with the required printed disclaimer and non-mutation protection.
- [x] Add the additive Dexie v9 supplier, purchase, and purchase-line local records plus purchase-linked inventory movements without altering historical v8 records.
- [x] Implement supplier management and immutable, idempotent, multi-line purchase completion that atomically increases stock and writes traceable movement history.
- [x] Add local Purchases and Stock/Reports discovery surfaces with read-only purchase history and original supplier/product snapshots after rename/archive.
- [x] Extend owner-controlled Backup/Restore and the read-only integrity audit for supplier/purchase records and legacy v8 compatibility.
- [x] Add focused migration, atomicity, idempotency, archive/history, print non-mutation, backup, integrity, accessibility, and browser/offline regressions; validate and deploy a single owner-testable release, then wait for owner testing before Stage 8.

# Enhancement Roadmap — Stage 8 Planning Only

- [x] Record the owner’s Stage 7 approval while keeping Stage 8 implementation blocked until its detailed plan is reviewed and approved.
- [x] Read the authoritative Stage 8 requirement and reconcile it with the approved Stage 1–7 local-first engine, including purchase-stock and End of day safeguards.
- [x] Define the proposed Stage 8 scope, data model, financial-separation rules, migration, integrity/backup effects, exclusions, regression coverage, and owner acceptance steps.
- [x] Present the detailed Stage 8 plan and receive owner authorization to implement only the approved Stage 8 scope.

# Enhancement Roadmap — Stage 8: Expenses & Simple Business Health

- [x] Reconfirm the approved additive local-only scope, financial-separation rules, immutable expense-history boundary, Stage 1–7 preservation requirements, and Stage 9 block.
- [x] Add the v10 expense record schema and an atomic, idempotent local expense service without rewriting historical records.
- [x] Add the compact Expenses workspace, read-only expense history, and validation/error/empty states without saved-expense edit or delete actions.
- [x] Add the read-only Business Health view with separate sales, money collected, customer debt, expenses, expense categories, and low-stock facts; retain no-profit wording.
- [x] Extend Backup/Restore and the read-only integrity audit for expenses and legacy v9 compatibility without altering the existing Backup presentation.
- [x] Add Stage 8 unit/component/migration/backup/integrity regression coverage and preserve every Stage 1–7 workflow.
- [x] Run complete TypeScript, test, audit, PWA, browser, offline, responsive, accessibility, and public-release validation; document results and known advisories.
- [x] Commit, deploy, and verify the Stage 8 release; deliver exact owner acceptance steps and wait for owner testing before Stage 9.

# Reusable Workflow Skill + Enhancement Roadmap — Stage 9 Planning Only

- [x] Read the skill-creation instructions and define the reusable staged local-first delivery workflow to package.
- [x] Initialize, author, and validate the reusable workflow skill.
- [x] Read the authoritative Stage 9 requirement and reconcile it with the approved Stage 1–8 local-first engine.
- [x] Define the direct-authorization Stage 9 scope, data-safety rules, validation, exclusions, and owner acceptance approach.
- [x] Record the owner’s explicit instruction to implement Stage 9; a separate plan-approval gate was superseded by that direct authorization.

# Enhancement Roadmap — Stage 9: Approved Implementation

- [x] Record the owner’s Stage 8 testing approval and authorization to implement only Stage 9.
- [x] Reconfirm the authoritative Stage 9 owner workflow, local-first boundaries, and Stage 1–8 preservation requirements.
- [x] Implement the approved Stage 9 workflow with only the required local records and no automatic upload, sync, or new financial ledger.
- [x] Confirm Backup/Restore and integrity require no Stage 9 schema extension because sharing is read-only; add focused fallback, content, and browser non-mutation regression coverage.
- [x] Run complete TypeScript, test, audit, PWA, browser, offline, responsive, accessibility, and Stage 1–8 regression validation; document results and known advisories.
- [x] Commit, deploy, and verify the Stage 9 release; deliver exact owner acceptance steps and wait for owner testing before Stage 10.

# Enhancement Roadmap — Stage 10: Backup, Export & Business Data Ownership

- [x] Record the owner’s Stage 9 testing approval and authorization to implement only Stage 10.
- [x] Read the authoritative Stage 10 roadmap and confirm the existing local Backup/Restore architecture and Stage 1–9 invariants.
- [x] Define the Stage 10 inclusions, exclusions, recovery safeguards, validation strategy, and owner acceptance boundary.
- [x] Implement clearer local Backup/Export ownership status and last successful export metadata without cloud sync or automatic upload.
- [x] Preserve and validate complete current business-data coverage across business details, products, stock movements, customers, suppliers, purchases, sales, payments, repayments, receipts, expenses, and Mobile Money snapshots.
- [x] Strengthen restore safeguards, invalid-input handling, atomic replacement, and no-partial-restore behavior without changing historical records.
- [x] Add Stage 10 focused tests and preserve every Stage 1–9 regression.
- [x] Run complete TypeScript, test, audit, PWA, browser, offline, responsive, accessibility, recovery, and Stage 1–9 validation; document results and known advisories.
- [x] Commit, deploy, and verify the Stage 10 release; deliver exact owner acceptance steps and wait for owner testing before any later work.

> Stage 10 implementation is authorized. Stage 11 and all later work remain blocked until the owner personally tests and approves this release.

---

# Stage 10 Release Handover Follow-up

- [x] Complete final Stage 10 public-build verification after the managed checkpoint and confirm the owner-testable Backup route.
- [x] Send the Stage 10 completion handover with exact owner acceptance steps and wait for owner testing before closing the release gate.

# Enhancement Roadmap — Stage 11: Validation, Integrity & Recovery Safeguards

- [x] Record the owner’s Stage 10 testing approval and authorization to implement only Stage 11.
- [x] Read the authoritative Stage 11 requirement and reconcile it with the Stage 1–10 local-first engine, backup, migrations, and historical-data invariants.
- [x] Define Stage 11 inclusions, exclusions, risks, validation strategy, and owner acceptance boundary.
- [x] Strengthen proportionate client-side validation and user-facing error handling without adding accounts, servers, or security theater.
- [x] Improve read-only local integrity checks and recovery guidance without silently changing, deleting, or repairing owner data.
- [x] Add focused malformed-input, corrupt-backup, migration, atomic-failure, uniqueness, and integrity-audit regressions.
- [x] Run complete TypeScript, tests, dependency audit, PWA build, browser, offline, recovery, accessibility, and Stage 1–10 regression validation.
- [x] Document the local-device threat model, privacy/security limitations, recovery guidance, known advisories, and exact owner acceptance steps.
- [x] Commit, deploy, and verify the managed Stage 11 release; deliver the owner handover, with the stale public-domain propagation advisory documented, and wait for owner testing before any later work.

> Stage 11 implementation is authorized. Stage 12 and all later work remain blocked until the owner personally tests and approves this release.

---

# Stage 11 Discussion — Sign-In, Multiple Companies & Ownership Transfer

- [x] Record the owner’s proposed Stage 11 direction: one person may manage multiple companies, sign in to choose a company, and clear a company’s data when it is sold.
- [x] Define whether this stage replaces the current local-only model with authenticated cloud-backed company workspaces, or uses sign-in only as an access key to device-local encrypted company data.
- [x] Define company ownership, invited-user roles, device limits, sign-out behavior, offline behavior, and what happens when one person uses two companies on one device.
- [x] Define safe company transfer: export and verification, recipient acceptance, owner-role transfer, previous-owner access removal, and recovery/support policy.
- [x] Define destructive clear safeguards: recent verified backup, exact company-name confirmation, typed confirmation, re-authentication, multi-step warning, cancellation, and no automatic deletion of another company.
- [x] Define the Stage 11 data model, migration path, privacy/security limitations, backup implications, and cross-stage invariants.
- [x] Present the Stage 11 discussion brief and obtain explicit design approval before changing authentication, storage, schema, or deployed behavior.

> Option 1 Stage 11 implementation is approved and underway; cloud sign-in, cross-device access, ownership transfer, and Stage 12 remain blocked.

---

# Stage 11 Plan — Multiple Local Companies on One Phone

- [x] Add the v11 active-company metadata and child-record indexes with deterministic legacy backfill.
- [x] Scope business profile, inventory, customers, sales, payments, receipts, repayments, Mobile Money, purchases, expenses, reports, and company management to the selected local company.
- [x] Add visible company switching and local company creation without displacing the five primary operating routes.
- [x] Add guarded company clearing that requires exact name confirmation and a fresh company-specific backup.
- [x] Make Backup/Restore company-scoped while preserving other local companies and legacy backup compatibility.
- [x] Run final cross-company browser/offline/reopen/backup/clear validation and document owner acceptance.


- [x] Record the owner’s selection of Option 1: multiple local companies on one phone, preserving local-first IndexedDB/Dexie and excluding cloud sync.
- [x] Record the owner’s explicit approval to implement the Option 1 Stage 11 plan; keep cloud sign-in, sync, cross-device access, and later stages blocked.
- [x] Inspect the current schema, services, backup, integrity, routes, and active-business assumptions for company isolation points.
- [x] Define the additive company/workspace model, legacy single-company migration, active-company selection, and strict record scoping.
- [x] Define safe company creation, switching, rename/archive policy, and clear-company safeguards with no cross-company deletion.
- [x] Define company-scoped Backup/Restore, integrity checks, offline behavior, visible active-company identity, and access boundaries.
- [x] Define tests, browser/offline validation, accessibility, recovery, data-integrity risks, exclusions, and exact owner acceptance steps.
- [x] Present the detailed Option 1 Stage 11 plan and receive explicit implementation approval before changing code, schema, or deployed behavior.

> Stage 11 implementation is approved and underway. Cloud sign-in, sync, cross-device access, ownership transfer, and later stages remain blocked.

---

# Stage 11 Multi-Company Validation Completion

- [x] Repair Business settings query-string detection so the Companies workspace opens reliably at `/business?view=companies`.
- [x] Run the disposable two-company browser validator against the production PWA preview while offline, including switch, scoped backup, clear gate, exact confirmation, selected-company deletion, and remaining-company checks.
- [x] Verify offline PWA reopen preserves the remaining company and does not restore the cleared company.
- [x] Complete desktop and 390px mobile visual review of the Companies workspace and record the findings.
- [x] Run the final Stage 11 test, type-check, production build, and diff checks before checkpointing.

- [x] Fix backup expense validation so a valid non-primary company export is accepted, and add regression coverage.

# Stage 11 Company Isolation Defect Correction

- [ ] Reproduce the reported leak with two disposable companies and audit every read/write path for missing active-company scoping.
- [ ] Correct all affected services and UI refresh paths so reads, creates, updates, and derived views use only the active company.
- [ ] Add regression tests proving customers, products, stock, sales, payments, receipts, debt, suppliers, purchases, expenses, reports, and providers do not cross company boundaries.
- [ ] Re-run migration, backup/restore, offline/reopen, responsive browser, full regression, type-check, build, and dependency validation.
- [ ] Publish the isolation correction, document the owner acceptance steps, and stop for owner testing and explicit approval.
