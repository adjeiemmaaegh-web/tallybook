import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import { activeStaffShift, requirePermission } from "@/features/staff/staff";
import { nanoid } from "nanoid";
import { postStoreStockDelta } from "@/features/stores/storeStockLedger";
import type { TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { formatMinorAmount, type InventoryMovement } from "@/features/inventory/inventory";
import { appendInventoryCostChange, restoreInventoryCost } from "@/features/inventory/costLedger";
import { assertDebtReversalIsUnallocatedPaymentSafe } from "@/features/sales/reversalDebtGuard.mjs";
import {authorizeReturnPolicy,type ReturnPolicyEvidence} from '@/features/business/returnPolicy.mjs';

export interface SaleReversalLine { productId: string; productName: string; quantity: number; restoredQuantity: number }
export interface SaleReversal {
  /** Immutable sale-time and decision-time company policy evidence. */
  policyEvidence?:ReturnPolicyEvidence;
  id: string;
  businessProfileId: string;
  originalSaleId: string;
  originalReceiptNumber: string;
  customerId?: string;
  createdAt: string;
  submissionKey: string;
  reversedSaleTotalMinor: number;
  reversedReceivedMinor: number;
  reversedOutstandingMinor: number;
  lines: SaleReversalLine[];
  staffId?: string;
  shiftId?: string;
}
export interface ReversalPreview { saleId: string; receiptNumber: string; totalMinor: number; createdAt: string; lines: Array<{ productName: string; quantity: number }>; text: string; reversal?: SaleReversal }

async function latestReversibleSale(database: TallybookDB, activeId: string) {
  const sales = (await database.sales.where("businessProfileId").equals(activeId).toArray())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  for (const sale of sales) {
    const existing = await database.saleReversals.where("originalSaleId").equals(sale.id).first();
    const partial = await database.cashPartialReturns.where("originalSaleId").equals(sale.id).first();
    if (!existing && !partial) return sale;
  }
  return undefined;
}

export async function prepareLatestSaleReversal(currency: string, database: TallybookDB): Promise<ReversalPreview> {
  const activeId = getActiveBusinessProfileId();
  const sale = await latestReversibleSale(database, activeId);
  if (!sale) throw new Error("I couldn't find a completed sale that has not already been reversed.");
  const profile=await database.businessProfiles.get(activeId);
  if(!profile)throw new Error('The selected company has no saved refund policy.');
  // Advisory read-only preview; the posting transaction reauthorizes against
  // the latest revision and checks staff/shift/financial safety independently.
  authorizeReturnPolicy(profile.returnPolicyHistory,sale,'full',new Date().toISOString());
  if(getActiveBusinessProfileId()!==activeId)throw new Error('Company changed during reversal review.');
  const lines = await database.saleLines.where("saleId").equals(sale.id).toArray();
  const products = await Promise.all(lines.map((line) => database.products.get(line.productId)));
  const named = lines.map((line, index) => ({ productName: products[index]?.name ?? line.productName ?? "Unknown product", quantity: line.quantity }));
  return { saleId: sale.id, receiptNumber: sale.receiptNumber, totalMinor: sale.totalMinor, createdAt: sale.createdAt, lines: named, text: `I found sale ${sale.receiptNumber} recorded ${new Date(sale.createdAt).toLocaleString()}. Total: ${formatMinorAmount(sale.totalMinor, currency)}. I can prepare an audit-preserving reversal; the original sale will remain in history and nothing is changed yet.` };
}

export async function executeLatestSaleReversal(currency: string, database: TallybookDB, submissionKey = `reversal-${nanoid(18)}`): Promise<SaleReversal> {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => executeLatestSaleReversalWhileLocked(currency, database, submissionKey));
}

