# Stage 11 Discussion Brief — Sign-In, Multiple Companies & Ownership Transfer

> **Discussion only. No Stage 11 authentication, multi-company, transfer, schema, storage, or data-clearing implementation has begun.**

## The proposed owner problem

One person may run more than one company and should be able to sign in once, choose the correct company, and avoid installing a separate copy of the app for every company. If a company is sold, the previous owner should be able to transfer it safely or clear that company’s records from the device without accidentally affecting another company.

This is a meaningful next direction. It also changes Tallybook from a primarily device-local tool into an identity and company-ownership system. The most important decision is therefore not the screen design; it is where the authoritative company records will live.

## Three architecture choices

| Option | How it works | Strengths | Important limitations |
| --- | --- | --- | --- |
| **A. Cloud company workspaces** | Sign-in identifies the person; company records live in a remote database and are selected after sign-in. | Best support for changing phones, selling a company, recipient access, recovery, and one person managing multiple companies. | Major change from the current local-only architecture. Requires backend, accounts, authorization, encryption/privacy design, sync/conflict rules, offline queue behavior, migrations, and operating/support responsibilities. |
| **B. Local company vaults with sign-in as a device key** | Multiple company profiles remain on one device in IndexedDB; sign-in identifies the owner but records do not automatically leave the device. | Preserves offline-first behavior and avoids automatic cloud upload. Supports multiple companies on one phone and a clearly scoped “clear this company” action. | Sign-in cannot by itself move records to a new phone or give a buyer the company. A device login is not meaningful recovery unless strong local encryption and key recovery are designed. Ownership transfer would require an explicit backup/export handoff. |
| **C. Hybrid control plane plus protected company backups** | Account and company ownership live remotely; business records remain local until an explicit encrypted backup/restore or transfer is initiated. | Preserves more local operation while enabling company listing, ownership transfer, and access revocation. | More difficult to explain and build safely. It still needs an account service, company identifiers, protected transfer packages, key management, revocation rules, and careful offline behavior. |

## Recommendation

I recommend **not implementing full sign-in or multi-company switching immediately**. First approve the product and privacy architecture. If the requirement is truly “sign in on another phone and access the same company,” Option A or a carefully designed Option C is necessary; a local-only sign-in cannot honestly provide that capability.

For a conservative Stage 11, I recommend two explicitly separated decisions:

1. **Company workspace decision:** allow several named company profiles on one device, with an explicit company switcher and a clear active-company label on every operating screen. Each record must carry a company identifier, and every query, backup, restore, integrity check, and destructive action must be company-scoped.
2. **Ownership decision:** treat a company sale as a transfer workflow, not as “delete everything.” The safest sequence is to create and verify a complete backup, confirm the exact company name, give the recipient an explicit transfer package or account invitation, record acceptance, revoke the previous owner’s access where cloud authorization exists, and only then offer local removal.

If cross-device sign-in is mandatory, the owner should approve a separate architecture change to authenticated company workspaces before coding. The current IndexedDB-only model cannot provide reliable remote access, device revocation, or buyer handover without adding a backend or an explicit secure transfer service.

## How multiple companies should behave

A person should have one account identity and a list of company workspaces. The active company should be obvious in the header and in destructive dialogs. Switching companies must change the active data scope atomically and must never mix sales, customers, stock, suppliers, purchases, expenses, receipts, or reports between companies.

The first implementation should prefer one person using multiple companies on one device. “One account” should not silently mean “unlimited devices.” A device policy must be chosen explicitly: for example, one active device at a time, a small registered-device limit, or multiple devices with synchronized records. Each choice has different recovery and security consequences.

## How sign-in should behave

Sign-in should identify the account and authorize access to company workspaces; it should not silently upload the current local company. On first sign-in, the app must explain whether the owner is creating a new company, attaching an existing company, importing a transfer package, or opening a synchronized workspace.

Sign-out must make the active-company state clear. It must not delete local records automatically. If the device retains local records after sign-out, the app needs a deliberate lock/clear policy; if it clears them, it needs a verified-backup warning and an explicit per-company selection.

## How a company sale should behave

A seller should not be asked to “clear all data” before the buyer has the records. The safer workflow is:

| Step | Required protection |
| --- | --- |
| Prepare | Select one exact company by name and show its record counts and last backup time. |
| Preserve | Require a fresh verified backup or transfer package before removal. |
| Handoff | Provide an explicit buyer handoff mechanism; do not call a downloaded file a completed transfer until the recipient confirms receipt and restore verification. |
| Access | If cloud workspaces are approved, transfer the owner role and revoke the former owner. If records are local-only, remove the seller’s local copy only after the buyer controls their own verified copy. |
| Clear | Require re-authentication where applicable, type the exact company name, show an irreversible warning, and offer Cancel. Clear only the selected company. |
| Recover | Explain that clearing is irreversible from this device and that future recovery depends on the verified backup or transfer package. |

A simple device clear should never delete every company by default, never delete a remote company merely because local data was cleared, and never claim that a company was transferred when only a file was downloaded.

## Questions requiring owner decisions

| Decision | Recommended starting choice |
| --- | --- |
| Must the same company open on a second phone through sign-in? | No decision yet. If yes, approve a backend/cloud or hybrid architecture change. |
| Should several companies work on one phone? | Yes, with an active-company switcher and strict company scoping. |
| How many devices may one account use? | Start with one active device unless cross-device access is an explicit requirement. |
| Should sign-out delete local records? | No. Sign-out and deletion should be separate actions. |
| Should a sale mean clear or transfer? | Transfer first; clear only after verified handoff. |
| Should a buyer receive the seller’s account? | No. Transfer the company to a separate recipient identity. |
| Should clear be recoverable? | No from the device after confirmation; recovery must depend on the verified backup/transfer package. |
| Should Stage 11 add cloud sync? | Only after explicit architecture approval; it is not a small UI enhancement. |

## Preserved rules and exclusions

Until the architecture decision is approved, the app remains local-first. No remote database, cloud sync, automatic upload, account linking, device registration, login gate, company switcher, destructive clear, transfer package, or new company-scoped schema should be implemented. Existing sales, payments, receipts, debt, repayments, stock, purchases, expenses, sharing, Backup/Restore, and integrity behavior remain unchanged.

## Approval gate

The next step is a design decision, not code. The owner should choose whether Stage 11 means **multiple local companies on one device only**, or **authenticated cross-device company workspaces**. After that decision, a detailed implementation plan can define the migration, security model, recovery behavior, tests, and owner acceptance steps.

> **Stage 11 remains in discussion. Stage 12 and all implementation work remain blocked until the owner explicitly approves the architecture and the detailed Stage 11 implementation plan.**
