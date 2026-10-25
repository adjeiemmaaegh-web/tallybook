const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SecurityValidator } = require('../dist/security.js');
const now = 100000;
const principal = { id: 's1', companyId: 'c1', roles: ['cashier'], sessionId: 'x1' };
const base = { principal, companyId: 'c1', operation: 'sale.create', sessionId: 'x1' };
function setup(overrides = {}, options = {}) {
 const db = { companyExists: async () => true, staffBelongsToCompany: async () => true, getSession: async () => ({id:'x1',principalId:'s1',companyId:'c1',issuedAt:90000,expiresAt:110000}), ...overrides.db };
 const auth = { isRoleValid: async () => true, hasPermission: async () => true, canPerformFinancialOperation: async () => true, ...overrides.auth };
 return new SecurityValidator(db, auth, {now: () => now, ...options});
}
test('authorized operation is allowed and audited', async () => { const v=setup(); const r=await v.validate(base); assert.equal(r.decision,'allow'); assert.equal(v.getAuditReport()[0].decision,'allow'); });
test('cross-company principal denied', async () => { const r=await setup().validate({...base,companyId:'c2'}); assert.equal(r.decision,'deny'); assert.ok(r.findings.some(x=>x.code==='COMPANY_ISOLATION')); });
test('cross-company resource denied', async () => { const r=await setup().validate({...base,resourceCompanyId:'c2'}); assert.ok(r.findings.some(x=>x.code==='RESOURCE_ISOLATION')); });
test('staff membership denial', async () => { const r=await setup({db:{staffBelongsToCompany:async()=>false}}).validate(base); assert.ok(r.findings.some(x=>x.code==='STAFF_ISOLATION')); });
test('invalid role denied', async () => { const r=await setup({auth:{isRoleValid:async()=>false}}).validate(base); assert.ok(r.findings.some(x=>x.code==='ROLE_INVALID')); });
test('permission denial', async () => { const r=await setup({auth:{hasPermission:async()=>false}}).validate(base); assert.ok(r.findings.some(x=>x.code==='PERMISSION_DENIED')); });
test('financial operation requires explicit adapter approval', async () => { const r=await setup({auth:{canPerformFinancialOperation:undefined}}).validate({...base,financial:true,amount:100}); assert.ok(r.findings.some(x=>x.code==='FINANCIAL_DENIED')); });
test('unsafe financial value denied', async () => { const r=await setup().validate({...base,financial:true,amount:1.2}); assert.ok(r.findings.some(x=>x.code==='INVALID_FINANCIAL_AMOUNT')); });
test('expired session denied', async () => { const r=await setup({db:{getSession:async()=>({...{id:'x1',principalId:'s1',companyId:'c1',issuedAt:1,expiresAt:2}})}}).validate(base); assert.ok(r.findings.some(x=>x.code==='SESSION_INVALID')); });
test('adapter failure fails closed', async () => { const r=await setup({db:{companyExists:async()=>{throw Error('offline');}}}).validate(base); assert.ok(r.findings.some(x=>x.code==='ADAPTER_FAILURE')); });
test('repeated denials trigger suspicious attempt finding', async () => { const v=setup({auth:{hasPermission:async()=>false}},{maxFailedAttempts:2}); await v.validate(base); await v.validate(base); const r=await v.validate(base); assert.equal(r.suspicious,true); assert.ok(r.findings.some(x=>x.code==='SUSPICIOUS_ATTEMPTS')); });
test('audit snapshots cannot mutate internal report', async () => { const v=setup(); const r=await v.validate(base); r.audit.operation='tampered'; assert.equal(v.getAuditReport()[0].operation,'sale.create'); });
test('does not mutate adapter-backed data', async () => { let writes=0; const v=setup({db:{write:async()=>{writes++;}}}); await v.validate(base); assert.equal(writes,0); });
test('missing session denied by default', async () => { const r=await setup().validate({...base,sessionId:undefined,principal:{...principal,sessionId:undefined}}); assert.ok(r.findings.some(x=>x.code==='SESSION_INVALID')); });
