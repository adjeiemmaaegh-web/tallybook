import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRun8BackupTables,RUN8_BACKUP_TABLES} from '../run8BackupCompatibility.mjs';
const baseline=()=>Object.fromEntries(RUN8_BACKUP_TABLES.map(k=>[k,[]]));
test('v37 event journal is optional only in older portable backups',()=>{
 const old=baseline();delete old.centralSaleEvents;
 assert.deepEqual(normalizeRun8BackupTables(old,36,37).centralSaleEvents,[]);
 assert.throws(()=>normalizeRun8BackupTables(old,37,37),/Required backup table missing: centralSaleEvents/);
});
test('v28 round-trip preserves every table as provided',()=>{
 const original=baseline();
 original.businessProfiles=[{id:'primary'}];
 const actual=normalizeRun8BackupTables(original,28,28);
 assert.deepEqual(Object.keys(actual),RUN8_BACKUP_TABLES);
 assert.deepEqual(actual.businessProfiles,original.businessProfiles);
});
test('v1 legacy only requires original core tables and defaults introduced later',()=>{
 const input=baseline();
 for(const key of ['mobileMoneyProviders','purchases','supplierPayableEntries',
  'staffMembers','inventoryCostEvents','syncOutbox','cashPartialReturns'])
  delete input[key];
 const result=normalizeRun8BackupTables(input,1,28);
 assert.equal(result.sales,input.sales);
 assert.deepEqual(result.cashPartialReturns,[]);
});
test('legacy v7 may omit mobile money but v8 cannot',()=>{
 const input=baseline();delete input.mobileMoneyProviders;
 assert.ok(normalizeRun8BackupTables(input,7,28));
 assert.throws(()=>normalizeRun8BackupTables(input,8,28),/Required backup table missing: mobileMoneyProviders/);
});
test('v9 supplier and purchase tables are mandatory',()=>{
 const input=baseline();delete input.purchases;
 assert.ok(normalizeRun8BackupTables(input,8,28));
 assert.throws(()=>normalizeRun8BackupTables(input,9,28),/Required backup table missing: purchases/);
});
test('missing v17 wallet transfers and v18 staff memberships fail closed',()=>{
 const a=baseline();delete a.walletTransfers;
 assert.ok(normalizeRun8BackupTables(a,16,28));
 assert.throws(()=>normalizeRun8BackupTables(a,17,28),/Required backup table missing: walletTransfers/);
 const b=baseline();delete b.staffMembers;
 assert.ok(normalizeRun8BackupTables(b,17,28));
 assert.throws(()=>normalizeRun8BackupTables(b,18,28),/Required backup table missing: staffMembers/);
});
test('v25 commerce and v26 cost/event extension records must exist',()=>{
 for(const [key,version] of [['commerceOrders',25],['inventoryCostEvents',26],
  ['syncDevices',26],['storeLocations',26]]){
  const a=baseline();delete a[key];
  assert.ok(normalizeRun8BackupTables(a,version-1,28));
  assert.throws(()=>normalizeRun8BackupTables(a,version,28),/Required backup table missing/);
 }
});
test('v27 supplier-payable evidence and v28 cash return evidence cannot disappear',()=>{
 const a=baseline();delete a.supplierPayableEntries;
 assert.ok(normalizeRun8BackupTables(a,26,28));
 assert.throws(()=>normalizeRun8BackupTables(a,27,28),/Required backup table missing/);
 const b=baseline();delete b.cashPartialReturns;
 assert.ok(normalizeRun8BackupTables(b,27,28));
 assert.throws(()=>normalizeRun8BackupTables(b,28,28),/Required backup table missing/);
});
test('a missing table present since v1 is never silently invented',()=>{
 const a=baseline();delete a.sales;
 assert.throws(()=>normalizeRun8BackupTables(a,1,28),/Required backup table missing: sales/);
});
test('unknown future backup table fails, never drops unseen records',()=>{
 const a=baseline();a.futureTransactions=[{id:'money-1'}];
 assert.throws(()=>normalizeRun8BackupTables(a,28,28),/unrecognized tables/);
});
test('future schema version fails before trying to normalize',()=>{
 assert.throws(()=>normalizeRun8BackupTables(baseline(),29,28),/newer version/);
});
test('invalid table structure and malformed version cannot be normalized',()=>{
 const a=baseline();a.sales=[null];
 assert.throws(()=>normalizeRun8BackupTables(a,28,28),/Invalid portable backup table/);
 for(const version of [0,-1,1.5,'28',NaN,Infinity])
  assert.throws(()=>normalizeRun8BackupTables(baseline(),version,28),/schema version/);
});
test('normalizer never mutates original records',()=>{
 const a=baseline();delete a.staffMembers;
 const keys=Object.keys(a);
 normalizeRun8BackupTables(a,17,28);
 assert.deepEqual(Object.keys(a),keys);
 assert.equal(Object.hasOwn(a,'staffMembers'),false);
});
