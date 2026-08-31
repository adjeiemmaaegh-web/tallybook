import type { TallybookDB } from "@/db/TallybookDB";

export const LEGACY_BUSINESS_PROFILE_ID = "primary";

let activeBusinessProfileId = LEGACY_BUSINESS_PROFILE_ID;

export function getActiveBusinessProfileId() {
  return activeBusinessProfileId;
}

export function setActiveBusinessProfileId(id: string) {
  if (!id.trim()) throw new Error("Choose a company before continuing.");
  activeBusinessProfileId = id;
}

export async function loadActiveBusinessProfileId(database: TallybookDB) {
  await database.open();
  const saved = await database.appMeta.get("activeBusinessProfileId");
  const savedProfile = saved?.value ? await database.businessProfiles.get(saved.value) : undefined;
  const fallback = savedProfile?.id ?? (await database.businessProfiles.get(LEGACY_BUSINESS_PROFILE_ID))?.id ?? (await database.businessProfiles.orderBy("updatedAt").last())?.id;
  if (fallback) {
    activeBusinessProfileId = fallback;
    if (saved?.value !== fallback) await persistActiveBusinessProfileId(fallback, database);
  }
  return activeBusinessProfileId;
}

export async function persistActiveBusinessProfileId(id: string, database: TallybookDB) {
  setActiveBusinessProfileId(id);
  await database.appMeta.put({ key: "activeBusinessProfileId", value: id, updatedAt: new Date().toISOString() });
}

export async function getLocalCompanyProfiles(database: TallybookDB) {
  return database.businessProfiles.orderBy("name").toArray();
}

export async function clearCompanyData(companyId: string, database: TallybookDB) {
  if (!companyId.trim()) throw new Error("Choose a company before clearing data.");
  await database.transaction("rw", [
    database.businessProfiles, database.categories, database.products, database.inventoryMovements,
    database.customers, database.sales, database.saleLines, database.payments, database.receipts,
    database.customerActivities, database.repayments, database.mobileMoneyProviders, database.suppliers,
    database.purchases, database.purchaseLines, database.expenses,
  ], async () => {
    const scopedTables = [
      database.categories, database.products, database.inventoryMovements, database.customers,
      database.sales, database.saleLines, database.payments, database.receipts, database.customerActivities,
      database.repayments, database.mobileMoneyProviders, database.suppliers, database.purchases,
      database.purchaseLines, database.expenses,
    ];
    for (const table of scopedTables) {
      const records = await table.where("businessProfileId").equals(companyId).toArray();
      if (records.length) await table.bulkDelete(records.map((record) => record.id));
    }
    await database.businessProfiles.delete(companyId);
  });
  const next = (await getLocalCompanyProfiles(database))[0];
  if (next) await persistActiveBusinessProfileId(next.id, database);
  else {
    activeBusinessProfileId = LEGACY_BUSINESS_PROFILE_ID;
    await database.appMeta.delete("activeBusinessProfileId");
  }
}
