import { test } from 'node:test';
import assert from 'node:assert/strict';

export function assertScopedAccess(actor: {companyId:string; permissions:string[]; active:boolean}, record: {companyId:string}, permission:string) {
  if (!actor.active || !actor.companyId || !record.companyId || actor.companyId !== record.companyId) throw new Error('Company or session denied');
  if (!Array.isArray(actor.permissions) || !actor.permissions.includes(permission)) throw new Error('Permission denied');
  return true;
}

test('same-company authorized access', () => assert.equal(assertScopedAccess({companyId:'A',permissions:['sell'],active:true},{companyId:'A'},'sell'),true));
test('cross-company denied', () => assert.throws(() => assertScopedAccess({companyId:'A',permissions:['sell'],active:true},{companyId:'B'},'sell'),/denied/));
test('disabled session denied', () => assert.throws(() => assertScopedAccess({companyId:'A',permissions:['sell'],active:false},{companyId:'A'},'sell'),/denied/));
test('missing permission denied', () => assert.throws(() => assertScopedAccess({companyId:'A',permissions:['sell'],active:true},{companyId:'A'},'refund'),/denied/));
