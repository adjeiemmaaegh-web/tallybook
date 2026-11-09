import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { requirePermission, currentStaffId } from '@/features/staff/staff';
import { prepareCashReturnReview, type CashReturnReview } from './cashReturnReview.mjs';
import { assertCashReturnStockLinks } from './cashReturnStockLinks.mjs';
import {authorizeReturnPolicy} from '@/features/business/returnPolicy.mjs';

/** A consistent local snapshot, NOT approval or permission to pay out cash. */
export async function getCashReturnReview(originalSaleId: string, database: TallybookDB = db): Promise<CashReturnReview> {
  const company = getActiveBusinessProfileId();
  if (!company || typeof originalSaleId !== 'string' || !originalSaleId.trim()) throw new Error('Select a saved sale for return review.');
  return database.transaction('r', [database.businessProfiles, database.sales, database.saleLines, database.payments, database.receipts,
    database.cashPartialReturns, database.saleReversals, database.products, database.inventoryCostEvents,
    database.inventoryBatches, database.inventoryMovements, database.staffMembers, database.storeStockModes, database.storeLocations], async () => {
    const actor=await requirePermission('refund',database,company);
    const originalActorId=currentStaffId(company);
    const sale = await database.sales.get(originalSaleId);
    if (!sale || sale.businessProfileId !== company) throw new Error('This sale is not available in the active company.');
    const companyProfile=await database.businessProfiles.get(company);
    if(!companyProfile)throw new Error('The selected company has no saved return policy.');
    authorizeReturnPolicy(companyProfile.returnPolicyHistory,sale,'partialCash',new Date().toISOString());
    const [saleLines, payments, receipts, priorReturns, fullReversals] = await Promise.all([
      database.saleLines.where('saleId').equals(sale.id).toArray(),
      database.payments.where('saleId').equals(sale.id).toArray(),
      database.receipts.where('saleId').equals(sale.id).toArray(),
      database.cashPartialReturns.where('originalSaleId').equals(sale.id).toArray(),
      database.saleReversals.where('originalSaleId').equals(sale.id).toArray(),
    ]);
    const productIds = [...new Set(saleLines.map(line=>line.productId))];
    const [products, costEvents, batches] = await Promise.all([
      database.products.bulkGet(productIds),
      database.inventoryCostEvents.bulkGet(saleLines.map(line=>line.costEventId ?? '')),
      Promise.all(productIds.map(id=>database.inventoryBatches.where('productId').equals(id).toArray())).then(groups=>groups.flat()),
    ]);
    const priorRows = priorReturns.flatMap(ret => ret.lines);
    const [priorMovements, priorCostEvents] = await Promise.all([
      database.inventoryMovements.bulkGet(priorRows.map(row => row.movementId)),
      database.inventoryCostEvents.bulkGet(priorRows.map(row => row.costEventId)),
    ]);
    if (getActiveBusinessProfileId() !== company || currentStaffId(company)!==originalActorId)
      throw new Error('Company or refund-review session changed during return review.');
    const stillAuthorized=await requirePermission('refund',database,company);
    if(stillAuthorized?.id!==actor?.id)
      throw new Error('Return reviewer authorization changed; unlock again.');
    assertCashReturnStockLinks(sale, saleLines, priorReturns,
      priorMovements.filter((item): item is NonNullable<typeof item> => Boolean(item)),
      [...costEvents, ...priorCostEvents].filter((item): item is NonNullable<typeof item> => Boolean(item)));
    const storeMode=Boolean(await database.storeStockModes.get(company));
    const receivingStores=storeMode?(await database.storeLocations.where("businessProfileId").equals(company).toArray()).filter(store=>store.status==="active").map(({id,name})=>({id,name})):[];
    if(getActiveBusinessProfileId()!==company||currentStaffId(company)!==originalActorId)throw new Error("Company or reviewer changed while reading receiving stores.");
    return {...prepareCashReturnReview({company,sale,saleLines,payments,receipts,priorReturns,fullReversals,
      products: products.filter((p): p is NonNullable<typeof p> => Boolean(p)),
      costEvents:costEvents.filter((e):e is NonNullable<typeof e>=>Boolean(e)),batches}),storeMode,receivingStores};
  });
}
