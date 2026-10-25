import test from 'node:test';import assert from 'node:assert/strict';
import {validateStaffSale,prepareDrawerEvent} from './staffTransactionAndDrawerEvents.ts';
import {exportWatchdogCsv} from './watchdogCsvExport.ts';
import {summarizeAttendants,matchMoMoStatements} from './crossShopAttendantReports.ts';
import {prepareSyncBatch,verifySyncAcknowledgements,retryDelayMs} from './centralRetailSync.ts';
const ctx={businessProfileId:'co',storeId:'shop',staffId:'staff',shiftId:'shift',authenticatedPin:true};
test('mandatory staff and shift',()=>assert.equal(validateStaffSale({paymentMethod:'cash'}).length,2));
test('mandatory MoMo reference and provider',()=>assert.equal(validateStaffSale({paymentMethod:'mobile',staffId:'s',shiftId:'t'}).length,1));
test('PIN-verified drawer event',()=>assert.equal(prepareDrawerEvent(ctx,{id:'1',submissionKey:'unique1',kind:'no_sale',reason:'customer change',occurredAt:'2026-10-24T12:00:00Z'}).staffId,'staff'));
test('drawer event denied without verified PIN',()=>assert.throws(()=>prepareDrawerEvent({...ctx,authenticatedPin:false},{id:'1',submissionKey:'k',kind:'no_sale',reason:'a',occurredAt:'2026-10-24T12:00:00Z'})));
const e={eventId:'e1',businessProfileId:'co',storeId:'shop',staffId:'s',shiftId:'t',timestamp:'2026-10-24T12:00:00Z',eventType:'no_sale',reason:'=SUM(A1)'};
test('Watchdog CSV escaping and spreadsheet formula safety',()=>assert.match(exportWatchdogCsv([e],'co'),/\'=SUM\(A1\)/));
test('Watchdog export rejects cross-company',()=>assert.throws(()=>exportWatchdogCsv([e],'other')));
test('Watchdog export rejects duplicates',()=>assert.throws(()=>exportWatchdogCsv([e,e],'co')));
const x={businessProfileId:'co',storeId:'shop',staffId:'s',shiftId:'t',at:'2026-10-24T12:00:00Z'};
test('attendant aggregation',()=>{const r=summarizeAttendants([{...x,kind:'shift_close',varianceMinor:-90},{...x,kind:'void'},{...x,kind:'discount'}],'co');assert.equal(r[0].varianceMinor,-90);assert.equal(r[0].voids,1);assert.equal(r[0].discounts,1)});
test('cross-company report denied',()=>assert.throws(()=>summarizeAttendants([{...x,kind:'void'}],'other')));
test('MoMo statement matching',()=>{const a=matchMoMoStatements([{...x,kind:'momo',reference:'ref1',amountMinor:100},{...x,kind:'momo',reference:'ref2',amountMinor:200}],[{reference:'ref1',amountMinor:100},{reference:'ref2',amountMinor:150}]);assert.deepEqual(a.matched,['ref1']);assert.equal(a.mismatched.length,1)});
const sync={eventId:'sync1',companyId:'co',storeId:'shop',kind:'sale',occurredAt:'2026-10-24T12:00:00Z',payload:{},version:1};
test('sync preparation',()=>assert.equal(prepareSyncBatch([sync],'co').length,1));
test('sync batch denies duplicates and cross-company',()=>{assert.throws(()=>prepareSyncBatch([sync,sync],'co'));assert.throws(()=>prepareSyncBatch([sync],'other'))});
test('sync acknowledgment tracks pending',()=>assert.deepEqual(verifySyncAcknowledgements([sync],[],'co').pending,['sync1']));
test('sync acknowledgement denies unknown events',()=>assert.throws(()=>verifySyncAcknowledgements([sync],[{eventId:'wrong',companyId:'co',serverSequence:1,acceptedAt:'2026-10-24T12:01:00Z'}],'co')));
test('retry backoff capped',()=>assert.equal(retryDelayMs(30),300000));

test('repeated MoMo reference cannot be marked matched',()=>{
 const result=matchMoMoStatements([{...x,kind:'momo',reference:'same',amountMinor:100},{...x,kind:'momo',reference:'same',amountMinor:100}], [{reference:'same',amountMinor:100}]);
 assert.deepEqual(result.matched,[]);assert.deepEqual(result.duplicates,['same']);
});
test('duplicate statement MoMo reference cannot be marked matched',()=>{
 const result=matchMoMoStatements([{...x,kind:'momo',reference:'same',amountMinor:100}], [{reference:'same',amountMinor:100},{reference:'same',amountMinor:100}]);
 assert.deepEqual(result.matched,[]);assert.deepEqual(result.duplicates,['same']);
});
test('invalid negative MoMo statement amount is rejected',()=>{
 assert.throws(()=>matchMoMoStatements([{...x,kind:'momo',reference:'same',amountMinor:100}], [{reference:'same',amountMinor:-100}]));
});
test('CSV export requires an event type',()=>assert.throws(()=>exportWatchdogCsv([{...e,eventType:''}],'co')));
test('CSV formula injection with leading spaces is mitigated',()=>assert.match(exportWatchdogCsv([{...e,reason:'  =1+1'}],'co'),/\'  =1\+1/));

test('sync acknowledgement rejects mixed-company input batch even without acknowledgements',()=>{
 assert.throws(()=>verifySyncAcknowledgements([{...sync,companyId:'other'}],[],'co'));
});
test('sync acknowledgement rejects repeated event IDs in batch',()=>{
 assert.throws(()=>verifySyncAcknowledgements([sync,sync],[],'co'));
});
