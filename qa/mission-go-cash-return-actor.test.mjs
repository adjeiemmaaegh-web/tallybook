import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCashReturnActorUnchanged } from '../client/src/features/sales/cashReturnActorGuard.mjs';

test('same refund staff and shift remain valid despite new object instances', () => {
  assert.doesNotThrow(() => assertCashReturnActorUnchanged(
    { id: 'owner' }, { id: 'shift-1' }, { id: 'owner' }, { id: 'shift-1' }));
});
test('changes in staff identity fail closed', () => {
  assert.throws(() => assertCashReturnActorUnchanged(
    { id: 'owner' }, { id: 'shift-1' }, { id: 'cashier' }, { id: 'shift-1' }), /staff or shift changed/);
});
test('a shift replacement for the same staff fails closed', () => {
  assert.throws(() => assertCashReturnActorUnchanged(
    { id: 'owner' }, { id: 'shift-1' }, { id: 'owner' }, { id: 'shift-2' }), /staff or shift changed/);
});
test('a closed shift fails closed', () => {
  assert.throws(() => assertCashReturnActorUnchanged(
    { id: 'owner' }, { id: 'shift-1' }, { id: 'owner' }, null), /staff or shift changed/);
});
test('opening a shift after entering unstaffed refund rejects ambiguous attribution', () => {
  assert.throws(() => assertCashReturnActorUnchanged(null, null, { id: 'owner' }, { id: 'shift-1' }), /staff or shift changed/);
});
test('legitimately unstaffed mode stays consistent', () => {
  assert.doesNotThrow(() => assertCashReturnActorUnchanged(null, null, undefined, undefined));
});
