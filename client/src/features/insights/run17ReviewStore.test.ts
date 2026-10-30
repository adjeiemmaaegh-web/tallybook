import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {createStaff,unlockStaff,lockStaff} from '@/features/staff/staff';
import {createProduct} from '@/features/inventory/inventory';
import {createBackup,parseBackup} from '@/features/backup/backup';
import {getRun17Evidence} from './run17Service';
import {recordRun17Review,getRun17ReviewStates,RUN17_AUTOMATIC_ACTIONS_ENABLED} from './run17ReviewStore';
const databases:TallybookDB[]=[];
async function fixture(){
 setActiveBusinessProfileId('primary');
 const db=new TallybookDB(`advisory-review-${crypto.randomUUID()}`);databases.push(db);await initializeDatabase(db);
 await saveBusinessProfile({name:'Review fixture',country:'Ghana',currency:'GHS',businessType:'Retail'},db);
 const owner=await createStaff('Review owner','owner','123456',db);await unlockStaff(owner.id,'123456',db);
 const product=await createProduct({name:'Rice',categoryId:'uncategorized',sellingPrice:'10',costPrice:'1',initialStock:'0',lowStockThreshold:'1'},'GHS',db);
 const report=await getRun17Evidence('last7',new Date(),db);
 const finding=report.findings.find(f=>f.id===`stock:${product.id}`)!;
 const input={findingId:finding.id,period:'last7' as const,action:'acknowledge' as const,
  expectedEvidenceKey:finding.evidenceKey,note:'Shelf count reviewed today.',submissionKey:'review-request-1'};
 return {db,owner,product,input};
}
afterEach(async()=>{vi.restoreAllMocks();lockStaff('primary');setActiveBusinessProfileId('primary');
 for(const db of databases.splice(0)){db.close();await new Dexie(db.name).delete();}});
it('persists exact evidence review, retries once, reopens and retains a valid backup without financial writes',async()=>{
 const {db,input,product}=await fixture();
 const before=await db.products.get(product.id);
 const first=await recordRun17Review(input,db);
 expect(await recordRun17Review(input,db)).toEqual(first);
 expect(await db.run17ReviewEvents.count()).toBe(1);
 expect(await db.staffAudits.filter(row=>row.action==='insights.run17.acknowledge').count()).toBe(1);
 db.close();await db.open();
 expect(await getRun17ReviewStates(db)).toMatchObject([{status:'acknowledged',evidenceKey:input.expectedEvidenceKey,eventCount:1}]);
 await recordRun17Review({...input,action:'reopen',submissionKey:'review-request-2'},db);
 expect(await getRun17ReviewStates(db)).toMatchObject([{status:'unreviewed',eventCount:2}]);
 expect(parseBackup(JSON.stringify(await createBackup(db))).records.run17ReviewEvents).toHaveLength(2);
 expect(await db.products.get(product.id)).toEqual(before);
 expect(await db.sales.count()).toBe(0);expect(await db.payments.count()).toBe(0);
 expect(RUN17_AUTOMATIC_ACTIONS_ENABLED).toBe(false);
});
it('rejects an acknowledgement of evidence that changed after display',async()=>{
 const {db,input,product}=await fixture();
 await db.products.update(product.id,{lowStockThreshold:2});
 await expect(recordRun17Review(input,db)).rejects.toThrow(/changed/);
 expect(await db.run17ReviewEvents.count()).toBe(0);
});
it('rejects cashier and locked sessions without adding review records',async()=>{
 const {db,input}=await fixture();
 const cashier=await createStaff('Cashier','cashier','654321',db);await unlockStaff(cashier.id,'654321',db);
 await expect(recordRun17Review(input,db)).rejects.toThrow();
 lockStaff('primary');await expect(recordRun17Review(input,db)).rejects.toThrow();
 expect(await db.run17ReviewEvents.count()).toBe(0);
});
it('rolls back review if the audit write fails',async()=>{
 const {db,input}=await fixture();
 vi.spyOn(db.staffAudits,'add').mockRejectedValueOnce(Error('audit unavailable'));
 await expect(recordRun17Review(input,db)).rejects.toThrow(/audit unavailable/);
 expect(await db.run17ReviewEvents.count()).toBe(0);
});
it('rolls back when staff locks during the final audit write',async()=>{
 const {db,input}=await fixture();const add=db.staffAudits.add.bind(db.staffAudits);
 vi.spyOn(db.staffAudits,'add').mockImplementationOnce(async record=>{const key=await add(record);lockStaff('primary');return key;});
 await expect(recordRun17Review(input,db)).rejects.toThrow(/session changed/);
 expect(await db.run17ReviewEvents.count()).toBe(0);
 expect(await db.staffAudits.filter(row=>row.action==='insights.run17.acknowledge').count()).toBe(0);
});
it('serializes competing acknowledgements and rejects cross-company review',async()=>{
 const {db,input}=await fixture();
 const outcomes=await Promise.allSettled([recordRun17Review(input,db),recordRun17Review({...input,submissionKey:'review-request-2'},db)]);
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(await db.run17ReviewEvents.count()).toBe(1);
 setActiveBusinessProfileId('other');await expect(recordRun17Review(input,db)).rejects.toThrow();
 expect(await db.run17ReviewEvents.count()).toBe(1);
});
