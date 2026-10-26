import type { CashPartialSaleReturn } from '@/features/sales/cashPartialReturnPosting';
import type { Sale } from '@/features/sales/sales';

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

export type CentralOperationalEvent = CentralCashRefundEvent;

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

export function validateCentralOperationalEvent(event:CentralOperationalEvent,originalSale:Sale):void {
  if(event.kind!=='sale.cash_partial_refund_recorded' || event.payloadVersion!==1 ||
     event.deliveryStatus!=='local_only' || event.deviceId!==null ||
     event.payoutEvidence!=='staff_confirmed_only')
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
