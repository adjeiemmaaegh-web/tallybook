import type { CashPartialSaleReturn } from '@/features/sales/cashPartialReturnPosting';
import type { Sale } from '@/features/sales/sales';
import type { SaleReversal } from '@/features/assistant/reversals';
import type { DebtRepayment } from '@/features/credit/credit';

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

export type CentralOperationalEvent = CentralCashRefundEvent | CentralSaleReversalEvent | CentralRepaymentEvent;

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

export function validateCentralOperationalEvent(event:CentralOperationalEvent,originalSale?:Sale):void {
  if(event.payloadVersion!==1 || event.deliveryStatus!=='local_only' || event.deviceId!==null ||
     !event.businessProfileId || event.operationId!==event.id || !event.entityId ||
     !Number.isFinite(Date.parse(event.createdAt)))
    throw new Error('Unsupported central operational event state.');
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
