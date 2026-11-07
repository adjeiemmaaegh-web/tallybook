/**
 * Only these non-personal catalogue fields may be persisted as a shared-shop
 * offline display snapshot. An untrusted cached role or policy is NEVER an
 * authority for sales, refunds, staff or finance actions.
 *
 * Important: this removes sensitive fields from the cache; it does not encrypt
 * product names, stock levels, or queued transactions in IndexedDB.
 */
import type { ShopOverview } from "./shopClient";

export interface CachedShopBusiness {
  id: string;
  name: string;
  role: "owner" | "attendant";
}
export interface ShopCache {
  businesses: CachedShopBusiness[];
  overviews: Record<string, ShopOverview>;
}
export const blankCache = (): ShopCache => ({ businesses: [], overviews: {} });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const listOf = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function safeCache(input: unknown): ShopCache {
  const source = asRecord(input);
  if (!source) return blankCache();

  const businesses: CachedShopBusiness[] = [];
  for (const value of listOf(source.businesses)) {
    const b = asRecord(value);
    if (!b || !string(b.id) || !string(b.name)) continue;
    businesses.push({
      id: b.id, name: b.name,
      role: "attendant", // Cached membership is not verified authorization.
    });
  }

  const overviews: Record<string, ShopOverview> = Object.create(null);
  const rawOverviews = asRecord(source.overviews);
  for (const [id, value] of Object.entries(rawOverviews ?? {})) {
    const view = asRecord(value);
    if (!view || !string(id) || view.companyId !== id) continue;

    const stores = listOf(view.stores).flatMap(value => {
      const s = asRecord(value);
      if (!s || !string(s.id) || !string(s.name) ||
          (s.status !== "active" && s.status !== "archived")) return [];
      return [{id: s.id, name: s.name, status: s.status as "active" | "archived"}];
    });
    const products = listOf(view.products).flatMap(value => {
      const p = asRecord(value);
      if (!p || !string(p.id) || !string(p.name) ||
          !count(p.unitPriceMinor) || typeof p.active !== "boolean") return [];
      return [{id: p.id, name: p.name, unitPriceMinor: p.unitPriceMinor, active: p.active}];
    });
    const stock = listOf(view.stock).flatMap(value => {
      const s = asRecord(value);
      if (!s || !string(s.storeId) || !string(s.productId) || !count(s.quantity)) return [];
      return [{storeId: s.storeId, productId: s.productId, quantity: s.quantity}];
    });

    // Whitelist exclusively: never spread a server overview or old cache.
    // Future backend fields may contain private data and must be opt-in.
    overviews[id] = {
      companyId: id,
      role: "attendant", // Never persist an owner privilege claim for offline use.
      currency: typeof view.currency === "string" && /^[A-Z]{3}$/.test(view.currency)
        ? view.currency : null,
      stores, products, stock,
      members: [], pendingInvites: [], customers: [],
      myPermissions: {canDiscount: false, maxDiscountBps: 0, canCredit: false},
      memberPermissions: {},

    };
  }
  return { businesses, overviews };
}
