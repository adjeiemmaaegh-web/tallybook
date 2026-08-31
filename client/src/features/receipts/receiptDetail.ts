/** Tallybook Africa design reminder: receipt views are read-only local facts; sharing and printing must never mutate a sale, payment, stock record, balance, or receipt. */
import { formatMinorAmount } from "@/features/inventory/inventory";
import { shareBusinessText, type BusinessShareResult } from "@/features/sharing/businessSharing";
import { paymentMethodLabel, type Payment, type Receipt, type Sale, type SaleLine, type SaleSnapshot } from "@/features/sales/sales";

export interface ReceiptDetailProfile { name: string; currency: string; }
export interface ReceiptDetailCustomer { id: string; name: string; }

export interface ReceiptDetail {
  receipt: Receipt;
  sale: Sale;
  lines: SaleLine[];
  payment?: Payment;
  businessName: string;
  currency: string;
  customerName: string;
}

export function resolveReceiptDetail({ receiptId, snapshot, profile, customers }: { receiptId: string; snapshot: SaleSnapshot; profile: ReceiptDetailProfile; customers: ReceiptDetailCustomer[] }): ReceiptDetail | undefined {
  const receipt = snapshot.receipts.find((item) => item.id === receiptId);
  if (!receipt) return undefined;
  const sale = snapshot.sales.find((item) => item.id === receipt.saleId);
  if (!sale) return undefined;
  const lines = snapshot.lines.filter((line) => line.saleId === sale.id);
  if (!lines.length) return undefined;
  const payment = snapshot.payments.find((item) => item.saleId === sale.id);
  const customerName = sale.customerId ? customers.find((customer) => customer.id === sale.customerId)?.name ?? "Saved customer unavailable" : "Walk-in customer";
  return { receipt, sale, lines, payment, businessName: profile.name, currency: profile.currency, customerName };
}

export function receiptPaymentDescription(detail: ReceiptDetail) {
  if (detail.sale.paymentMethod === "credit") return "Credit · Pay later";
  const method = paymentMethodLabel(detail.sale.paymentMethod);
  if (detail.sale.paymentMethod !== "mobile") return method;
  const provider = detail.payment?.mobileMoneyProviderName;
  const reference = detail.payment?.mobileMoneyReference;
  return [method, provider, reference ? `Ref ${reference}` : undefined].filter(Boolean).join(" · ");
}

export function formatReceiptShareText(detail: ReceiptDetail) {
  const lines = detail.lines.map((line) => `${line.productName} × ${line.quantity} — ${formatMinorAmount(line.lineTotalMinor, detail.currency)}`);
  const discount = detail.sale.discountMinor > 0 ? `Discount: ${formatMinorAmount(detail.sale.discountMinor, detail.currency)}` : undefined;
  const payment = `Payment: ${receiptPaymentDescription(detail)}`;
  return [
    detail.businessName,
    `Receipt ${detail.receipt.receiptNumber}`,
    new Date(detail.receipt.issuedAt).toLocaleString(),
    `Customer: ${detail.customerName}`,
    "",
    "Items",
    ...lines,
    "",
    `Subtotal: ${formatMinorAmount(detail.sale.subtotalMinor, detail.currency)}`,
    discount,
    `Total: ${formatMinorAmount(detail.sale.totalMinor, detail.currency)}`,
    `Paid: ${formatMinorAmount(detail.sale.amountPaidMinor, detail.currency)}`,
    `Remaining: ${formatMinorAmount(detail.sale.outstandingMinor, detail.currency)}`,
    payment,
    "",
    "Thank you for your business.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export type ReceiptShareResult = BusinessShareResult;

export async function shareReceiptText(text: string): Promise<ReceiptShareResult> {
  return shareBusinessText({ title: "Tallybook receipt", text });
}
