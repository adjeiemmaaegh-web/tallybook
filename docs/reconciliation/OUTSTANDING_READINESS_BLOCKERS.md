# Outstanding blockers for offline-core release

| Priority | Blocker | Evidence needed to close |
|---|---|---|
| Critical | Optional sync server security tests cannot be validated on this Windows host: 43 failures stem from POSIX path guards; WSL and Docker are unavailable. | Completed Linux native/server run on the exact candidate SHA, including symlink, mode, lock, replay and revocation checks. If sync is excluded from release, prove the server cannot be started or reached from the shipped offline artifact. |
| Critical | No representative customer migration and restore exercise across both v30 histories and later versions. | Sanitized backups plus before/after ID, company, money, stock, cost and tax comparisons; interruption and restart evidence. |
| Critical | Physical-device acceptance has not been performed. | Signed and retained evidence for Windows Chrome/Edge, Android Chrome and iPhone Safari scenarios in `DEVICE_ACCEPTANCE_TEMPLATE.md`. |
| Critical | The governing register has 60 `implemented-unverified`, 18 `missing`, 3 `blocked`, and only 1 `implemented-and-tested` unit. Offline-core gaps include financial reconciliation and release recovery. | Each applicable unit in `docs/release/traceability.json` mapped to an implementation, passing test, manual observation and independent review; excluded capabilities gated off. |
| High | Deferred multi-store, commerce, assistant automation and cloud routes are accessible in the current app. | Either complete their acceptance units or implement and test release gating in navigation, direct routes and write services. Merely hiding links is insufficient. |
| High | The CI result for the development branch is not retrievable through the available connected workflow-run reader. | Obtain a completed Ubuntu validation job URL and raw native/browser logs for the exact candidate SHA. |

No blocker may be closed solely by editing an assertion. The release decision remains NO-GO until the applicable gate is proven and reviewed. The development branch may continue to receive commits; main and deployment remain separate.
