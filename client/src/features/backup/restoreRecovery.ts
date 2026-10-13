/** Crash-safe preimage journal for restore or company clear across two
 * IndexedDB stores. The main ledger is the commit authority: if the marker
 * persists, roll the assistant tables back to the recorded preimage.
 */
import { db, type TallybookDB } from '@/db/TallybookDB';
import { assistantLocalDB, type StoredWorkflow, type StoredAlias, type AssistantHistoryRecord } from '@/features/assistant/assistantLocalStore';
import { withCrossTabDataLock } from './crossTabDataLock.mjs';
import { RESTORE_JOURNAL_KEY, RESTORE_JOURNAL_KIND, RESTORE_JOURNAL_VERSION, parseRestoreJournal, serializeRestoreJournal, assistantSnapshotsEqual, validateAssistantSnapshot } from './restoreJournal.mjs';

export interface AssistantRestoreSnapshot {
  workflows: StoredWorkflow[];
  aliases: StoredAlias[];
  history: AssistantHistoryRecord[];
}
interface RestoreJournal {
  kind: typeof RESTORE_JOURNAL_KIND;
  version: typeof RESTORE_JOURNAL_VERSION;
  phase: 'assistant-preimage-durable';
  id: string;
  companyId: string;
  createdAt: string;
  before: AssistantRestoreSnapshot;
  /** Exact postimage used to detect intervening writes on startup; absent in
   * legacy markers. Unknown states must not be silently overwritten. */
  after?: AssistantRestoreSnapshot;
  /** Absent on older restore journals; never treat unknown operations as safe. */
  operation?: 'backup-restore' | 'company-clear';
}

export async function readAssistantRestoreSnapshot(companyId: string): Promise<AssistantRestoreSnapshot> {
  await assistantLocalDB.open();
  return assistantLocalDB.transaction('r', [assistantLocalDB.workflows, assistantLocalDB.aliases, assistantLocalDB.history], async () => ({
    workflows: await assistantLocalDB.workflows.where('businessProfileId').equals(companyId).toArray(),
    aliases: await assistantLocalDB.aliases.where('businessProfileId').equals(companyId).toArray(),
    history: await assistantLocalDB.history.where('businessProfileId').equals(companyId).toArray(),
  }));
}

