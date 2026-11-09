import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
/** Narrow, explicitly confirmed LOCAL CASH-only partial restock/refund posting.
 * The customer must already have received cash; no provider or wallet transfer
 * is initiated here. The caller must collect an explicit staff confirmation.
 * Other dispositions, customer sales, service/batch sales, legacy currency,
 * unknown tax evidence and credit sales fail closed pending an agreed policy.
 */
import { nanoid } from 'nanoid';
import { postStoreStockDelta, resolveReturnStore } from '@/features/stores/storeStockLedger';
import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import { requirePermission, activeStaffShift } from '@/features/staff/staff';
import { restorePartialInventoryCost } from '@/features/inventory/costLedger';
import { planPartialSaleReturn } from './partialReturnPlan.mjs';
import {authorizeReturnPolicy,type ReturnPolicyEvidence} from '@/features/business/returnPolicy.mjs';
import { reconcileCashPartialReturns } from './cashPartialReturn.mjs';
import { assertCashReturnStockLinks } from './cashReturnStockLinks.mjs';
import { assertCashReturnActorUnchanged } from './cashReturnActorGuard.mjs';
import type { InventoryMovement } from '@/features/inventory/inventory';
import { makeCentralCashRefundEvent } from '@/features/sync/centralOperationalEvent';

export interface CashPartialSaleReturn {
  /** Immutable owner-configured policy revision and sale-time entitlement. */
  policyEvidence?:ReturnPolicyEvidence;
  id: string;
  businessProfileId: string;
  /** Explicit receiving location; historical sale attribution stays unchanged. */
  returnStoreId?: string;
  originalSaleId: string;
  originalReceiptNumber: string;
  currency: string;
  createdAt: string;
  returnSequence: number;
  submissionKey: string;
  refundMethod: 'cash';
  disposition: 'restockable';
  refundedMinor: number;
  returnedTaxableMinor: number;
  returnedTaxMinor: number;
  returnedDiscountMinor: number;
  lines: Array<{ saleLineId: string; productId: string; quantity: number; movementId: string; costEventId: string }>;
  staffId?: string;
  shiftId?: string;
}

export async function recordConfirmedCashPartialReturn(values: {
  /** Explicit receiving location; historical sale attribution stays unchanged. */
  returnStoreId?: string;
  originalSaleId: string;
  submissionKey: string;
  lines: Array<{ saleLineId: string; quantity: number }>;
  /** Must be affirmatively confirmed by the cashier for this exact refund. */
  cashWasRefunded: true;
  /** Explicit amount physically returned, in the saved sale's minor currency units. */
  confirmedRefundMinor: number;
  /** Physically inspected, accepted sellable stock. Other dispositions are not supported. */
  disposition: 'restockable';
}, database: TallybookDB = db): Promise<CashPartialSaleReturn> {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => recordConfirmedCashPartialReturnWhileLocked(values, database));
}

