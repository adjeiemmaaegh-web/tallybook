import { formatMinorAmount } from "@/features/inventory/inventory";
import { callShop } from "./shopClient";

export type QuotationStatus = "open" | "accepted" | "declined" | "cancelled" | "converted" | "expired";
export interface QuotationLine { productId: string; name: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }
export interface Quotation {
  quotationId: string; quoteNo: number; storeId: string | null; customerId: string | null; customerName: string; validUntil: string; note: string | null;
  totalMinor: number; status: QuotationStatus; createdBy: string; createdAt: string; saleId: string | null; lines: QuotationLine[];
}
export const STATUS_LABEL: Record<QuotationStatus, string> = {
  open: "Waiting for the customer", accepted: "Accepted", declined: "Declined", cancelled: "Cancelled", converted: "Sold", expired: "Expired",
};

const ops = "tallybook_shop_ops" as const;
export interface CreateQuotationInput {
  quotationId: string; storeId?: string; customerId?: string; customerName?: string; validDays: number; note?: string;
  lines: Array<{ productId: string; quantity: number }>;
}
export const createShopQuotation = (companyId: string, input: CreateQuotationInput) =>
  callShop<{ quotationId: string; quoteNo: number; replayed: boolean }>("createQuotation", { companyId, ...input }, ops);
export const decideShopQuotation = (companyId: string, quotationId: string, decision: "accepted" | "declined" | "cancelled") =>
  callShop<{ quotationId: string; status: QuotationStatus }>("decideQuotation", { companyId, quotationId, decision }, ops);
export const convertShopQuotation = (companyId: string, quotationId: string, saleId: string) =>
  callShop<{ quotationId: string; status: QuotationStatus }>("convertQuotation", { companyId, quotationId, saleId }, ops);

function minor(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`A quotation has an amount that cannot be shown exactly (${label}).`);
  return n;
}
export function parseQuotations(raw: unknown): Quotation[] {
  const list = (raw as { quotations?: unknown })?.quotations;
  if (!Array.isArray(list)) throw new Error("Unexpected response from Tallybook.");
  return list.map(item => {
    const q = item as Record<string, unknown>;
    return {
      quotationId: String(q.quotationId), quoteNo: minor(q.quoteNo, "number"), storeId: typeof q.storeId === "string" ? q.storeId : null,
      customerId: typeof q.customerId === "string" ? q.customerId : null, customerName: String(q.customerName ?? ""), validUntil: String(q.validUntil),
      note: typeof q.note === "string" ? q.note : null, totalMinor: minor(q.totalMinor, "total"), status: q.status as QuotationStatus,
      createdBy: String(q.createdBy), createdAt: String(q.createdAt), saleId: typeof q.saleId === "string" ? q.saleId : null,
      lines: (Array.isArray(q.lines) ? q.lines : []).map(l => { const r = l as Record<string, unknown>;
        return { productId: String(r.productId), name: String(r.name), quantity: minor(r.quantity, "quantity"), unitPriceMinor: minor(r.unitPriceMinor, "price"), lineTotalMinor: minor(r.lineTotalMinor, "line total") }; }),
    };
  });
}
export async function listShopQuotations(companyId: string): Promise<Quotation[]> {
  return parseQuotations(await callShop<unknown>("listQuotations", { companyId }, ops));
}

/** A quotation can still become a sale. */
export const isLive = (q: Pick<Quotation, "status">) => q.status === "open" || q.status === "accepted";

/** The message that is shared, copied or sent on WhatsApp. It restates what the server saved. */
export function formatQuotationText(shopName: string, q: Quotation, currency: string, locale?: string): string {
  const m = (v: number) => formatMinorAmount(v, currency);
  const until = new Date(q.validUntil + "T00:00:00");
  const lines = [shopName, `Quotation #${q.quoteNo} for ${q.customerName}`, "",
    ...q.lines.map(l => `${l.quantity} × ${l.name} @ ${m(l.unitPriceMinor)} = ${m(l.lineTotalMinor)}`), "", `Total: ${m(q.totalMinor)}`,
    `Valid until ${Number.isNaN(until.getTime()) ? q.validUntil : until.toLocaleDateString(locale)}`];
  if (q.note) lines.push(`Note: ${q.note}`);
  lines.push("", "Prices may change after this date. Thank you.");
  return lines.join("\n");
}
