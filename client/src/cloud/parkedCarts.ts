/**
 * Parked carts for the shared till: set a half-built sale aside while serving
 * someone else, then pick it up again. Kept on this device only, sealed with
 * the same device key as the offline cache, and scoped to the signed-in
 * person, business and store. A parked cart is not a sale: nothing is
 * recorded, no stock is held, and prices and stock are checked again when it
 * is resumed.
 */
export const PARKED_PREFIX = "tallybook.shop.parked.v1:";
export const MAX_PARKED = 5;
export const PARKED_MAX_AGE_MS = 24 * 3600_000;
const MAX_LINES = 100;
const MAX_QUANTITY = 100_000;

export interface ParkedLine { productId: string; quantity: number }
export interface ParkedCart { id: string; parkedAt: string; customerId: string | null; lines: ParkedLine[] }

export const parkedKey = (userId: string, companyId: string, storeId: string) => `${PARKED_PREFIX}${userId}:${companyId}:${storeId}`;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

/** Reads whatever was stored: anything malformed or older than a day is dropped, never trusted. */
export function sanitizeParked(value: unknown, now: number = Date.now()): ParkedCart[] {
  if (!Array.isArray(value)) return [];
  const carts: ParkedCart[] = [];
  for (const item of value) {
    const c = record(item);
    if (!c || !text(c.id, 64) || !text(c.parkedAt, 40) || !Array.isArray(c.lines)) continue;
    const at = Date.parse(c.parkedAt);
    if (Number.isNaN(at) || now - at > PARKED_MAX_AGE_MS || at - now > 5 * 60_000) continue;
    const lines: ParkedLine[] = [];
    const seen = new Set<string>();
    for (const l of c.lines.slice(0, MAX_LINES)) {
      const line = record(l);
      if (!line || !text(line.productId, 64) || seen.has(line.productId)) continue;
      if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) continue;
      seen.add(line.productId);
      lines.push({ productId: line.productId, quantity: line.quantity });
    }
    if (!lines.length) continue;
    carts.push({ id: c.id, parkedAt: c.parkedAt, customerId: text(c.customerId, 64) ? c.customerId : null, lines });
  }
  return carts.slice(0, MAX_PARKED);
}

/** Adds the current cart to the list, newest first. Throws a plain sentence when it cannot. */
export function parkCart(
  existing: ParkedCart[], cart: Record<string, number>, customerId: string | null,
  now: Date = new Date(), newId: () => string = () => crypto.randomUUID(),
): ParkedCart[] {
  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([productId, quantity]) => ({ productId, quantity }));
  if (!lines.length) throw new Error("There is nothing in the cart to set aside.");
  if (existing.length >= MAX_PARKED) throw new Error(`You already have ${MAX_PARKED} parked carts. Resume or discard one first.`);
  return [{ id: newId(), parkedAt: now.toISOString(), customerId: customerId || null, lines }, ...existing];
}

export interface RestoreProduct { id: string; name: string; active: boolean; unitPriceMinor: number; tracked: boolean }
export interface RestoreResult {
  cart: Record<string, number>;
  /** Names no longer for sale (or removed). */
  unavailable: string[];
  /** Names whose quantity was lowered to the stock now on hand. */
  reduced: string[];
}

/**
 * Turns a parked cart back into a live cart using today's products and stock,
 * so nothing stale can be sold: gone or hidden products are dropped, counted
 * goods stop at the stock on hand, untracked items keep their quantity.
 */
export function restoreCart(parked: ParkedCart, products: readonly RestoreProduct[], stockOf: (productId: string) => number, untrackedMax = 1000): RestoreResult {
  const byId = new Map(products.map(p => [p.id, p]));
  const result: RestoreResult = { cart: {}, unavailable: [], reduced: [] };
  for (const line of parked.lines) {
    const product = byId.get(line.productId);
    if (!product || !product.active) { result.unavailable.push(product?.name ?? "A product that was removed"); continue; }
    const max = product.tracked ? stockOf(product.id) : untrackedMax;
    if (max <= 0) { result.unavailable.push(`${product.name} (out of stock)`); continue; }
    const quantity = Math.min(line.quantity, max);
    if (quantity < line.quantity) result.reduced.push(`${product.name} (${quantity} of ${line.quantity})`);
    result.cart[product.id] = quantity;
  }
  return result;
}

export const parkedItemCount = (cart: ParkedCart) => cart.lines.reduce((n, l) => n + l.quantity, 0);
