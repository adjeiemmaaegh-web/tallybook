import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission } from "@/features/staff/staff";
import { getReportsSnapshot, type ReportPeriod } from "@/features/reports/reports";
import { createAdvancedInsights, createLocalInsights, type AdvancedInsight } from "./localInsights.mjs";

export async function getInsightFindings(period: ReportPeriod, now = new Date(), database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  return database.transaction("r", database.tables, async () => {
    await requirePermission("reports", database, company);
    const snapshot = await getReportsSnapshot(period, now, database);
    const [batches, products, lines, reversals] = await Promise.all([
      database.inventoryBatches.where("businessProfileId").equals(company).toArray(), database.products.where("businessProfileId").equals(company).toArray(),
      database.saleLines.where("businessProfileId").equals(company).toArray(), database.saleReversals.where("businessProfileId").equals(company).toArray(),
    ]);
    const names = new Map(products.map(product => [product.id, product.name]));
    const batchRows = batches.filter(batch => batch.expiryDate && names.has(batch.productId)).map(batch => ({ companyId: company, batchId: batch.id, productName: names.get(batch.productId)!, remainingQuantity: batch.quantity, expiryDate: batch.expiryDate! }));
    const reversed = new Set(reversals.filter(reversal => new Date(reversal.createdAt) <= now).map(reversal => reversal.originalSaleId));
    const selected = new Set(snapshot.sales.filter(sale => !reversed.has(sale.id)).map(sale => sale.id));
    const units = new Map<string, number>();
    for (const line of lines.filter(line => selected.has(line.saleId))) {
      const sum = (units.get(line.productId) ?? 0) + line.quantity;
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(sum) || !names.has(line.productId)) throw new Error("Product sales evidence needs reconciliation before showing demand.");
      units.set(line.productId, sum);
    }
    const demand: AdvancedInsight[] = [...units].map(([productId, quantity]) => ({ id: `units:${productId}`, kind: "demand", severity: "information", title: `Recorded unit sales: ${names.get(productId)}`, evidence: `${quantity} base units on non-reversed sales in ${snapshot.range.label.toLocaleLowerCase()}. This is observed sales volume; missing history and out-of-stock days can reduce it.`, action: "Review the recorded period and stock availability before planning a purchase", href: "/reports" }));
    await requirePermission("reports", database, company);
    return [...createLocalInsights(snapshot), ...createAdvancedInsights(snapshot, { companyId: company, now: now.toISOString(), batchRows }), ...demand];
  });
}
