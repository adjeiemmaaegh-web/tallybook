/**
 * Run 13 administrative store allocation preview.
 *
 * Strictly read-only: existing store observations are not authoritative balances
 * and transfer requests are not completed inventory transfers. The allocations
 * supplied here are hypothetical, never persisted or substituted for sales stock.
 */
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission } from "@/features/staff/staff";
import { reconcileStoreStockPlan } from "./run13StockConservation.mjs";

export interface PlannedOpeningAllocation {
  businessProfileId: string;
  storeId: string;
  productId: string;
  quantity: number;
}

export interface PlannedStoreTransfer {
  id: string;
  businessProfileId: string;
  sourceStoreId: string;
  destinationStoreId: string;
  productId: string;
  quantity: number;
}

export interface StorePlanningPreview {
  readonly authoritative: false;
  readonly plannedOnly: true;
  readonly companyId: string;
  readonly companyStockUnchanged: true;
  readonly balances: Array<{storeId: string; productId: string; quantity: number}>;
  readonly unallocated: Array<{productId: string; quantity: number}>;
  readonly transferCount: number;
}

/**
 * Read all source records and perform report authorization in one consistent
 * company-scoped Dexie transaction. Do not construct an allocation from physical
 * count observations: counts and requests have no ledger authority.
 */
export async function previewStoreStockPlan(
  allocations: PlannedOpeningAllocation[],
  transfers: PlannedStoreTransfer[] = [],
  database: TallybookDB = db
): Promise<StorePlanningPreview> {
  const company = getActiveBusinessProfileId();
  const result = await database.transaction(
    "r",
    [database.businessProfiles, database.staffMembers, database.storeLocations, database.products],
    async () => {
      await requirePermission("reports", database, company);
      if (!(await database.businessProfiles.get(company))) throw new Error("Active company is unavailable.");
      const [stores, products] = await Promise.all([
        database.storeLocations.where("businessProfileId").equals(company).toArray(),
        database.products.where("businessProfileId").equals(company).toArray(),
      ]);
      if (getActiveBusinessProfileId() !== company)
        throw new Error("Company changed during store allocation preview.");
      const stockProducts = products.filter(product => !product.archivedAt && product.itemKind !== "service");
      if (products.some(product => product.businessProfileId !== company) ||
          stores.some(store => store.businessProfileId !== company))
        throw new Error("Cross-company data detected in store preview.");
      return reconcileStoreStockPlan({
        companyId: company, products: stockProducts, stores, allocations, transfers,
      });
    }
  );
  if (getActiveBusinessProfileId() !== company) throw new Error("Company changed after preview.");
  await requirePermission("reports", database, company);
  return {
    ...result,
    companyId: company,
    authoritative: false,
    plannedOnly: true,
    companyStockUnchanged: true,
  };
}
