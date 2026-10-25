# Offline-core production-readiness gates

Decision scope: sales, purchasing, inventory, customer balances, refunds, supplier settlement, local staff authorization, reporting, backups, and recovery on one device. Multi-store, commerce, assistant automation, cloud sync, production cloud hosting, live payments, and external integrations must either meet their own acceptance gates or be disabled from the first release with that exclusion verified in the UI and write services. This document does not approve deployment.

| Gate | Required evidence | Current state |
|---|---|---|
| Reproducible source | Fresh GitHub clone at a recorded SHA, frozen lockfile install, clean status, matching package manifest | Fresh clone of `77086e2`, fast-forwarded to `3fd4b2f`; frozen install, TypeScript, build and full client rerun passed. Final package manifest pending. |
| Native and security | All applicable QA/native tests green; POSIX file-mode, symlink, hardlink, lock, and revocation checks on Linux; Windows local behavior separately verified | Clean-clone QA 420/420 and focused server audits 83/83 pass. Full Windows server: 345 pass, 43 sync failures, 1 skip; Linux CI result pending. |
| Client and browser | Complete Vitest, typecheck, build, release and offline Playwright all green on the candidate SHA | Clean-clone client 996/996, release Playwright 3/3, offline Playwright 3/3, typecheck and build passed at `3fd4b2f`; production audit zero advisories. |
| Migration and data conservation | Preserve v28, both v30 histories, v34 and v35 rows; crash/restart and backup/restore; compare counts, IDs, balances, stock, cost and tax before/after | Representative fixtures exist; broader real customer histories and interrupted restore evidence open. |
| Governing acceptance | Record result, test artifact, owner/reviewer, and disposition for each of the 82 register units; deferred features inaccessible and never marked complete | Register remains NO-GO; individual offline-core acceptance and deferred-feature gating are open. |
| Physical devices | Windows Chrome and Edge, Android Chrome, iPhone Safari: offline checkout, restart, company switch, authorization denial, encrypted backup and restore | Not performed. |
| Release | No critical defects or unexplained financial differences; reviewed PR after integration, separate explicit deployment decision | No PR or deployment. |

Tests for historical static source syntax may be updated to assert the current equivalent safety invariant, but runtime security behavior must not be relaxed. A failing gate remains failing until a completed rerun on the candidate SHA proves otherwise. Record raw logs and exact commit hashes; never infer physical acceptance from automation.
