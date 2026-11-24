import { reconcilePrepaidLiability } from "@/features/reports/prepaidLiabilityReconciliation.mjs";
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
import { reconcileCashPartialReturns, MANUAL_REFUND_TENDERS } from './cashPartialReturn.mjs';
import { reconcileCreditLedger } from './creditLedger.mjs';
import { allocateReturnToTenders, pointsToReverse } from './returnAllocation.mjs';
import { reconcileLoyaltyReturns } from './loyaltyReturnAudit.mjs';
import { companyReturnChoices } from '@/features/business/returnPolicy.mjs';
import { stillOwedOnSale } from '@/features/credit/creditReturns';
import { assertCashReturnStockLinks } from './cashReturnStockLinks.mjs';
import { assertCashReturnActorUnchanged } from './cashReturnActorGuard.mjs';
import type { InventoryMovement } from '@/features/inventory/inventory';
import { makeCentralCashRefundEvent } from '@/features/sync/centralOperationalEvent';

export interface CashPartialSaleReturn {
  /** Immutable owner-configured policy revision and sale-time entitlement. */
  policyEvidence?:ReturnPolicyEvidence;
  id: string;
  businessProfileId: string;
  /** Explicit physical receiving location; original sale attribution is immutable. */
  returnStoreId?: string;
  originalSaleId: string;
  originalReceiptNumber: string;
  currency: string;
  createdAt: string;
  returnSequence: number;
  submissionKey: string;
  /** Original single tender. Mobile/card are manual staff-confirmed evidence, never provider settlement. */
  /** 'credit' = no money out; the return only reduced the customer's receivable on this sale. */
  refundMethod: 'cash'|'mobile'|'card'|'credit'|'wallet'|'split';
  /** Split-tender sales only: what was returned through each ORIGINAL tender (company allocation policy). */
  legs?: Array<{ method: 'cash'|'mobile'|'card'; amountMinor: number }>;
  /** Allocation policy in force when a split refund was recorded (evidence). */
  allocationPolicy?: 'proportional'|'reverse-order';
  /** Customer loyalty points the returned value earned: taken back unless the business chose to keep them. */
  loyalty?: { policy: 'reverse'|'keep'; earnedPoints: number; pointsReversed: number; pointsShortfall: number };
  /** Present on customer sales: the identity whose receivable was credited. */
  customerId?: string;
  /** Receivable credit-note portion of this return (debt is reduced BEFORE any tender refund). */
  debtReducedMinor?: number;
  disbursementEvidence?: 'staff_confirmed_manual_unverified';
  /** Optional staff-typed note (e.g. MoMo transaction reference); unverified free text. */
  manualReference?: string;
  disposition: 'restockable';
  refundedMinor: number;
  returnedTaxableMinor: number;
  returnedTaxMinor: number;
  returnedDiscountMinor: number;
  /** batchRestorations: only for lines sold from expiry/batch-tracked stock; which source batches got the returned units back. */
  lines: Array<{ saleLineId: string; productId: string; quantity: number; movementId: string; costEventId: string; batchRestorations?: Array<{ batchId: string; quantity: number }> }>;
  staffId?: string;
  shiftId?: string;
}

export async function recordConfirmedCashPartialReturn(values: {
  /** Physical receiving store when company store stock is active. */
  returnStoreId?: string;
  originalSaleId: string;
  submissionKey: string;
  lines: Array<{ saleLineId: string; quantity: number }>;
  /** Must be affirmatively confirmed by the cashier whenever money was actually handed back. */
  cashWasRefunded?: boolean;
  /** Exact receivable credit the cashier reviewed (customer credit sales); default 0. */
  confirmedDebtReductionMinor?: number;
  /** Explicit amount physically returned, in the saved sale's minor currency units. */
  confirmedRefundMinor: number;
  /** Physically inspected, accepted sellable stock. Other dispositions are not supported. */
  disposition: 'restockable';
  /** Must equal the original sale's single tender; defaults to cash. */
  refundMethod?: 'cash'|'mobile'|'card'|'wallet'|'split';
  /** Split-tender sales: the exact amount returned through each original tender, as the cashier reviewed it. */
  confirmedLegs?: Array<{ method: 'cash'|'mobile'|'card'; amountMinor: number }>;
  /** Optional manual reference for a non-cash refund; unverified. */
  manualReference?: string;
}, database: TallybookDB = db): Promise<CashPartialSaleReturn> {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => recordConfirmedCashPartialReturnWhileLocked(values, database));
}

