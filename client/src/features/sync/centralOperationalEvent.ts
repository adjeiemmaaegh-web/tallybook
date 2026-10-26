import type { CashPartialSaleReturn } from '@/features/sales/cashPartialReturnPosting';
import type { Sale } from '@/features/sales/sales';
import type { SaleReversal } from '@/features/assistant/reversals';
import type { DebtRepayment } from '@/features/credit/credit';
import type { Purchase, PurchaseLine } from '@/features/purchases/purchases';
import type { SupplierPayableEntry } from '@/features/purchases/supplierPayables.ts';
import type { StaffShift } from '@/features/staff/staff';

/** Local evidence only. Staff confirmation of cash payout is not independent disbursement proof. */
export interface CentralCashRefundEvent {
  id:string;
  businessProfileId:string;
  operationId:string;
  entityId:string;
  kind:'sale.cash_partial_refund_recorded';
  createdAt:string;
  shopId:string|null;
  staffId:string|null;
  shiftId:string|null;
  deviceId:null;
  deliveryStatus:'local_only';
  payloadVersion:1;
  payoutEvidence:'staff_confirmed_only';
  payload:{cashReturn:CashPartialSaleReturn};
}

export interface CentralSaleReversalEvent extends Omit<CentralCashRefundEvent,'kind'|'payoutEvidence'|'payload'> {
  kind:'sale.reversal_recorded';
  payoutEvidence:'accounting_reversal_only';
  payload:{reversal:SaleReversal};
}

export interface CentralRepaymentEvent extends Omit<CentralCashRefundEvent,'kind'|'payoutEvidence'|'payload'> {
  kind:'customer.repayment_recorded';
  settlementEvidence:'local_record_only';
  payload:{repayment:DebtRepayment};
}

export interface CentralPurchaseEvent extends Omit<CentralCashRefundEvent,'kind'|'payoutEvidence'|'payload'> {
  kind:'purchase.completed';
  payload:{purchase:Purchase;lines:PurchaseLine[]};
}

export interface CentralSupplierEntryEvent extends Omit<CentralCashRefundEvent,'kind'|'payoutEvidence'|'payload'> {
  kind:'supplier.liability_recognized'|'supplier.payment_recorded'|'supplier.credit_recorded';
  settlementEvidence:'local_record_only';
  payload:{entry:SupplierPayableEntry};
}

export interface CentralShiftEvent extends Omit<CentralCashRefundEvent,'kind'|'payoutEvidence'|'payload'> {
  kind:'shift.opened'|'shift.closed';
  payload:{shift:StaffShift};
}

export type CentralOperationalEvent = CentralCashRefundEvent | CentralSaleReversalEvent | CentralRepaymentEvent | CentralPurchaseEvent | CentralSupplierEntryEvent | CentralShiftEvent;

export function makeCentralPurchaseEvent(purchase:Purchase,lines:PurchaseLine[]):CentralPurchaseEvent {
  const event:CentralPurchaseEvent={id:`purchase:${purchase.id}`,operationId:`purchase:${purchase.id}`,
    entityId:purchase.id,businessProfileId:purchase.businessProfileId,kind:'purchase.completed',
    createdAt:purchase.createdAt,shopId:purchase.storeId??null,staffId:purchase.staffId??null,
    shiftId:purchase.shiftId??null,deviceId:null,deliveryStatus:'local_only',payloadVersion:1,
    payload:{purchase,lines}};
  validateCentralOperationalEvent(event);
  return event;
}

export function makeCentralSupplierEntryEvent(entry:SupplierPayableEntry,purchase:Purchase):CentralSupplierEntryEvent {
  const kind=entry.kind==='recognition'?'supplier.liability_recognized':entry.kind==='payment'?'supplier.payment_recorded':'supplier.credit_recorded';
  const event:CentralSupplierEntryEvent={id:`supplier-entry:${entry.id}`,operationId:`supplier-entry:${entry.id}`,
    entityId:entry.id,businessProfileId:entry.businessProfileId,kind,createdAt:entry.createdAt,
    shopId:purchase.storeId??null,staffId:entry.staffId??null,shiftId:entry.shiftId??null,
    deviceId:null,deliveryStatus:'local_only',payloadVersion:1,settlementEvidence:'local_record_only',
    payload:{entry}};
  validateCentralOperationalEvent(event,purchase);
  return event;
}

export function makeCentralShiftEvent(shift:StaffShift,kind:CentralShiftEvent['kind']):CentralShiftEvent {
  const event:CentralShiftEvent={id:`${kind}:${shift.id}`,operationId:`${kind}:${shift.id}`,
    entityId:shift.id,businessProfileId:shift.businessProfileId,kind,
    createdAt:kind==='shift.opened'?shift.openedAt:shift.closedAt!,shopId:null,
    staffId:shift.staffId,shiftId:shift.id,deviceId:null,deliveryStatus:'local_only',
    payloadVersion:1,payload:{shift}};
  validateCentralOperationalEvent(event);
  return event;
}

