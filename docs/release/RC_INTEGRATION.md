# Integration candidate architecture

## Access and storage

| Entry | Authority and behavior |
|---|---|
| Standalone device | Empty cloud configuration and disabled deployment flags on an unbound browser. Business setup and staff enrollment/unlock mount outside the navigation shell. Operational routes require a local active staff session. First enrollment on a previously ungoverned device assumes physical custody. Missing staff records on a governed company block enrollment. |
| Cloud-configured or previously bound device | Public welcome/account and recovery are outside the ledger. Existing local data requires a separate local owner PIN to bind a single-company device. Multiple companies or missing local owner credentials need operator recovery. Membership is checked online. Cached identity can allow return to a previously verified device offline. Remote revocation becomes enforceable on reconnect. |
| Shared shop | The server resolves user and session from Auth and checks current membership, assigned stores and operation permissions. Cached catalogue data has an attendant display role, no credit/discount authority, customers, staff, or invitations. A changed identity invalidates outstanding membership loads. |
| Offline shared sale | The sealed outbox retains the submission key for retry; only a server receipt confirms posting. The cache and queue use the existing device-key storage. Local ledger tables are not encrypted as a whole. Loss of device keys can make sealed data unrecoverable. |

Opening stock establishes a shared starting balance. It does not transfer the local sales, tax, supplier, repayment or cost history. Keep the original ledger and a verified backup for historical reporting. The real dashboard reads the local report service. The public phone illustration contains no customer records.

## PostgreSQL upgrade

The ten migrations through `20261106130000_invite_24h.sql` are preserved byte-for-byte relative to the integration baseline. The existing `shop_refund_policy_history`, sale snapshot and refund evidence are authoritative. The business owner configures the policy per company; sale-time and current terms both constrain a refund. The alternative return-policy table and its competing triggers from PRs 26 and 28 were excluded.

Four additive migrations at `20261108100000` through `20261108130000` introduce `tallybook_shop_ops`. The first checks for the canonical policy and invite constraint and rejects an alternate preview schema before installing functions. Review actual schema history before any eventual rollout. An environment with either competing preview migration needs a data-specific mapping and reconciliation. Renaming an already-applied migration cannot establish equivalence.

Owner onboarding reads the new session-scoped readiness RPC. Attendant sale summaries honor the cashier and store boundaries. Stock counts and transfers, partial purchase receipts, supplier settlements and manual online order links have server-side operations and disposable database coverage. Their dedicated shared-shop authoring screens remain incomplete. Local purchasing and existing shared POS continue through their original entry points. The new RPC never initiates payment or reserves stock for an online order.

## Release review

Require release validation, UI branch verification and integrated reference UI against the proposed merge before owner acceptance. Retain approval for changes to migrations, PIN/session enforcement and money posting. Require an up-to-date review head and block force pushes on main. Repository governance and deployment decisions remain with the owner.
