import type { FixtureFactory } from './contracts.js';
import { assertSnapshotHealthy, saleTotal } from './contracts.js';
export type QaResult = { name:string; passed:boolean; detail?:string; elapsedMs:number };
export async function runScenarios(makeFixture:FixtureFactory):Promise<QaResult[]> {
 const scenarios: {name:string; run:(f:Awaited<ReturnType<FixtureFactory>>)=>Promise<void>}[] = [
 {name:'baseline database integrity',run:async f=> {const issues=assertSnapshotHealthy(await f.adapter.snapshot(f.companyA)); if(issues.length) throw Error(issues.join(','));}},
 {name:'cross-company financial permission denied',run:async f=> {const d=await f.adapter.authorize(f.outsiderB,'refund',f.companyA);if(d.allowed)throw Error('CROSS_COMPANY_ALLOW');}},
 {name:'sales math and idempotent request',run:async f=> {const lines=[{sku:f.sku,quantity:2,unitPriceMinor:125n}]; const id='qa-sale-001';const a=await f.adapter.sale(f.cashierA,lines,id);const b=await f.adapter.sale(f.cashierA,lines,id);if(a.totalMinor!==saleTotal(lines)||a.id!==b.id)throw Error('SALE_MATH_OR_IDEMPOTENCY');}},
 {name:'refund never exceeds sale',run:async f=> {const s=await f.adapter.sale(f.managerA,[{sku:f.sku,quantity:1,unitPriceMinor:500n}],'qa-refund-sale');let rejected=false;try{await f.adapter.refund(f.managerA,s.id,501n,'qa-over-refund');}catch{rejected=true;}if(!rejected)throw Error('OVER_REFUND_ACCEPTED');}},
 {name:'inventory adjustment persisted',run:async f=> {const before=(await f.adapter.snapshot(f.companyA)).inventory[f.sku]??0;await f.adapter.adjustInventory(f.managerA,f.sku,3,'qa-stock');const after=(await f.adapter.snapshot(f.companyA)).inventory[f.sku]??0;if(after!==before+3)throw Error('INVENTORY_MISMATCH');}},
 {name:'backup restore roundtrip',run:async f=> {const before=await f.adapter.snapshot(f.companyA);const backup=await f.adapter.exportBackup(f.managerA);if(!backup.length)throw Error('EMPTY_BACKUP');await f.adapter.adjustInventory(f.managerA,f.sku,2,'qa-backup-change');await f.adapter.restoreBackup(f.managerA,backup);const after=await f.adapter.snapshot(f.companyA);if(JSON.stringify({...before,salesTotal:String(before.salesTotal),refundsTotal:String(before.refundsTotal)})!==JSON.stringify({...after,salesTotal:String(after.salesTotal),refundsTotal:String(after.refundsTotal)}))throw Error('RESTORE_MISMATCH');}},
 {name:'corrupt backup rejected without mutation',run:async f=> {const before=await f.adapter.snapshot(f.companyA);let rejected=false;try{await f.adapter.restoreBackup(f.managerA,new Uint8Array([0,255,13,37]));}catch{rejected=true;}if(!rejected)throw Error('CORRUPT_BACKUP_ACCEPTED');const after=await f.adapter.snapshot(f.companyA);if(JSON.stringify({...before,salesTotal:String(before.salesTotal),refundsTotal:String(before.refundsTotal)})!==JSON.stringify({...after,salesTotal:String(after.salesTotal),refundsTotal:String(after.refundsTotal)}))throw Error('CORRUPT_RESTORE_MUTATED');}}
 ];
 const results:QaResult[]=[];
 for(const s of scenarios){const start=Date.now();let f:Awaited<ReturnType<FixtureFactory>>|undefined;try{f=await makeFixture();await s.run(f);results.push({name:s.name,passed:true,elapsedMs:Date.now()-start});}catch(e){results.push({name:s.name,passed:false,detail:e instanceof Error?e.message:String(e),elapsedMs:Date.now()-start});}}
 return results;
}
export function failureReport(results:readonly QaResult[]):string {return JSON.stringify({passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results},null,2);}
