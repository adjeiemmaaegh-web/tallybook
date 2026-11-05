/**
 * Reads this phone's books (one local company) into an opening-balance import
 * for the shared shop: products with their selling prices, stores, and the
 * units on hand right now. Past sales are NOT moved; they stay in this phone's
 * books as history before the switch. Only the local owner may export.
 */
import type { TallybookDB } from "@/db/TallybookDB";
import { requirePermission } from "@/features/staff/staff";
import { readStoreBalances } from "@/features/stores/storeStockLedger";
import type { OpeningImport } from "./shopClient";

export interface LocalBooksSnapshot {
  profileId: string;
  businessName: string;
  /** Per-store quantities exist on this phone; otherwise stock is one company-wide count. */
  hasStores: boolean;
  /** Services and archived products are not stocked items, so they are left out. */
  skipped: { services: number; archived: number };
  books: OpeningImport;
}

const LOCAL_ID = /^[A-Za-z0-9_-]{1,80}$/;

export async function readLocalBooks(database: TallybookDB, profileId: string): Promise<LocalBooksSnapshot> {
  await requirePermission("staff", database, profileId);
  const profile = await database.businessProfiles.get(profileId);
  if (!profile) throw new Error("Set up this business on this phone first.");
  const all = await database.products.where("businessProfileId").equals(profileId).toArray();
  const services = all.filter(p => !p.archivedAt && p.itemKind === "service").length;
  const archived = all.filter(p => p.archivedAt).length;
  const products = all.filter(p => !p.archivedAt && p.itemKind !== "service");
  for (const p of products) if (!LOCAL_ID.test(p.id)) throw new Error(`Product "${p.name}" has an id the shared shop can't read.`);

  const storeMode = await database.storeStockModes.get(profileId);
  const stores = storeMode
    ? (await database.storeLocations.where("businessProfileId").equals(profileId).toArray()).filter(s => s.status === "active")
    : [];
  for (const s of stores) if (!LOCAL_ID.test(s.id)) throw new Error(`Store "${s.name}" has an id the shared shop can't read.`);
  const perStore = Boolean(storeMode) && stores.length > 0;
  const stock: OpeningImport["stock"] = [];
  if (perStore) {
    const open = new Set(stores.map(s => s.id));
    for (const product of products) {
      for (const [storeId, quantity] of await readStoreBalances(database, profileId, product.id)) {
        if (quantity > 0 && open.has(storeId)) stock.push({ localProductId: product.id, localStoreId: storeId, quantity });
      }
    }
  } else {
    for (const product of products) {
      if (product.stockQuantity > 0) stock.push({ localProductId: product.id, quantity: product.stockQuantity });
    }
  }
  return {
    profileId,
    businessName: profile.name,
    hasStores: perStore,
    skipped: { services, archived },
    books: {
      sourceKey: `device:${profileId}`.slice(0, 128),
      currency: profile.currency,
      stores: (perStore ? stores : []).map(s => ({ localId: s.id, name: s.name })),
      products: products.map(p => ({ localId: p.id, name: p.name.trim().slice(0, 120), unitPriceMinor: p.sellingPriceMinor })),
      stock,
    },
  };
}
