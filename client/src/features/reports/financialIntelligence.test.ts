import {describe,it,expect} from "vitest";
import {financialRange,summarizeFinancials,financialCsv} from "./financialIntelligence";
import type { FinancialInputs } from "./financialIntelligence";
const at=(day:string)=>`${day}T12:00:00`;
const base:FinancialInputs={sales:[],payments:[],repayments:[],expenses:[],reversals:[]};
describe("Stage 3 management reporting",()=>{
 it("uses an exclusive next-day boundary for custom dates",()=>{const range=financialRange("custom",new Date("2026-10-09T12:00:00"),"2026-10-01","2026-10-09");expect(range.end>new Date(at("2026-10-09"))).toBe(true);});
 it("rejects impossible custom dates and backwards windows",()=>{expect(()=>financialRange("custom",new Date(),"2026-02-30","2026-03-01")).toThrow();expect(()=>financialRange("custom",new Date(),"2026-10-10","2026-10-09")).toThrow();});
 it("keeps credit sales separate from received cash and calculates current debt",()=>{const sale={id:"s1",customerId:"c1",createdAt:at("2026-10-09"),totalMinor:10000,outstandingMinor:7000} as FinancialInputs["sales"][number];const payment={saleId:"s1",createdAt:at("2026-10-09"),amountMinor:3000} as FinancialInputs["payments"][number];const repayment={createdAt:at("2026-10-09"),amountMinor:2000} as FinancialInputs["repayments"][number];const s=summarizeFinancials({...base,sales:[sale],payments:[payment],repayments:[repayment]},financialRange("custom",new Date(),"2026-10-09","2026-10-09"));expect(s.revenueMinor).toBe(10000);expect(s.collectionsMinor).toBe(5000);expect(s.currentReceivablesMinor).toBe(5000);});
 it("separates expense timing from creation time",()=>{const expense={expenseDate:"2026-10-08",createdAt:at("2026-10-09"),amountMinor:4000,category:"rent"} as FinancialInputs["expenses"][number];const s=summarizeFinancials({...base,expenses:[expense]},financialRange("custom",new Date(),"2026-10-08","2026-10-08"));expect(s.expensesMinor).toBe(4000);});
 it("rejects over-repayment instead of disguising negative receivables as zero",()=>{const sale={id:"s1",customerId:"c1",createdAt:at("2026-10-09"),totalMinor:1000,outstandingMinor:500} as FinancialInputs["sales"][number];const repayment={createdAt:at("2026-10-09"),amountMinor:600} as FinancialInputs["repayments"][number];expect(()=>summarizeFinancials({...base,sales:[sale],repayments:[repayment]},financialRange("today",new Date("2026-10-09T12:00:00")))).toThrow(/do not reconcile/);});
 it("rejects negative and unsafe monetary inputs",()=>{const bad={saleId:"s1",createdAt:at("2026-10-09"),amountMinor:-1} as FinancialInputs["payments"][number];expect(()=>summarizeFinancials({...base,sales:[{id:"s1",createdAt:at("2026-10-09"),totalMinor:0,outstandingMinor:0} as FinancialInputs["sales"][number]],payments:[bad]},financialRange("today",new Date("2026-10-09T12:00:00")))).toThrow(/invalid monetary/);const huge={saleId:"s1",createdAt:at("2026-10-09"),amountMinor:Number.MAX_SAFE_INTEGER+1} as FinancialInputs["payments"][number];expect(()=>summarizeFinancials({...base,sales:[{id:"s1",createdAt:at("2026-10-09"),totalMinor:0,outstandingMinor:0} as FinancialInputs["sales"][number]],payments:[huge]},financialRange("today",new Date("2026-10-09T12:00:00")))).toThrow(/safe integer/);});
 it("exports a labeled CSV without formula injection",()=>{const s=summarizeFinancials(base,financialRange("today",new Date("2026-10-09T12:00:00")));expect(financialCsv(s)).toContain("Not a statutory profit");});
 it("rejects orphaned payments, including those outside the selected period",()=>{
   const payment={saleId:"missing",createdAt:at("2026-01-01"),amountMinor:100} as FinancialInputs["payments"][number];
   expect(()=>summarizeFinancials({...base,payments:[payment]},financialRange("today",new Date("2026-10-09T12:00:00")))).toThrow(/orphaned sale payment/);
 });
 it("rejects payment linked to the wrong customer",()=>{
   const sale={id:"s1",customerId:"c1",createdAt:at("2026-10-09"),totalMinor:200,outstandingMinor:0} as FinancialInputs["sales"][number];
   const payment={saleId:"s1",customerId:"c2",createdAt:at("2026-10-09"),amountMinor:200} as FinancialInputs["payments"][number];
   expect(()=>summarizeFinancials({...base,sales:[sale],payments:[payment]},financialRange("today",new Date("2026-10-09T12:00:00")))).toThrow(/customer mismatch/);
 });
 it("rejects repeated reversals or an incorrect reversal total",()=>{
   const sale={id:"s1",createdAt:at("2026-10-09"),totalMinor:200,amountPaidMinor:150,outstandingMinor:50} as FinancialInputs["sales"][number];
   const reversal={originalSaleId:"s1",createdAt:at("2026-10-09"),reversedSaleTotalMinor:-200,reversedReceivedMinor:-150,reversedOutstandingMinor:-50} as FinancialInputs["reversals"][number];
   const range=financialRange("today",new Date("2026-10-09T12:00:00"));
   expect(()=>summarizeFinancials({...base,sales:[sale],reversals:[reversal,{...reversal}]},range)).toThrow(/repeated reversals/);
   expect(()=>summarizeFinancials({...base,sales:[sale],reversals:[{...reversal,reversedReceivedMinor:-140}]},range)).toThrow(/reversal amount mismatch/);
 });

});