export async function writeAssistantRestoreSnapshot(companyId: string, snapshot: AssistantRestoreSnapshot, expectedBefore?: AssistantRestoreSnapshot): Promise<void> {
  await assistantLocalDB.open();
  validateAssistantSnapshot(snapshot, companyId);
  if (expectedBefore) validateAssistantSnapshot(expectedBefore, companyId);
  await assistantLocalDB.transaction('rw', [assistantLocalDB.workflows, assistantLocalDB.aliases, assistantLocalDB.history], async () => {
    // Read and compare within the SAME assistant IndexedDB write transaction.
    // Prevents a stale journal snapshot from overwriting intervening edits.
    // The caller holds the Web Locks gate in normal restore/clear/recovery;
    // full coverage of retail writers and real cross-tab QA remain open.
    if (expectedBefore) {
      const current: AssistantRestoreSnapshot = {
        workflows: await assistantLocalDB.workflows.where('businessProfileId').equals(companyId).toArray(),
        aliases: await assistantLocalDB.aliases.where('businessProfileId').equals(companyId).toArray(),
        history: await assistantLocalDB.history.where('businessProfileId').equals(companyId).toArray(),
      };
      if (!assistantSnapshotsEqual(current, expectedBefore))
        throw new Error('Assistant records changed after recovery snapshot. Stop and preserve this device; do not overwrite concurrent edits.');
    }
    for (const key of ['workflows', 'aliases', 'history'] as const) {
      const rows = snapshot[key];
      if (!Array.isArray(rows) || rows.some(row => !row.id || row.businessProfileId !== companyId) ||
          new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Invalid assistant restore preimage.');
      const others = await assistantLocalDB[key].bulkGet(rows.map(row => row.id));
      if (others.some(row => row && row.businessProfileId !== companyId))
        throw new Error('Assistant restore would overwrite another company.');
    }
    await assistantLocalDB.workflows.where('businessProfileId').equals(companyId).delete();
    await assistantLocalDB.aliases.where('businessProfileId').equals(companyId).delete();
    await assistantLocalDB.history.where('businessProfileId').equals(companyId).delete();
    await assistantLocalDB.workflows.bulkPut(snapshot.workflows);
    await assistantLocalDB.aliases.bulkPut(snapshot.aliases);
    await assistantLocalDB.history.bulkPut(snapshot.history);
  });
}

async function beginAssistantPreimageJournal(companyId: string, before: AssistantRestoreSnapshot, operation: 'backup-restore' | 'company-clear', database: TallybookDB, after: AssistantRestoreSnapshot): Promise<string> {
  const marker: RestoreJournal = {
    kind: RESTORE_JOURNAL_KIND, version: RESTORE_JOURNAL_VERSION, phase: 'assistant-preimage-durable',
    id: crypto.randomUUID(), companyId, createdAt: new Date().toISOString(), before, after, operation,
  };
  const value = serializeRestoreJournal(marker);
  await database.transaction('rw', database.appMeta, async () => {
    if (await database.appMeta.get(RESTORE_JOURNAL_KEY))
      throw new Error('An interrupted restore or company clear requires recovery before another operation.');
    await database.appMeta.put({key: RESTORE_JOURNAL_KEY, value, updatedAt: marker.createdAt});
  });
  return value;
}

export function beginBackupRestoreJournal(companyId: string, before: AssistantRestoreSnapshot, database: TallybookDB = db, after: AssistantRestoreSnapshot = before): Promise<string> {
  return beginAssistantPreimageJournal(companyId, before, 'backup-restore', database, after);
}

/** A company clear has the same crash protocol as backup restore: assistant
 * changes first, followed by a single main-ledger commit deleting the marker.
 */
export function beginCompanyClearJournal(companyId: string, before: AssistantRestoreSnapshot, database: TallybookDB = db): Promise<string> {
  return beginAssistantPreimageJournal(companyId, before, 'company-clear', database, { workflows: [], aliases: [], history: [] });
}

/** Call before showing the database as ready. A corrupt/failed journal is
 * intentionally sticky and fails startup closed instead of rewriting records.
 */
export async function recoverPendingBackupRestoreWhileLocked(database: TallybookDB = db): Promise<boolean> {
  await database.open();
  const saved = await database.appMeta.get(RESTORE_JOURNAL_KEY);
  if (!saved) return false;
  const journal = parseRestoreJournal(saved.value) as RestoreJournal;
  // Before replaying a preimage, require exactly the change this operation
  // was authorized to make. Another tab's unexpected assistant writes must
  // remain intact and leave the journal available for deliberate recovery.
  const current = await readAssistantRestoreSnapshot(journal.companyId);
  if (!assistantSnapshotsEqual(current, journal.before)) {
    if (!journal.after || !assistantSnapshotsEqual(current, journal.after))
      throw new Error('Pending recovery found unexpected assistant edits. Preserve this device and recovery journal; manual reconciliation is required.');
    // This second comparison takes place within the assistant RW transaction
    // to avoid a read-then-write race against another assistant writer.
    await writeAssistantRestoreSnapshot(journal.companyId, journal.before, journal.after);
  }
  await database.transaction('rw', database.appMeta, async () => {
    const current = await database.appMeta.get(RESTORE_JOURNAL_KEY);
    if (!current || current.value !== saved.value) throw new Error('Backup restore journal changed during recovery.');
    await database.appMeta.delete(RESTORE_JOURNAL_KEY);
  });
  return true;
}

/** Public startup recovery acquires the same cross-tab exclusive lock used by
 * restore and company clear. Internal callers already holding that lock must
 * call recoverPendingBackupRestoreWhileLocked to avoid self-deadlock. */
export async function recoverPendingBackupRestore(database: TallybookDB = db): Promise<boolean> {
  await database.open();
  // On supported browsers, gate startup even if a marker is not visible yet:
  // another tab might be between acquiring the lock and persisting its marker.
  // On unsupported browsers, permit normal startup ONLY if no journal exists.
  if (!globalThis.navigator?.locks && !(await database.appMeta.get(RESTORE_JOURNAL_KEY))) return false;
  return withCrossTabDataLock('exclusive', () => recoverPendingBackupRestoreWhileLocked(database));
}
