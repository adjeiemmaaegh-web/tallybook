/** Pure migration-chain diagnostics; does not open or upgrade a database. */
export type MigrationStep = {from:number;to:number;id:string};
export type MigrationFinding = {code:string;step?:string;detail:string};
export function validateMigrationChain(current:number,target:number,steps:readonly MigrationStep[]):MigrationFinding[] {
 const out:MigrationFinding[]=[];
 if(!Number.isSafeInteger(current)||!Number.isSafeInteger(target)||current<0||target<current)return [{code:'INVALID_VERSION_RANGE',detail:'Versions must be ordered safe nonnegative integers'}];
 const byFrom=new Map<number,MigrationStep>();const ids=new Set<string>();
 for(const s of steps){if(!s.id||ids.has(s.id))out.push({code:'DUPLICATE_STEP_ID',step:s.id,detail:'Migration ID is missing or reused'});ids.add(s.id);
  if(!Number.isSafeInteger(s.from)||!Number.isSafeInteger(s.to)||s.from<0||s.to<=s.from)out.push({code:'INVALID_STEP',step:s.id,detail:'Migration must advance a valid version'});
  if(byFrom.has(s.from))out.push({code:'AMBIGUOUS_START',step:s.id,detail:'Two migrations start at the same version'});else byFrom.set(s.from,s);
 }
 let at=current;const visited=new Set<number>();while(at<target){if(visited.has(at)){out.push({code:'CYCLE',detail:'Cycle in migration chain'});break;}visited.add(at);
  const s=byFrom.get(at);if(!s){out.push({code:'MISSING_MIGRATION',detail:`No migration starting at ${at}`});break;}
  if(s.to>target){out.push({code:'OVERSHOOT',step:s.id,detail:'Migration overshoots target schema'});break;}
  if(s.to<=at)break;at=s.to;
 }
 return out;
}