describe('prepaid wallet settlement accounting',()=>{
  it('does not count wallet spend as new money collected',()=>{
    const range=financialRange('custom',new Date('2026-10-09T12:00:00'), '2026-10-09','2026-10-09');
    const sale={id:'w1',customerId:'c1',businessProfileId:'biz',receiptNumber:'W',status:'completed',createdAt:'2026-10-09T12:00:00',totalMinor:500,subtotalMinor:500,discountMinor:0,amountPaidMinor:500,walletAppliedMinor:500,outstandingMinor:0,paymentMethod:'wallet',submissionKey:'wallet-123'} as FinancialInputs['sales'][number];
    const report=summarizeFinancials({sales:[sale],payments:[],repayments:[],expenses:[],reversals:[]},range);
    expect(report.revenueMinor).toBe(500);
    expect(report.collectionsMinor).toBe(0);
  });
});


describe("Stage 2/3 prepaid ledger integration integrity",()=>{
  const range=financialRange("custom",new Date("2026-10-09T12:00:00"),"2026-10-09","2026-10-09");
  const transfer=(overrides:Record<string,unknown>={})=>({
    id:"wt-1",businessProfileId:"biz",customerId:"c1",kind:"deposit",amountMinor:900,
    method:"cash",reference:"receipt",benefitEntryId:"entry-1",submissionKey:"submitted-1",
    createdAt:"2026-10-09T12:00:00",...overrides
  }) as NonNullable<FinancialInputs["walletTransfers"]>[number];
  it("counts deposits and refunds once as external cash, never wallet spend",()=>{
    const report=summarizeFinancials({...base,walletTransfers:[transfer(),transfer({id:"wt-2",kind:"refund",amountMinor:200,submissionKey:"submitted-2"})]},range);
    expect(report.walletNetCashMinor).toBe(700);
    expect(report.collectionsMinor).toBe(700);
    expect(report.daily[0].collectionsMinor).toBe(700);
  });
  it("rejects unknown movement kinds and negative, fractional or unsafe amounts",()=>{
    for (const bad of [{kind:"adjustment"},{amountMinor:-1},{amountMinor:0},{amountMinor:0.2},{amountMinor:Number.MAX_SAFE_INTEGER}]) {
      expect(()=>summarizeFinancials({...base,walletTransfers:[transfer(bad)]},range)).toThrow(/invalid cash movement/);
    }
  });
  it("rejects duplicate transfer and submission identities, even outside the report window",()=>{
    for(const bad of [transfer({id:"wt-1",submissionKey:"submitted-2"}),transfer({id:"wt-2",submissionKey:"submitted-1"})]) {
      expect(()=>summarizeFinancials({...base,walletTransfers:[transfer({createdAt:"2025-01-01T12:00:00"}),bad]},range)).toThrow(/duplicate or missing identity/);
    }
  });
  it("rejects damaged history even when reporting a different period",()=>{
    expect(()=>summarizeFinancials({...base,walletTransfers:[transfer({createdAt:"2025-01-01T12:00:00",kind:"unknown"})]},range)).toThrow(/invalid cash movement/);
  });
});

