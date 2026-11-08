import { z } from "zod";
import { calculateGhanaVat, validateGhanaVatEvidence } from "./ghanaVat.mjs";
import type { GhanaVatBreakdown, GhanaTaxLine } from "./ghanaVat.mjs";

/** Historic single-rate taxation remains unchanged. Ghana Act 1151 is opt-in. */
export const taxPolicySchema = z.object({
  enabled: z.boolean(),
  registrationStatus: z.enum(["unknown", "not-registered", "registered"]),
  registrationNumber: z.string().trim().max(80).optional(),
  label: z.string().trim().min(1).max(40),
  rateBasisPoints: z.number().int().min(0).max(10000),
  priceMode: z.enum(["inclusive", "exclusive"]),
  scheme: z.enum(["ghana-vat-2026"]).optional(),
}).strict().superRefine((policy, context) => {
  if (policy.enabled && policy.registrationStatus !== "registered")
    context.addIssue({ code: "custom", message: "Confirm registered status before enabling tax.", path: ["registrationStatus"] });
  if (policy.scheme === "ghana-vat-2026") {
    if (policy.rateBasisPoints !== 2000)
      context.addIssue({ code: "custom", message: "Ghana Act 1151 requires the fixed 15% VAT, 2.5% NHIL and 2.5% GETFund rates.", path: ["rateBasisPoints"] });
    if (policy.enabled && !policy.registrationNumber?.trim())
      context.addIssue({ code: "custom", message: "Enter the verified Ghana tax registration identifier before enabling Ghana VAT.", path: ["registrationNumber"] });
  }
});
export type TaxPolicy = z.infer<typeof taxPolicySchema>;
export interface TaxSnapshot {
  policy: TaxPolicy;
  taxableMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Immutable per-category bases and independently reconcilable levies. Never a GRA-certified invoice. */
  ghana?: GhanaVatBreakdown;
}

export function taxPolicyKey(policy?: TaxPolicy): string {
  if (!policy) return "off";
  const p = taxPolicySchema.parse(policy);
  const legacy = [p.enabled, p.registrationStatus, p.registrationNumber ?? "", p.label, p.rateBasisPoints, p.priceMode];
  return JSON.stringify(p.scheme ? [...legacy, p.scheme] : legacy);
}

/** Cart-specific review fingerprint: prevent silently changing a classified
 * Ghana product or its price after the cashier reviewed the tax preview.
 * The server still verifies permissions, stock, price and tax independently.
 */
export function taxReviewKeyForSale(policy: TaxPolicy | undefined, lines: Array<{productId: string; amountMinor: number; treatment?: GhanaTaxLine["treatment"]}>): string {
  const base = taxPolicyKey(policy);
  if (!policy?.enabled || policy.scheme !== "ghana-vat-2026") return base;
  const serialized = JSON.stringify(lines.map(line => [line.productId, line.amountMinor, line.treatment ?? "unclassified"]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
  let fingerprint = 14695981039346656037n;
  for (let i = 0; i < serialized.length; i++) {
    fingerprint ^= BigInt(serialized.charCodeAt(i));
    fingerprint = BigInt.asUintN(64, fingerprint * 1099511628211n);
  }
  return base + "|cart:" + lines.length + ":" + fingerprint.toString(16);
}

/** For existing single-rate companies only. New Ghana VAT must receive product classifications. */
export function calculateTax(amountAfterDiscountMinor: number, policy?: TaxPolicy): TaxSnapshot | undefined {
  if (!Number.isSafeInteger(amountAfterDiscountMinor) || amountAfterDiscountMinor < 0) throw new Error("Invalid tax base.");
  if (!policy) return undefined;
  const p = taxPolicySchema.parse(policy);
  if (!p.enabled) return undefined;
  if (p.scheme === "ghana-vat-2026") throw new Error("Ghana VAT requires a classified product breakdown, not a single inferred rate.");
  const base = BigInt(amountAfterDiscountMinor), rate = BigInt(p.rateBasisPoints);
  const denominator = p.priceMode === "inclusive" ? 10000n + rate : 10000n;
  const tax = (base * rate * 2n + denominator) / (denominator * 2n);
  const total = p.priceMode === "inclusive" ? base : base + tax;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Tax total exceeds safe money limits.");
  return { policy: p, taxMinor: Number(tax), totalMinor: Number(total), taxableMinor: Number(total - tax) };
}

export function calculateSaleTax(lines: Array<{amountMinor: number; treatment?: GhanaTaxLine["treatment"]}>, discountMinor: number, policy?: TaxPolicy): TaxSnapshot | undefined {
  if (!Array.isArray(lines) || !lines.length || !Number.isSafeInteger(discountMinor) || discountMinor < 0)
    throw new Error("Invalid sale tax inputs.");
  const sum = lines.reduce((acc, line) => {
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor < 0 || !Number.isSafeInteger(acc + line.amountMinor))
      throw new Error("Sale tax amount exceeds safe precision.");
    return acc + line.amountMinor;
  }, 0);
  if (discountMinor > sum) throw new Error("Tax discount exceeds subtotal.");
  if (!policy) return undefined;
  const parsed = taxPolicySchema.parse(policy);
  if (!parsed.enabled) return undefined;
  if (parsed.scheme !== "ghana-vat-2026") return calculateTax(sum - discountMinor, parsed);
  const result = calculateGhanaVat(lines, discountMinor, parsed.priceMode);
  return { policy: parsed, taxableMinor: result.taxableMinor, taxMinor: result.taxMinor, totalMinor: result.totalMinor, ghana: result };
}

export function validateTaxSnapshot(sale: { subtotalMinor: number; discountMinor: number; totalMinor: number; tax?: TaxSnapshot }): number {
  if (!sale.tax) return 0;
  const policy = taxPolicySchema.parse(sale.tax.policy);
  if (policy.scheme === "ghana-vat-2026") {
    validateGhanaVatEvidence(sale);
    return sale.tax.taxMinor;
  }
  if (sale.tax.ghana) throw new Error("Unexpected Ghana tax breakdown on a single-rate sale.");
  const expected = calculateTax(sale.subtotalMinor - sale.discountMinor, policy);
  if (!expected || expected.taxMinor !== sale.tax.taxMinor || expected.taxableMinor !== sale.tax.taxableMinor ||
      expected.totalMinor !== sale.tax.totalMinor || expected.totalMinor !== sale.totalMinor)
    throw new Error("Saved tax amounts do not reconcile.");
  return expected.taxMinor;
}
