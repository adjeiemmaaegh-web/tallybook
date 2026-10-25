import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMigrationChain} from './databaseMigrationValidator.ts';
import {validateBackupManifest} from './backupRestoreValidator.ts';
import {planCrashRecovery} from './crashRecoveryManager.ts';
import {reconcileSyncQueue} from './offlineSyncReconciliation.ts';
import {summarizeFinancialEvents} from './financialReportsIntegration.ts';
import {validateWorkflowTransitions} from './businessWorkflowIntegration.ts';
const h='a'.repeat(64),b='b'.repeat(64);
test('migration chain intact',()=>assert.deepEqual(validateMigrationChain(1,3,[{from:1,to:2,id:'a'},{from:2,to:3,id:'b'}]),[]));
test('migration missing step',()=>assert.equal(validateMigrationChain(1,3,[{from:1,to:2,id:'a'}])[0].code,'MISSING_MIGRATION'));
test('backup exact digest',()=>assert.deepEqual(validateBackupManifest([{path:'a',bytes:2,sha256:h}],[{path:'a',bytes:2,sha256:h}]),[]));
test('backup tamper',()=>assert.ok(validateBackupManifest([{path:'a',bytes:2,sha256:h}],[{path:'a',bytes:2,sha256:b}]).some(x=>x.code==='MISMATCH')));
test('backup traversal',()=>assert.ok(validateBackupManifest([],[{path:'../evil',bytes:1,sha256:h}]).some(x=>x.code==='UNSAFE_PATH')));
test('recovery rollback',()=>assert.equal(planCrashRecovery({phase:'applying',backupVerified:true,originalAvailable:true,restoreVerified:false}).action,'rollback'));
test('recovery unknown no destructive action',()=>assert.equal(planCrashRecovery({phase:'applying',backupVerified:false,originalAvailable:false,restoreVerified:false}).action,'investigate'));
test('sync accepted receipt',()=>assert.deepEqual(reconcileSyncQueue([{companyId:'c',operationId:'o',sequence:1,status:'acked',payloadHash:h,ackHash:h}]),[]));
test('sync mismatch',()=>assert.ok(reconcileSyncQueue([{companyId:'c',operationId:'o',sequence:1,status:'acked',payloadHash:h,ackHash:b}]).some(x=>x.code==='ACK_MISMATCH')));
test('sync duplicate',()=>assert.ok(reconcileSyncQueue([{companyId:'c',operationId:'o',sequence:1,status:'pending',payloadHash:h},{companyId:'c',operationId:'o',sequence:1,status:'pending',payloadHash:h}]).some(x=>x.code==='DUPLICATE_OPERATION')));
test('financial report keeps currency boundaries',()=>assert.equal(summarizeFinancialEvents([{companyId:'c',currency:'GHS',id:'a',kind:'sale',amountMinor:500},{companyId:'c',currency:'USD',id:'b',kind:'refund',amountMinor:100}]).length,2));
test('financial report rejects duplicate',()=>assert.throws(()=>summarizeFinancialEvents([{companyId:'c',currency:'GHS',id:'a',kind:'sale',amountMinor:500},{companyId:'c',currency:'GHS',id:'a',kind:'sale',amountMinor:500}])));
test('workflow valid',()=>assert.deepEqual(validateWorkflowTransitions([{companyId:'c',recordId:'r',kind:'sale',from:'approved',to:'posted',authorized:true}]),[]));
test('workflow rejects unauthorized jump',()=>assert.deepEqual(validateWorkflowTransitions([{companyId:'c',recordId:'r',kind:'return',from:'draft',to:'posted',authorized:false}]).map(x=>x.code),['UNAUTHORIZED','INVALID_TRANSITION']));

test('unsafe expected backup paths fail closed',()=>{
 const h='a'.repeat(64);
 assert.ok(validateBackupManifest([{path:'../secret',sha256:h,bytes:1}],[{path:'../secret',sha256:h,bytes:1}]).some(x=>x.code==='UNSAFE_PATH'));
});
test('duplicate normalization hazards fail manifest validation',()=>{
 const h='a'.repeat(64);
 assert.ok(validateBackupManifest([{path:'data//sales.json',sha256:h,bytes:1}],[{path:'data//sales.json',sha256:h,bytes:1}]).some(x=>x.code==='UNSAFE_PATH'));
});