describe('FIN-002 supplier history and cash separation',()=>{
  const range = financialRange('custom',new Date('2026-10-10T12:00:00Z'),'2026-10-10','2026-10-10');
  const purchase = {id:'p-1',businessProfileId:'shop',supplierId:'sup',totalCostMinor:10000,currency:'GHS',purchaseDate:'2026-10-09'} as NonNullable<FinancialInputs['purchases']>[number];
  const entry=(kind:'recognition'|'payment'|'credit',id:string,amountMinor:number,createdAt:string)=>({
    id,submissionKey:id,businessProfileId:'shop',supplierId:'sup',purchaseId:'p-1',currency:'GHS',kind,
    amountMinor,createdAt,...(kind==='payment'?{method:'cash' as const}:{})
  });
  it('exposes saved supplier liabilities as-of and period payments separately from expenses and cash',()=>{
    const supplierPayableEntries=[entry('payment','pay',2000,at('2026-10-10')),entry('recognition','liability',10000,at('2026-10-09')),entry('credit','credit',3000,at('2026-10-10'))];
    const summary=summarizeFinancials({...base,purchases:[purchase],supplierPayableEntries},range);
    expect(summary.supplierReconciliation?.outstandingByCurrency).toEqual([{currency:'GHS',amountMinor:5000}]);
    expect(summary.supplierReconciliation?.periodPaymentsByCurrency).toEqual([{currency:'GHS',amountMinor:2000}]);
    expect(summary.collectionsMinor).toBe(0);
    expect(summary.netRecordedCashMovementMinor).toBe(0); // explicitly excludes supplier tender, not a cash balance
    expect(financialCsv(summary)).toContain('Manual supplier payments in period, GHS');
  });
  it('leaves unknown legacy purchase liabilities unknown instead of assuming zero',()=>{
    const summary=summarizeFinancials({...base,purchases:[{...purchase,id:'old',currency:undefined}],supplierPayableEntries:[]},range);
    expect(summary.supplierReconciliation).toMatchObject({unknownPurchases:1,complete:false});
    expect(summary.unavailable.supplierPayables).toMatch(/1 purchase/);
  });
  it('requires both purchase and payable snapshots to avoid a falsely empty ledger',()=>{
    expect(()=>summarizeFinancials({...base,purchases:[purchase]},range)).toThrow(/purchases and settlement entries together/);
  });
});

describe('FIN-002 full-history prepaid liability reconciliation',()=>{
  const timestamp='2026-10-09T12:00:00.000Z';
  const transfer={id:'tr1',businessProfileId:'biz',customerId:'c1',kind:'deposit',amountMinor:900,
    currency:'GHS',method:'cash',reference:'local reference',submissionKey:'receipt-deposit-1',
    benefitEntryId:'benefit-tr1',createdAt:timestamp} as NonNullable<FinancialInputs['walletTransfers']>[number];
  const benefit={id:'benefit-tr1',businessProfileId:'biz',customerId:'c1',kind:'wallet',delta:900,
    reason:'Prepaid deposit',submissionKey:'wallet-transfer-tr1',createdAt:timestamp} as NonNullable<FinancialInputs['customerBenefits']>[number];
  const range=financialRange('custom',new Date(timestamp),'2026-10-09','2026-10-09');
  it('reports verified prepaid liability as-of, separately from the period deposit inflow',()=>{
    const summary=summarizeFinancials({...base,walletCurrency:'GHS',walletTransfers:[transfer],customerBenefits:[benefit]},range);
    expect(summary.walletNetCashMinor).toBe(900);
    expect(summary.prepaidLiabilityMinor).toBe(900);
    expect(summary.prepaidLiabilityCustomers).toBe(1);
    expect(financialCsv(summary)).toContain('Prepaid wallet liability as-of');
  });
  it('refuses a missing wallet benefit rather than certify a deposit as an outstanding liability',()=>{
    expect(()=>summarizeFinancials({...base,walletCurrency:'GHS',walletTransfers:[transfer],customerBenefits:[]},range)).toThrow(/missing.*wallet movement/);
  });
});

