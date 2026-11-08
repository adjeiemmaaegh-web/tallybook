/** Read-only resolution of a previously committed checkout. Never creates another sale. */
import { validateTaxSnapshot } from "./tax";
import {assertSplitPaymentLedger} from "./splitTender.mjs";
import {validateGhanaVatLineEvidence} from "./ghanaVat.mjs";
import type { SaleSnapshot } from "./sales";

export function recoverSavedCheckout(snapshot: SaleSnapshot, companyId: string, submissionKey: string) {
  if (!companyId || !submissionKey) return null;
  const matching = snapshot.sales.filter(sale => sale.businessProfileId === companyId && sale.submissionKey === submissionKey);
  if (matching.length > 1) throw new Error("More than one sale has this submission key. Do not retry; contact support.");
  const sale = matching[0];
  if (!sale) return null;
  const fail = (reason: string): never => { throw new Error(`Saved sale ${reason}. Do not retry; inspect sales history.`); };
  const receipts = snapshot.receipts.filter(receipt => receipt.businessProfileId === companyId && receipt.saleId === sale.id);
  if (receipts.length !== 1 || receipts[0].receiptNumber !== sale.receiptNumber) fail("has missing, duplicate, or mismatched receipts");
  const lines = snapshot.lines.filter(line => line.businessProfileId === companyId && line.saleId === sale.id);
  if (!lines.length || lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0 || line.lineTotalMinor !== line.quantity * line.unitPriceMinor)) fail("has inconsistent item lines");
  validateTaxSnapshot(sale);
  if(sale.tax?.ghana)validateGhanaVatLineEvidence(sale,lines);
  const subtotal = lines.reduce((total, line) => total + line.lineTotalMinor, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal !== sale.subtotalMinor || (sale.tax?.totalMinor ?? sale.subtotalMinor - sale.discountMinor) !== sale.totalMinor || sale.totalMinor - sale.amountPaidMinor !== sale.outstandingMinor) fail("totals do not reconcile");
  const payments = snapshot.payments.filter(payment => payment.businessProfileId === companyId && payment.saleId === sale.id);
  assertSplitPaymentLedger(sale,payments);
  if ((sale.paymentMethod!=="split"&&payments.length>1) || payments.some(payment => !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0 || (sale.paymentMethod!=="split"&&payment.method !== sale.paymentMethod)) || payments.reduce((total, payment) => total + payment.amountMinor, 0) !== sale.amountPaidMinor - (sale.walletAppliedMinor ?? 0)) fail("payment does not reconcile");
  if (sale.walletAppliedMinor !== undefined && (sale.paymentMethod !== "wallet" || !Number.isSafeInteger(sale.walletAppliedMinor) || sale.walletAppliedMinor < 0 || sale.walletAppliedMinor > sale.amountPaidMinor || !sale.customerId)) fail("has invalid wallet settlement");
  return { sale, receipt: receipts[0], payment: payments[0], payments };
}