async function executeLatestSaleReversalWhileLocked(currency: string, database: TallybookDB, submissionKey = `reversal-${nanoid(18)}`): Promise<SaleReversal> {
  const activeId = getActiveBusinessProfileId();
  return database.transaction("rw", [database.appMeta, database.businessProfiles, database.saleReversals, database.cashPartialReturns, database.sales, database.saleLines, database.products, database.inventoryMovements, database.inventoryCostEvents, database.inventoryBatches, database.customerBenefits, database.staffAudits, database.staffMembers, database.staffShifts, database.repayments, database.storeStockModes, database.storeStockEntries, database.storeLocations, database.storeAssignments, database.storeTransferRequests], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const staff = await requirePermission("refund", database, activeId);
    const shift = await activeStaffShift(staff, database);
    if (staff?.role === 'cashier' && !shift) throw new Error('Open a shift before reversing a sale.');
    if (typeof submissionKey !== 'string' || !/^[A-Za-z0-9:_-]{8,100}$/.test(submissionKey))
      throw new Error('Invalid reversal submission key.');
    const reversalMatches = await database.saleReversals.where("submissionKey").equals(submissionKey).toArray();
    if (reversalMatches.length > 1) throw new Error("Reversal submission key has duplicate saved records.");
    const existingByKey = reversalMatches[0];
    if (existingByKey && existingByKey.businessProfileId !== activeId) throw new Error("Reversal key belongs to another company.");
    if (existingByKey) {
      const original = await database.sales.get(existingByKey.originalSaleId);
      if (!original || original.businessProfileId !== activeId || existingByKey.originalReceiptNumber !== original.receiptNumber ||
          existingByKey.customerId !== original.customerId || existingByKey.reversedSaleTotalMinor !== -original.totalMinor ||
          existingByKey.reversedReceivedMinor !== -original.amountPaidMinor || existingByKey.reversedOutstandingMinor !== -original.outstandingMinor)
        throw new Error('Saved reversal retry does not reconcile with its original sale.');
      return existingByKey;
    }
    const sale = await latestReversibleSale(database, activeId);
    if (!sale) throw new Error("I couldn't find a completed sale that has not already been reversed.");
    const currentProfile=await database.businessProfiles.get(activeId);
    if(!currentProfile)throw new Error('Company return policy is unavailable.');
    const now=new Date().toISOString();
    const policyEvidence=authorizeReturnPolicy(currentProfile.returnPolicyHistory,sale,'full',now);
    if (sale.customerId) {
      const debts = await database.sales.where("customerId").equals(sale.customerId).and(row => row.businessProfileId === activeId).toArray();
      const reversals = await database.saleReversals.where("businessProfileId").equals(activeId).and(row => row.customerId === sale.customerId).toArray();
      const repayments = await database.repayments.where("customerId").equals(sale.customerId).and(row => row.businessProfileId === activeId).toArray();
      assertDebtReversalIsUnallocatedPaymentSafe(sale, debts, reversals, repayments);
    }
    const lines = await database.saleLines.where("saleId").equals(sale.id).toArray();
    if (!lines.length) throw new Error("The sale has no lines, so it cannot be reversed safely.");
    const products = await Promise.all(lines.map((line) => database.products.get(line.productId)));
    if (products.some((product) => !product || product.businessProfileId !== activeId)) throw new Error("A product from this sale is no longer available in this company.");
    const resolvedProducts = products as NonNullable<typeof products[number]>[];
    // Historical sale lines may contain the same product more than once. Restore
    // each product once using the sum of its lines, not repeated stale snapshots.
    const restoreByProduct = new Map<string, number>();
    for (const [index, line] of lines.entries()) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw new Error("Invalid original sale line quantity.");
      if (line.stockTracked === false || (line.stockTracked === undefined && resolvedProducts[index].itemKind === "service")) continue;
      const previous = restoreByProduct.get(line.productId) ?? 0;
      const updated = previous + line.quantity;
      if (!Number.isSafeInteger(updated)) throw new Error("Stock restoration quantity exceeds safe limits.");
      restoreByProduct.set(line.productId, updated);
    }
    const restoredStock = new Map<string, number>();
    const movements: InventoryMovement[] = [];
    for (const [productId, quantity] of restoreByProduct) {
      const product = resolvedProducts.find(item => item.id === productId)!;
      const restored = product.stockQuantity + quantity;
      if (!Number.isSafeInteger(restored) || restored < 0) throw new Error("Stock restoration would create an invalid quantity.");
      restoredStock.set(productId, restored);
      movements.push({ id: nanoid(14), businessProfileId: activeId, productId,
        movementType: "reversal", quantityDelta: quantity,
        previousQuantity: product.stockQuantity, resultingQuantity: restored,
        note: `Reversal of sale ${sale.receiptNumber}`, createdAt: now });
    }
    const reversalLines: SaleReversalLine[] = lines.map((line, index) => ({
      productId: line.productId, productName: line.productName,
      quantity: line.quantity,
      restoredQuantity: !restoreByProduct.has(line.productId)
        ? resolvedProducts[index].stockQuantity : restoredStock.get(line.productId)!
    }));
    for (const movement of movements) {
      const product = resolvedProducts.find(p => p.id === movement.productId)!;
      const originalLines = lines.filter(line => line.productId === product.id);
      const linked = originalLines.filter(line => line.costEventId);
      if (linked.length && (linked.length !== 1 || originalLines.length !== 1)) throw new Error("Sale cost allocations need reconciliation before reversal.");
      if (linked.length) {
        const originalCost = await database.inventoryCostEvents.get(linked[0].costEventId!);
        if (!originalCost || originalCost.saleLineId !== linked[0].id || originalCost.quantityDelta !== -movement.quantityDelta) throw new Error("Sale cost allocations need reconciliation before reversal.");
        await restoreInventoryCost(database, product, linked[0].costEventId!, { sourceId: movement.id, createdAt: now, saleId: sale.id });
      }
      else await appendInventoryCostChange(database, product, movement.quantityDelta, { sourceId: movement.id, createdAt: now, saleId: sale.id });
      const batches = await database.inventoryBatches.where("productId").equals(product.id).and(batch => batch.businessProfileId === activeId).toArray();
      const allocations = originalLines.flatMap(line => line.batchAllocations ?? []);
      if (batches.length && allocations.reduce((sum, a) => sum + a.quantity, 0) !== movement.quantityDelta) throw new Error("Original batch allocations are unavailable; reconcile before reversing tracked stock.");
      for (const allocation of allocations) {
        const batch = batches.find(b => b.id === allocation.batchId);
        if (!batch || !Number.isSafeInteger(allocation.quantity) || allocation.quantity <= 0 || !Number.isSafeInteger(batch.quantity + allocation.quantity)) throw new Error("Invalid original batch allocation.");
        batch.quantity += allocation.quantity;
        await database.inventoryBatches.put(batch);
      }
    }
    const reversal: SaleReversal = {policyEvidence, id: nanoid(14), businessProfileId: activeId, originalSaleId: sale.id, originalReceiptNumber: sale.receiptNumber, customerId: sale.customerId, createdAt: now, submissionKey, reversedSaleTotalMinor: -sale.totalMinor, reversedReceivedMinor: -sale.amountPaidMinor, reversedOutstandingMinor: -sale.outstandingMinor, lines: reversalLines, ...(staff?{staffId:staff.id}:{}),...(shift?{shiftId:shift.id}:{}) };
    if (sale.customerId) {
      const linked = (await database.customerBenefits.where("customerId").equals(sale.customerId).toArray())
        .filter(entry => entry.businessProfileId === activeId &&
          (entry.submissionKey === `sale-points-${sale.id}` || entry.submissionKey === `sale-wallet-${sale.id}` || entry.submissionKey === `sale-redeemed-${sale.id}`));
      const benefitKeys = new Set(linked.map(entry => entry.submissionKey));
      if (linked.length > 3 || benefitKeys.size !== linked.length)
        throw new Error("Duplicate customer benefits for this sale; reconcile before reversal.");
      for (const entry of linked) {
        const entries = (await database.customerBenefits.where("customerId").equals(sale.customerId).toArray())
          .filter(row => row.businessProfileId === activeId && row.kind === entry.kind);
        const available = entries.reduce((sum, row) => {
          if (!Number.isSafeInteger(row.delta) || !Number.isSafeInteger(sum + row.delta))
            throw new Error("Customer benefit history exceeds safe balance limits.");
          return sum + row.delta;
        }, 0);
        if (!Number.isSafeInteger(available - entry.delta) || available - entry.delta < 0)
          throw new Error("Customer rewards were already spent. Reconcile the benefit balance before reversing this sale.");
        await database.customerBenefits.add({ id: nanoid(14), businessProfileId: activeId,
          customerId: sale.customerId, kind: entry.kind, delta: -entry.delta,
          reason: `Reversal of ${sale.receiptNumber}`, submissionKey: `reversal-benefit-${entry.id}`,
          createdAt: now });
      }
    }
    if(getActiveBusinessProfileId()!==activeId)
      throw new Error('Company changed before completing the full reversal.');
    await assertRun7RetailWriteReady(database.appMeta);
    const postingStaff = await requirePermission('refund',database,activeId);
    const postingShift = await activeStaffShift(postingStaff,database);
    if (postingStaff?.role === 'cashier' && !postingShift)
      throw new Error('Cashier shift closed before sale reversal was recorded.');
    await database.saleReversals.add(reversal);
    if(staff)await database.staffAudits.add({id:nanoid(14),businessProfileId:activeId,staffId:staff.id,action:'sale.reversed',createdAt:now,details:reversal.id});
    await Promise.all(Array.from(restoredStock, async ([productId, stockQuantity]) => {
      const product = resolvedProducts.find(item => item.id === productId)!;
      await database.products.put({ ...product, stockQuantity, updatedAt: now });
    }));
    for(const movement of movements) await postStoreStockDelta(database,activeId,movement.productId,sale.storeId,movement.quantityDelta,movement.id,"refund",now,movement.previousQuantity,movement.resultingQuantity);
    await database.inventoryMovements.bulkAdd(movements);
    void currency;
    return reversal;
  });
}
