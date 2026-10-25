# Dexie v28–v35 migration reconciliation

Two sources used the same historical version numbers for different schema work:

| Version | Master local lineage | GitHub stage22 lineage | Unified treatment |
|---:|---|---|---|
| 28 | Cash partial returns | Cash partial returns | Preserved unchanged. |
| 29 | Purchase/batch/cost provenance indexes | Store stock and transfer indexes | v29 declaration is the union; no historical rows are rewritten. |
| 30 | Append-only no-sale drawer events | Encrypted replica tables | v30 declaration is the union; no historical rows are rewritten. |
| 31–33 | Absent | Payment sandbox, commerce, advisory review | GitHub declarations retained. |
| 34 | Absent | Company-scoped financial retry indexes | GitHub declaration retained. |
| 35 | New | New | Reasserts the batch/cost indexes and drawer table for upgrades from either physical lineage. |

The first v35 attempt lost a Master v30 no-sale record in a focused fixture: Dexie removed the table while stepping through the conflicting v30 definition. The union declarations corrected that failure. The focused suite now preserves a v28 batch, a Master-style v30 no-sale event and batch, and GitHub-style v34 sale and wallet rows. These tests inspect saved rows after upgrade and assert v35 opens. They do not yet prove every full historical schema, duplicate-index conflict, interrupted upgrade, or backup/restore path.

Financial rows are not backfilled, reclassified, converted, or rewritten by this migration. Existing customer data must be backed up before a release candidate is used on real devices. Production migration acceptance remains open.
