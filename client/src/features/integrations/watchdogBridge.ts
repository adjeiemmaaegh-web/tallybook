import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { requirePermission, currentStaffId, staffCan } from '@/features/staff/staff';
import { serializeSingleStoreWatchdogCsv, mapSingleStoreWatchdogEvents, type ExportSnapshot } from './watchdogEventMapper';
import { createWatchdogDayEnvelope } from './watchdogDayEnvelope';

/** Reads the only verified active store under one authorized read transaction. */
async function readAuthorizedWatchdogSnapshot(database:TallybookDB):Promise<ExportSnapshot & {shifts: import('@/features/staff/staff').StaffShift[]; returns: import('@/features/sales/cashPartialReturnPosting').CashPartialSaleReturn[]}> {
  const company=getActiveBusinessProfileId();
  const actor=await requirePermission('reports',database,company);
  const actorId=actor?.id ?? null;
  return database.transaction('r',[database.storeLocations,database.sales,database.payments,database.staffShifts,database.saleReversals,database.noSaleEvents,database.cashPartialReturns,database.staffMembers],async()=>{
    const stores=await database.storeLocations.where('businessProfileId').equals(company).toArray();
    if(stores.length!==1||stores[0].status!=='active') throw new Error('Watchdog export requires one verified active store. Multi-store sale attribution is not yet available.');
    const [sales,payments,shifts,reversals]=await Promise.all([
      database.sales.where('businessProfileId').equals(company).toArray(),
      database.payments.where('businessProfileId').equals(company).toArray(),
      database.staffShifts.where('businessProfileId').equals(company).toArray(),
      database.saleReversals.where('businessProfileId').equals(company).toArray(),
    ]);
    const returns=await database.cashPartialReturns.where('businessProfileId').equals(company).toArray();
    const noSaleEvents=await database.noSaleEvents.where('businessProfileId').equals(company).toArray();
    const members=await database.staffMembers.where('businessProfileId').equals(company).toArray();
    if (actorId===null && members.length>0) throw new Error('Unlock an authorized staff member before exporting.');
    if (actorId!==null && !members.some(m=>m.id===actorId && !m.disabledAt && staffCan(m,'reports')))
      throw new Error('Report permission revoked during export.');
    if(company!==getActiveBusinessProfileId() || (actorId!==null && currentStaffId(company)!==actorId))
      throw new Error('Company or staff session changed during Watchdog export.');
    return {companyId:company,storeId:stores[0].id,sales,payments,shifts,reversals,noSaleEvents,returns};
  });
}

/** Legacy CSV unchanged for existing importers: no schema-version guarantee. */
export async function createWatchdogCsv(database:TallybookDB=db):Promise<string> {
  const data=await readAuthorizedWatchdogSnapshot(database);
  return serializeSingleStoreWatchdogCsv(data);
}

/** Versioned UTC-day JSON with explicit completeness/provenance limitations. */
export async function createWatchdogDayJson(dayUtc:string,database:TallybookDB=db):Promise<string> {
  const data=await readAuthorizedWatchdogSnapshot(database);
  const events=mapSingleStoreWatchdogEvents(data);
  const envelope=createWatchdogDayEnvelope({...data,events,dayUtc});
  if (getActiveBusinessProfileId()!==data.companyId) throw new Error('Company changed after Watchdog snapshot.');
  return JSON.stringify(envelope,null,2)+'\n';
}
