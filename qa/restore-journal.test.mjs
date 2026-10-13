import test from 'node:test';
import assert from 'node:assert/strict';
import { RESTORE_JOURNAL_KEY, RESTORE_JOURNAL_KIND, RESTORE_JOURNAL_VERSION, RESTORE_JOURNAL_MAX_BYTES, serializeRestoreJournal, parseRestoreJournal, assistantSnapshotsEqual } from '../client/src/features/backup/restoreJournal.mjs';
const company = 'primary';
const journal = (before = {workflows: [], aliases: [], history: []}) => ({
  kind: RESTORE_JOURNAL_KIND, version: RESTORE_JOURNAL_VERSION, phase: 'assistant-preimage-durable', id: 'restore-test-001',
  companyId: company, createdAt: '2026-10-11T00:00:00.000Z', before,
});
const workflow = (id='wf-1', businessProfileId=company) => ({id, businessProfileId, name:'Valid',description:'',commands:[],createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'});

test('the recovery marker has a fixed key and roundtrips all three assistant tables', () => {
  assert.equal(RESTORE_JOURNAL_KEY, 'restoreRecoveryJournal');
  assert.deepEqual(parseRestoreJournal(serializeRestoreJournal(journal({workflows:[workflow()],aliases:[],history:[]}))),journal({workflows:[workflow()],aliases:[],history:[]}));
});
test('refuses missing and malformed journal shape, version, date and identity', () => {
  for (const input of [null,{}, {...journal(),kind:'impostor'}, {...journal(),version:2}, {...journal(),phase:'ledger-committed'}, {...journal(),id:''}, {...journal(),companyId:''}, {...journal(),createdAt:'not a date'}, {...journal(),before:null}, {...journal(),before:{workflows:[]}}]) {
    assert.throws(() => serializeRestoreJournal(input), /journal/i);
  }
});
test('never applies a preimage with duplicate IDs or a row from another company', () => {
  for (const rows of [[workflow(),workflow()], [workflow('x','foreign')], [{id:'',businessProfileId:company}], [null]]) {
    assert.throws(() => serializeRestoreJournal(journal({workflows:rows,aliases:[],history:[]})), /journal/i);
  }
});
test('rejects malformed raw values and never guesses a partial truncated preimage', () => {
  for (const value of ['', '{}', '{broken', 7, null, ' '.repeat(RESTORE_JOURNAL_MAX_BYTES+1)]) {
    assert.throws(() => parseRestoreJournal(value), /journal/i);
  }
});
test('enforces the persistent preimage resource limit before any assistant database mutation', () => {
  const oversized = journal({workflows: [workflow('x')], aliases:[], history: []});
  oversized.before.workflows[0].name = 'a'.repeat(RESTORE_JOURNAL_MAX_BYTES);
  assert.throws(() => serializeRestoreJournal(oversized), /limit/i);
});


test('company-clear preimage retains the same durable commit-marker format', () => {
  const clear = {...journal({workflows:[workflow('clear-wf')], aliases:[], history:[]}), operation:'company-clear'};
  assert.deepEqual(parseRestoreJournal(serializeRestoreJournal(clear)), clear);
});
test('older restore journals without operation remain recoverable', () => {
  const legacy = journal({workflows:[workflow('old-wf')], aliases:[], history:[]});
  assert.equal(parseRestoreJournal(serializeRestoreJournal(legacy)).operation, undefined);
  assert.equal(parseRestoreJournal(serializeRestoreJournal({...legacy,operation:'backup-restore'})).operation,'backup-restore');
});
test('unknown or malformed operations fail closed rather than triggering a deletion recovery', () => {
  for (const operation of ['delete-all', 'company-clear-done', '', 1, null, {}, []]) {
    assert.throws(() => serializeRestoreJournal({...journal(),operation}), /journal/i);
  }
});
test('company-clear journals reject foreign, duplicate and oversized assistant snapshots', () => {
  const clear = {...journal(),operation:'company-clear'};
  assert.throws(() => serializeRestoreJournal({...clear, before:{workflows:[workflow('a','other')],aliases:[],history:[]}}),/journal/i);
  assert.throws(() => serializeRestoreJournal({...clear, before:{workflows:[workflow(),workflow()],aliases:[],history:[]}}),/journal/i);
  assert.throws(() => serializeRestoreJournal({...clear, before:{workflows:[{...workflow(),name:'x'.repeat(RESTORE_JOURNAL_MAX_BYTES)}],aliases:[],history:[]}}),/limit/i);
});

test('new recovery marker persists both the exact before and authorized after state', () => {
  const before = {workflows:[workflow('initial')],aliases:[],history:[]};
  const after = {workflows:[workflow('replacement')],aliases:[],history:[]};
  const marker = {...journal(before),operation:'backup-restore',after};
  assert.deepEqual(parseRestoreJournal(serializeRestoreJournal(marker)),marker);
});
test('postimages must be owned and cannot contain duplicate assistant identities', () => {
  const marker = {...journal(),operation:'company-clear',after:{workflows:[],aliases:[],history:[]}};
  assert.throws(() => serializeRestoreJournal({...marker,after:{workflows:[workflow('foreign','other')],aliases:[],history:[]}}),/journal/i);
  assert.throws(() => serializeRestoreJournal({...marker,after:{workflows:[workflow(),workflow()],aliases:[],history:[]}}),/journal/i);
  assert.throws(() => serializeRestoreJournal({...marker,after:null}),/journal/i);
});
test('preimage plus postimage jointly respect the journal byte bound', () => {
  const marker = {...journal(), after:{workflows:[{...workflow(),name:'x'.repeat(RESTORE_JOURNAL_MAX_BYTES)}],aliases:[],history:[]}};
  assert.throws(() => serializeRestoreJournal(marker),/limit/i);
});
test('assistant snapshot comparison ignores row/key ordering, but not values', async () => {
  const {assistantSnapshotsEqual} = await import('../client/src/features/backup/restoreJournal.mjs');
  const first = {workflows:[workflow('a'),workflow('b')],aliases:[],history:[]};
  const same = {history:[],workflows:[{...workflow('b'),name:'Valid'}, {...workflow('a')}],aliases:[]};
  assert.equal(assistantSnapshotsEqual(first,same),true);
  same.workflows[0].description = 'newer edit';
  assert.equal(assistantSnapshotsEqual(first,same),false);
  same.workflows[0].description = '';
  same.workflows.push(workflow('c'));
  assert.equal(assistantSnapshotsEqual(first,same),false);
  assert.equal(assistantSnapshotsEqual(first,{}),false);
});
test('legacy marker without after still parses, without assuming an authorized postimage', () => {
  const legacy = parseRestoreJournal(serializeRestoreJournal(journal({workflows:[workflow()],aliases:[],history:[]})));
  assert.equal(Object.hasOwn(legacy,'after'),false);
});

test('snapshot comparison fails closed on unsupported structured-clone field types', async () => {
  const {assistantSnapshotsEqual} = await import('../client/src/features/backup/restoreJournal.mjs');
  const a={workflows:[{...workflow(), extra: new Date('2026-10-11T00:00:00Z')}],aliases:[],history:[]};
  const b={workflows:[{...workflow(), extra: new Date('2026-10-12T00:00:00Z')}],aliases:[],history:[]};
  assert.throws(() => assistantSnapshotsEqual(a,b),/unsupported record fields/i);
  assert.throws(() => assistantSnapshotsEqual({workflows:[{...workflow(), extra: undefined}],aliases:[],history:[]},
    {workflows:[workflow()],aliases:[],history:[]}), /non-JSON/i);
});

// Multi-byte text exposes a resource-limit bypass if the implementation
// accidentally compares UTF-16 .length instead of UTF-8 storage bytes.
test('recovery journal byte cap rejects oversized multi-byte input before parsing', () => {
  const nonAscii = '🚀'.repeat(9_000_000); // 18M JS code units, 36M UTF-8 bytes.
  assert.ok(nonAscii.length < RESTORE_JOURNAL_MAX_BYTES);
  assert.ok(new TextEncoder().encode(nonAscii).byteLength > RESTORE_JOURNAL_MAX_BYTES);
  assert.throws(() => parseRestoreJournal(nonAscii), /safe local recovery limit/i);
});

test('recovery journal byte cap rejects oversized valid JSON assistant text on export', () => {
  const hugeText = '🚀'.repeat(9_000_000);
  const candidate = journal({workflows: [{...workflow(), description: hugeText}], aliases:[], history:[]});
  assert.ok(JSON.stringify(candidate).length < RESTORE_JOURNAL_MAX_BYTES);
  assert.throws(() => serializeRestoreJournal(candidate), /safe local restore limit/i);
});

test('company clear accepts only an empty authorized assistant postimage', () => {
  const empty = {workflows:[], aliases:[], history:[]};
  const marker = {...journal({workflows:[workflow()],aliases:[],history:[]}), operation:'company-clear',after:empty};
  assert.deepEqual(parseRestoreJournal(serializeRestoreJournal(marker)), marker);
  for (const table of ['workflows','aliases','history']) {
    const postimage = {...empty, [table]: [table === 'workflows' ? workflow('replacement') : {
      id:'replacement',businessProfileId:company
    }]};
    assert.throws(() => serializeRestoreJournal({...marker,after:postimage}), /company-clear journal postimage/i);
    assert.throws(() => parseRestoreJournal(JSON.stringify({...marker,after:postimage})), /company-clear journal postimage/i);
  }
});


test('recovery refuses nonportable structured-clone values before persisting a journal', () => {
  const invalid = [
    {extra: new Date('2026-10-11T00:00:00Z')},
    {extra: new Map([['x', 1]])},
    {extra: new Set(['x'])},
    {extra: new Uint8Array([1,2])},
    {extra: undefined},
    {extra: NaN},
    {extra: Infinity},
    {extra: 4n},
    {extra: () => 1},
    {extra: Symbol('not-serializable')},
  ];
  for (const fields of invalid) {
    const before = {workflows: [{...workflow(), ...fields}], aliases:[], history:[]};
    assert.throws(() => serializeRestoreJournal(journal(before)), /snapshot|record|non-JSON/i);
  }
});

test('recovery refuses cyclic, dangerously keyed and excessively nested evidence', () => {
  const cycle = {...workflow()}; cycle.extra = cycle;
  assert.throws(() => serializeRestoreJournal(journal({workflows:[cycle],aliases:[],history:[]})), /cyclic/i);
  const poisoned = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(() => parseRestoreJournal(JSON.stringify(journal({workflows:[{...workflow(),extra:poisoned}],aliases:[],history:[]}))), /unsafe record key/i);
  let deep = 'leaf'; for (let i=0;i<36;i++) deep={inside:deep};
  assert.throws(() => serializeRestoreJournal(journal({workflows:[{...workflow(),extra:deep}],aliases:[],history:[]})), /deeply nested/i);
});

test('recovery compares JSON snapshots exactly even when one side gains unsupported data', () => {
  const a = {workflows:[workflow()],aliases:[],history:[]};
  const b = {workflows:[{...workflow(),extra:undefined}],aliases:[],history:[]};
  assert.throws(() => serializeRestoreJournal(journal(b)), /non-JSON/i);
  assert.throws(() => assistantSnapshotsEqual(a,b), /non-JSON/i);
  const sparse=[];sparse.length=2;sparse[0]='first';
  assert.throws(() => serializeRestoreJournal(journal({workflows:[{...workflow(),commands:sparse}],aliases:[],history:[]})), /non-JSON/i);
  assert.equal(assistantSnapshotsEqual(a,{workflows:[{...workflow(),name:'changed'}],aliases:[],history:[]}),false);
});


test('recovery rejects hidden, symbol and accessor fields that JSON would discard', () => {
  const examples = [];
  const hidden = {...workflow()}; Object.defineProperty(hidden, 'hidden', {value:'important', enumerable:false}); examples.push(hidden);
  const symbolic = {...workflow(), [Symbol('private')]:'value'}; examples.push(symbolic);
  const getter = {...workflow()}; Object.defineProperty(getter,'danger',{enumerable:true,get(){return 'value';}}); examples.push(getter);
  for (const row of examples) {
    assert.throws(() => serializeRestoreJournal(journal({workflows:[row],aliases:[],history:[]})), /nonportable record fields/i);
  }
  assert.throws(() => serializeRestoreJournal(journal({workflows:[workflow()],aliases:[],history:[],payments:[]})), /snapshot table/i);
});