async function recordConfirmedCashPartialReturnWhileLocked(values: {
  /** Physical receiving store when company store stock is active. */
  returnStoreId?: string;
  originalSaleId: string;
  submissionKey: string;
  lines: Array<{ saleLineId: string; quantity: number }>;
  /** Must be affirmatively confirmed by the cashier whenever money was actually handed back. */
  cashWasRefunded?: boolean;
  /** Exact receivable credit the cashier reviewed (customer credit sales); default 0. */
  confirmedDebtReductionMinor?: number;
  /** Explicit amount physically returned, in the saved sale's minor currency units. */
  confirmedRefundMinor: number;
  /** Physically inspected, accepted sellable stock. Other dispositions are not supported. */
  disposition: 'restockable';
  /** Must equal the original sale's single tender; defaults to cash. */
  refundMethod?: 'cash'|'mobile'|'card'|'wallet'|'split';
  /** Split-tender sales: the exact amount returned through each original tender, as the cashier reviewed it. */
  confirmedLegs?: Array<{ method: 'cash'|'mobile'|'card'; amountMinor: number }>;
  /** Optional manual reference for a non-cash refund; unverified. */
  manualReference?: string;
}, database: TallybookDB = db): Promise<CashPartialSaleReturn> {
  const confirmedDebt = values?.confirmedDebtReductionMinor ?? 0;
  if (values.disposition !== 'restockable' ||
      !Number.isSafeInteger(values.confirmedRefundMinor) || values.confirmedRefundMinor < 0 ||
      !Number.isSafeInteger(confirmedDebt) || confirmedDebt < 0 ||
      values.confirmedRefundMinor + confirmedDebt <= 0 ||
      (values.confirmedRefundMinor > 0 && values.refundMethod !== 'wallet' && values.cashWasRefunded !== true) ||
      (values.refundMethod === 'split' && (!Array.isArray(values.confirmedLegs) || values.confirmedLegs.length < 1 || values.confirmedLegs.length > 3)) ||
      (values.refundMethod !== 'split' && values.confirmedLegs !== undefined) ||
      (values.refundMethod === 'wallet' && (values.cashWasRefunded === true || values.confirmedDebtReductionMinor)) ||
      !values.originalSaleId ||
      ![...MANUAL_REFUND_TENDERS,'wallet','split'].includes(values.refundMethod ?? 'cash') ||
      (values.manualReference !== undefined && ((values.refundMethod ?? 'cash') === 'cash' || values.refundMethod === 'wallet' || values.refundMethod === 'split' ||
        typeof values.manualReference !== 'string' || !values.manualReference.trim() || values.manualReference.length > 64)) ||
      !/^[A-Za-z0-9:_-]{8,80}$/.test(values.submissionKey ?? '') ||
      !Array.isArray(values.lines) || values.lines.length < 1 || values.lines.length > 256 ||
      new Set(values.lines.map(row=>row.saleLineId)).size !== values.lines.length)
    throw new Error('Confirm the actual cash refund and provide a unique return request with valid sale lines.');
  const company = getActiveBusinessProfileId();
  return database.transaction('rw', [database.appMeta, database.businessProfiles, database.staffMembers, database.staffShifts, database.staffAudits,
    database.sales, database.saleLines, database.payments, database.receipts, database.saleReversals, database.cashPartialReturns, database.customers, database.customerBenefits, database.walletTransfers, database.repayments,
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
    // This lane credits ONLY the sale's own receivable; it never alters loyalty,
    // saved wallets, remote payments, service quantities or batch ownership.
    if (sale.tax && !plan.taxPolicyVerified) throw new Error('Saved tax settings must be reconciled before issuing this refund.');
    // Customer credit: split the returned value into receivable credit (first) and tender refund.
    let debtReducedMinor = 0, customerId: string | undefined;
    if (sale.customerId !== undefined) {
      customerId = sale.customerId;
      const customer = await database.customers.get(customerId);
      if (!customer || customer.businessProfileId !== company) throw new Error('The customer on this sale is unavailable in this company.');
      const stillOwed = sale.paymentMethod === 'wallet' || sale.outstandingMinor === 0 ? 0 : await stillOwedOnSale(database, company, sale);
      debtReducedMinor = Math.min(plan.draftAmountMinor, stillOwed);
    }
    const tenderMinor = plan.draftAmountMinor - debtReducedMinor;
    if (values.confirmedRefundMinor !== tenderMinor || confirmedDebt !== debtReducedMinor)
      throw new Error('Confirmed cash refund does not equal the exact saved invoice return amount (receivable credit first, tender refund for the remainder).');
    let refundMethod: 'cash'|'mobile'|'card'|'credit'|'wallet'|'split';
    if (sale.paymentMethod === 'wallet') {
      if (values.refundMethod !== 'wallet' || sale.customerId === undefined) throw new Error('A wallet-paid sale can only be refunded to that customer\'s prepaid wallet.');
      refundMethod = 'wallet';
    } else if (values.refundMethod === 'wallet') throw new Error('Only a wallet-paid sale can be refunded to the prepaid wallet.');
    else if (tenderMinor === 0) refundMethod = 'credit';
    else if (sale.paymentMethod === 'split') {
      if (values.refundMethod !== 'split') throw new Error('A split-tender sale is refunded through its original tenders; review the refund legs first.');
      refundMethod = 'split';
    } else if (values.refundMethod === 'split') throw new Error('Only a split-tender sale can be refunded through split legs.');
    else {
      refundMethod = values.refundMethod ?? 'cash';
      if (sale.paymentMethod !== refundMethod)
        throw new Error(sale.paymentMethod === 'credit'
          ? 'This return exceeds the unpaid balance of a credit sale; refunding the customer\'s repayments is not supported here.'
          : 'A refund must go back through the original single tender; this sale was not paid by that method.');
    }
    if (tenderMinor > sale.amountPaidMinor - prior.reduce((n, row) => n + row.refundedMinor, 0))
      throw new Error('This return would refund money the customer paid through later repayments, beyond the original payment; refunding repayments is not supported here. Reconcile with the owner.');
    if (tenderMinor > 0 && sale.amountPaidMinor === 0) throw new Error('This sale has no paid tender to refund.');
    // Single-tender evidence only; wallet, loyalty and split tenders remain blocked.
    if (!/^[A-Z]{3}$/.test(sale.currency ?? '') || (sale.walletAppliedMinor && refundMethod !== 'wallet') ||
        sale.loyaltyRedeemedPoints || sale.loyaltyRedeemedMinor || full.length ||
        (sale.paymentMethod === 'split' && (sale.splitTendersAtSale === undefined || sale.amountPaidMinor === 0)) ||
        (refundMethod === 'wallet' && (sale.walletAppliedMinor !== sale.amountPaidMinor || sale.amountPaidMinor !== sale.totalMinor || sale.outstandingMinor !== 0)) ||
        (sale.customerId === undefined && (sale.paymentMethod !== refundMethod || sale.outstandingMinor !== 0 || sale.amountPaidMinor !== sale.totalMinor)) ||
        (sale.paymentMethod === 'split' ? payments.length !== (sale.splitTendersAtSale?.length ?? -1) : refundMethod === 'wallet' ? payments.length !== 0 : sale.amountPaidMinor === 0 ? payments.length !== 0 :
          (payments.length !== 1 || payments[0].businessProfileId !== company || payments[0].method !== sale.paymentMethod || payments[0].amountMinor !== sale.amountPaidMinor)))
      throw new Error('This sale requires the full customer/tender refund workflow; this return lane does not support it.');
    reconcileCashPartialReturns([sale],lines,payments,prior,full);
    // Business choices (defaults: original tenders, proportional, reverse loyalty points).
    const choices = companyReturnChoices(companyProfile.returnPolicyHistory);
    // Split-tender sale: allocate the refund across the ORIGINAL tenders and require the cashier to have confirmed exactly that.
    let splitLegs: Array<{ method: 'cash'|'mobile'|'card'; amountMinor: number }> | undefined;
    if (refundMethod === 'split') {
      const refundedBefore = new Map<string, number>();
      for (const row of prior) for (const leg of row.legs ?? []) refundedBefore.set(leg.method, (refundedBefore.get(leg.method) ?? 0) + leg.amountMinor);
      const legsCapacity = sale.splitTendersAtSale!.map(t => ({ method: t.method, capacityMinor: t.amountMinor - (refundedBefore.get(t.method) ?? 0) }));
      splitLegs = allocateReturnToTenders({ valueMinor: tenderMinor, legs: legsCapacity, policy: choices.refundAllocation }) as typeof splitLegs;
      const canonical = (rows: Array<{ method: string; amountMinor: number }>) => JSON.stringify([...rows].sort((a, b) => (a.method < b.method ? -1 : 1)).map(r => [r.method, r.amountMinor]));
      if (canonical(values.confirmedLegs ?? []) !== canonical(splitLegs!))
        throw new Error(`Confirmed refund legs do not match the exact split under this business's refund policy (${choices.refundAllocation}). Review the legs again.`);
    }
    // Loyalty: take back the points the returned (tender) value earned, never driving the balance below zero.
    let loyalty: CashPartialSaleReturn['loyalty'];
    let pointsToTake = 0;
    if (customerId !== undefined) {
      const customerBenefits = (await database.customerBenefits.where('customerId').equals(customerId).toArray()).filter(row => row.businessProfileId === company && row.kind === 'points');
      const earnedEntry = customerBenefits.filter(row => row.submissionKey === `sale-points-${sale.id}`);
      if (earnedEntry.length > 1) throw new Error('Duplicate earned-points records for this sale; reconcile before returning.');
      if (earnedEntry.length === 1) {
        const balancePoints = customerBenefits.reduce((n, row) => n + row.delta, 0);
        const before = prior.reduce((n, row) => n + row.refundedMinor, 0);
        const result = pointsToReverse({ earnedPoints: earnedEntry[0].delta, paidMinor: sale.amountPaidMinor, refundedBeforeMinor: before,
          refundedAfterMinor: before + tenderMinor, balancePoints, policy: choices.loyaltyOnReturn });
        pointsToTake = result.reverse;
        loyalty = { policy: choices.loyaltyOnReturn, earnedPoints: earnedEntry[0].delta, pointsReversed: result.reverse, pointsShortfall: result.shortfall };
      }
    }
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
      if (products.has(originalLine.productId) || originalLine.stockTracked === false || !originalLine.costEventId)
        throw new Error('This return requires reconciled, uniquely tracked stock and FIFO evidence.');
      products.add(originalLine.productId);
      const product = await database.products.get(originalLine.productId);
      if (!product || product.businessProfileId !== company || product.itemKind === 'service' ||
          !Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0 ||
          !Number.isSafeInteger(product.stockQuantity + item.quantity)) throw new Error('Stock is missing or cannot be restored safely.');
      // Expiry/batch-tracked stock: returned units go back to the batches they were sold from (most recent allocation first),
      // never more per batch than that batch supplied to this line, so batch totals keep equalling on-hand stock.
      const allocations = originalLine.batchAllocations ?? [];
      const productBatches = await database.inventoryBatches.where('productId').equals(product.id).and(row=>row.businessProfileId===company).toArray();
      let batchRestorations: Array<{ batchId: string; quantity: number }> | undefined;
      if (productBatches.length || allocations.length) {
        if (!allocations.length) throw new Error('This product is batch-tracked but the original sale line has no batch allocation. Reconcile before refunding.');
        if (values.returnStoreId || sale.storeId) throw new Error('Store-specific batch provenance must be reconciled before returning tracked stock.');
        if (productBatches.reduce((sum,b)=>sum+b.quantity,0) !== product.stockQuantity) throw new Error(`Batch quantities for ${product.name} do not reconcile with stock. Reconcile before refunding.`);
        const restoredBefore = new Map<string, number>();
        for (const row of prior.flatMap(r=>r.lines).filter(r=>r.saleLineId===originalLine.id))
          for (const b of row.batchRestorations ?? []) restoredBefore.set(b.batchId,(restoredBefore.get(b.batchId)??0)+b.quantity);
        let left = item.quantity; batchRestorations = [];
        for (const a of [...allocations].reverse()) {
          if (!left) break;
          const room = a.quantity - (restoredBefore.get(a.batchId) ?? 0);
          if (room < 0) throw new Error('Existing batch restorations exceed the original allocation. Reconcile before refunding.');
          const take = Math.min(room, left); if (!take) continue;
          const batch = productBatches.find(b=>b.id===a.batchId);
          if (!batch || !Number.isSafeInteger(batch.quantity + take) || (batch.startingQuantity !== undefined && batch.quantity + take > batch.startingQuantity))
            throw new Error('A source batch is missing or cannot take the returned units back. Reconcile before refunding.');
          batchRestorations.push({ batchId: a.batchId, quantity: take }); left -= take;
        }
        if (left) throw new Error('The returned quantity exceeds what the original batches supplied to this line.');
      }
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
        note:`Partial ${refundMethod==='credit'?'credit-note':refundMethod} return of ${sale.receiptNumber}`,createdAt:now};
      await postStoreStockDelta(database,company,product.id,receivingStoreId,item.quantity,movement.id,"refund",now,product.stockQuantity,movement.resultingQuantity);
      await database.inventoryMovements.add(movement);
      await database.products.put({...product,stockQuantity:movement.resultingQuantity,updatedAt:now});
      for (const r of batchRestorations ?? []) {
        const batch = (await database.inventoryBatches.get(r.batchId))!;
        await database.inventoryBatches.put({ ...batch, quantity: batch.quantity + r.quantity });
      }
      savedLines.push({saleLineId:originalLine.id,productId:product.id,quantity:item.quantity,movementId,costEventId:event.id,...(batchRestorations?{batchRestorations}:{})});
    }
    const recorded:CashPartialSaleReturn = {
      ...(values.returnStoreId?{returnStoreId:receivingStoreId}:{}),
      policyEvidence,id:nanoid(18),businessProfileId:company,originalSaleId:sale.id,
      originalReceiptNumber:sale.receiptNumber,currency:sale.currency!,submissionKey:values.submissionKey,createdAt:now,returnSequence:prior.length+1,
      refundMethod,...(refundMethod==='split'?{legs:splitLegs!,allocationPolicy:choices.refundAllocation}:{}),...(loyalty?{loyalty}:{}),
      ...(refundMethod==='split'?(splitLegs!.some(leg=>leg.method!=='cash')?{disbursementEvidence:'staff_confirmed_manual_unverified' as const}:{}):refundMethod!=='cash'&&refundMethod!=='credit'&&refundMethod!=='wallet'?{disbursementEvidence:'staff_confirmed_manual_unverified' as const}:{}),
      ...(values.manualReference?{manualReference:values.manualReference.trim()}:{}),disposition:'restockable',refundedMinor:tenderMinor,
      ...(customerId!==undefined?{customerId,debtReducedMinor}:{}),
      returnedTaxableMinor:plan.draftTaxableMinor,returnedTaxMinor:plan.draftTaxMinor,
      returnedDiscountMinor:plan.draftDiscountMinor,lines:savedLines,
      ...(staff?{staffId:staff.id}:{}),...(shift?{shiftId:shift.id}:{})};
    reconcileCashPartialReturns([sale],lines,payments,[...prior,recorded],full);
    if (customerId!==undefined) {
      // Final conservation proof: the customer's receivable must remain valid with this credit note.
      const [s2,r2,p2]=await Promise.all([
        database.sales.where('customerId').equals(customerId).and(row=>row.businessProfileId===company).toArray(),
        database.saleReversals.where('customerId').equals(customerId).and(row=>row.businessProfileId===company).toArray(),
        database.repayments.where('customerId').equals(customerId).and(row=>row.businessProfileId===company).toArray()]);
      const existingCredit=(await database.cashPartialReturns.where('originalSaleId').anyOf(s2.map(row=>row.id)).toArray()).filter(row=>row.businessProfileId===company);
      reconcileCreditLedger(s2,r2,p2,[...existingCredit,recorded]);
    }
    if (getActiveBusinessProfileId() !== company) throw new Error("Company switched during cash refund posting.");
    await assertRun7RetailWriteReady(database.appMeta);
    const postingStaff = await requirePermission("refund",database,company);
    const postingShift = await activeStaffShift(postingStaff,database);
    if (postingStaff?.role === 'cashier' && !postingShift)
      throw new Error('Cashier shift closed before refund was recorded.');
    assertCashReturnActorUnchanged(staff,shift,postingStaff,postingShift);
    await database.cashPartialReturns.add(recorded);
    if (pointsToTake > 0) {
      await database.customerBenefits.add({id:nanoid(14),businessProfileId:company,customerId:sale.customerId!,kind:'points',delta:-pointsToTake,
        reason:`Points taken back for return of ${sale.receiptNumber}`,submissionKey:`return-points-${recorded.id}`,createdAt:now});
    }
    if (loyalty) {
      const [allBenefits,allSales,allReturns]=await Promise.all([
        database.customerBenefits.where('businessProfileId').equals(company).toArray(),
        database.sales.where('businessProfileId').equals(company).toArray(),
        database.cashPartialReturns.where('businessProfileId').equals(company).toArray()]);
      reconcileLoyaltyReturns({benefits:allBenefits,sales:allSales,returns:allReturns});
    }
    if (refundMethod === 'wallet') {
      // The refund credits the prepaid wallet (a liability). It never touches the drawer.
      await database.customerBenefits.add({id:nanoid(14),businessProfileId:company,customerId:sale.customerId!,kind:'wallet',delta:tenderMinor,
        reason:`Wallet refund for return of ${sale.receiptNumber}`,submissionKey:`return-wallet-${recorded.id}`,createdAt:now});
      const [transfers,benefits,allSales,allReversals,allReturns]=await Promise.all([
        database.walletTransfers.where('businessProfileId').equals(company).toArray(),
        database.customerBenefits.where('businessProfileId').equals(company).toArray(),
        database.sales.where('businessProfileId').equals(company).toArray(),
        database.saleReversals.where('businessProfileId').equals(company).toArray(),
        database.cashPartialReturns.where('businessProfileId').equals(company).toArray()]);
      reconcilePrepaidLiability({transfers,benefits,sales:allSales,reversals:allReversals,returns:allReturns},sale.currency!);
    }
    await database.centralOperationalEvents.add(makeCentralCashRefundEvent(recorded,sale));
    if (staff) await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:staff.id,
      action:refundMethod==='split'?'sale.partial-split-refund-manual':refundMethod==='cash'?'sale.partial-cash-refund':refundMethod==='credit'?'sale.partial-credit-note':refundMethod==='wallet'?'sale.partial-wallet-refund':`sale.partial-${refundMethod}-refund-manual`,createdAt:now,details:`${recorded.id}:${sale.id}:${recorded.refundedMinor}:${sale.currency}`});
    assertCompanyScope(company, getActiveBusinessProfileId());
    return recorded;
  });
}
