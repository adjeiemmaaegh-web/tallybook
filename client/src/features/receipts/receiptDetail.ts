/** Tallybook Africa design reminder: receipt views are read-only local facts; sharing and printing must never mutate a sale, payment, stock record, balance, or receipt. */
import { formatMinorAmount } from "@/features/inventory/inventory";
import { businessDateTimeLabel } from "@/features/business/businessCalendar.mjs";
import { shareBusinessText, type ShareBusinessTextResult } from "@/features/sharing/businessSharing";
import { paymentMethodLabel, type Payment, type Receipt, type Sale, type SaleLine, type SaleSnapshot } from "@/features/sales/sales";

export interface ReceiptDetailProfile { name: string; currency: string; country?: string; }
export interface ReceiptDetailCustomer { id: string; name: string; }

export interface ReceiptDetail {
  receipt: Receipt;
  sale: Sale;
  lines: SaleLine[];
  payment?: Payment;
  businessName: string;
  currency: string;
  country?: string;
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
  return { receipt, sale, lines, payment, businessName: profile.name, currency: profile.currency, country: profile.country, customerName };
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
    businessDateTimeLabel(detail.receipt.issuedAt, detail.country),
    `Customer: ${detail.customerName}`,
    "",
    "Items",
    ...lines,
    "",
    `Subtotal: ${formatMinorAmount(detail.sale.subtotalMinor, detail.currency)}`,
    discount,
    ...(detail.sale.tax?.ghana ? [
      "Ghana VAT Act 1151 (2026) — " + detail.sale.tax.policy.priceMode + " prices",
      "Taxable value: " + formatMinorAmount(detail.sale.tax.ghana.taxableBaseMinor, detail.currency),
      "VAT (15%): " + formatMinorAmount(detail.sale.tax.ghana.vatMinor, detail.currency),
      "NHIL (2.5%): " + formatMinorAmount(detail.sale.tax.ghana.nhilMinor, detail.currency),
      "GETFund (2.5%): " + formatMinorAmount(detail.sale.tax.ghana.getFundMinor, detail.currency),
      "Total VAT and levies: " + formatMinorAmount(detail.sale.tax.taxMinor, detail.currency),
      "Zero-rated supplies (after discount): " + formatMinorAmount(detail.sale.tax.ghana.zeroRatedMinor, detail.currency),
      "Exempt supplies (after discount): " + formatMinorAmount(detail.sale.tax.ghana.exemptMinor, detail.currency),
      "Tax registration: " + (detail.sale.tax.policy.registrationNumber ?? "unverified"),
      "NOT A GRA-CERTIFIED E-VAT INVOICE — official signature, QR and certification not issued by Tallybook."
    ] : detail.sale.tax ? [
      `${detail.sale.tax.policy.label} (${detail.sale.tax.policy.rateBasisPoints / 100}%, ${detail.sale.tax.policy.priceMode}): ${formatMinorAmount(detail.sale.tax.taxMinor, detail.currency)}`,
      `Before tax: ${formatMinorAmount(detail.sale.tax.taxableMinor, detail.currency)}`,
      ...(detail.sale.tax.policy.registrationNumber ? [`Tax registration: ${detail.sale.tax.policy.registrationNumber}`] : [])
    ] : []),
    `Total: ${formatMinorAmount(detail.sale.totalMinor, detail.currency)}`,
    `Settled: ${formatMinorAmount(detail.sale.amountPaidMinor, detail.currency)}`,
    ...(detail.sale.walletAppliedMinor ? [
      `Prepaid wallet used: ${formatMinorAmount(detail.sale.walletAppliedMinor, detail.currency)}`,
      `New cash received: ${formatMinorAmount(detail.sale.amountPaidMinor - detail.sale.walletAppliedMinor, detail.currency)}`,
    ] : []),
    ...(detail.sale.loyaltyRedeemedPoints ? [
      `Loyalty points redeemed: ${detail.sale.loyaltyRedeemedPoints}`,
      `Loyalty discount: ${formatMinorAmount(detail.sale.loyaltyRedeemedMinor ?? 0, detail.currency)}`,
    ] : []),
    `Remaining: ${formatMinorAmount(detail.sale.outstandingMinor, detail.currency)}`,
    payment,
    "",
    "Thank you for your business.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export type ReceiptShareResult = ShareBusinessTextResult;

export async function shareReceiptText(text: string): Promise<ReceiptShareResult> {
  return shareBusinessText({ title: "Tallybook receipt", text });
}
