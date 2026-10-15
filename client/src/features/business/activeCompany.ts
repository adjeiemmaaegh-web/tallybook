import { lockStaff, requirePermission } from "@/features/staff/staff";
import { RESTORE_JOURNAL_KEY } from "@/features/backup/restoreJournal.mjs";
import {RUN8_VERIFIED_RECEIPT_KEY,parseRun8VerifiedReceipt} from "@/features/backup/run8VerifiedReceipt.mjs";
import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import { beginCompanyClearJournal, readAssistantRestoreSnapshot, recoverPendingBackupRestoreWhileLocked, writeAssistantRestoreSnapshot } from "@/features/backup/restoreRecovery";
import type { BusinessProfile } from "@/features/business/businessProfile";
import type { TallybookDB } from "@/db/TallybookDB";

export const LEGACY_BUSINESS_PROFILE_ID = "primary";

let activeBusinessProfileId = LEGACY_BUSINESS_PROFILE_ID;

export function getActiveBusinessProfileId() {
  return activeBusinessProfileId;
}

export function setActiveBusinessProfileId(id: string) {
  if (!id.trim()) throw new Error("Choose a company before continuing.");
  if (activeBusinessProfileId !== id) lockStaff(activeBusinessProfileId);
  activeBusinessProfileId = id;
}

export async function loadActiveBusinessProfileId(database: TallybookDB) {
  await database.open();
  const saved = await database.appMeta.get("activeBusinessProfileId");
  const savedProfile = saved?.value ? await database.businessProfiles.get(saved.value) : undefined;
  const fallback = savedProfile?.id ?? (await database.businessProfiles.get(LEGACY_BUSINESS_PROFILE_ID))?.id ?? (await database.businessProfiles.orderBy("updatedAt").last())?.id;
  if (fallback) {
    activeBusinessProfileId = fallback;
    if (saved?.value !== fallback) await persistActiveBusinessProfileId(fallback, database);
  }
  return activeBusinessProfileId;
}

export async function persistActiveBusinessProfileId(id: string, database: TallybookDB) {
  // The company selector is local workspace state, never proof of account
  // ownership. Refuse stale or forged identifiers even in offline-only mode.
  if (!id.trim() || !await database.businessProfiles.get(id))
    throw new Error("That company is no longer available on this device.");
  // Persist first: failed storage writes must not switch the in-memory
  // company and lock the currently unlocked staff session.
  await database.appMeta.put({ key: "activeBusinessProfileId", value: id, updatedAt: new Date().toISOString() });
  setActiveBusinessProfileId(id);
}

export async function getLocalCompanyProfiles(database: TallybookDB) {
  return database.businessProfiles.orderBy("name").toArray();
}

/** Clear assistant records before the retail transaction. A durable assistant
 * preimage journal survives process termination; its deletion is atomic with
 * the main company deletion. Startup recovery rolls assistant records back
 * only if that retail transaction did not commit.
 *
 * The exported clear function now holds an origin-wide exclusive Web Lock,
 * coordinated with supported assistant writers and restore/recovery. Other
 * retail writers/raw IndexedDB calls are NOT all lock-aware, and real browser
 * crash and concurrency QA remain mandatory.
 */
async function clearCompanyDataWhileLocked(companyId: string, database: TallybookDB) {
  if (companyId !== getActiveBusinessProfileId() || !companyId.trim())
    throw new Error("Switch to the company being cleared and unlock an authorized owner first.");
  await database.open();
  // Fail before any journal/assistant mutation when permission or company
  // existence is already invalid. Repeat these checks under the retail lock.
  await requirePermission("staff", database, companyId);
  if (!await database.businessProfiles.get(companyId)) throw new Error("Company to clear was not found.");
  if (await database.appMeta.get(RESTORE_JOURNAL_KEY))
    throw new Error("Recover the interrupted restore or company clear before clearing another company.");

  const before = await readAssistantRestoreSnapshot(companyId);
  const marker = await beginCompanyClearJournal(companyId, before, database);
  let next: BusinessProfile | undefined;
  try {
    await writeAssistantRestoreSnapshot(companyId, { workflows: [], aliases: [], history: [] }, before);
    next = await database.transaction("rw", database.tables, async () => {
      const journal = await database.appMeta.get(RESTORE_JOURNAL_KEY);
      if (!journal || journal.value !== marker) throw new Error("Company clear recovery journal changed before commit.");
      await requirePermission("staff", database, companyId);
      if (!await database.businessProfiles.get(companyId)) throw new Error("Company to clear was not found.");
      for (const table of database.tables) {
        if (table.name === "appMeta" || table.name === "businessProfiles") continue;
        // IndexedDB tables are company-indexed. Stock-count sessions also
        // retain an old 'companyId' field but their indexed ownership is
        // businessProfileId, as required by the current schema.
        await table.where("businessProfileId").equals(companyId).delete();
      }
      await database.businessProfiles.delete(companyId);
      const remaining = (await database.businessProfiles.orderBy("name").toArray())[0];
      const now = new Date().toISOString();
      if (remaining) await database.appMeta.put({ key: "activeBusinessProfileId", value: remaining.id, updatedAt: now });
      else await database.appMeta.delete("activeBusinessProfileId");
      if ((await database.appMeta.get("lastBackupCompanyId"))?.value === companyId) {
        await database.appMeta.delete("lastBackupCompanyId");
        await database.appMeta.delete("lastBackupAt");
      }
      // Never resurrect a verified-backup indicator if a cleared company ID
      // is recreated later. Proof for a different company is retained.
      const proofRow=await database.appMeta.get(RUN8_VERIFIED_RECEIPT_KEY);
      if(proofRow){
        const proof=parseRun8VerifiedReceipt(proofRow.value);
        if(proof.companyId===companyId)
          await database.appMeta.delete(RUN8_VERIFIED_RECEIPT_KEY);
      }
      // Durable commit decision: never remove outside this transaction.
      await database.appMeta.delete(RESTORE_JOURNAL_KEY);
      return remaining;
    });
  } catch (error) {
    try {
      if (!(await recoverPendingBackupRestoreWhileLocked(database)))
        throw new Error("Company clear journal disappeared before recovery.");
    } catch {
      throw new Error("Company clear failed and durable assistant recovery also failed. Preserve this device and retry startup recovery.", { cause: error });
    }
    throw error;
  }
  lockStaff(companyId);
  setActiveBusinessProfileId(next?.id ?? LEGACY_BUSINESS_PROFILE_ID);
}

/** Owner-authorized company deletion must hold the same exclusive Web Lock
 * across both IndexedDB commits and any recovery path. */
export function clearCompanyData(companyId: string, database: TallybookDB): Promise<void> {
  return withCrossTabDataLock('exclusive', () => clearCompanyDataWhileLocked(companyId, database));
}