export function makeCentralSaleReversalEvent(reversal:SaleReversal,originalSale:Sale):CentralSaleReversalEvent {
  const event:CentralSaleReversalEvent={
    id:`sale-reversal:${reversal.id}`,businessProfileId:reversal.businessProfileId,
    operationId:`sale-reversal:${reversal.id}`,entityId:reversal.id,
    kind:'sale.reversal_recorded',createdAt:reversal.createdAt,
    shopId:originalSale.storeId??null,staffId:reversal.staffId??null,
    shiftId:reversal.shiftId??null,deviceId:null,deliveryStatus:'local_only',
    payloadVersion:1,payoutEvidence:'accounting_reversal_only',payload:{reversal},
  };
  validateCentralOperationalEvent(event,originalSale);
  return event;
}

export function makeCentralRepaymentEvent(repayment:DebtRepayment):CentralRepaymentEvent {
  const event:CentralRepaymentEvent={
    id:`repayment:${repayment.id}`,businessProfileId:repayment.businessProfileId,
    operationId:`repayment:${repayment.id}`,entityId:repayment.id,
    kind:'customer.repayment_recorded',createdAt:repayment.createdAt,
    shopId:null,staffId:repayment.staffId??null,
    shiftId:repayment.shiftId??null,deviceId:null,deliveryStatus:'local_only',
    payloadVersion:1,settlementEvidence:'local_record_only',payload:{repayment},
  };
  validateCentralOperationalEvent(event);
  return event;
}

export function makeCentralCashRefundEvent(cashReturn:CashPartialSaleReturn,originalSale:Sale):CentralCashRefundEvent {
  const event:CentralCashRefundEvent={
    id:`cash-refund:${cashReturn.id}`,businessProfileId:cashReturn.businessProfileId,
    operationId:`cash-refund:${cashReturn.id}`,entityId:cashReturn.id,
    kind:'sale.cash_partial_refund_recorded',createdAt:cashReturn.createdAt,
    shopId:originalSale.storeId??null,staffId:cashReturn.staffId??null,
    shiftId:cashReturn.shiftId??null,deviceId:null,deliveryStatus:'local_only',
    payloadVersion:1,payoutEvidence:'staff_confirmed_only',payload:{cashReturn},
  };
  validateCentralOperationalEvent(event,originalSale);
  return event;
}

