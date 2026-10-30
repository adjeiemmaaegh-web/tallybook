# V56: durable QA sale claim quarantine

Development branch: `development/v19-unified-reconciliation`. This is an additive local IndexedDB migration from schema v38 to v39. It creates `qaSaleClaimInbox` and `qaSaleClaimCursors`, with no upgrade rewrite of existing data.

`pullQaSaleClaimsToQuarantine` reads one page through the existing signed, isolated QA challenge flow. It loads the active nonextractable key from the verified device vault, requires an unlocked staff member with reports permission, checks the enrolled shop, binds the cursor to local company, cloud company, and device, and atomically writes claims and the next cursor. It rejects concurrent cursor changes, duplicate operation IDs, store changes, and staff or local company changes. A crash before commit leaves both claims and cursor unchanged. Backup restore clears these device-local records in the restore transaction; portable backups exclude them.

Every stored row retains `evidenceStatus: upload_claim_only` and `financialApplied: false`. No sale, inventory, receivable, or report is changed by this operation. The server still has to release signed pull after identity and data-flow acceptance, and a later reconciliation design must prove full-event integrity, deduplication, ordered replay, conflict handling, and financial posting before cloud sync can be called complete. This function has no user-facing trigger yet.

Verification in this increment: `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json` exited 0. The user will conduct application acceptance; no claim is made that this change was tested in a browser or against a live QA account.

The local sync status page now counts quarantined QA claims for the selected business and labels them unposted. Composite cursor and claim IDs use tuple serialization, so IDs containing `:` cannot collide across companies or devices. The existing QA Edge service has no device enrollment route and keeps signed pull disabled; showing a claim count does not make that route available.
