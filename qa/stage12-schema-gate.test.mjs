import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const database = readFileSync(new URL('../client/src/db/TallybookDB.ts', import.meta.url), 'utf8');
const declared = Number(database.match(/export const DATABASE_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1]);
const migrations = [...database.matchAll(/this\.version\((\d+)\)/g)].map(match => Number(match[1]));
test('declared schema version equals latest Dexie migration', () => {
  assert.ok(Number.isSafeInteger(declared));
  assert.equal(declared, Math.max(...migrations));
});
test('Dexie migration versions have no duplicate or missing numbers', () => {
  assert.ok(migrations.length > 0);
  const actual = [...migrations].sort((a,b)=>a-b);
  assert.deepEqual(actual, Array.from({length: declared}, (_,i)=>i+1));
});
test('regression tests cannot pin the obsolete version 21', () => {
  for (const file of ['../client/src/features/purchases/purchases.test.ts','../client/src/db/TallybookDB.test.ts']) {
    const text = readFileSync(new URL(file, import.meta.url),'utf8');
    assert.doesNotMatch(text, /schemaVersion\)\.toBe\(21\)|DATABASE_SCHEMA_VERSION\)\.toBe\(21\)/);
  }
});
