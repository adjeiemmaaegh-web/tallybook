/** Tactile Ledger Stage 6: debt is derived from completed customer sales minus immutable repayment records, never typed as a mutable balance. */
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { currencyMinorDivisor, formatMinorAmount } from "@/features/inventory/inventory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import type { PaymentMethod, Sale } from "@/features/sales/sales";

export const repaymentMethods = ["cash", "card", "mobile"] as const;
export type RepaymentMethod = (typeof repaymentMethods)[number];

export interface DebtRepayment {
  id: string;
  businessProfileId: string;
  customerId: string;
  amountMinor: number;
  method: RepaymentMethod;
  note?: string;
  submissionKey: string;
  createdAt: string;
}

export type DebtActivity =
  | { id: string; type: "sale"; createdAt: string; saleId: string; totalMinor: number; amountPaidMinor: number; outstandingMinor: number; receiptNumber: string }
  | { id: string; type: "repayment"; createdAt: string; repaymentId: string; amountMinor: number; method: RepaymentMethod; note?: string };

export interface CustomerDebtSummary {
  customerId: string;
  salesOutstandingMinor: number;
  repaidMinor: number;
  outstandingMinor: number;
  outstandingLabel: string;
  activities: DebtActivity[];
}

export interface RecordRepaymentInput {
  customerId: string;
  amount: string;
  method: RepaymentMethod;
  note?: string;
  currency: string;
  submissionKey?: string;
}

export const recordRepaymentSchema = z.object({
  customerId: z.string().min(1),
  amount: z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Enter a valid repayment amount."),
  method: z.enum(repaymentMethods),
  note: z.string().trim().max(240, "Keep the repayment note under 240 characters.").optional(),
  currency: z.string().min(1),
  submissionKey: z.string().trim().min(8).max(80).optional(),
});

function parseAmount(value: string, currency: string) {
  const amount = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a repayment amount greater than zero.");
  return Math.round(amount * currencyMinorDivisor(currency));
}

function debtFromRecords(sales: Sale[], repayments: DebtRepayment[]) {
  const salesOutstandingMinor = sales.reduce((sum, sale) => sum + sale.outstandingMinor, 0);
  const repaidMinor = repayments.reduce((sum, repayment) => sum + repayment.amountMinor, 0);
  return { salesOutstandingMinor, repaidMinor, outstandingMinor: Math.max(0, salesOutstandingMinor - repaidMinor) };
}

export async function getCustomerDebtSummary(customerId: string, currency: string, database: TallybookDB = db): Promise<CustomerDebtSummary> {
  const [sales, repayments] = await Promise.all([
    database.sales.where("customerId").equals(customerId).and((sale) => sale.businessProfileId === getActiveBusinessProfileId()).toArray(),
    database.repayments.where("customerId").equals(customerId).and((repayment) => repayment.businessProfileId === getActiveBusinessProfileId()).toArray(),
  ]);
  const totals = debtFromRecords(sales, repayments);
  const activities: DebtActivity[] = [
    ...sales.map((sale) => ({ id: `sale-${sale.id}`, type: "sale" as const, createdAt: sale.createdAt, saleId: sale.id, totalMinor: sale.totalMinor, amountPaidMinor: sale.amountPaidMinor, outstandingMinor: sale.outstandingMinor, receiptNumber: sale.receiptNumber })),
    ...repayments.map((repayment) => ({ id: `repayment-${repayment.id}`, type: "repayment" as const, createdAt: repayment.createdAt, repaymentId: repayment.id, amountMinor: repayment.amountMinor, method: repayment.method, note: repayment.note })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return { customerId, ...totals, outstandingLabel: formatMinorAmount(totals.outstandingMinor, currency), activities };
}

export async function recordRepayment(values: RecordRepaymentInput, database: TallybookDB = db) {
  const input = recordRepaymentSchema.parse(values);
  const now = new Date().toISOString();
  return database.transaction("rw", [database.customers, database.sales, database.repayments], async () => {
    const submissionKey = input.submissionKey ?? nanoid(18);
    const activeId = getActiveBusinessProfileId();
    const existing = await database.repayments.where("submissionKey").equals(submissionKey).and((repayment) => repayment.businessProfileId === activeId).first();
    if (existing) return existing;
    const customer = await database.customers.get(input.customerId);
    if (!customer || customer.businessProfileId !== activeId || customer.archivedAt) throw new Error("Choose an active customer before recording a repayment.");
    const [sales, repayments] = await Promise.all([
      database.sales.where("customerId").equals(customer.id).and((sale) => sale.businessProfileId === activeId).toArray(),
      database.repayments.where("customerId").equals(customer.id).and((repayment) => repayment.businessProfileId === activeId).toArray(),
    ]);
    const balance = debtFromRecords(sales, repayments).outstandingMinor;
    if (balance <= 0) throw new Error(`${customer.name} has no outstanding balance to repay.`);
    const amountMinor = parseAmount(input.amount, input.currency);
    if (amountMinor > balance) throw new Error(`Repayment cannot exceed the outstanding balance of ${formatMinorAmount(balance, input.currency)}.`);
    const repayment: DebtRepayment = { id: nanoid(14), businessProfileId: activeId, customerId: customer.id, amountMinor, method: input.method, note: input.note?.trim() || undefined, submissionKey, createdAt: now };
    await database.repayments.add(repayment);
    return repayment;
  });
}
