/** V19 Run 7: pure, deterministic decision for an interrupted two-database
 * restore/company clear. The main ledger commit is authoritative: a marker
 * exists ONLY while its main transaction has not committed. Never overwrite
 * unexpected assistant edits.
 */
import {assistantSnapshotsEqual} from './restoreJournal.mjs';
const deny=()=>{throw Error('Pending recovery found unexpected assistant edits; assistant recovery state is ambiguous. Preserve this device and journal for manual reconciliation.');};
export function classifyPendingAssistantRecovery(journal,current){
  if(!journal||typeof journal!=='object'||!current||typeof current!=='object'||
    !journal.before||!['backup-restore','company-clear',undefined].includes(journal.operation))
    deny();
  if(assistantSnapshotsEqual(current,journal.before)){
    return Object.freeze({action:'remove-marker',requiresAssistantWrite:false});
  }
  if(!journal.after||!assistantSnapshotsEqual(current,journal.after))deny();
  return Object.freeze({action:'restore-preimage',requiresAssistantWrite:true});
}
