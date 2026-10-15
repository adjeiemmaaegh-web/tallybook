import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPendingAssistantRecovery} from '../run7RecoveryDecision.mjs';
import {parseRestoreJournal,serializeRestoreJournal,
  RESTORE_JOURNAL_KIND,RESTORE_JOURNAL_VERSION} from '../restoreJournal.mjs';

const c='primary';
const empty=()=>({workflows:[],aliases:[],history:[]});
const before=()=>({workflows:[{id:'workflow-A',businessProfileId:c,name:'Before'}],aliases:[],history:[]});
const after=()=>({workflows:[{id:'workflow-A',businessProfileId:c,name:'After'}],aliases:[],history:[]});
const journal=(changes={})=>({
 kind:RESTORE_JOURNAL_KIND,version:RESTORE_JOURNAL_VERSION,
 id:'12345678-1234-4123-8123-123456789012',companyId:c,
 phase:'assistant-preimage-durable',operation:'backup-restore',
 createdAt:'2026-10-16T00:00:00.000Z',before:before(),after:after(),...changes
});
test('crash after marker but before assistant write only clears marker',()=>{
 const result=classifyPendingAssistantRecovery(journal(),before());
 assert.equal(result.action,'remove-marker');
 assert.equal(result.requiresAssistantWrite,false);
 assert.ok(Object.isFrozen(result));
});
test('crash after assistant commit and before retail commit replays preimage',()=>{
 const result=classifyPendingAssistantRecovery(journal(),after());
 assert.equal(result.action,'restore-preimage');
 assert.equal(result.requiresAssistantWrite,true);
});
test('company clear postimage produces correct preimage decision',()=>{
 const j=journal({operation:'company-clear',after:empty()});
 assert.equal(classifyPendingAssistantRecovery(j,empty()).action,'restore-preimage');
 assert.equal(classifyPendingAssistantRecovery(j,before()).action,'remove-marker');
});
test('assistant row reorder is not an unrecognized postimage',()=>{
 const j=journal({before:{workflows:[
   {id:'workflow-A',businessProfileId:c,name:'Before'},
   {id:'workflow-B',businessProfileId:c,name:'Other'}],aliases:[],history:[]}});
 const swapped={workflows:[...j.before.workflows].reverse(),aliases:[],history:[]};
 assert.equal(classifyPendingAssistantRecovery(j,swapped).action,'remove-marker');
});
test('unrelated edit causes fail-closed recovery, no rollback decision',()=>{
 assert.throws(()=>classifyPendingAssistantRecovery(journal(),{
   workflows:[{id:'workflow-A',businessProfileId:c,name:'Unrelated'}],
   aliases:[],history:[]
 }),/Preserve this device/);
});
test('unauthorized third-state row insertion causes fail closed',()=>{
 const wrong=after();wrong.workflows.push({id:'workflow-X',businessProfileId:c,name:'New'});
 assert.throws(()=>classifyPendingAssistantRecovery(journal(),wrong),/ambiguous/);
});
test('legacy journal without postimage clears marker only when before still intact',()=>{
 const j=journal({after:undefined});
 assert.equal(classifyPendingAssistantRecovery(j,before()).action,'remove-marker');
 assert.throws(()=>classifyPendingAssistantRecovery(j,after()),/ambiguous/);
});
test('unknown operation is always rejected',()=>{
 assert.throws(()=>classifyPendingAssistantRecovery(journal({operation:'arbitrary'}),after()),/ambiguous/);
});
test('strict serialized marker survives portable round trip',()=>{
 const j=parseRestoreJournal(serializeRestoreJournal(journal()));
 assert.equal(classifyPendingAssistantRecovery(j,after()).action,'restore-preimage');
});
test('malformed and cross-company assistant marker fails validation',()=>{
 const invalid=journal({after:{
   workflows:[{id:'workflow-A',businessProfileId:'foreign',name:'After'}],
   aliases:[],history:[]}});
 assert.throws(()=>serializeRestoreJournal(invalid),/Invalid/);
});
test('a corrupted or oversized text marker does not become an empty state',()=>{
 assert.throws(()=>parseRestoreJournal('not-json'),/corrupt/);
 assert.throws(()=>parseRestoreJournal('x'.repeat(32*1024*1024+1)),/safe local recovery/);
});
test('repeated recovery decision on unchanged source is deterministic',()=>{
 const j=journal(),current=after();
 const first=classifyPendingAssistantRecovery(j,current);
 const second=classifyPendingAssistantRecovery(j,current);
 assert.deepEqual(first,second);
});
