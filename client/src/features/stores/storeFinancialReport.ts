import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { currentStaffId, requirePermission } from "@/features/staff/staff";
import {
  getFinancialSummary,
  type FinancialPeriod,
} from "@/features/reports/financialIntelligence";
import { validateRun12SaleTaxEvidence } from "@/features/reports/run12SaleTaxAudit.mjs";
import { reconcileSaleCosts } from "@/features/reports/costReconciliation";

/** Sale contribution belongs to the original selling store. Receiving a return
 * elsewhere moves physical stock, never historical revenue attribution.
 * Company expenses and pooled FIFO assets are not arbitrarily split by store. */
export async function getStoreFinancialReport(
  period: FinancialPeriod = "month",
  database: TallybookDB = db,
  now = new Date()
) {
  const company = getActiveBusinessProfileId(),
    staff = currentStaffId(company);
  return database.transaction("r", database.tables, async () => {
    await requirePermission("reports", database, company);
    const summary = await getFinancialSummary(
      period,
      now,
      undefined,
      undefined,
      database
    );
    const [
      profile,
      stores,
      sales,
      reversals,
      cashReturns,
      products,
      events,
      movements,
      lines,
      purchases,
      purchaseLines,
    ] = await Promise.all([
      database.businessProfiles.get(company),
      database.storeLocations
        .where("businessProfileId")
        .equals(company)
        .toArray(),
      database.sales.where("businessProfileId").equals(company).toArray(),
      database.saleReversals
        .where("businessProfileId")
        .equals(company)
        .toArray(),
      database.cashPartialReturns
        .where("businessProfileId")
        .equals(company)
        .toArray(),
      database.products.where("businessProfileId").equals(company).toArray(),
      database.inventoryCostEvents
        .where("businessProfileId")
        .equals(company)
        .toArray(),
      database.inventoryMovements
        .where("businessProfileId")
        .equals(company)
        .toArray(),
      database.saleLines.where("businessProfileId").equals(company).toArray(),
      database.purchases.where("businessProfileId").equals(company).toArray(),
      database.purchaseLines
        .where("businessProfileId")
        .equals(company)
        .toArray(),
    ]);
    if (!profile) throw Error("Company profile unavailable.");
    const storeIds = new Set(stores.map(store => store.id));
    if (sales.some(sale => sale.storeId && !storeIds.has(sale.storeId)))
      throw Error("Sale references a missing store.");
    const within = (date: string) =>
      new Date(date) >= summary.range.start &&
      new Date(date) < summary.range.end;
    const exact = (values: number[]) => {
      let total = 0;
      for (const value of values) {
        if (
          !Number.isSafeInteger(value) ||
          !Number.isSafeInteger(total + value)
        )
          throw Error("Store financial arithmetic exceeds safe precision.");
        total += value;
      }
      return total;
    };
    const saleById = new Map(sales.map(sale => [sale.id, sale]));
    const rows = [
      ...stores.map(store => ({
        id: store.id as string | undefined,
        name: store.name,
      })),
      { id: undefined, name: "Historical sales without a store" },
    ].map(store => {
      const attributed = sales.filter(sale => sale.storeId === store.id);
      const ids = new Set(attributed.map(sale => sale.id));
      const posted = attributed.filter(sale => within(sale.createdAt));
      const returned = reversals.filter(
        row => ids.has(row.originalSaleId) && within(row.createdAt)
      );
      const partial = cashReturns.filter(
        row => ids.has(row.originalSaleId) && within(row.createdAt)
      );
      const netSalesMinor = exact([
        ...posted.map(sale => sale.totalMinor),
        ...returned.map(row => row.reversedSaleTotalMinor),
        ...partial.map(row => -row.refundedMinor),
      ]);
      const recordedTaxMinor = exact([
        ...posted.map(sale => sale.tax?.taxMinor ?? 0),
        ...returned.map(
          row => -(saleById.get(row.originalSaleId)?.tax?.taxMinor ?? 0)
        ),
        ...partial.map(row => -row.returnedTaxMinor),
      ]);
      const costs = reconcileSaleCosts(
        company,
        {
          sales,
          reversals,
          cashReturns,
          products,
          events,
          movements,
          lines,
          purchases,
          purchaseLines,
          expectedCurrency: profile.currency,
        },
        summary.range,
        ids
      );
      const revenueExTaxMinor = exact([netSalesMinor, -recordedTaxMinor]);
      const taxKnown = [
        ...posted,
        ...returned.map(row => saleById.get(row.originalSaleId)!),
        ...partial.map(row => saleById.get(row.originalSaleId)!),
      ].every(sale => validateRun12SaleTaxEvidence(sale).verified);
      return {
        storeId: store.id,
        name: store.name,
        saleCount: posted.length,
        netSalesMinor,
        recordedTaxMinor,
        revenueExTaxMinor,
        cogsMinor: costs.cogsMinor,
        contributionMinor:
          taxKnown && costs.cogsMinor !== undefined
            ? exact([revenueExTaxMinor, -costs.cogsMinor])
            : undefined,
      };
    });
    if (
      exact(rows.map(row => row.netSalesMinor)) !== summary.revenueMinor ||
      exact(rows.map(row => row.recordedTaxMinor)) !==
        summary.recordedTaxMinor ||
      (summary.cogsMinor !== undefined &&
        (rows.some(row => row.cogsMinor === undefined) ||
          exact(rows.map(row => row.cogsMinor!)) !== summary.cogsMinor))
    )
      throw Error(
        "Store totals do not reconcile with company financial evidence."
      );
    if (
      getActiveBusinessProfileId() !== company ||
      currentStaffId(company) !== staff
    )
      throw Error("Company or staff session changed during financial review.");
    return {
      rows,
      currency: profile.currency,
      range: summary.range,
      companyExpensesMinor: summary.expensesMinor,
    };
  });
}
