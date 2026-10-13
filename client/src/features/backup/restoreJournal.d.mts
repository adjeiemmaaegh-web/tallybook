export const RESTORE_JOURNAL_KEY: 'restoreRecoveryJournal';
export const RESTORE_JOURNAL_KIND: 'tallybook-assistant-restore-preimage';
export const RESTORE_JOURNAL_VERSION: 1;
export const RESTORE_JOURNAL_MAX_BYTES: number;
export function validateRestoreJournal(input: unknown): unknown;
export function parseRestoreJournal(value: unknown): unknown;
export function serializeRestoreJournal(journal: unknown): string;
/** Checks company ownership and uniqueness for all assistant snapshot tables. */
export function validateAssistantSnapshot(snapshot: unknown, companyId: string): unknown;
/** Strict field-by-field, row-order-independent assistant snapshot comparison. */
export function assistantSnapshotsEqual(left: unknown, right: unknown): boolean;
