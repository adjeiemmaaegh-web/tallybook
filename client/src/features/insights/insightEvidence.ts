import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission,currentStaffId } from "@/features/staff/staff";
import { getReportsSnapshot, type ReportPeriod } from "@/features/reports/reports";
import { createAdvancedInsights, createLocalInsights, type AdvancedInsight } from "./localInsights.mjs";
import {deriveSkuDemand} from './skuDemand.mjs';

export async function getInsightFindings(period: ReportPeriod, now = new Date(), database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  return database.transaction("r", database.tables, async () => {
    await requirePermission("reports", database, company);
    const actor=currentStaffId(company);
    const snapshot = await getReportsSnapshot(period, now, database);
    const [batches, products, lines, reversals,sales,payments,returns] = await Promise.all([
      database.inventoryBatches.where("businessProfileId").equals(company).toArray(), database.products.where("businessProfileId").equals(company).toArray(),
      database.saleLines.where("businessProfileId").equals(company).toArray(), database.saleReversals.where("businessProfileId").equals(company).toArray(),
      database.sales.where('businessProfileId').equals(company).toArray(),
      database.payments.where('businessProfileId').equals(company).toArray(),
      database.cashPartialReturns.where('businessProfileId').equals(company).toArray(),
    ]);
    const names = new Map(products.map(product => [product.id, product.name]));
    const batchRows = batches.filter(batch => batch.expiryDate && names.has(batch.productId)).map(batch => ({ companyId: company, batchId: batch.id, productName: names.get(batch.productId)!, remainingQuantity: batch.quantity, expiryDate: batch.expiryDate! }));
    const unitRows=deriveSkuDemand({company,products,sales,lines,payments,reversals,returns,
      startMs:snapshot.range.start?.getTime()??0,endMs:snapshot.range.end.getTime(),asOfMs:now.getTime(),
      windowDays:period==='all'?null:period==='today'?1:7});
    const demand:AdvancedInsight[]=unitRows.flatMap(row=>{
      const items:AdvancedInsight[]=[{id:`units:${row.productId}`,kind:'demand',severity:'information',
        title:`Net recorded unit sales: ${row.productName}`,
        evidence:`${row.netUnits} base units from ${row.soldUnits} sold less ${row.returnedUnits} returned, excluding full reversals, in ${snapshot.range.label.toLowerCase()}. Returns are counted through this review. Missing history and stock-outs can reduce observed volume.`,
        action:'Review original sale lines and returns before planning purchases',href:'/reports'}];
      if(row.reorderUnits!==null)items.push({id:`coverage:${row.productId}`,kind:'reorder',severity:'information',
        title:`Stock coverage scenario: ${row.productName}`,
        evidence:`${row.netUnits} net units over ${row.windowDays} calendar day(s), including today's incomplete day. At that recorded pace, ${row.horizonDays}-day coverage is ${row.coverageUnits} units; saved stock ${row.stockQuantity}; possible replenishment ${row.reorderUnits} units. This is arithmetic, not a demand forecast.`,
        action:'Check shelf stock, reservations, incoming orders, lead time and missing history before deciding an order quantity',href:'/inventory'});
      return items;
    });
    if(getActiveBusinessProfileId()!==company||currentStaffId(company)!==actor)
      throw Error('Company or reports session changed during the insight query.');
    await requirePermission("reports", database, company);
    return [...createLocalInsights(snapshot), ...createAdvancedInsights(snapshot, { companyId: company, now: now.toISOString(), batchRows })
      .filter(item=>item.kind!=='demand'&&item.kind!=='reorder'), ...demand];
  });
}
