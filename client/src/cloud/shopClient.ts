/**
 * Shared shop client: the cloud-authoritative ledger used when a business has
 * attendants. All authorisation happens in `public.tallybook_shop` on the
 * server (session-bound, owner/assignment checked inside the transaction).
 * The browser never sends prices or totals it expects the server to trust.
 */
import { parseProfitReport, type ProfitReport } from "./profitReport";
import { getSupabaseClient } from "@/lib/supabase";
import { filterSalesLocally, type LocalSalesQuery } from "./salesFilters";
import { parseDailyReport, type DailyReport } from "./dailyReport";

export type ShopRole = "owner" | "attendant";
export interface ShopStore { id: string; name: string; status: "active" | "archived" }
export type ProductKind = "good" | "service";
/**
 * `barcode` onwards come from the product catalog and are absent on a server
 * that has not been upgraded; absent means a normal, stock-tracked good.
 * `costMinor` is sent to owners only and is never stored in the offline cache.
 */
export interface ShopProduct {
  id: string; name: string; unitPriceMinor: number; active: boolean;
  barcode?: string | null; category?: string | null; kind?: ProductKind;
  trackStock?: boolean; lowStockThreshold?: number | null; costMinor?: number | null;
}
export { tracksStock } from "./productTracking";
export interface ShopStock { storeId: string; productId: string; quantity: number }
export interface ShopMember { userId: string; role: ShopRole; email: string | null; storeIds: string[] }
export interface ShopInvite { invitationId: string; email: string | null; expiresAt: string }
/** What this person may do at the till. The owner may do everything. */
export interface ShopPermissions { canDiscount: boolean; maxDiscountBps: number; canCredit: boolean }
export interface ShopCustomer { id: string; name: string; phone: string | null; creditLimitMinor: number; balanceMinor: number }
export interface ShopOverview {
  companyId: string; role: ShopRole; currency: string | null;
  stores: ShopStore[]; products: ShopProduct[]; stock: ShopStock[];
  members: ShopMember[]; pendingInvites: ShopInvite[];
  /** Absent in an overview cached before the full till shipped. */
  myPermissions?: ShopPermissions;
  memberPermissions?: Record<string, ShopPermissions>;
  customers?: ShopCustomer[];
  /** Customers the owner has archived: kept out of `customers` (the till and the list). */
  archivedCustomers?: ShopCustomer[];
}
export const NO_PERMISSIONS: ShopPermissions = { canDiscount: false, maxDiscountBps: 0, canCredit: false };
export const permissionsOf = (overview: ShopOverview): ShopPermissions =>
  overview.myPermissions ?? (overview.role === "owner" ? { canDiscount: true, maxDiscountBps: 10000, canCredit: true } : NO_PERMISSIONS);

