# Premium Settings UI — source review and deferred Windows acceptance

**Review date:** 2026-10-15  
**Feature branch:** feature/premium-settings-business-staff-2026-10-15  
**Review scope:** Business Setup (/business and /business?view=companies) and Staff & Permissions (/staff).  
**Explicit exclusions:** Home, Sales, Customers, Purchases, Expenses, Reports, and Backup & Restore.

## Implemented presentation

- Follow the premium Home visual language with cool-blue workspace surfaces, white cards, cobalt buttons, clear headings, readable inputs and helpful summaries.
- Business Setup: business identity, trading/payment information, contact details, tax configuration, Mobile Money provider management, multiple-company chooser and a distinct irreversible-clear warning. All pre-existing underlying business services preserved.
- Staff & Permissions: team/session summary, local-only security notice, owner-first account creation, separate unlock/new-PIN fields, per-user PIN reset fields, active/disabled directory, understandable permission descriptions, two-step disable confirmation, role-change confirmation explaining default permission reset, cashier shift and history panels, authorized-manager audit list.
- Responsive CSS is scoped to the two redesigned modules. Phone layouts include a 320px fallback and reduced-motion support.

## Source-level review (NOT executed runtime tests)

Twenty focused source checks were evaluated against the feature branch. All twenty matched the required source-code contracts:

1. Staff service functions continue to own all access and writes.
2. Initial staff member is always the owner.
3. Staff workspace remounts on company change.
4. PIN state for login, creation and per-user reset is separate.
5. Manager activity list is filtered by staff role.
6. Enable account calls changeStaffStatus(id, **false**).
7. Disable account calls changeStaffStatus(id, **true**).
8. Role changes have confirmation and warn that custom permissions reset.
9. Shift amounts are described as **minor units**.
10. Owner-first setup remains accessible.
11. CSS has narrow-phone responsive rules.
12. CSS is scoped to Business Setup and Staff workspace selectors.
13. Company create/switch/clear remain wired.
14. All existing business form fields remain present.
15. The same tax policy validation/save is preserved.
16. The same Mobile Money provider services are used.
17. Link to company workspace remains present.
18. Link to Staff route remains present.
19. Browser test cases cover status changes and role confirmation.
20. Browser tests cover 320px narrow viewport.

**Corrections during review:** A new UI initially passed the inverse boolean to the enable/disable service; this was caught and corrected. A one-click role change was replaced with explicit confirmation because the staff service resets role permissions to the selected role defaults. A test initially used the non-existent generic textbox role of password fields; the test now uses their accessible label.

## Confidence score

- Business Setup **7.5/10 static implementation confidence**.
- Staff & Permissions **7/10 static implementation confidence**, lower because it has security-sensitive, stateful operations and cannot be certified from source alone.
- Both scores are subjective **source-review estimates, not passed TypeScript/compiler/unit/browser test results**.
- This review is not a global Tallybook release assessment and is not proof of a bug-free product.

## Required real Windows verification before merger

Prerequisites: separate clone of the feature branch, Node 24.19.0, pnpm 10.34.0, installed Chromium, and no real shop data in browser QA contexts.

~~~powershell
node --version
pnpm.cmd --version
git rev-parse HEAD
pnpm.cmd install --frozen-lockfile
pnpm.cmd check
pnpm.cmd test --maxWorkers=2
pnpm.cmd build
pnpm.cmd exec playwright install chromium
pnpm.cmd exec playwright test --config playwright.settings.config.mjs
node --test qa/premium-settings-contract.test.mjs
~~~

The targeted browser tests cover complete settings rendering, existing tax/provider and company management areas, owner-first account creation, PIN unlock, manager controls, permissions display, staff status flips, shift reconciliation, mobile/desktop layouts and screenshot evidence. Screenshots and failure traces are retained under artifacts/settings-ui. Other Tallybook V19 financial, backup, authorization and offline release gates must still be executed independently.

**Execution status of all the above for this branch: NOT RUN.** GitHub-hosted runner usage is blocked by the account's Actions billing/spending budget, and the owner opted to defer testing until Windows. No production/staging merge or deployment approval was granted.

## Safety and honest limitations

- UI disable/enabled states and labels are not authorization; the pre-existing staff services enforce access.
- Device staff authentication is local-only, not cloud identity or remote staff revocation.
- Already-confirmed transactions are not cancelled by navigation, role changes or UI remounts.
- Cashier figures remain raw *minor-unit* values, and expected cash may exclude unrecorded cash or external settlements.
- Data clearing remains disabled until the company confirms its name and a fresh company backup has been recorded.
- Nothing in this increment proves commercial safety or replaces the full V19 release validation.

**Disposition:** DRAFT / UNMERGED / UNDEPLOYED / RUNTIME TESTING PENDING.
