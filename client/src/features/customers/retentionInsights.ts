/** Read-only, local customer purchasing insights. Management information, not a prediction. */
import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';

export interface CustomerRetentionSummary {
  completedSales: number;
  recordedSalesMinor: number;
  lastPurchaseAt?: string;
  daysSinceLastPurchase?: number;
  recent90DaySales: number;
  prior90DaySales: number;
  trend: 'increasing' | 'decreasing' | 'unchanged' | 'insufficient-history';
}

export function calculateCustomerRetention(sales: ReadonlyArray<{createdAt:string;totalMinor:number}>, now: Date = new Date()): CustomerRetentionSummary {
  const instant = now.getTime();
  if (!Number.isFinite(instant)) throw new Error('Invalid report date.');
  let recordedSalesMinor = 0;
  let recent90DaySales = 0;
  let prior90DaySales = 0;
  let latest = -Infinity;
  for (const sale of sales) {
    const stamp = Date.parse(sale.createdAt);
    if (!Number.isFinite(stamp) || stamp > instant || !Number.isSafeInteger(sale.totalMinor) || sale.totalMinor < 0) {
      throw new Error('Customer sales require reconciliation before retention analysis.');
    }
    recordedSalesMinor += sale.totalMinor;
    if (!Number.isSafeInteger(recordedSalesMinor)) throw new Error('Customer sales exceed safe reporting precision.');
    latest = Math.max(latest, stamp);
    const ageDays = (instant - stamp) / 86400000;
    if (ageDays < 90) recent90DaySales++;
    else if (ageDays < 180) prior90DaySales++;
  }
  const trend = sales.length === 0 || (recent90DaySales === 0 && prior90DaySales === 0) ? 'insufficient-history'
    : recent90DaySales > prior90DaySales ? 'increasing'
    : recent90DaySales < prior90DaySales ? 'decreasing' : 'unchanged';
  return { completedSales: sales.length, recordedSalesMinor, ...(latest === -Infinity ? {} : {
    lastPurchaseAt: new Date(latest).toISOString(), daysSinceLastPurchase: Math.floor((instant - latest) / 86400000)
  }), recent90DaySales, prior90DaySales, trend };
}

export async function getCustomerRetention(customerId:string, database:TallybookDB=db, now:Date=new Date()) {
  const businessProfileId = getActiveBusinessProfileId();
  return database.transaction('r', [database.customers, database.sales], async () => {
    const customer=await database.customers.get(customerId);
    if(!customer || customer.businessProfileId !== businessProfileId || customer.archivedAt) throw new Error('Customer is unavailable.');
    const sales=await database.sales.where('customerId').equals(customerId)
      .and(s => s.businessProfileId === businessProfileId && s.status === 'completed').toArray();
    return calculateCustomerRetention(sales,now);
  });
}