export type PaymentMethod = "cash" | "mobile" | "card";
export type TenderMethod = PaymentMethod | "credit";
export interface SaleLineInput { productId: string; quantity: number }
export interface TenderInput { method: TenderMethod; amountMinor: number; tenderedMinor?: number; reference?: string; customerId?: string }
interface SaleBase { storeId: string; submissionKey: string; clientRecordedAt?: string; lines: SaleLineInput[] }
/** The current request: 0 to 5 tenders adding up to the server-priced total after any discount. */
export interface TenderSaleRequest extends SaleBase { tenders: TenderInput[]; discountMinor?: number; discountReason?: string }
/** The earlier single-payment shape. Still accepted, so sales queued before an update still send. */
export interface LegacySaleRequest extends SaleBase { paymentMethod: PaymentMethod; amountTenderedMinor: number; paymentReference?: string }
export type SaleRequest = TenderSaleRequest | LegacySaleRequest;
export interface ShopReceipt {
  saleId: string; companyId: string; storeId: string; storeName: string; cashierId: string;
  submissionKey: string; receiptNumber: number; currency: string; totalMinor: number;
  subtotalMinor?: number; discountMinor?: number; discountReason?: string | null;
  customer?: ShopCustomer | null;
  recordedAt: string; replayed: boolean;
  payment: { method: TenderMethod | "split"; amountDueMinor: number; amountTenderedMinor: number; changeMinor: number; reference: string | null };
  tenders?: Array<{ method: TenderMethod; amountMinor: number; tenderedMinor: number; reference: string | null }>;
  lines: Array<{ lineNo: number; productId: string; name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; lineDiscountMinor?: number; refundedQuantity: number }>;
  refundedMinor: number;
  refunds: ShopRefund[];
}
export interface ShopRefund {
  refundId: string; refundNo: number; amountMinor: number; creditMinor?: number; method: TenderMethod; returnedToStock: boolean;
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

export async function callShop<T>(action: string, input: Record<string, unknown>, rpc: "tallybook_shop" | "tallybook_shop_ops" | "tallybook_shop_order_lines" = "tallybook_shop"): Promise<T> {
  const client = getSupabaseClient();
  let response: Awaited<ReturnType<typeof client.rpc>>;
  try {
    response = await client.rpc(rpc, { p_action: action, p_input: input });
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
  if (/The refund policy changed/.test(message)) return "Someone changed the refund policy. Reload and try again.";
  return message.replace(/^Invalid (\w+)$/, "Something in this request isn't valid ($1).");
}

/** One page of sales matching the filters. Totals cover every match, not just this page. */
export interface SalesPage {
  sales: ShopReceipt[];
  hasMore: boolean;
  next: { recordedAt: string; receiptNumber: number } | null;
  matchCount: number;
  grossMinor: number;
  refundedMinor: number;
  /** True when the server cannot search yet and only its latest sales were filtered here. */
  limited: boolean;
}
export interface SalesQuery extends LocalSalesQuery {
  limit?: number;
  before?: { recordedAt: string; receiptNumber: number } | null;
}
const toMinor = (value: unknown) => { const n = Number(value); return Number.isSafeInteger(n) ? n : 0; };

/**
 * Searches sales on the server. A server that has not been upgraded to the
 * search action answers "Unknown shop operations action"; then the latest
 * sales are fetched with the old list call and filtered here, and `limited`
 * tells the screen to say so.
 */
export async function searchShopSales(companyId: string, query: SalesQuery, cashierEmail?: (id: string) => string | null | undefined): Promise<SalesPage> {
  const input: Record<string, unknown> = { companyId };
  if (query.storeId) input.storeId = query.storeId;
  if (query.from) input.from = query.from;
  if (query.to) input.to = query.to;
  if (query.payment && query.payment !== "all") input.payment = query.payment;
  if (query.q?.trim()) input.q = query.q.trim();
  if (query.limit) input.limit = query.limit;
  if (query.before) { input.beforeRecordedAt = query.before.recordedAt; input.beforeReceiptNumber = query.before.receiptNumber; }
  try {
    const r = await callShop<{ sales: ShopReceipt[]; hasMore: boolean; next: SalesPage["next"]; matchCount: number | string; grossMinor: string; refundedMinor: string }>(
      "searchSales", input, "tallybook_shop_ops");
    return { sales: r.sales, hasMore: r.hasMore, next: r.next, matchCount: Number(r.matchCount), grossMinor: toMinor(r.grossMinor), refundedMinor: toMinor(r.refundedMinor), limited: false };
  } catch (cause) {
    if (!(cause instanceof ShopRejectedError) || !/Unknown shop operations action/.test(cause.message)) throw cause;
  }
  const latest = await listShopSales(companyId, query.storeId);
  const sales = filterSalesLocally(latest, query, cashierEmail);
  return {
    sales, hasMore: false, next: null, matchCount: sales.length, limited: true,
    grossMinor: sales.reduce((n, sale) => n + sale.totalMinor, 0),
    refundedMinor: sales.reduce((n, sale) => n + (sale.refundedMinor ?? 0), 0),
  };
}

export interface ProductCatalogEntry {
  productId: string; name: string; unitPriceMinor: number; active: boolean;
  barcode: string | null; category: string | null; kind: ProductKind; trackStock: boolean;
  lowStockThreshold: number | null; costMinor?: number | null;
}
export interface ProductInput {
  productId: string; name: string; unitPriceMinor: number; active: boolean;
  barcode: string | null; category: string | null; kind: ProductKind; trackStock: boolean;
  lowStockThreshold: number | null; costMinor: number | null;
}
export const getProductCatalog = (companyId: string) =>
  callShop<{ products: ProductCatalogEntry[] }>("productCatalog", { companyId }, "tallybook_shop_ops").then(r => r.products);
export const saveShopProductFull = (companyId: string, product: ProductInput) =>
  callShop<ProductCatalogEntry>("saveProductFull", { companyId, ...product }, "tallybook_shop_ops");

/** Adds catalog details to the overview's products. Products the catalog does not mention are left as they are. */
export function mergeCatalog(overview: ShopOverview, catalog: ProductCatalogEntry[]): ShopOverview {
  const byId = new Map(catalog.map(entry => [entry.productId, entry]));
  return { ...overview, products: overview.products.map(product => {
    const entry = byId.get(product.id);
    if (!entry) return product;
    return { ...product, barcode: entry.barcode, category: entry.category, kind: entry.kind, trackStock: entry.trackStock,
      lowStockThreshold: entry.lowStockThreshold, ...("costMinor" in entry ? { costMinor: entry.costMinor ?? null } : {}) };
  }) };
}

/** Moves archived customers out of the customer list so the till and the list never offer them. */
export function mergeArchive(overview: ShopOverview, archivedIds: string[]): ShopOverview {
  if (!archivedIds.length || !overview.customers) return { ...overview, archivedCustomers: [] };
  const hidden = new Set(archivedIds);
  return { ...overview, customers: overview.customers.filter(c => !hidden.has(c.id)), archivedCustomers: overview.customers.filter(c => hidden.has(c.id)) };
}
export const getArchivedCustomerIds = (companyId: string) =>
  callShop<{ customerIds: string[] }>("archivedCustomers", { companyId }, "tallybook_shop_ops");
export const setShopCustomerArchived = (companyId: string, customerId: string, archived: boolean) =>
  callShop<{ customerId: string; archived: boolean }>(archived ? "archiveCustomer" : "unarchiveCustomer", { companyId, customerId }, "tallybook_shop_ops");

/** The shared shop's daily / end-of-day report for a day range (and optionally one store). Read-only. */
export async function getDailyReport(companyId: string, query: { from: string; to: string; storeId?: string }): Promise<DailyReport> {
  const raw = await callShop<unknown>("dailyReport", { companyId, from: query.from, to: query.to, ...(query.storeId ? { storeId: query.storeId } : {}) }, "tallybook_shop_ops");
  return parseDailyReport(raw);
}

/** Profit and margin for a day range (owner only). */
export async function getProfitReport(companyId: string, query: { from: string; to: string; storeId?: string }): Promise<ProfitReport> {
  const raw = await callShop<unknown>("profitReport", { companyId, from: query.from, to: query.to, ...(query.storeId ? { storeId: query.storeId } : {}) }, "tallybook_shop_ops");
  return parseProfitReport(raw);
}

export const getShopReadiness = (companyId: string) =>
  callShop<{companyId: string; saleCount: number}>("readiness", {companyId}, "tallybook_shop_ops");
export const getShopOverview = (companyId: string) => callShop<ShopOverview>("overview", { companyId });
export const listShopSales = (companyId: string, storeId?: string) =>
  callShop<{ sales: ShopReceipt[] }>("listSales", storeId ? { companyId, storeId } : { companyId }).then(r => r.sales);
/**
 * When a shared device has a known cashier, pin the exact Supabase access token
 * from that cashier before any await on the HTTP send. A stale A outbox MUST NOT
 * be uploaded using B's active Supabase session after a mid-flight account switch.
 * The server still verifies JWT, membership, store access and receipt idempotency.
 */
export async function recordShopSaleForCashier(companyId:string,sale:SaleRequest,expectedUserId:string):Promise<ShopReceipt> {
  const {data,error}=await getSupabaseClient().auth.getSession();
  const session=data.session;
  if(error||!session?.access_token||session.user.id!==expectedUserId)
    throw new ShopUnreachableError("The cashier account changed. This sale remains queued for its original cashier to sync.");
  const url=import.meta.env.VITE_SUPABASE_URL?.trim();
  const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if(!url||!key)throw new ShopUnreachableError("Shared shop connection is not configured.");
  let response:Response;
  try {
    response=await fetch(new URL("/rest/v1/rpc/tallybook_shop",url).toString(),{
      method:"POST",
      headers:{"apikey":key,"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({p_action:"recordSale",p_input:{companyId,...sale}}),
    });
  } catch { throw new ShopUnreachableError("Can't reach Tallybook right now. This cashier's sale is still queued."); }
  let payload:unknown;
  try { payload=await response.json(); }
  catch { throw new ShopUnreachableError("Could not verify the sale response. Keep the original cashier's pending sale."); }
  if(!response.ok){
    const problem=payload&&typeof payload==="object"&&!Array.isArray(payload)?payload as {code?:unknown;message?:unknown}:{};
    const code=typeof problem.code==="string"?problem.code:"";
    const description=typeof problem.message==="string"?problem.message:"Tallybook could not process this sale.";
    if(DECIDED.test(code))throw new ShopRejectedError(friendlyMessage(description));
    if(code==="PGRST202")throw new ShopRejectedError("The shared shop isn't available on this server yet.");
    throw new ShopUnreachableError("Tallybook could not verify this cashier's sale. It remains queued for reconciliation.");
  }
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw new ShopUnreachableError("Unexpected response. The sale stays queued until its outcome is checked.");
  const receipt=payload as ShopReceipt;
  if(receipt.companyId!==companyId||receipt.cashierId!==expectedUserId||receipt.submissionKey!==sale.submissionKey)
    throw new ShopUnreachableError("Receipt identity did not match the original cashier. Check the server before retrying.");
  return receipt;
}
export const recordShopSale = (companyId: string, sale: SaleRequest, expectedUserId?:string) =>
  expectedUserId
    ? recordShopSaleForCashier(companyId,sale,expectedUserId)
    : callShop<ShopReceipt>("recordSale", { companyId, ...sale });
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
/** Company refund policy. Default is OFF; every change is a new numbered revision. */
export interface ShopRefundPolicy {
  companyId: string; revision: number; refundsEnabled: boolean; allowVoid: boolean; allowPartial: boolean; maxAgeDays: number;
  effectiveAt: string | null;
  /** Owner only; newest first. */
  history: Array<{ revision: number; effectiveAt: string; refundsEnabled: boolean; allowVoid: boolean; allowPartial: boolean;
    maxAgeDays: number; reason: string; actorId: string }>;
}
export interface RefundPolicyChange {
  refundsEnabled: boolean; allowVoid: boolean; allowPartial: boolean; maxAgeDays: number; reason: string;
  /** The revision the owner was looking at; a stale value is rejected. */
  expectedRevision: number; confirmed: true;
}
export const getShopRefundPolicy = (companyId: string) => callShop<ShopRefundPolicy>("refundPolicy", { companyId });
export const setShopRefundPolicy = (companyId: string, change: RefundPolicyChange) =>
  callShop<ShopRefundPolicy>("setRefundPolicy", { companyId, ...change });
export const importShopOpening = (companyId: string, books: OpeningImport) =>
  callShop<OpeningImportResult>("importOpening", { companyId, ...books });

export const saveShopCustomer = (companyId: string, customer: { customerId: string; name: string; phone?: string; creditLimitMinor?: number }) =>
  callShop<ShopCustomer>("saveCustomer", { companyId, ...customer });
export const recordShopRepayment = (companyId: string, repayment: { customerId: string; repaymentKey: string; amountMinor: number; method: PaymentMethod; reference?: string; storeId?: string }) =>
  callShop<ShopCustomer & { replayed: boolean }>("recordRepayment", { companyId, ...repayment });
export interface CustomerStatement extends ShopCustomer {
  entries: Array<{ kind: "credit_sale" | "repayment" | "refund"; amountMinor: number; balanceAfterMinor: number;
    receiptNumber: number | null; method: PaymentMethod | null; reference: string | null; recordedAt: string }>;
}
export const getCustomerStatement = (companyId: string, customerId: string) => callShop<CustomerStatement>("customerStatement", { companyId, customerId });
export const setShopMemberPermissions = (companyId: string, userId: string, permissions: ShopPermissions) =>
  callShop<ShopPermissions>("setMemberPermissions", { companyId, userId, ...permissions });

export function newSubmissionKey() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Short join codes: the owner makes one, an employee types it to join as an attendant. */
export interface JoinCodeRow { codeId: string; status: "pending" | "used" | "revoked" | "expired"; createdAt: string; expiresAt: string; usedBy: string | null; usedAt: string | null }
export const createJoinCode = (companyId: string) =>
  callShop<{ codeId: string; code: string; expiresAt: string }>("createJoinCode", { companyId }, "tallybook_shop_ops");
export const listJoinCodes = (companyId: string) =>
  callShop<{ codes: JoinCodeRow[] }>("listJoinCodes", { companyId }, "tallybook_shop_ops");
export const revokeJoinCode = (companyId: string) => (codeId: string) =>
  callShop<{ codeId: string; revoked: boolean }>("revokeJoinCode", { companyId, codeId }, "tallybook_shop_ops");
export const joinWithShortCode = (code: string) =>
  callShop<{ joined: boolean; reason?: "invalid" | "locked" | "already-member"; companyId?: string; userId?: string }>("joinWithCode", { code }, "tallybook_shop_ops");
/** "ABCD-EFGH" for reading aloud and typing; the server ignores the dash and the case. */
export const showJoinCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
export const JOIN_CODE_REASON = {
  invalid: "That code isn't valid. It may have expired, been used already or been cancelled. Check it, or ask the owner for a new one.",
  locked: "Too many wrong codes. Wait 15 minutes, then try again.",
  "already-member": "You are already part of that shop.",
} as const;
