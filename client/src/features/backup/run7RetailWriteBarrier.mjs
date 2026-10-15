/** Validate the durable two-DB recovery marker INSIDE the main IndexedDB
 * write transaction, whose tables MUST include appMeta. An interrupted
 * restore/clear must stop unrelated ledger writes before any financial
 * mutation or idempotency replay. This does not replace origin Web Locks.
 */
import {RESTORE_JOURNAL_KEY} from './restoreJournal.mjs';
export async function assertRun7RetailWriteReady(appMeta){
  if(!appMeta||typeof appMeta.get!=='function')
    throw Error('Retail recovery guard requires the indexed metadata table.');
  const saved=await appMeta.get(RESTORE_JOURNAL_KEY);
  if(saved!==undefined&&saved!==null)
    throw Error('Interrupted restore or company clear requires recovery before another retail write. Preserve this device.');
  return true;
}
