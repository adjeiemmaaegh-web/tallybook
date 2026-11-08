import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseRetry} from '../client/src/cloud/purchaseRetry.ts';

test('supplier retry survives a lost response and separates accounts, companies and amounts', async () => {
  const values = new Map();
  const storage = {getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k)};
  const start = (user='owner', company='shop', amount=4500) =>
    purchaseRetry(user,company,'settlement',{supplier:'private name',amount},storage);
  const first = await start();
  assert.equal((await start()).id, first.id);
  for (const other of [await start('different'),await start('owner','another'),await start('owner','shop',4600)])
    assert.notEqual(other.id,first.id);
  assert.doesNotMatch(JSON.stringify([...values]), /private name|4500|settlement/);
  first.confirm();
  const next = await start();
  assert.notEqual(next.id,first.id);
  first.confirm();
  assert.equal((await start()).id,next.id);
});

test('storage failure stops the caller before a financial request is sent', async () => {
  await assert.rejects(purchaseRetry('owner','shop','receipt',{},{
    getItem:()=>null,setItem:()=>{throw Error('storage unavailable');}
  }),/storage unavailable/);
});
