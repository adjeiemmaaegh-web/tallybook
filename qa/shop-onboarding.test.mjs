// Owner first-run checklist (PRD UX2/UX3): progress comes from data, never from clicks; no false "ready".
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChecklist} from '../client/src/cloud/shopOnboarding.ts';

const empty = {stores: [], products: [], stock: []};

test('a brand-new shop is not ready and points at the store', () => {
  const c = buildChecklist(empty, false);
  assert.equal(c.readyToSell, false);
  assert.equal(c.next.id, 'store');
  assert.equal(c.doneCount, 0);
});

test('archived stores and hidden products do not count', () => {
  const c = buildChecklist({stores: [{id: 's', status: 'archived'}], products: [{id: 'p', active: false}], stock: [{storeId: 's', productId: 'p', quantity: 9}]}, false);
  assert.equal(c.doneCount, 0);
  assert.equal(c.readyToSell, false);
});

test('stock in another store, or zero stock, is not opening stock', () => {
  const base = {stores: [{id: 's', status: 'active'}], products: [{id: 'p', active: true}]};
  assert.equal(buildChecklist({...base, stock: [{storeId: 'other', productId: 'p', quantity: 5}]}, false).steps[2].done, false);
  assert.equal(buildChecklist({...base, stock: [{storeId: 's', productId: 'p', quantity: 0}]}, false).steps[2].done, false);
});

test('ready to sell once store, product and stock exist; complete only after a confirmed sale', () => {
  const o = {stores: [{id: 's', status: 'active'}], products: [{id: 'p', active: true}], stock: [{storeId: 's', productId: 'p', quantity: 3}]};
  const before = buildChecklist(o, false);
  assert.equal(before.readyToSell, true);
  assert.equal(before.complete, false);
  assert.equal(before.next.id, 'sale');
  assert.equal(buildChecklist(o, true).complete, true);
});

test('an unknown sale state is neither done nor complete', () => {
  const o = {stores: [{id: 's', status: 'active'}], products: [{id: 'p', active: true}], stock: [{storeId: 's', productId: 'p', quantity: 3}]};
  const c = buildChecklist(o, null);
  assert.equal(c.complete, false);
  assert.equal(c.steps[3].done, false);
  assert.equal(c.steps[3].unknown, true);
});
