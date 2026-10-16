/** Device-local recovery journal. A pending entry is never evidence that a sale committed. */
import type { completeSale } from "./sales";
export type CheckoutIntent = Parameters<typeof completeSale>[0];
export interface PendingCheckout { version: 1; companyId: string; savedAt: string; intent: CheckoutIntent & { submissionKey: string } }
const key = (companyId: string) => `tallybook:pending-checkout:v1:${companyId}`;
export function loadPendingCheckout(companyId: string): PendingCheckout | null {
  if (!companyId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(companyId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const p = value as Partial<PendingCheckout>;
    const i = p.intent;
    if (p.version !== 1 || p.companyId !== companyId || !i || typeof p.savedAt !== "string" || !Number.isFinite(Date.parse(p.savedAt)) || typeof i.submissionKey !== "string" || !i.submissionKey || !Array.isArray(i.lines) || !i.lines.length || !i.lines.every(x => typeof x.productId === "string" && x.productId.length > 0 && Number.isSafeInteger(x.quantity) && x.quantity > 0) || (i.storeId !== undefined && (typeof i.storeId !== "string" || !i.storeId || i.storeId.length>200)) || (i.commerceOrderId !== undefined && (typeof i.commerceOrderId !== "string" || !i.commerceOrderId || i.commerceOrderId.length>128)) || typeof i.currency !== "string" || typeof i.paymentMethod !== "string" || typeof i.amountPaid !== "string" || typeof i.discount !== "string") return null;
    return p as PendingCheckout;
  } catch { return null; }
}
/** Distinguishes an empty recovery slot from unreadable or damaged saved state. */
export function getPendingCheckoutStatus(companyId: string): { state: "empty" | "pending" | "damaged" | "unavailable"; pending: PendingCheckout | null } {
  if (!companyId || typeof localStorage === "undefined") return { state: "unavailable", pending: null };
  let raw: string | null;
  try { raw = localStorage.getItem(key(companyId)); }
  catch { return { state: "unavailable", pending: null }; }
  if (raw === null) return { state: "empty", pending: null };
  const pending = loadPendingCheckout(companyId);
  return pending ? { state: "pending", pending } : { state: "damaged", pending: null };
}
export function savePendingCheckout(companyId: string, intent: CheckoutIntent & { submissionKey: string }): PendingCheckout {
  if (!companyId || !intent.submissionKey || !intent.lines.length) throw new Error("Invalid pending checkout");
  if (typeof localStorage === "undefined") throw new Error("Recovery storage is unavailable. Checkout cannot safely start on this device.");
  // A damaged journal is not evidence of an uncommitted sale. Never overwrite it:
  // the original submission key may be needed to reconcile a committed checkout.
  let existing: string | null;
  try { existing = localStorage.getItem(key(companyId)); }
  catch { throw new Error("Recovery storage cannot be read. Checkout cannot safely start on this device."); }
  if (existing !== null) {
    if (!loadPendingCheckout(companyId)) throw new Error("Saved checkout recovery data is damaged. Check sales history and restore the recovery journal before starting another sale.");
    throw new Error("Resolve the previous pending checkout before starting another sale.");
  }
  const record: PendingCheckout = { version: 1, companyId, savedAt: new Date().toISOString(), intent };
  try {
    localStorage.setItem(key(companyId), JSON.stringify(record));
    // Browser storage can fail silently or become unavailable. Never initiate
    // a financial write unless the recovery key is durably readable.
    const verified = loadPendingCheckout(companyId);
    if (!verified || verified.intent.submissionKey !== intent.submissionKey) {
      throw new Error("Checkout recovery data could not be verified after saving. No sale was submitted.");
    }
  } catch (error) {
    throw new Error(error instanceof Error && error.message.includes("could not be verified")
      ? error.message : "Checkout recovery storage failed. No sale was submitted.");
  }
  return record;
}
export function clearPendingCheckout(companyId: string, submissionKey: string): void {
  if (!companyId || !submissionKey) return;
  if (loadPendingCheckout(companyId)?.intent.submissionKey === submissionKey) localStorage.removeItem(key(companyId));
}
