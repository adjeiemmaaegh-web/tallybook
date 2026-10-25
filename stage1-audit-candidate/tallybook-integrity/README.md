# Tallybook V19 — standalone read-only integrity assessment

This component requires **no changes** to existing Tallybook source. It receives a Dexie database instance and explicit table/field mappings; it never opens or upgrades the database, invokes writes, deletes data, or performs repairs.

## Integration

```ts
import { assessIntegrity, type Options } from './integrity';

const options: Options = {
  tables: [
    { name: 'sales', key: 'id', transactionIds: ['transactionId'],
      financial: [{ path: 'amountMinorUnits', integer: true }],
      references: [{ path: 'customerId', targetTable: 'customers', targetPath: 'id', optional: true }] },
    { name: 'customers', key: 'id' }
  ],
  recovery: { backupPresent: async () => backupMetadataExists(),
              backupVerified: async () => backupChecksumVerified(),
              backupAgeHours: 12, maximumBackupAgeHours: 24 }
};
const report = await assessIntegrity(existingDexieInstance, options);
// Display/report issues; do not auto-repair. `incomplete` means validation cannot certify a clean result.
```

Replace the example names and paths with the application's real schema. `transactionIds` compares equal IDs across configured tables **when the same path is used**; choose consistent paths to check cross-table uniqueness. Numeric financial rules expect finite JS numbers, preferably safe integer minor currency units; configure `allowNegative` for valid signed adjustments. `key` and reference paths support dotted own-properties. Reference targets must be among configured tables. `validate` is an optional synchronous, read-only per-record rule. Recovery flags are **caller-supplied evidence**, not proof of recoverability: test restoring a backup separately.

## Running focused tests

Requires Node.js 18+ and TypeScript CLI (`tsc`). From this folder:

```sh
tsc -p tsconfig.json
node --test tests/*.test.cjs
```

## Limitations and safety

- `toArray()` reads entire configured tables into memory; use on bounded datasets or extend with a paged snapshot adapter for large stores.
- This is a **logical read-only scan**, not a Dexie snapshot transaction: concurrent writes can produce false relationship warnings. Run while writes are paused for consistent results. It does not guarantee detection of low-level IndexedDB page corruption, incomplete historical records, or a restorable backup.
- An absent configured table or failed read yields `incomplete`, not `clean`. `maxIssues` truncation also yields `incomplete`.
- Duplicate transaction detection uses exact primitive string/number/bigint identity (string `"1"` differs from numeric `1`). Empty or nonprimitive IDs are invalid. Date and compound-key identities require a caller-provided schema-specific validator.
- No customer data is copied into issue messages; messages contain table/field names and row positions. Treat reports as potentially sensitive operational metadata.
- Avoid running custom validators or backup callbacks with side effects; they are supplied by the host and cannot be made pure by this module.
