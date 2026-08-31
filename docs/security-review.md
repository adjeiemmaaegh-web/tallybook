# Stage 11 Security and Integrity Review

## Scope

Tallybook remains a single-owner, local-first PWA. This review hardens the application proportionately for that model; it does not add accounts, a backend business API, remote sync, cloud storage, multi-user authorization, or claims of encryption that are not present.

| Area | Stage 11 control | Remaining limit |
| --- | --- | --- |
| Input and transaction validation | Zod schemas, minor-unit parsing, business rules, and Dexie transactions remain the gate for operational writes. | A person with device/browser access can still use the app. |
| Idempotency | Sale and repayment submission keys prevent a repeated client action from creating a second completed record. | It is not cross-device synchronization. |
| Restore safety | Backup format and relationships are checked before a replace-only restore; the replacement runs in one local transaction. | The backup file is unencrypted and owner-controlled. |
| Integrity review | Backup includes a read-only check for record links, totals, payments, receipts, activities, repayments, movements, and schema metadata. | It reports, rather than guesses at, a repair. |
| Dependencies | Unused audited packages were removed; the static server and identifier generator were updated to patched releases. | Dependency review must be repeated before each release. |

## Local threat model

Tallybook protects against ordinary accidental duplicate submissions, invalid data entry, interrupted local transactions, malformed backup input, and common package exposure. It does **not** protect against a compromised device, a malicious person with browser-profile access, browser-storage clearing, an unencrypted exported JSON file being copied, or physical-device loss.

> **Recovery rule:** If the local record check reports an issue, first download a fresh local backup. Do not delete browser data or edit the backup by hand. Keep the report message and seek assistance before replacing records.

## Production boundary

The production server serves static assets and the client-side route fallback only. It has no endpoint for business records, authentication, payments, customer information, or backup upload. The local browser database remains authoritative.

## Stage 12 release decision

The release candidate retains the same proportionate local threat model. The completed release checklist separates verified build, dependency, local-data, and integrity controls from untested owner-device installation, cross-browser, and low-end-network performance conditions. No security claim is expanded merely because the product is prepared for owner testing.
