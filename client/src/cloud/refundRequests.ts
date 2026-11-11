import { callShop, type ShopReceipt } from "./shopClient";

export type RefundRequestStatus = "pending" | "approved" | "declined" | "cancelled";
export interface RefundRequestItem { name: string; quantity: number }
export interface RefundRequest {
  requestId: string; saleId: string; receiptNumber: number; status: RefundRequestStatus; reason: string;
  lines: Array<{ lineNo: number; quantity: number }> | null; returnToStock: boolean; createdAt: string;
  decidedAt: string | null; decisionNote: string | null; items: RefundRequestItem[];
  /** Owner's list only. */
  requestedBy?: string; totalMinor?: string;
}
const ops = "tallybook_shop_ops" as const;
export const requestShopRefund = (companyId: string, input: { requestId: string; saleId: string; reason: string; returnToStock: boolean; lines?: Array<{ lineNo: number; quantity: number }> }) =>
  callShop<{ requestId: string; status: RefundRequestStatus; replayed: boolean }>("requestRefund", { companyId, ...input }, ops);
export const getMyRefundRequests = (companyId: string) => callShop<{ requests: RefundRequest[] }>("myRefundRequests", { companyId }, ops);
export const cancelRefundRequest = (companyId: string, requestId: string) =>
  callShop<{ requestId: string; status: RefundRequestStatus }>("cancelRefundRequest", { companyId, requestId }, ops);
export const getRefundRequests = (companyId: string, status: RefundRequestStatus | "all" = "pending") =>
  callShop<{ requests: RefundRequest[] }>("listRefundRequests", { companyId, status }, ops);
export const declineRefundRequest = (companyId: string, requestId: string, note: string) =>
  callShop<{ requestId: string; status: RefundRequestStatus }>("declineRefundRequest", { companyId, requestId, ...(note.trim() ? { note: note.trim() } : {}) }, ops);
export const approveRefundRequest = (companyId: string, requestId: string) =>
  callShop<{ requestId: string; status: RefundRequestStatus; replayed: boolean; receipt?: ShopReceipt }>("approveRefundRequest", { companyId, requestId }, ops);

export const describeItems = (r: Pick<RefundRequest, "items" | "lines">) =>
  r.lines === null ? "Whole sale" : r.items.map(i => `${i.quantity} × ${i.name}`).join(", ");
