/** A parked cart is a device-local draft, never a reservation or financial transaction. */
export interface ParkedCartLine { productId: string; quantity: number }
export interface ParkedCart { version: 1; lines: ParkedCartLine[]; parkedAt: string }
const storageKey = (companyId: string) => `tallybook:parked-cart:v1:${companyId}`;
export function loadParkedCart(companyId: string): ParkedCart | null {
  if (!companyId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const cart = data as Partial<ParkedCart>;
    if (cart.version !== 1 || !Array.isArray(cart.lines) || cart.lines.length === 0 || cart.lines.length > 200 || typeof cart.parkedAt !== "string") return null;
    if (!cart.lines.every((line) => line && typeof line.productId === "string" && line.productId.length > 0 && Number.isSafeInteger(line.quantity) && line.quantity > 0)) return null;
    if (new Set(cart.lines.map((line) => line.productId)).size !== cart.lines.length) return null;
    return { version: 1, parkedAt: cart.parkedAt, lines: cart.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })) };
  } catch { return null; }
}
export function saveParkedCart(companyId: string, lines: ParkedCartLine[]): void {
  if (!companyId || !lines.length || lines.length > 200 || lines.some((line) => !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity <= 0)) throw new Error("Invalid parked cart");
  if (new Set(lines.map((line) => line.productId)).size !== lines.length) throw new Error("Duplicate product in parked cart");
  if (typeof localStorage === "undefined") throw new Error("Device storage is unavailable. The cart was not parked.");
  const key = storageKey(companyId);
  // Never replace an unresolved draft, even when its contents are damaged.
  // Reading can throw when the device blocks local storage.
  if (localStorage.getItem(key) !== null) throw new Error("A cart is already parked for this business. Resume it before parking another.");
  const record: ParkedCart = { version: 1, parkedAt: new Date().toISOString(), lines: lines.map(line => ({ ...line })) };
  try {
    localStorage.setItem(key, JSON.stringify(record));
    const stored = loadParkedCart(companyId);
    if (!stored || stored.parkedAt !== record.parkedAt || JSON.stringify(stored.lines) !== JSON.stringify(record.lines)) {
      throw new Error("Parked cart could not be verified. Your active cart has not been cleared.");
    }
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Device storage failed. Your active cart has not been cleared.");
  }
}
export function clearParkedCart(companyId: string): void { if (companyId) localStorage.removeItem(storageKey(companyId)); }

/** Clear a parked draft only if it still matches the cart that was submitted.
 * Never remove an unrelated or corrupted parked draft during receipt recovery. */
export function clearParkedCartIfMatches(companyId: string, lines: ParkedCartLine[]): boolean {
  if (!companyId || !lines.length || typeof localStorage === "undefined") return false;
  const saved = loadParkedCart(companyId);
  if (!saved || JSON.stringify(saved.lines) !== JSON.stringify(lines)) return false;
  clearParkedCart(companyId);
  return true;
}
