/** Decision support only: no automatic restore, journal mutation or live recovery. */
export type RecoveryJournal={phase:'idle'|'prepared'|'applying'|'committed';backupVerified:boolean;originalAvailable:boolean;restoreVerified:boolean};
export type RecoveryDecision={action:'none'|'investigate'|'rollback'|'confirm';reason:string};
export function planCrashRecovery(j:RecoveryJournal):RecoveryDecision{
 if(!j||!['idle','prepared','applying','committed'].includes(j.phase))return {action:'investigate',reason:'Invalid or missing recovery journal'};
 if(j.phase==='idle')return {action:'none',reason:'No restore in progress'};
 if(j.phase==='committed')return j.restoreVerified?{action:'confirm',reason:'Committed restore has verification evidence'}:{action:'investigate',reason:'Committed restore lacks validation evidence'};
 if(j.originalAvailable)return {action:'rollback',reason:'Incomplete restore; preserve original snapshot for controlled rollback'};
 return {action:'investigate',reason:'Incomplete restore without verified original; do not overwrite data'};
}