describe('FIN-002 daily report conservation and historical date evidence',()=>{
  const range=financialRange('custom',new Date('2026-10-11T12:00:00'),'2026-10-10','2026-10-11');
  it('reconciles multiple days and expense categories against headline period totals',()=>{
    const expenses=[
      {id:'expense1',businessProfileId:'b',category:'rent',amountMinor:250,currency:'GHS',expenseDate:'2026-10-10',createdAt:at('2026-10-11')},
      {id:'expense2',businessProfileId:'b',category:'rent',amountMinor:150,currency:'GHS',expenseDate:'2026-10-11',createdAt:at('2026-10-11')},
    ] as FinancialInputs['expenses'];
    const repayments=[{id:'repay1',createdAt:at('2026-10-11'),amountMinor:700}] as FinancialInputs['repayments'];
    // Current debt is retained from outside the selected range and is not cash.
    const sales=[{id:'old-credit',businessProfileId:'b',customerId:'c',createdAt:at('2026-09-01'),totalMinor:700,outstandingMinor:700,amountPaidMinor:0,subtotalMinor:700,discountMinor:0}] as FinancialInputs['sales'];
    const result=summarizeFinancials({...base,sales,repayments,expenses},range);
    expect(result.collectionsMinor).toBe(700);
    expect(result.expensesMinor).toBe(400);
    expect(result.daily.reduce((sum,day)=>sum+day.collectionsMinor,0)).toBe(result.collectionsMinor);
    expect(result.daily.reduce((sum,day)=>sum+day.expensesMinor,0)).toBe(result.expensesMinor);
    expect(result.expenseByCategory).toEqual([{category:'rent',amountMinor:400}]);
  });
  it('rejects a malformed earlier sale timestamp even if it is not in the requested period',()=>{
    const sale={id:'bad-day',businessProfileId:'b',createdAt:'not-a-date',totalMinor:0,amountPaidMinor:0,outstandingMinor:0,subtotalMinor:0,discountMinor:0} as FinancialInputs['sales'][number];
    expect(()=>summarizeFinancials({...base,sales:[sale]},range)).toThrow(/invalid original posting date/);
  });
  it('rejects a rolled-over historical sale posting date outside the requested period',()=>{
    const sale={id:'rolled-sale',businessProfileId:'b',createdAt:'2026-02-30T12:00:00.000Z',totalMinor:0,amountPaidMinor:0,outstandingMinor:0,subtotalMinor:0,discountMinor:0} as FinancialInputs['sales'][number];
    expect(()=>summarizeFinancials({...base,sales:[sale]},range)).toThrow(/invalid original posting date/);
  });
  it('rejects a valid expense date with an impossible stored creation timestamp',()=>{
    const expense={id:'rolled-expense',businessProfileId:'b',expenseDate:'2026-10-10',createdAt:'2026-11-31T12:00:00.000Z',category:'rent',amountMinor:100} as FinancialInputs['expenses'][number];
    expect(()=>summarizeFinancials({...base,expenses:[expense]},range)).toThrow(/invalid original posting date/);
  });
  it('rejects an impossible historical expense calendar day instead of silently omitting it',()=>{
    const expense={id:'bad-expense',businessProfileId:'b',expenseDate:'2026-02-30',createdAt:at('2026-10-10'),category:'rent',amountMinor:100} as FinancialInputs['expenses'][number];
    expect(()=>summarizeFinancials({...base,expenses:[expense]},range)).toThrow(/invalid original posting date/);
  });
});
