# Validated source handoff — 2026-11-17

**NO-GO. All seven current development workflows pass; all 12 roadmap stages are not complete or accepted.**

## Exact Git and artifact identity

- Main remains `41d4bab619db1808f21471299bd7760eee1a6836`; no production/main change was performed.
- Validated review source: `4acc36595d80e724f2293d8c8dc322ba503daddf`, [draft PR #105](https://github.com/adjeiemmaaegh-web/tallybook/pull/105).
- Actual PR workflow checkout: `3a87d295e30fa6672986e874881aa26d46068f4b`; both commits have exact tree `4d4b3f10af3230ca372b46a108c849e202aaee70`. Frozen source ref: `codex/checkpoint-20261117-3a87d295`.
- [Development package](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478753/artifacts/14314725167): 321 payload files, 190 production dependency versions and 185 original top-level notice files. Manifest SHA-256 `a16e13403c19275545ed9a60a9412e3dd4977ab5c1c86dfec7f1937b2805c659`; ZIP SHA-256 `b95213b857cb72627ed80b3d4d9f96cafc20be219c7f1e763c9bb4cfb65d28eb`. Hosted artifact expires after 14 days. Source refs and committed evidence persist.

This handoff update changes evidence only; the pinned source above remains the exact tested candidate. A later documentation-head workflow is not silently counted as already passed.

## Working engineering increments

Canonical standalone and shared-shop boundaries were preserved. Changes include independent stored-ledger conservation tests, company/store stock allocation and atomic transfers, recovery/write and original-unlock guards, exact immutable sync acknowledgements, per-line public-order pricing/currency snapshots, active privileged-session proof, source-grounded owner-approved advisory schedules, currency-correct accessible charts, truthful manual-payment receipts, stream byte limits and startup failure handling.

The latest repairs specifically reject checkout/refund-policy/consent/queue/conflict writes after operator lock or same-owner re-unlock, preserve original reviewed input, and roll back all saved money, debt, wallet, stock, FIFO, receipt and audit tables on final-write interruption. General multi-tender partial refunds remain open; the cash-only lane is not renamed as a complete refund system.

The CI packager produces a verifiable NO-GO web/schema checkpoint, dependency metadata and exact notice bytes. It rejects corrupt, extra, traversal, duplicate or symlink payloads and forged release-approval flags. Repeated builds matched in one isolated Linux job; independent-machine reproducibility and legal/asset acceptance are still open.

## Final observed verification of the pinned source

Environment: Node 24.19.0, pnpm 10.34.0, frozen lockfile; full developer QA on Ubuntu 24.04. Browser matrix additionally runs Windows Edge and macOS WebKit.

| Workflow | Result and scope |
| --- | --- |
| [Complete release validation](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478753) | **1,211 native pass; 0 failed/skipped. 1,915 client pass in 240 files.** Types/build, 30 Chromium cases, dependency advisory gate and two identical 321-file package manifests pass. |
| [Four actual browser engines](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478763) | **64 pass**: 16 each on Windows Edge 156.0.4314.58, macOS WebKit 27.2, Linux Chrome 157.0.8103.78 and Firefox 157.0. Native IndexedDB financial invariants, duplicate checkout, lock denial, historical schemas, populated ledgers and two-tab custody are exercised. |
| [Security](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478932) | All three jobs pass. 37 focused client and 21 native security/package cases, types/build/repeat package, CodeQL severity and strict source-verified historical-secret gates pass. |
| [UI branch verification](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478794) | Pass |
| [Integrated reference UI](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478904) | Pass |
| [Clementia 100×20 QA](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478793) | Pass |
| [Read-only public-site smoke](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050478748) | Pass; public HTTP only, not authenticated merchant acceptance |

[Separate same-source push security run](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44050464982) also passes the mandatory gate: **0 High/Critical CodeQL**, one retained 6.5 test-CA file-flow finding. The generated public test certificate is used to configure HTTPS CA validation, not as an HTTP request body. No query suppression was added. The PR SARIF has zero findings; report scope remains explicit.

The 632 historical scanner matches are source-verified noncredential metadata: 599 digest values, 30 synthetic submission IDs, 2 Git commit references and 1 intentionally public browser publishable key. Unknown findings still fail. No credential values are retained in reports. Scan size/archive/time limits remain documented; this is not independent security certification.

Machine-readable results and artifact/source bindings: [validated-source JSON](evidence/road-to-complete-continuation/validated-source-2026-11-17.json). Earlier local and hosted results retain their own source identities.

## Remaining requirements and owner gates

All 119 governing rows remain in the [progress register](ROAD_TO_COMPLETE_PROGRESS.json): **1 verified, 94 partial, 4 missing engineering, 20 owner/external blocked; 0 unreviewed and 0 implemented-pending-acceptance**. These dispositions do not mean 119 completed tasks. The 143 historical IDs still need complete behavioral closure.

Missing engineering includes active-ledger encryption and the real-provider adapter/settlement/refund/dispute chain. Mandatory partial work includes general customer/credit/wallet/mixed-tender partial refunds, inventory/store batch provenance and broader transfer/scale cases, complete trusted financial replication and central reconciliation, commerce fulfillment/refund lifecycle, privacy/recovery and acceptance gaps recorded per task.

Production migrations 38/39 remain unapplied. Live leaked-password policy is unchanged. Real hosted Auth, provider verification, Safari application, Android/iOS phones, printers/scanners/drawers, disaster-recovery field drills, legal/asset terms and owner release acceptance are not inferred from fixtures.

## Coherent continuation point

The local execution workspace became unavailable; engineering continued through GitHub source commits and isolated hosted CI. Do not assume inaccessible local worktrees include these later commits. Resume from the current review branch or the pinned validated source, inspect current Git state and preserve any newer work.

Highest-value next work is canonical ST22-02 general-tender partial-return integration: read the cash-only posting, full reversal, credit/repayment and wallet ledgers, reports, backup validators and local event contracts before extending them. Preserve original sale/receipt and prove money/stock/debt/credit conservation under replay and final-write interruption. Do not import retired candidate financial engines. Continue unresolved inventory/store provenance and full sync requirements afterward.

This session leaves a tested development increment and exact open-task handoff, not a commercial readiness claim. Main merge, production data/config/auth changes, live payments and deployment remain unauthorized.
