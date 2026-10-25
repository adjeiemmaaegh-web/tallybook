import {describe,it,expect} from 'vitest';
import {assertSnapshotHealthy,saleTotal} from '../src/contracts.js';
import {failureReport} from '../src/scenarios.js';
describe('QA framework contract',()=>{
 it('computes minor-unit totals exactly',()=>expect(saleTotal([{quantity:3,unitPriceMinor:199n}])).toBe(597n));
 it('rejects invalid quantity',()=>expect(()=>saleTotal([{quantity:0,unitPriceMinor:10n}])).toThrow('INVALID_LINE'));
 it('detects duplicate IDs and dangling references',()=>expect(assertSnapshotHealthy({companyId:'a',salesTotal:100n,refundsTotal:0n,inventory:{x:2},recordIds:['x','x'],brokenReferences:['missing'],invalidFinancialValues:[]})).toEqual(['DUPLICATE_IDS','BROKEN_REFERENCES']));
 it('detects bad financials and stock',()=>expect(assertSnapshotHealthy({companyId:'a',salesTotal:10n,refundsTotal:20n,inventory:{x:-1},recordIds:[],brokenReferences:[],invalidFinancialValues:['NaN']})).toEqual(['FINANCIAL_TOTALS','INVALID_FINANCIAL_VALUES','INVALID_STOCK:x']));
 it('reports failures in machine-readable JSON',()=>expect(JSON.parse(failureReport([{name:'x',passed:false,detail:'bad',elapsedMs:2}])).failed).toBe(1));
});
