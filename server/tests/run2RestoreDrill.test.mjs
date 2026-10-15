import test from 'node:test';
import assert from 'node:assert/strict';
import {performIndependentRestoreDrill} from '../run2RestoreDrill.mjs';
const source=()=>({kind:'tallybook-local-backup',formatVersion:1,records:{
  appMeta:[],businessProfiles:[{id:'local',name:'Test Company'}],
  products:[{id:'p1',businessProfileId:'local',name:'Sample'}],
  sales:[{id:'s1',businessProfileId:'local',amountMinor:1000}],
  syncConsents:[{businessProfileId:'local',enabled:true,updatedAt:'2026-10-15'}]
}});
function isolated(change=x=>x){
  const state={backup:null,closed:false};
  return {state,makeIsolatedStore:async()=>({
    empty:async()=>true,
    import:async value=>{state.backup=structuredClone(value);},
    snapshot:async()=>change(structuredClone(state.backup)),
    destroy:async()=>{state.closed=true;}
  })};
}
test('disposable restore compares full snapshot, not a caller success flag',async()=>{
  const x=isolated(v=>{v.records.syncConsents[0].enabled=false;return v;});
  const result=await performIndependentRestoreDrill({backupText:JSON.stringify(source()),
    companyId:'local',makeIsolatedStore:x.makeIsolatedStore});
  assert.match(result.backupManifestSha256,/^[a-f0-9]{64}$/);
  assert.match(result.restoreReceiptSha256,/^[a-f0-9]{64}$/);
  assert.equal(x.state.closed,true);
});
test('rejected forged restored data closes disposable store',async()=>{
  const x=isolated(v=>{v.records.sales[0].amountMinor=1;return v;});
  await assert.rejects(performIndependentRestoreDrill({backupText:JSON.stringify(source()),
    companyId:'local',makeIsolatedStore:x.makeIsolatedStore}));
  assert.equal(x.state.closed,true);
});
test('backup cannot restore under another company identity',async()=>{
  const x=isolated();
  await assert.rejects(performIndependentRestoreDrill({backupText:JSON.stringify(source()),
    companyId:'foreign',makeIsolatedStore:x.makeIsolatedStore}));
});
test('nonempty target is never overwritten',async()=>{
  let imported=false;
  await assert.rejects(performIndependentRestoreDrill({backupText:JSON.stringify(source()),
    companyId:'local',makeIsolatedStore:async()=>({
      empty:async()=>false,import:async()=>{imported=true;},
      snapshot:async()=>source(),destroy:async()=>{}
    })}));
  assert.equal(imported,false);
});
test('foreign-company rows in backup are rejected before import',async()=>{
  const x=isolated(),data=source();
  data.records.products[0].businessProfileId='foreign';
  await assert.rejects(performIndependentRestoreDrill({backupText:JSON.stringify(data),
    companyId:'local',makeIsolatedStore:x.makeIsolatedStore}));
});
