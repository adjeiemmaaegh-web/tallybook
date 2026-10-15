/** Static drift detection for Run 6 local-data entrypoint guards.
 * Static checks are not a substitute for IndexedDB/browser negative tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=(name)=>readFileSync(new URL('../../client/src/features/'+name,import.meta.url),'utf8');
function body(text,fn){
 const pattern=new RegExp('export async function '+fn+'\\(');
 const match=pattern.exec(text);
 assert.ok(match,'Missing entrypoint '+fn);
 const following=text.slice(match.index+match[0].length);
 const boundary=following.search(/\nexport (?:async )?function /);
 return boundary<0?following:following.slice(0,boundary);
}
const audited=[
 ['sales/sales.ts','getSaleSnapshot','sell'],
 ['sales/sales.ts','getCustomerSaleSummary','sell'],
 ['inventory/inventory.ts','getInventorySnapshot','sell'],
 ['customers/customers.ts','getCustomerSnapshot','sell'],
 ['purchases/purchases.ts','getPurchasesSnapshot','inventory'],
 ['expenses/expenses.ts','listExpenses','reports']
];
test('each sensitive read entrypoint requires a fresh staff permission check',()=>{
 for(const[file,fn,permission]of audited){
  const chunk=body(source(file),fn);
  assert.match(chunk,new RegExp('requirePermission\\("'+permission+'"'));
  assert.match(chunk,/database\.staffMembers/);
 }
});
test('all four financial report entrypoints revalidate staff permission before output',()=>{
 const data=source('reports/reports.ts');
 for(const fn of ['getReportsSnapshot','getDashboardSummary',
   'getBusinessHealthSummary','getEndOfDaySummary']){
  const chunk=body(data,fn);
  assert.match(chunk,/requirePermission\("reports"/);
  assert.match(chunk,/assertCompanyScope\(company/);
 }
});
test('staff sessions bind to credential state and do not persist unlock proof',()=>{
 const data=source('staff/staff.ts');
 assert.match(data,/sessionCredentials\.set\(company,staffCredentialBinding\(latest\)\)/);
 assert.match(data,/assertStaffAuthority\(/);
 assert.match(data,/sessionGenerations/);
 assert.doesNotMatch(data,/sessionStorage\.setItem/);
});
test('supervisor approval is issued with an audit, a live shift, and generation',()=>{
 const data=source('staff/staff.ts');
 const approval=body(data,'approveCheckoutDiscount');
 assert.match(approval,/assertSupervisorApprovalFresh/);
 assert.match(approval,/assertStaffShift/);
 assert.match(approval,/discount\.supervisor\.approved/);
 assert.match(approval,/cashierGeneration/);
});
test('shift completion checks authorization before and after commit preparations',()=>{
 const data=source('staff/staff.ts');
 const shift=body(data,'closeShift');
 assert.match(shift,/assertStaffShift/);
 assert.match(shift,/Staff session changed before shift close committed/);
});

test('high-risk local mutation entrypoints still enforce their required staff role',()=>{
 const writes=[
  ['sales/sales.ts','completeSaleWhileLocked','sell'],
  ['inventory/inventory.ts','adjustStock','inventory'],
  ['purchases/purchases.ts','completePurchase','inventory'],
  ['expenses/expenses.ts','createExpense','inventory'],
  ['staff/staff.ts','changeStaffRole','staff'],
  ['staff/staff.ts','resetStaffPin','staff']
 ];
 for(const[file,fn,permission]of writes){
  const contents=source(file);
  const pattern=new RegExp('(?:async )?function '+fn+'\\(');
  const found=pattern.exec(contents);
  assert.ok(found,'Missing high-risk write '+fn);
  const remaining=contents.slice(found.index);
  const next=remaining.slice(0,Math.min(8500,remaining.length));
  assert.match(next,new RegExp('requirePermission\\(["\\x27]'+permission+'["\\x27]'));
 }
});
test('sale checkout awaits fresh database supervisor approval in posting transaction',()=>{
 const sale=source('sales/sales.ts');
 assert.match(sale,/await consumeCheckoutDiscountApproval\(/);
 assert.match(sale,/database\.staffMembers/);
 assert.match(sale,/database\.staffShifts/);
 const staff=source('staff/staff.ts');
 const consumption=body(staff,'consumeCheckoutDiscountApproval');
 assert.match(consumption,/staffCredentialBinding\(latest\)/);
 assert.match(consumption,/assertStaffShift/);
});
