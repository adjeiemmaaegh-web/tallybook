import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSales} from './batch1/financialReconciliation.ts';
import {reviewCustomerCredit} from './batch1/customerCreditLedger.ts';
import {reviewRefundEvidence} from './batch1/refundSettlement.ts';
import {reviewWallet} from './batch1/walletReconciliation.ts';
import {auditStaffAuthorization} from './batch2/staffAuthorizationAudit.ts';
import {validateBackupManifest} from './batch3/backupRestoreValidator.ts';
import {prepareDrawerEvent} from './batch4/staffTransactionAndDrawerEvents.ts';
import {exportWatchdogCsv} from './batch4/watchdogCsvExport.ts';

test('financial sale and repayment summaries conserve receivables',()=>{
 const sale={id:'sale',businessProfileId:'co',customerId:'cust',currency:'GHS',totalMinor:500,amountPaidMinor:300,outstandingMinor:200};
 assert.deepEqual(reconcileSales([sale]),[]);
 const credit=reviewCustomerCredit([sale],[{id:'pay',businessProfileId:'co',customerId:'cust',currency:'GHS',amountMinor:100,saleAllocations:[{saleId:'sale',amountMinor:100}]}],'co','cust');
 assert.equal(credit.balanceMinor,100);
});
test('refund evidence never implies money was paid unless confirmed',()=>{
 const ref={id:'ref',companyId:'co',originalSaleId:'sale',currency:'GHS',amountMinor:100,method:'cash',reference:'manual-proof',confirmedByStaffId:'staff',confirmedAt:'2026-10-24T11:00:00Z',submissionKey:'key',status:'proposed'};
 assert.equal(reviewRefundEvidence([ref],'co','sale',100).confirmedMinor,0);
 assert.equal(reviewRefundEvidence([{...ref,status:'confirmed'}],'co','sale',100).confirmedMinor,100);
});
test('drawer provenance survives Watchdog CSV serialization',()=>{
 const event=prepareDrawerEvent({businessProfileId:'co',storeId:'shop',staffId:'staff',shiftId:'shift',authenticatedPin:true},{id:'evt',submissionKey:'key',kind:'no_sale',reason:'manual inspection',occurredAt:'2026-10-24T12:00:00Z'});
 const csv=exportWatchdogCsv([{eventId:event.id,businessProfileId:event.businessProfileId,storeId:event.storeId,staffId:event.staffId,shiftId:event.shiftId,timestamp:event.occurredAt,eventType:event.kind,reason:event.reason}],'co');
 assert.match(csv, /evt,co,shop,staff,shift/);
});
test('same-instant wallet review and staff permission preflight are independent',()=>{
 const postings=[{id:'one',businessProfileId:'co',customerId:'cust',kind:'deposit',amountMinor:100,createdAt:'2026-01-01T01:00:00+01:00',submissionKey:'one'}, {id:'two',businessProfileId:'co',customerId:'cust',kind:'spend',amountMinor:80,createdAt:'2026-01-01T00:00:00Z',submissionKey:'two'}];
 assert.equal(reviewWallet(postings,'co','cust').balanceMinor,20);
 assert.equal(auditStaffAuthorization({companyId:'co',recordCompanyId:'co',staffId:'staff',activeStaffId:'staff',role:'cashier',permission:'refund',grantedPermissions:['refund'],shiftOpen:true,sessionExpiresAt:200,now:100,disabled:false}).allowed,false);
});
test('restore manifest checks expected and actual entries',()=>{
 const digest='a'.repeat(64);assert.deepEqual(validateBackupManifest([{path:'backup.json',sha256:digest,bytes:10}],[{path:'backup.json',sha256:digest,bytes:10}]),[]);
 assert.ok(validateBackupManifest([{path:'../backup.json',sha256:digest,bytes:10}],[{path:'../backup.json',sha256:digest,bytes:10}]).some(x=>x.code==='UNSAFE_PATH'));
});
