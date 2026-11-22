# Operations, incident and privacy runbook (DRAFT for owner review)

Status: **draft written from the code and workflows as they exist on 2026-11-22.** Nothing here has been drilled by a person, no alert delivery channel exists yet, and the retention periods are **proposals that need legal/counsel approval**. It does not authorise any production change: every command below that touches a hosted database is **owner-run**.

## 1. What is monitored today, and what is not

| Signal | Exists today | Gap |
|---|---|---|
| Public site up, PWA files, no secrets in public responses | `production-readonly-smoke.yml` (daily 06:17 UTC + on demand; read-only, cannot authenticate or deploy) | The daily result is only visible in GitHub Actions. **No notification is sent** when it fails. |
| Code health | CI on every PR: tests, types, build, audit, CodeQL, secret scan, four browser engines | Not a production signal. |
| Local data integrity | `auditLocalIntegrity` (per device, on demand): prepaid wallet, receivables, returns, stock, FIFO | Runs only when someone opens the check; no schedule. |
| Cloud payment evidence | `payment_action('reconcile')` (service role): replays every applied event and lists any intent whose stored state differs | Dev-only migration, not applied; nobody calls it on a schedule. |
| Shift cash | `tallybook_shop_shift_reconciliation` (`reconcileShift`, `abandonedShifts`) | Dev-only migration; no screen yet. |
| Hosted DB errors/auth failures/RPC latency | Supabase dashboard logs (owner access) | No alert rules configured by us. |
| Client errors in the field | None | No error reporting is wired (and it must not capture personal data when added). |

**To close the monitoring gap (owner decision needed):** pick a notification channel (email/Slack/Telegram), then (1) add a failure notification to the daily smoke workflow, (2) schedule the two reconcile calls with a service-role runner and alert on any non-empty `discrepancies`, `needsReview`, `unresolved` or abandoned shift, (3) add Supabase log alerts for `permission denied` spikes and RPC 5xx. Each can be built once a channel and a runner exist.

## 2. Severity and first fifteen minutes

| Level | Meaning | Example |
|---|---|---|
| SEV1 | Money, customer data or access is wrong or exposed | A report total does not match the ledger; another business's data visible; secret leaked |
| SEV2 | Shops cannot trade | Sign-in or sync down; bad deploy |
| SEV3 | Degraded, workaround exists | One screen failing; slow search |

First fifteen minutes (any level): (1) write down the time and who reported it; (2) **stop making changes**; (3) decide who is incident lead (the owner by default); (4) capture evidence before fixing (screenshot, exact message, affected business id, receipt numbers; never copy PINs, tokens or card/phone data into chat); (5) apply the matching playbook below; (6) tell affected shops plainly what is known and not known.

## 3. Playbooks

**A. Totals do not reconcile (SEV1).** Do not edit ledger rows. On the affected device run the integrity check and keep its output. If a payment ledger exists, run `reconcile` and keep the `discrepancies` array. Take a backup *before* anything else (Backup page; it is encrypted and staff-protected). Report the first mismatching receipt. Corrections are made only through the existing return/reversal/credit workflows so the audit trail stays intact.

**B. Suspected account or staff-PIN compromise (SEV1).** Owner locks all staff sessions, disables the staff member, resets the PIN (this invalidates earlier supervisor approvals), revokes the authenticator if one was enrolled, reviews the Activity audit and shift records for the period, and asks for password reset on the cloud account. Never reuse a PIN.

**C. Another business's data seen (SEV1).** Treat as a tenant-isolation failure: capture the exact screen and business ids, switch off any related Connected Commerce service with the kill switch (D), and escalate to the engineer who can run the RPC catalog audit (`qa/rpc-catalog-negative.test.mjs`) against the deployed schema.

**D. Switch off a Connected Commerce service immediately (owner-run, hosted DB).** Public search and requests stop at once because visibility is checked on every read:
`INSERT INTO public.cc_platform_kill_switch(track,disabled,reason) VALUES('discover',true,'incident <id>') ON CONFLICT(track) DO UPDATE SET disabled=true,reason=EXCLUDED.reason;`
To resume: set `disabled=false` after the cause is understood. Merchant consent and flags are untouched.

**E. Bad deploy (SEV2).** Roll back to the previous known-good deployment in the hosting dashboard (owner-run). Identify the candidate with `node scripts/release-candidate-manifest.mjs --verify <manifest> --dist dist`; a mismatch means what is running is not what was approved. Database migrations are **never** rolled back automatically: each has a guarded `supabase/rollback/*_down.sql` that refuses to run once evidence exists. Use a forward repair instead.

**F. Sync or sign-in outage (SEV2).** Shops keep selling offline: sales are queued on the device and posted when connectivity returns, once each. Tell shops not to clear browser data or reinstall until the queue is empty. Check the Supabase status page and the daily smoke run.

**G. Lost device or lost PIN.** Lost device: owner disables the staff member and revokes the authenticator; local data on the device is encrypted only if the owner turned on ledger encryption (it is opt-in). Lost owner PIN: use the recovery code or recovery package created when encryption/backup was set up; there is deliberately no backdoor, so without them encrypted data cannot be recovered.

## 4. Backup and restore drill (owner-run, quarterly)

1. Create an encrypted backup on a real device. 2. Restore it into a *separate browser profile*, never over live data. 3. Compare receipt count, wallet liability, receivables and stock for three products. 4. Record the date, the device, the result and who checked. A drill that has not been done is not evidence that recovery works.

## 5. Privacy and retention (PROPOSAL, needs counsel)

| Data class | Where | Proposed retention | Notes |
|---|---|---|---|
| Sales, returns, payments, shifts, audit | device + shared shop | Keep for the legal bookkeeping period (counsel to confirm; commonly 6+ years) | Append-only by design; correction by new entries, not deletion |
| Customer name/phone (credit, wallet) | device + shared shop | While the account is active; delete or anonymise on request unless needed for an open balance or legal record | Archive blocked while debt/wallet remains |
| Discover shopper requests (name, phone, note) | cloud | **Proposal: 90 days after the request is answered or expires**, then delete | Not yet implemented: needs a scheduled cleanup and counsel approval |
| Discover public listing | cloud | Until the owner unpublishes; hidden at once on consent withdrawal or kill switch | |
| Payment events | cloud | Same as sales (financial record) | Contains no card numbers by design |
| Backups | device/owner-held | Owner's choice; encrypted | Tallybook cannot read an encrypted backup |
| Support evidence | chat/tickets | Delete after the incident closes | Never include PINs, tokens, card data |

Requests from individuals (access, correction, deletion): the owner is the controller of their shop's customer data; Tallybook staff act on the owner's instruction. Respond within the period counsel specifies. Deletion must not break financial records: anonymise the customer link rather than deleting the sale.

## 6. Owner decisions needed to finish this document

Notification channel; who is on call and how they are reached; retention periods and legal basis; whether Discover shopper requests are auto-deleted after 90 days; whether to add client error reporting (and its privacy review); a date for the first restore drill.
