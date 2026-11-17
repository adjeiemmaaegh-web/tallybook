# Verified checkpoint and checkout-authority repair — 2026-11-17

**NO-GO.** This is an engineering checkpoint, not all-stages completion. See [machine-readable evidence](evidence/road-to-complete-continuation/verified-checkpoint-2026-11-17.json).

## Frozen executable evidence

[Release validation 44045528700](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44045528700) passed:

- 1,208 native tests, zero failed or skipped.
- 1,910 client tests in 239 files.
- Strict TypeScript, production client/server bundle, 30 Chromium checks across functional, auth, fresh-start, phone-width, accessibility, offline and performance configurations.
- Moderate-or-higher dependency advisory check; no known vulnerabilities reported.
- Two builds with identical content manifests in the same isolated Linux job, followed by independent file/hash verification of that package: 136 payload files, 190 production dependency versions.

GitHub PR workflows execute a synthetic merge, not the PR head itself. The actual checkout was `198332faed5a6d04f4075b588eee9ac348ec1b2f`, with parents main `41d4bab619db1808f21471299bd7760eee1a6836` and review head `ea61775af959d8016b35cd563b4068ac4cd7e507`. Both the executed commit and review head have the exact tree `c29e198d66e7876a772acd94a24d92b81d0eb74e`, confirmed via Git metadata. The source is retained at `codex/checkpoint-20261117-198332fa`. This reference does not merge anything into main.

Manifest SHA-256: `95d4c6e6dc3d6c75e42619518b8b043614db2b5348e4f1fa2ca3ce999f47c781`.
[Development artifact 14312355794](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44045528700/artifacts/14312355794), ZIP SHA-256 `703aa3e92948f4407ee391028da70decb2617931c962823f183d1a72ae6a941f`, expires 1 December 2026. The artifact contains web output, unapplied migration source, requirements and toolchain/dependency metadata, with NO-GO and no owner/production approval. It contains no customer database or new live configuration.

Likewise, the earlier 1,193-native/1,896-client run 44039335537 was associated with head `10355725d814dd04422debe717c2903435ab4a0a` but executed `e591fb0aaf9e227a8c9a356856d94f37c5d09d39`. Both have tree `3aeb4428ec4c195a47c63def127309edb40d5426`. Historical shorthand naming the review candidate should be read with this exact checkout/tree distinction.

## Subsequent canonical checkout repair

The frozen checkpoint above intentionally predates this repair.

At `ad65f324b1db1de52b93a8292c889d4d43b7d467`, [run 44046633903](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44046633903) reproduced two genuine authorization defects: a cash checkout committed after the operator locked during its final durable-event write; re-unlocking the same owner while checkout waited for coordination transferred an old approval to the fresh session. Two additional credit/wallet test setups failed contact validation and are not counted as demonstrated ledger defects. Their synthetic contact fixtures were corrected.

The canonical sale service now snapshots its parsed cart and captures company, staff ID and unlock generation before asynchronous coordination. It checks those identities at transaction entry, on duplicate receipt return and after the final durable-event write, so interruption aborts the entire IndexedDB transaction. Nested quotation conversion continues using its existing outer transaction rather than acquiring a Web Lock inside it.

At repaired source `2bc1031dd36fd1164e503d2a53815e68ddec79a2`, [security run 44046916459](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44046916459) passed all three jobs: 37 focused client tests, semantic TypeScript, 11 native descriptor/TLS/rate-limit/classification regressions, CodeQL severity gate and full-fetched-history classification. The new cash, credit and wallet cases assert that **every saved table** equals the pre-checkout snapshot after a final-write lock, including money, debt, wallet, stock, FIFO, receipt and audit records. Earlier successful-path tests remain necessary in the final complete regression.

## Genuine cross-engine automation

[Run 44046916471](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/44046916471) passed eight selected local account/ledger/public-entry cases per engine (32 total) at the repaired source:

| Engine | Host | Recorded version | Result |
| --- | --- | --- | --- |
| Microsoft Edge | Windows | 156.0.4314.58 | 8 pass |
| WebKit | macOS | 27.2 | 8 pass |
| Google Chrome | Linux | 157.0.8103.78 | 8 pass |
| Firefox | Linux | 157.0 | 8 pass |

The earlier matrix run 44045859764 records these exact versions; the repaired-source matrix also passed all four jobs. Engine metadata and JSON results are retained per job. WebKit automation does not equal Safari application acceptance, and these fixtures do not establish real hosted Auth, provider settlement, physical phones or a complete cross-browser business matrix.

## Remaining and exact continuation

Register totals: 1 verified task, 94 partial, 4 missing engineering and 20 owner/external blocked; no unresolved task was removed. All 119 have initial source dispositions, while the 143 historical IDs still need full closure. Main remains `41d4bab619db1808f21471299bd7760eee1a6836`.

The next integration must run complete CI on this later canonical checkout source and retain its actual executed merge SHA, tree, build manifest and test results. Then continue mandatory financial refunds, inventory/store provenance, full financial replication, at-rest encryption, durable real-provider settlement and other open requirements. Do not relabel the earlier checkpoint as the repaired checkout artifact.

No entire stage is certified accepted, and no main merge, live migration/auth-policy/config change, deployment or real payment was performed.