export function validateCentralOperationalEvent(event:CentralOperationalEvent,source?:Sale|Purchase):void {
  if(event.payloadVersion!==1 || event.deliveryStatus!=='local_only' || event.deviceId!==null ||
     !event.businessProfileId || event.operationId!==event.id || !event.entityId ||
     !Number.isFinite(Date.parse(event.createdAt)))
    throw new Error('Unsupported central operational event state.');
  if(event.kind==='purchase.completed') {
    const {purchase,lines}=event.payload??{};
    if(!purchase || !Array.isArray(lines) || !lines.length ||
       event.id!==`purchase:${purchase.id}` || event.entityId!==purchase.id ||
       event.businessProfileId!==purchase.businessProfileId || event.createdAt!==purchase.createdAt ||
       event.shopId!==(purchase.storeId??null) || event.staffId!==(purchase.staffId??null) ||
       event.shiftId!==(purchase.shiftId??null) || !/^[A-Z]{3}$/.test(purchase.currency??'') ||
       !Number.isSafeInteger(purchase.totalCostMinor) || purchase.totalCostMinor<=0 ||
       lines.some(line=>line.purchaseId!==purchase.id || line.businessProfileId!==purchase.businessProfileId ||
         !Number.isSafeInteger(line.lineTotalMinor) || line.lineTotalMinor<=0) ||
       !Number.isSafeInteger(lines.reduce((total,line)=>total+line.lineTotalMinor,0)) ||
       lines.reduce((total,line)=>total+line.lineTotalMinor,0)!==purchase.totalCostMinor)
      throw new Error('Central purchase event does not reconcile with its saved purchase.');
    return;
  }
  if(typeof event.kind==='string' && event.kind.startsWith('supplier.')) {
    const typed=event as CentralSupplierEntryEvent;
    const row=typed.payload?.entry;
    const purchase=source as Purchase|undefined;
    const expectedKind=row?.kind==='recognition'?'supplier.liability_recognized':row?.kind==='payment'?'supplier.payment_recorded':'supplier.credit_recorded';
    if(!row || !purchase || !['recognition','payment','credit'].includes(row.kind) ||
       typed.kind!==expectedKind || typed.settlementEvidence!=='local_record_only' ||
       event.id!==`supplier-entry:${row.id}` || event.entityId!==row.id ||
       event.businessProfileId!==row.businessProfileId || purchase.businessProfileId!==row.businessProfileId ||
       row.purchaseId!==purchase.id || row.supplierId!==purchase.supplierId || row.currency!==purchase.currency ||
       event.createdAt!==row.createdAt || event.shopId!==(purchase.storeId??null) ||
       event.staffId!==(row.staffId??null) || event.shiftId!==(row.shiftId??null) ||
       !Number.isSafeInteger(row.amountMinor) || row.amountMinor<=0)
      throw new Error('Central supplier event does not reconcile with its saved entry.');
    return;
  }
  if(event.kind==='shift.opened' || event.kind==='shift.closed') {
    const shift=event.payload?.shift;
    if(!shift || event.id!==`${event.kind}:${shift.id}` || event.entityId!==shift.id ||
       event.businessProfileId!==shift.businessProfileId || event.createdAt!==(event.kind==='shift.opened'?shift.openedAt:shift.closedAt) ||
       event.shopId!==null || event.staffId!==shift.staffId || event.shiftId!==shift.id ||
       !Number.isSafeInteger(shift.openingFloatMinor) || shift.openingFloatMinor<0 ||
       (event.kind==='shift.opened' && shift.closedAt!==undefined) ||
       (event.kind==='shift.closed' && (!shift.closedAt || Date.parse(shift.closedAt)<Date.parse(shift.openedAt) || !Number.isSafeInteger(shift.countedCashMinor) || !Number.isSafeInteger(shift.expectedCashMinor) || !Number.isSafeInteger(shift.varianceMinor) || shift.countedCashMinor! - shift.expectedCashMinor! !== shift.varianceMinor)))
      throw new Error('Central shift event does not reconcile with its saved shift.');
    return;
  }
  if(event.kind==='customer.repayment_recorded') {
    const row=event.payload?.repayment;
    if(event.settlementEvidence!=='local_record_only' || !row ||
       event.id!==`repayment:${row.id}` || event.entityId!==row.id ||
       event.businessProfileId!==row.businessProfileId || event.createdAt!==row.createdAt ||
       event.shopId!==null || event.staffId!==(row.staffId??null) || event.shiftId!==(row.shiftId??null) ||
       !row.customerId || !row.submissionKey || !/^[A-Z]{3}$/.test(row.currency??'') ||
       !['cash','card','mobile'].includes(row.method) ||
       !Number.isSafeInteger(row.amountMinor) || row.amountMinor<=0)
      throw new Error('Central repayment event does not reconcile with its saved repayment.');
    return;
  }
  if(event.kind==='sale.reversal_recorded') {
    const row=event.payload?.reversal;
    const originalSale=source as Sale|undefined;
    if(event.payoutEvidence!=='accounting_reversal_only' || !row || !originalSale ||
       event.id!==`sale-reversal:${row.id}` || event.entityId!==row.id ||
       event.businessProfileId!==row.businessProfileId || originalSale.businessProfileId!==row.businessProfileId ||
       row.originalSaleId!==originalSale.id || row.originalReceiptNumber!==originalSale.receiptNumber ||
       event.createdAt!==row.createdAt || event.shopId!==(originalSale.storeId??null) ||
       event.staffId!==(row.staffId??null) || event.shiftId!==(row.shiftId??null) ||
       row.reversedSaleTotalMinor!==-originalSale.totalMinor ||
       row.reversedReceivedMinor!==-originalSale.amountPaidMinor ||
       row.reversedOutstandingMinor!==-originalSale.outstandingMinor ||
       !Array.isArray(row.lines) || row.lines.length===0)
      throw new Error('Central reversal event does not reconcile with its saved reversal.');
    return;
  }
  if(event.kind!=='sale.cash_partial_refund_recorded' || event.payoutEvidence!=='staff_confirmed_only')
    throw new Error('Unsupported central operational event state.');
  const originalSale=source as Sale|undefined;
  const row=event.payload?.cashReturn;
  if(!row || !originalSale ||
     event.id!==`cash-refund:${row.id}` || event.operationId!==event.id ||
     event.entityId!==row.id || event.businessProfileId!==row.businessProfileId ||
     originalSale.businessProfileId!==row.businessProfileId ||
     row.originalSaleId!==originalSale.id || row.originalReceiptNumber!==originalSale.receiptNumber ||
     event.createdAt!==row.createdAt || !Number.isFinite(Date.parse(event.createdAt)) ||
     event.shopId!==(originalSale.storeId??null) ||
     event.staffId!==(row.staffId??null) || event.shiftId!==(row.shiftId??null) ||
     row.refundMethod!=='cash' || row.disposition!=='restockable' ||
     !/^[A-Z]{3}$/.test(row.currency) || row.currency!==originalSale.currency ||
     !Number.isSafeInteger(row.refundedMinor) || row.refundedMinor<=0 ||
     !Array.isArray(row.lines) || row.lines.length===0)
    throw new Error('Central cash refund event does not reconcile with its saved return.');
}
