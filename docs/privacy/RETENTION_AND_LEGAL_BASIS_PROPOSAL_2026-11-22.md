# Retention periods and lawful-basis proposal (for qualified legal review)

**Status: PROPOSAL, not legal advice, not in force.** Every period, legal basis and jurisdiction statement below must be verified by qualified legal counsel before any enforcement. Nothing in this repository deletes data automatically: the retention planner only reports what *would* be eligible (`server/retentionPolicy.mjs`) and **no deletion executor exists**. Building one needs separate explicit owner authorization.

## 1. Roles (to confirm)
- **Business owner = controller** of their shop's customer, staff and sales data; **Tallybook = processor** for that data when it hosts shared-shop data (Supabase, eu-west-2). Where Tallybook decides purposes itself (security monitoring, platform abuse prevention, billing), Tallybook is a controller for that data.
- Data on a device in offline mode stays on that device; Tallybook cannot read an encrypted ledger or backup.
- Counsel to confirm: applicable regimes (Ghana Data Protection Act, 2012 (Act 843) and registration duties; GDPR/UK GDPR if EU/UK shoppers or staff; any other country where a business operates), cross-border transfer rules (EU-region hosting, US providers such as the email provider), and processor agreements (Supabase, Vercel, GitHub, the email provider).

## 2. Data classes, bases and proposed periods
| Class | Personal data involved | Purpose | Proposed lawful basis | Proposed retention | Deletion mechanism today |
|---|---|---|---|---|---|
| Financial/accounting records (sales, returns, payments, shifts, payment events) | customer name/phone where recorded, staff ids, amounts | bookkeeping, tax, disputes | **Legal obligation** (record-keeping) | **7 years**, then listed for **human review** (anonymise customer link; never auto-delete) | none (append-only by design) |
| Security and audit logs | staff/user ids, IP/device identifiers if captured, actions | detect and investigate abuse | **Legitimate interests** (needs a documented balancing test) | **12 months** | none built |
| Technical logs | request metadata, errors | operate and debug the service | **Legitimate interests** | **30 days** | provider-side log retention (Supabase/Vercel settings); none built here |
| Rolling backups | everything in a backup | recover from loss/corruption | **Contractual necessity** (service delivery) | **30 days** (owner-held exports are the owner's decision) | none built |
| Discover shopper requests (name, phone, note) | shopper contact data | pass a request to a merchant | **Contractual necessity** (performing the shopper's request) | **90 days if inactive and not linked** to a transaction, dispute or legal hold | none built; planner skips linked/active/disputed/held rows |
| Optional marketing contacts | name, phone/email | marketing messages | **Consent** (must be freely given, specific, withdrawable; record each consent) | until consent is withdrawn (no default period) | none built; withdrawal makes a contact due immediately in the planner |
| Customer records (credit, wallet, loyalty) | name, phone, balances | operate customer accounts | Contractual necessity / legal obligation for the ledger part | while the account is active and any balance or legal record exists | archive is blocked while a balance remains |
| Alert recipients (owner / security admin emails) | email, name | deliver incident notices | Legitimate interests / contractual necessity | while the role is held | n/a |

**Preservation rules the code already encodes:** a legal hold, an open obligation or a dispute always blocks eligibility; Discover rows linked to a transaction are skipped; financial records are never auto-deleted.

## 3. Questions for counsel
1. Which jurisdictions apply per business and per shopper, and which statutory retention period applies to accounting records in each (7 years is the owner's proposal, not a verified figure)?
2. Is "legitimate interests" acceptable for security logs and technical logs, and what balancing test must be documented? Are 12 months / 30 days proportionate?
3. Is "contractual necessity" the right basis for Discover requests (the shopper asked a merchant to contact them) and for backups; is 90 days proportionate; what notice must the shopper see at submission?
4. Marketing: what consent wording, record of consent, withdrawal path and double-opt-in (if any) are required; does the existing `cc_consent_events` ledger satisfy the record-keeping requirement?
5. Data-subject requests (access, correction, deletion, objection): response period, identity verification, and how to honour deletion without breaking the financial record (proposal: anonymise the customer link, keep the sale).
6. Backups vs erasure: is "deleted from live data, expires from backups within 30 days" acceptable?
7. Cross-border transfers and processor agreements for Supabase (eu-west-2), Vercel, GitHub, and the email provider (Resend): what contractual/transfer mechanism is needed?
8. Breach notification duties and the content/timing of notices, to feed the alert routing (business-owner vs platform security administrator).
9. Whether a data-protection impact assessment is required (customer credit/debt data, staff accountability, optional encryption).
10. Registration with the national data-protection authority, and the privacy-notice text for owners, staff and shoppers.

## 4. What must exist before enforcement (all currently missing)
- Counsel's written verification (jurisdiction, who, when, reference): the retention configuration **refuses `enforce`** until this record and an owner approval record exist.
- A reviewed, separately authorized **deletion executor** (irreversible: backup first, dry-run gate, append-only audit row, rollback note).
- Privacy notices, consent records for marketing, a data-subject-request procedure, and processor agreements.
- A restore drill proving that a restored backup does not resurrect data that was due for deletion beyond the backup window.

## 5. Owner-proposed defaults (as recorded 2026-11-22)
Financial 7 years; security/audit 12 months; technical logs 30 days; rolling backups 30 days; Discover requests 90 days (inactive, unlinked, no hold). Marketing by consent only. These are the values in `RETENTION_CLASSES`; they start **off**.
