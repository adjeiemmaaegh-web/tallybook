import { z } from "zod";

/** Owner-supplied single-rate policy. No country rate is inferred. */
export const taxPolicySchema = z.object({
  enabled: z.boolean(),
  registrationStatus: z.enum(["unknown", "not-registered", "registered"]),
  registrationNumber: z.string().trim().max(80).optional(),
  label: z.string().trim().min(1).max(40),
  rateBasisPoints: z.number().int().min(0).max(10000),
  priceMode: z.enum(["inclusive", "exclusive"]),
}).strict().superRefine((policy, context) => {
  if (policy.enabled && policy.registrationStatus !== "registered")
    context.addIssue({ code: "custom", message: "Confirm registered status before enabling tax.", path: ["registrationStatus"] });
});
export type TaxPolicy = z.infer<typeof taxPolicySchema>;
export interface TaxSnapshot { policy: TaxPolicy; taxableMinor: number; taxMinor: number; totalMinor: number; }
export function taxPolicyKey(policy?: TaxPolicy): string {
  if (!policy) return "off";
  const p = taxPolicySchema.parse(policy);
  return JSON.stringify([p.enabled, p.registrationStatus, p.registrationNumber ?? "", p.label, p.rateBasisPoints, p.priceMode]);
}
export function calculateTax(amountAfterDiscountMinor: number, policy?: TaxPolicy): TaxSnapshot | undefined {
  if (!Number.isSafeInteger(amountAfterDiscountMinor) || amountAfterDiscountMinor < 0) throw new Error("Invalid tax base.");
  if (!policy) return undefined;
  const p = taxPolicySchema.parse(policy);
  if (!p.enabled) return undefined;
  const base = BigInt(amountAfterDiscountMinor), rate = BigInt(p.rateBasisPoints);
  const denominator = p.priceMode === "inclusive" ? 10000n + rate : 10000n;
  // Round half up once per invoice, after all discounts, using exact integers.
  const tax = (base * rate * 2n + denominator) / (denominator * 2n);
  const total = p.priceMode === "inclusive" ? base : base + tax;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Tax total exceeds safe money limits.");
  return { policy: p, taxMinor: Number(tax), totalMinor: Number(total), taxableMinor: Number(total - tax) };
}
export function validateTaxSnapshot(sale: { subtotalMinor: number; discountMinor: number; totalMinor: number; tax?: TaxSnapshot }): number {
  if (!sale.tax) return 0; // Historical records have no established tax evidence.
  const expected = calculateTax(sale.subtotalMinor - sale.discountMinor, sale.tax.policy);
  if (!expected || expected.taxMinor !== sale.tax.taxMinor || expected.taxableMinor !== sale.tax.taxableMinor || expected.totalMinor !== sale.tax.totalMinor || expected.totalMinor !== sale.totalMinor)
    throw new Error("Saved tax amounts do not reconcile.");
  return expected.taxMinor;
}
