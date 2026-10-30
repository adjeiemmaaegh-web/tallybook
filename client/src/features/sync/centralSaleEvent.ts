import type { Sale, SaleLine, Payment, Receipt } from '@/features/sales/sales';
import {validateSalePostingEvidence,type SalePostingEvidence} from './centralSalePostingEvidence';
import {validateCreditTerms} from '@/features/credit/creditTerms.mjs';

/** Immutable local checkout evidence. It is not a cloud acknowledgement or a trusted device identity. */
export interface CentralSaleEvent {
  id: string;
  businessProfileId: string;
  operationId: string;
  entityId: string;
  kind: 'sale.completed';
  createdAt: string;
  shopId: string | null;
  staffId: string;
  shiftId: string;
  deviceId: null;
  deliveryStatus: 'local_only';
  payloadVersion: 1;
  payload: { sale: Sale; lines: SaleLine[]; payment: Payment | null; receipt: Receipt; postingEvidence?:SalePostingEvidence };
}

export function makeCentralSaleEvent(sale: Sale, lines: SaleLine[], payment: Payment | undefined, receipt: Receipt,postingEvidence?:SalePostingEvidence): CentralSaleEvent {
  const event: CentralSaleEvent = {
    id: `sale:${sale.id}`, businessProfileId: sale.businessProfileId,
    operationId: `sale:${sale.id}`, entityId: sale.id, kind: 'sale.completed',
    createdAt: sale.createdAt, shopId: sale.storeId ?? null,
    staffId: sale.staffId ?? '', shiftId: sale.shiftId ?? '', deviceId: null,
    deliveryStatus: 'local_only', payloadVersion: 1,
    payload: { sale, lines, payment: payment ?? null, receipt,...(postingEvidence?{postingEvidence}:{}) },
  };
  validateCentralSaleEvent(event);
  return event;
}

export function validateCentralSaleEvent(event: CentralSaleEvent): void {
  if (event.kind !== 'sale.completed' || event.payloadVersion !== 1 || event.deliveryStatus !== 'local_only' || event.deviceId !== null)
    throw new Error('Unsupported central sale event state.');
  const { sale, lines, payment, receipt } = event.payload ?? {} as CentralSaleEvent['payload'];
  if (!sale || !Array.isArray(lines) || !receipt ||
      event.id !== `sale:${sale.id}` || event.entityId !== sale.id ||
      event.businessProfileId !== sale.businessProfileId || event.operationId !== `sale:${sale.id}` ||
      event.createdAt !== sale.createdAt || event.shopId !== (sale.storeId ?? null) ||
      event.staffId !== sale.staffId || event.shiftId !== sale.shiftId ||
      !event.staffId || !event.shiftId || !Number.isFinite(Date.parse(event.createdAt)) ||
      receipt.saleId !== sale.id || receipt.businessProfileId !== sale.businessProfileId ||
      receipt.receiptNumber !== sale.receiptNumber ||
      lines.length === 0 || lines.some(line => line.saleId !== sale.id || line.businessProfileId !== sale.businessProfileId ||
        !Number.isSafeInteger(line.lineTotalMinor) || line.lineTotalMinor < 0) ||
      (payment !== null && (!payment || payment.saleId !== sale.id || payment.businessProfileId !== sale.businessProfileId ||
        !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0)) ||
      !Number.isSafeInteger(sale.totalMinor) || sale.totalMinor < 0 ||
      !Number.isSafeInteger(sale.amountPaidMinor) || sale.amountPaidMinor < 0 ||
      !Number.isSafeInteger(sale.outstandingMinor) || sale.outstandingMinor < 0 ||
      sale.totalMinor !== sale.amountPaidMinor + sale.outstandingMinor)
    throw new Error('Central sale event does not reconcile with its local checkout.');
  if(event.payload.postingEvidence!==undefined)validateSalePostingEvidence(sale,lines,event.payload.postingEvidence);
  validateCreditTerms(sale);
}
