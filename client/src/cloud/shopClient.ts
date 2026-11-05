/**
 * Shared shop client: the cloud-authoritative ledger used when a business has
 * attendants. All authorisation happens in `public.tallybook_shop` on the
 * server (session-bound, owner/assignment checked inside the transaction).
 * The browser never sends prices or totals it expects the server to trust.
 */
import { getSupabaseClient } from "@/lib/supabase";

export type ShopRole = "owner" | "attendant";
export interface ShopStore { id: string; name: string; status: "active" | "archived" }
export interface ShopProduct { id: string; name: string; unitPriceMinor: number; active: boolean }
export interface ShopStock { storeId: string; productId: string; quantity: number }
export interface ShopMember { userId: string; role: ShopRole; email: string | null; storeIds: string[] }
export interface ShopInvite { invitationId: string; email: string | null; expiresAt: string }
export interface ShopOverview {
  companyId: string; role: ShopRole; currency: string | null;
  stores: ShopStore[]; products: ShopProduct[]; stock: ShopStock[];
  members: ShopMember[]; pendingInvites: ShopInvite[];
}
export type PaymentMethod = "cash" | "mobile" | "card";
export interface SaleLineInput { productId: string; quantity: number }
export interface SaleRequest {
  storeId: string; submissionKey: string; paymentMethod: PaymentMethod;
  amountTenderedMinor: number; paymentReference?: string; clientRecordedAt?: string;
  lines: SaleLineInput[];
}
export interface ShopReceipt {
  saleId: string; companyId: string; storeId: string; storeName: string; cashierId: string;
  submissionKey: string; receiptNumber: number; currency: string; totalMinor: number;
  recordedAt: string; replayed: boolean;
  payment: { method: PaymentMethod; amountDueMinor: number; amountTenderedMinor: number; changeMinor: number; reference: string | null };
  lines: Array<{ lineNo: number; productId: string; name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; refundedQuantity: number }>;
  refundedMinor: number;
  refunds: ShopRefund[];
}
export interface ShopRefund {
  refundId: string; refundNo: number; amountMinor: number; method: PaymentMethod; returnedToStock: boolean;
  reason: string; actorId: string; recordedAt: string;
  lines: Array<{ lineNo: number; productId: string; quantity: number; lineTotalMinor: number }>;
}
/** Leave `lines` out to void: refund everything not yet refunded. */
export interface RefundRequest {
  saleId: string; refundKey: string; reason: string; returnToStock: boolean;
  lines?: Array<{ lineNo: number; quantity: number }>;
}
export interface OpeningImport {
  sourceKey: string; currency: string; defaultStoreId?: string;
  stores: Array<{ localId: string; name: string }>;
  products: Array<{ localId: string; name: string; unitPriceMinor: number }>;
  stock: Array<{ localProductId: string; localStoreId?: string; quantity: number }>;
}
export interface OpeningImportResult {
  storesCreated: number; storesReused: number; productsCreated: number; productsReused: number;
  stockOpened: number; stockSkipped: number; unitsOpened: number;
}

/** The server refused the request on its merits; retrying will not help. */
export class ShopRejectedError extends Error {}
/** The request may not have reached the server; it is safe to retry with the same key. */
export class ShopUnreachableError extends Error {}

// PostgREST error codes that mean "the database decided", never "network".
const DECIDED = /^(22|23|42|P0)/;

export async function callShop<T>(action: string, input: Record<string, unknown>): Promise<T> {
  const client = getSupabaseClient();
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc("tallybook_shop", { p_action: action, p_input: input });
  } catch {
    throw new ShopUnreachableError("Can't reach Tallybook right now. Check your connection.");
  }
  const { data, error } = response;
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    if (DECIDED.test(code)) throw new ShopRejectedError(friendlyMessage(error.message));
    if (code === "PGRST202") throw new ShopRejectedError("The shared shop isn't available on this server yet.");
    throw new ShopUnreachableError("Can't reach Tallybook right now. Check your connection.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ShopRejectedError("Unexpected response from Tallybook.");
  return data as T;
}

function friendlyMessage(message: string) {
  if (/Active Auth session required|Authenticated account required/.test(message)) return "Your sign-in has expired. Sign in again.";
  if (/Business access denied/.test(message)) return "You no longer have access to this business.";
  return message.replace(/^Invalid (\w+)$/, "Something in this request isn't valid ($1).");
}

export const getShopOverview = (companyId: string) => callShop<ShopOverview>("overview", { companyId });
export const listShopSales = (companyId: string, storeId?: string) =>
  callShop<{ sales: ShopReceipt[] }>("listSales", storeId ? { companyId, storeId } : { companyId }).then(r => r.sales);
export const recordShopSale = (companyId: string, sale: SaleRequest) =>
  callShop<ShopReceipt>("recordSale", { companyId, ...sale });
export const setupShopLedger = (companyId: string, currency: string) => callShop("setupLedger", { companyId, currency });
export const saveShopStore = (companyId: string, storeId: string, name: string) => callShop("saveStore", { companyId, storeId, name });
export const setShopStoreStatus = (companyId: string, storeId: string, status: "active" | "archived") =>
  callShop("setStoreStatus", { companyId, storeId, status });
export const assignShopStore = (companyId: string, storeId: string, userId: string, assigned: boolean) =>
  callShop(assigned ? "assignStore" : "unassignStore", { companyId, storeId, userId });
export const saveShopProduct = (companyId: string, product: { productId: string; name: string; unitPriceMinor: number; active: boolean }) =>
  callShop("saveProduct", { companyId, ...product });
export const adjustShopStock = (companyId: string, change: { storeId: string; productId: string; delta: number; operationId: string; note?: string }) =>
  callShop<{ quantity: number }>("adjustStock", { companyId, ...change });
export const inviteShopAttendant = (companyId: string, email: string) =>
  callShop<{ inviteToken: string; invitationId: string; email: string; expiresAtEpochMs: number }>("inviteByEmail", { companyId, email });

export const refundShopSale = (companyId: string, refund: RefundRequest) =>
  callShop<ShopReceipt>("refundSale", { companyId, ...refund });
export const importShopOpening = (companyId: string, books: OpeningImport) =>
  callShop<OpeningImportResult>("importOpening", { companyId, ...books });

export function newSubmissionKey() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
