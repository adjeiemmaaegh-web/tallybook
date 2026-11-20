# Continued canonical-path repairs — 2026-11-17

Release decision: **NO-GO**. This increment completes initial source reconciliation of the nine remaining unreviewed roadmap rows; it does not complete those requirements. All 119 tasks now have a disposition: 1 verified, 93 partial, 4 missing and 21 owner/external blocked. There are no implemented-pending-acceptance or unreviewed rows. The 143-ID historical acceptance campaign still has open work.

## Regression evidence

At `9c8d278ab16278a3ecb20b0695a84fbe1dd64e84`, [security regression job 133905681872](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44044179002) reproduced both refund-policy defects: the saved window became 365 instead of the approved 30 days; locking the owner during the audit write still committed the policy. Thirteen existing tests passed and the two new regressions failed.

At `b35ebe555e226f9f4b2cffc1a37c5f30d14a23ac`, [run 44044338668](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44044338668) passed the corrected policy regressions, descriptor/TLS/throttle tests, CodeQL severity gate and strict historical-secret classification. No live credential rotation, history rewrite or global test-file/manifest exclusion was used.

The additional same-owner re-unlock policy test initially waited for credential hashing/readback inside an existing write transaction and timed out. It was corrected to exercise the actual Web Locks coordination boundary before that transaction, without skipping the test or increasing its timeout.

The integrated `5dae57109a0ee5a06f5738105f78f59120535de9` candidate passed its security workflow and device-engine workflow. UI-related workflows exposed a TypeScript declaration omission for the new JavaScript limiter. The declaration is now included; those gates require a full rerun. Its native job passed the new checkpoint tests, but the full release workflow result is not a substitute for the repaired candidate's verification.

## Canonical implementation repairs

- Refund-policy approval snapshots its primitive settings before asynchronous coordination and checks company, original actor and unlock generation through the last audit write. Existing sale-time snapshots remain immutable.
- Catalogue CSV parsing now enforces its documented 10,000-product cap after the final EOF record as well as after line delimiters. The regression tests exactly 10,000 and 10,001 rows with and without a trailing newline.
- Local synchronization consent and queue writes retain their initial unlock generation through final storage; queue metadata is cloned before caller mutation. A final-write interruption rolls back the whole transaction.
- Metadata conflict inspection now uses the canonical cross-tab/recovery barrier and an immutable claim. Conflict reads/writes retain original company/actor/unlock scope; mismatches remain quarantined and never apply remote financial records.
- A declaration for the pinned Express limiter restores strict TypeScript integration. This does not weaken the runtime limiter or the type-check gate.

New IndexedDB regressions assert unchanged financial tables on interrupted queue/quarantine writes and require that a new unlock of the same owner cannot inherit an earlier approval. These repairs do not implement actual financial replication, general multi-tender partial refunds, or an owner workflow for resolving conflicting financial histories.

## Task-level reconciliation

| Task | Existing source reused | Remaining required engineering/acceptance |
| --- | --- | --- |
| ST22-02 | Reused canonical full reversal and atomic cash-only partial-return posting with original receipt, FIFO restoration, policy evidence, duplicate refusal and multi-ledger regression coverage. | Cash-only partial returns explicitly reject customer-linked, credit, wallet, loyalty, mixed-tender, batch-owned and classified Ghana-tax cases; those required dispositions are not a complete general refund workflow. |
| ST22-04 | Reused default-deny append-only company policies and original-sale/current policy intersection. Reproduced then repaired mutable approval terms and commits after owner lock; added original-unlock-generation checks. | New guards and full policy cross-model acceptance require final integrated CI and field authorization evidence. |
| ST22-08 | Reused integer/BigInt half-up single-rate calculations, classified opt-in tax, immutable snapshots, stale-review denial, transaction rollback and backup/report reconciliation tests. Preserved currency-specific divisors. | Jurisdiction/registration certification, historical unsupported-currency provenance and complete corresponding partial-refund behavior remain open; code is not tax-invoice certification. |
| ST23-03 | Reused bounded 2–50-product shared-shop batches with canonical sorted counts, atomic PostgreSQL apply, stale count rejection, owner-only access and populated rollback guard; local recount rejects stale quantities and unsupported batch/store ownership. | Independent simultaneous count/employee field acceptance and historical adjustment review are not fully demonstrated; local and cloud stocktaking remain distinct. |
| ST23-05 | Reused variant RPCs, identifier validation, whole-unit pack conversion, wholesale thresholds and explicit service-item handling. Fixed the catalogue EOF loophole that accepted 10,001 rows without a final newline. | End-to-end supported product/variant/unit/expiry/archive behavior across both operating models still needs complete acceptance; existence of isolated conversion tests is insufficient. |
| ST23-09 | Reused measured navigation-shell browser performance and bounded catalogue parser. New 10,000-row preview checks validate the existing import boundary and prevent a trailing-newline bypass. | Shell timing and parser boundaries do not measure thousand-product purchasing/transfer/history workloads on low-resource physical hardware. Approved workload thresholds and scale evidence remain missing. |
| ST26-04 | Reused metadata mismatch/operation-collision/unknown-event quarantine without remote ledger writes. Added coordinated recovery barriers, immutable claims, original-unlock checks and transaction interruption tests. | Permissioned audited owner resolution of actual finance, inventory and ownership conflicts is not implemented by metadata quarantine; that integration remains open. |
| ST26-05 | Reused authorized shared-shop reports, BigInt supplier totals and scoped exports with explicit loaded-page limits. Local store contribution reporting retains original store and unknown historical attribution. | Shared-shop cloud records and local device ledgers are not a completed combined trusted financial replication/reporting system. Central cross-product financial reconciliation remains open. |
| ST26-06 | Reused durable local metadata queue, device trust, server-owned shared-shop posting and immutable matching receipts. Added input capture, same-owner unlock invalidation and rollback after final consent/queue write interruption. | Actual separate offline devices contending for one shop's stock under revoked staff and lost responses still require approved complete replication plus genuine device integration; metadata staging is not that feature. |

## Verification and continuation

The final integrated source in this commit requires fresh focused/semantic/full hosted verification. No new test is labelled passed before that run. Earlier observed 1,193 native/1,896 client/30 Chromium results belong only to `10355725d814dd04422debe717c2903435ab4a0a`.

Next: repair every new-candidate failure, finish deterministic checkpoint packaging, retain exact evidence, and continue mandatory partial/missing work. Main, hosted migrations/authentication policy, production deployments, real money, hardware acceptance and owner signoff remain unchanged and separately gated.