async function recordConfirmedCashPartialReturnWhileLocked(values: {
  /** Explicit receiving location; historical sale attribution stays unchanged. */
  returnStoreId?: string;
  originalSaleId: string;
  submissionKey: string;
  lines: Array<{ saleLineId: string; quantity: number }>;
  /** Must be affirmatively confirmed by the cashier for this exact refund. */
  cashWasRefunded: true;
  /** Explicit amount physically returned, in the saved sale's minor currency units. */
  confirmedRefundMinor: number;
  /** Physically inspected, accepted sellable stock. Other dispositions are not supported. */
  disposition: 'restockable';
}, database: TallybookDB = db): Promise<CashPartialSaleReturn> {
  if (values?.cashWasRefunded !== true || values.disposition !== 'restockable' ||
      !Number.isSafeInteger(values.confirmedRefundMinor) || values.confirmedRefundMinor <= 0 ||
      !values.originalSaleId ||
      !/^[A-Za-z0-9:_-]{8,80}$/.test(values.submissionKey ?? '') ||
      !Array.isArray(values.lines) || values.lines.length < 1 || values.lines.length > 256 ||
      new Set(values.lines.map(row=>row.saleLineId)).size !== values.lines.length)
    throw new Error('Confirm the actual cash refund and provide a unique return request with valid sale lines.');
  const company = getActiveBusinessProfileId();
  return database.transaction('rw', [database.appMeta, database.businessProfiles, database.staffMembers, database.staffShifts, database.staffAudits,
    database.sales, database.saleLines, database.payments, database.receipts, database.saleReversals, database.cashPartialReturns,
    database.products, database.inventoryMovements, database.inventoryCostEvents, database.inventoryBatches, database.storeStockModes, database.storeStockEntries, database.storeLocations, database.storeAssignments, database.storeTransferRequests, database.commerceHolds, database.centralOperationalEvents], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const staff = await requirePermission('refund',database,company);
    const shift = await activeStaffShift(staff,database);
    if (staff?.role === 'cashier' && !shift)
      throw new Error('Open a shift before recording a cash refund.');
    if (getActiveBusinessProfileId() !== company) throw new Error('Company switched during the return.');
    // Never silently replay a refund after a network/UI retry: the cashier
    // must inspect the existing event instead of accidentally handing cash twice.
    const priorWithKey = await database.cashPartialReturns.where('[businessProfileId+submissionKey]').equals([company,values.submissionKey]).toArray();
    if (priorWithKey.length > 1) throw new Error('Duplicate cash return operation records require reconciliation.');
    if (priorWithKey.length) throw new Error('This cash return operation was already recorded or belongs to another company; inspect saved evidence before handing out money.');
    const sale = await database.sales.get(values.originalSaleId);
    if (!sale || sale.businessProfileId !== company) throw new Error('The original sale is unavailable in this company.');
    const receivingStoreId=await resolveReturnStore(database,company,sale.storeId,values.returnStoreId);
    const companyProfile=await database.businessProfiles.get(company);
    if(!companyProfile)throw new Error('Company return policy is unavailable.');
    const now=new Date().toISOString();
    const policyEvidence=authorizeReturnPolicy(companyProfile.returnPolicyHistory,sale,'partialCash',now);
    const lines = await database.saleLines.where('saleId').equals(sale.id).toArray();
    const payments = await database.payments.where('saleId').equals(sale.id).toArray();
    const receipts = await database.receipts.where('saleId').equals(sale.id).toArray();
    if (receipts.length !== 1 || receipts[0].businessProfileId !== company ||
        receipts[0].receiptNumber !== sale.receiptNumber)
      throw new Error('Original sale receipt must be reconciled before refund.');
    const prior = await database.cashPartialReturns.where('originalSaleId').equals(sale.id).toArray();
    const full = await database.saleReversals.where('originalSaleId').equals(sale.id).toArray();
    if (sale.tax?.ghana) throw new Error("Ghana VAT partial refunds require exact per-class tax correction evidence; this cash-only refund lane is not supported.");
    const plan = planPartialSaleReturn(sale, lines, prior.flatMap(item=>item.lines.map(line=>({saleLineId:line.saleLineId,quantity:line.quantity}))), values.lines);
    if (sale.tax && !plan.taxPolicyVerified) throw new Error('Saved tax settings must be reconciled before issuing this refund.');
    if (values.confirmedRefundMinor !== plan.draftAmountMinor) throw new Error('Confirmed cash refund does not equal the exact saved invoice return amount.');
    // This initial path deliberately cannot alter customer balances, loyalty,
    // saved wallets, remote payments, service quantities or batch ownership.
    if (sale.customerId !== undefined || sale.paymentMethod !== 'cash' || !/^[A-Z]{3}$/.test(sale.currency ?? '') ||
        sale.outstandingMinor !== 0 || sale.amountPaidMinor !== sale.totalMinor || sale.walletAppliedMinor ||
        sale.loyaltyRedeemedPoints || sale.loyaltyRedeemedMinor || full.length ||
        payments.length !== 1 || payments[0].businessProfileId !== company || payments[0].method !== 'cash' || payments[0].amountMinor !== sale.totalMinor)
      throw new Error('This sale requires the full customer/tender refund workflow; cash-only refund is not supported.');
    reconcileCashPartialReturns([sale],lines,payments,prior,full);
    // A valid money journal is insufficient: validate its saved stock and FIFO
    // references before any further cash return is recorded.
    const pastRows = prior.flatMap(ret => ret.lines);
    const [originalIssues, pastMovements, pastCosts] = await Promise.all([
      database.inventoryCostEvents.bulkGet(lines.map(line => line.costEventId ?? '')),
      database.inventoryMovements.bulkGet(pastRows.map(row => row.movementId)),
      database.inventoryCostEvents.bulkGet(pastRows.map(row => row.costEventId)),
    ]);
    assertCashReturnStockLinks(sale, lines, prior,
      pastMovements.filter((row): row is NonNullable<typeof row> => Boolean(row)),
      [...originalIssues, ...pastCosts].filter((row): row is NonNullable<typeof row> => Boolean(row)));
    const savedLines:CashPartialSaleReturn['lines'] = [];
    const products = new Set<string>();
    assertCompanyScope(company, getActiveBusinessProfileId());
    for (const item of plan.lines) {
      const originalLine = lines.find(line=>line.id===item.saleLineId)!;
      if (products.has(originalLine.productId) || originalLine.stockTracked === false || !originalLine.costEventId ||
          originalLine.batchAllocations?.length) throw new Error('This return requires reconciled, uniquely tracked stock and FIFO evidence.');
      products.add(originalLine.productId);
      const product = await database.products.get(originalLine.productId);
      if (!product || product.businessProfileId !== company || product.itemKind === 'service' ||
          !Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0 ||
          !Number.isSafeInteger(product.stockQuantity + item.quantity)) throw new Error('Stock is missing or cannot be restored safely.');
      if (await database.inventoryBatches.where('productId').equals(product.id).and(row=>row.businessProfileId===company).count())
        throw new Error('Batch-owned stock requires an explicit returned-batch disposition.');
      const originalEvent = await database.inventoryCostEvents.get(originalLine.costEventId);
      if (!originalEvent || originalEvent.kind !== 'issue' || originalEvent.businessProfileId !== company ||
          originalEvent.saleLineId !== originalLine.id || originalEvent.saleId !== sale.id ||
          originalEvent.productId !== product.id || originalEvent.quantityDelta !== -originalLine.quantity)
        throw new Error('Original FIFO sale allocation must be reconciled before refund.');
      const priorLineUnits = prior.flatMap(row=>row.lines).filter(row=>row.saleLineId===originalLine.id).reduce((sum,row)=>sum+row.quantity,0);
      const priorCostEvents = await database.inventoryCostEvents.where('[businessProfileId+productId]').equals([company,product.id])
        .and(row=>row.kind==='reversal'&&row.reversesEventId===originalEvent.id).toArray();
      if (priorCostEvents.reduce((sum,row)=>sum+row.quantityDelta,0)!==priorLineUnits)
        throw new Error('Existing return stock and FIFO restoration evidence does not reconcile.');
      const movementId = nanoid(18);
      const event = await restorePartialInventoryCost(database, product, originalEvent.id, {sourceId:movementId,createdAt:now,saleId:sale.id,saleLineId:originalLine.id},item.quantity);
      const movement: InventoryMovement = {id:movementId,businessProfileId:company,productId:product.id,movementType:'reversal',
        quantityDelta:item.quantity,previousQuantity:product.stockQuantity,resultingQuantity:product.stockQuantity+item.quantity,
        note:`Partial cash refund of ${sale.receiptNumber}`,createdAt:now};
      await postStoreStockDelta(database,company,product.id,receivingStoreId,item.quantity,movement.id,"refund",now,product.stockQuantity,movement.resultingQuantity);
      await database.inventoryMovements.add(movement);
      await database.products.put({...product,stockQuantity:movement.resultingQuantity,updatedAt:now});
      savedLines.push({saleLineId:originalLine.id,productId:product.id,quantity:item.quantity,movementId,costEventId:event.id});
    }
    const recorded:CashPartialSaleReturn = {...(values.returnStoreId?{returnStoreId:values.returnStoreId}:{}),policyEvidence,id:nanoid(18),businessProfileId:company,originalSaleId:sale.id,
      originalReceiptNumber:sale.receiptNumber,currency:sale.currency!,submissionKey:values.submissionKey,createdAt:now,returnSequence:prior.length+1,
      refundMethod:'cash',disposition:'restockable',refundedMinor:plan.draftAmountMinor,
      returnedTaxableMinor:plan.draftTaxableMinor,returnedTaxMinor:plan.draftTaxMinor,
      returnedDiscountMinor:plan.draftDiscountMinor,lines:savedLines,
      ...(staff?{staffId:staff.id}:{}),...(shift?{shiftId:shift.id}:{})};
    reconcileCashPartialReturns([sale],lines,payments,[...prior,recorded],full);
    if (getActiveBusinessProfileId() !== company) throw new Error("Company switched during cash refund posting.");
    await assertRun7RetailWriteReady(database.appMeta);
    const postingStaff = await requirePermission("refund",database,company);
    const postingShift = await activeStaffShift(postingStaff,database);
    if (postingStaff?.role === 'cashier' && !postingShift)
      throw new Error('Cashier shift closed before refund was recorded.');
    assertCashReturnActorUnchanged(staff,shift,postingStaff,postingShift);
    await database.cashPartialReturns.add(recorded);
    await database.centralOperationalEvents.add(makeCentralCashRefundEvent(recorded,sale));
    if (staff) await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:staff.id,
      action:'sale.partial-cash-refund',createdAt:now,details:`${recorded.id}:${sale.id}:${recorded.refundedMinor}:${sale.currency}`});
    assertCompanyScope(company, getActiveBusinessProfileId());
    return recorded;
  });
}
