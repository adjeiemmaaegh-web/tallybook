import { requirePermission } from "@/features/staff/staff";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {auditRun10CompanyReceivables} from "@/features/reports/run10ReceivablesAudit.mjs";
/** Tactile Ledger Stage 6: debt is derived from completed customer sales minus immutable repayment records, never typed as a mutable balance. */
import { nanoid } from "nanoid";
import { activeStaffShift } from "@/features/staff/staff";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { currencyMinorDivisor, formatMinorAmount } from "@/features/inventory/inventory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { reconcileCreditLedger, inspectReceivableCurrency, assertReceivableWriteCurrency } from "@/features/sales/creditLedger.mjs";
import { getRepaymentTargetsFromLedger, type RepaymentTargetsResult } from "@/features/credit/repaymentTargets.mjs";
import type { PaymentMethod, Sale } from "@/features/sales/sales";
import type { SaleReversal } from "@/features/assistant/reversals";

export const repaymentMethods = ["cash", "card", "mobile"] as const;
export type RepaymentMethod = (typeof repaymentMethods)[number];

export interface DebtRepayment {
  id: string;
  businessProfileId: string;
  customerId: string;
  amountMinor: number;
  /** Currency at collection, absent on unverifiable historical repayments. */
  currency?: string;
  method: RepaymentMethod;
  note?: string;
  submissionKey: string;
  createdAt: string;
  staffId?: string;
  shiftId?: string;
  /** Exact, optional sale-level evidence. Absent on unallocated legacy repayments. */
  saleAllocations?: Array<{ saleId: string; amountMinor: number }>;
}

export type DebtActivity =
  | { id: string; type: "sale"; createdAt: string; saleId: string; totalMinor: number; amountPaidMinor: number; outstandingMinor: number; receiptNumber: string }
  | { id: string; type: "repayment"; createdAt: string; repaymentId: string; amountMinor: number; method: RepaymentMethod; note?: string }
  | { id: string; type: "reversal"; createdAt: string; reversalId: string; amountMinor: number; receiptNumber: string };

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
  /** Optional explicit minor-unit allocations; must sum to the repayment. */
  saleAllocations?: Array<{ saleId: string; amountMinor: number }>;
}

export const recordRepaymentSchema = z.object({
  customerId: z.string().min(1),
  amount: z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Enter a valid repayment amount."),
  method: z.enum(repaymentMethods),
  note: z.string().trim().max(240, "Keep the repayment note under 240 characters.").optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use an uppercase three-letter currency code."),
  submissionKey: z.string().trim().min(8).max(80).optional(),
  saleAllocations: z.array(z.object({ saleId: z.string().min(1), amountMinor: z.number().int().positive().refine(Number.isSafeInteger, "Allocation must use safe minor units.") })).min(1).max(256).optional(),
});

function parseAmount(value: string, currency: string) {
  // Decimal text is financial evidence: never route a large decimal through
  // IEEE-754 multiplication/rounding, and never silently round extra digits.
  const normalized = value.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error("Enter a valid repayment amount.");
  const divisor = currencyMinorDivisor(currency);
  if (!Number.isSafeInteger(divisor) || divisor < 1 || (divisor !== 1 && divisor !== 10 && divisor !== 100))
    throw new Error("Unsupported repayment currency precision.");
  const fractionDigits = divisor === 1 ? 0 : divisor === 10 ? 1 : 2;
  const fractional = match[2] ?? "";
  if (fractional.length > fractionDigits)
    throw new Error("Repayment has more fractional digits than the currency supports.");
  const minor = BigInt(match[1]) * BigInt(divisor) +
    BigInt((fractional + "0".repeat(fractionDigits)).slice(0, fractionDigits) || "0");
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Repayment exceeds safe money bounds.");
  return Number(minor);
}

function debtFromRecords(sales: Sale[], repayments: DebtRepayment[], reversals: SaleReversal[] = []) {
  return reconcileCreditLedger(sales, reversals, repayments);
}

export async function getCustomerDebtSummary(customerId: string, currency: string, database: TallybookDB = db): Promise<CustomerDebtSummary> {
  const activeId = getActiveBusinessProfileId();
  const [sales, repayments, reversals] = await database.transaction("r", [database.sales, database.repayments, database.saleReversals], async () => Promise.all([
    database.sales.where("customerId").equals(customerId).and((sale) => sale.businessProfileId === activeId).toArray(),
    database.repayments.where("customerId").equals(customerId).and((repayment) => repayment.businessProfileId === activeId).toArray(),
    database.saleReversals.where("customerId").equals(customerId).and((reversal) => reversal.businessProfileId === activeId).toArray(),
  ]));
  if (getActiveBusinessProfileId()!==activeId)
    throw new Error("Company changed while reading customer credit history.");
  const totals = debtFromRecords(sales, repayments, reversals);
  const activities: DebtActivity[] = [
    ...sales.map((sale) => ({ id: `sale-${sale.id}`, type: "sale" as const, createdAt: sale.createdAt, saleId: sale.id, totalMinor: sale.totalMinor, amountPaidMinor: sale.amountPaidMinor, outstandingMinor: sale.outstandingMinor, receiptNumber: sale.receiptNumber })),
    ...repayments.map((repayment) => ({ id: `repayment-${repayment.id}`, type: "repayment" as const, createdAt: repayment.createdAt, repaymentId: repayment.id, amountMinor: repayment.amountMinor, method: repayment.method, note: repayment.note })),
    ...reversals.map((reversal) => ({ id: `reversal-${reversal.id}`, type: "reversal" as const, createdAt: reversal.createdAt, reversalId: reversal.id, amountMinor: reversal.reversedOutstandingMinor, receiptNumber: reversal.originalReceiptNumber })),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const denomination = inspectReceivableCurrency(sales, repayments);
  // A legacy amount must never acquire the profile's current currency label.
  const outstandingLabel = denomination.hasUnknownMoney
    ? `${totals.outstandingMinor} minor units (historical currency unverified)`
    : denomination.currency && denomination.currency !== currency
      ? formatMinorAmount(totals.outstandingMinor, denomination.currency)
      : formatMinorAmount(totals.outstandingMinor, currency);
  return { customerId, ...totals, outstandingLabel, activities };
}

/** Read-only, company-scoped sale choices. The write path checks again before posting. */
export async function getCustomerRepaymentTargets(customerId: string, currency: string, database: TallybookDB = db): Promise<RepaymentTargetsResult> {
  const activeId = getActiveBusinessProfileId();
  return database.transaction("r", [database.customers, database.sales, database.repayments, database.saleReversals], async () => {
    const customer = await database.customers.get(customerId);
    if (!customer || customer.businessProfileId !== activeId || customer.archivedAt)
      throw new Error("Choose an active customer before linking a repayment to a sale.");
    const [sales, repayments, reversals] = await Promise.all([
      database.sales.where("customerId").equals(customerId).and(sale => sale.businessProfileId === activeId).toArray(),
      database.repayments.where("customerId").equals(customerId).and(row => row.businessProfileId === activeId).toArray(),
      database.saleReversals.where("customerId").equals(customerId).and(row => row.businessProfileId === activeId).toArray(),
    ]);
    if(getActiveBusinessProfileId()!==activeId)
      throw new Error("Company changed while reading repayment targets.");
    return getRepaymentTargetsFromLedger(sales, reversals, repayments, {customerId, businessProfileId: activeId, currency});
  });
}

export async function recordRepayment(values: RecordRepaymentInput, database: TallybookDB = db) {
  // Coordinate before opening the write transaction, never wait for Web
  // Locks from inside Dexie. Run 7 recovery/backup exclusivity then applies
  // to sale-linked customer money just like other retail posting paths.
  return withCoordinatedRetailWrite(async()=>{
  const input = recordRepaymentSchema.parse(values);
  const activeId = getActiveBusinessProfileId();
  return database.transaction("rw", [database.appMeta, database.customers, database.sales, database.repayments, database.saleReversals, database.staffAudits, database.staffMembers, database.staffShifts], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    if(getActiveBusinessProfileId()!==activeId)
      throw new Error("Company switched before recording customer repayment.");
    const staff = await requirePermission("sell", database, activeId);
    const shift = await activeStaffShift(staff, database);
    if (staff?.role === "cashier" && !shift) throw new Error("Open a shift before recording repayments.");
    const now = new Date().toISOString();
    const submissionKey = input.submissionKey ?? nanoid(18);
    const canonicalAllocations = input.saleAllocations?.map(row => ({...row})).sort((a,b)=>a.saleId.localeCompare(b.saleId));
    if (canonicalAllocations?.some((row, index) => index > 0 && row.saleId === canonicalAllocations[index - 1].saleId))
      throw new Error("A credit sale may appear only once in a repayment allocation.");
    // An operation key cannot be reused for another customer or another
    // semantic allocation; check before any additional ledger changes.
    const matches = await database.repayments.where("submissionKey").equals(submissionKey).toArray();
    if (matches.length > 1) throw new Error("Duplicate repayment operation records require reconciliation.");
    const existing = matches[0];
    if (existing && existing.businessProfileId !== activeId) throw new Error("Repayment operation belongs to another company.");
    if (existing) {
      const amountMinor = parseAmount(input.amount, input.currency);
      if (existing.customerId!==input.customerId || existing.amountMinor!==amountMinor || (existing.currency !== input.currency) || existing.method!==input.method ||
        (existing.note??'')!==(input.note?.trim()??'') ||
        JSON.stringify(existing.saleAllocations ?? null) !== JSON.stringify(canonicalAllocations ?? null)) throw new Error("Repayment submission key was reused for different details.");
      return existing;
    }
    const customer = await database.customers.get(input.customerId);
    if (!customer || customer.businessProfileId !== activeId || customer.archivedAt) throw new Error("Choose an active customer before recording a repayment.");
    const [sales, repayments, reversals] = await Promise.all([
      database.sales.where("customerId").equals(customer.id).and((sale) => sale.businessProfileId === activeId).toArray(),
      database.repayments.where("customerId").equals(customer.id).and((repayment) => repayment.businessProfileId === activeId).toArray(),
      database.saleReversals.where("customerId").equals(customer.id).and((reversal) => reversal.businessProfileId === activeId).toArray(),
    ]);
    // No actual money can be posted against mismatched or unidentified currency.
    assertReceivableWriteCurrency(sales, repayments, input.currency);
    const balance = debtFromRecords(sales, repayments, reversals).outstandingMinor;
    if (balance <= 0) throw new Error(`${customer.name} has no outstanding balance to repay.`);
    const amountMinor = parseAmount(input.amount, input.currency);
    if (canonicalAllocations) {
      // The UI projection is advisory. Recheck currency, old unallocated payments,
      // and target amounts inside the same transaction that records the money.
      const choices = getRepaymentTargetsFromLedger(sales, reversals, repayments, {
        customerId: customer.id, businessProfileId: activeId, currency: input.currency,
      });
      if (!choices.canLink) throw new Error(choices.reason ?? "No eligible credit sale can be linked.");
      for (const entry of canonicalAllocations) {
        const target = choices.targets.find(row => row.saleId === entry.saleId);
        if (!target || entry.amountMinor > target.remainingMinor)
          throw new Error("This credit sale cannot accept that payment allocation. Refresh its saved balance.");
      }
      // The candidate repayment must reconcile together with every existing
      // repayment BEFORE it is written. No historical allocation is invented.
      reconcileCreditLedger(sales, reversals, [...repayments, {
        amountMinor, currency: input.currency, customerId: customer.id, businessProfileId: activeId, saleAllocations: canonicalAllocations,
      }]);
    }
    if (amountMinor > balance) throw new Error(`Repayment cannot exceed the outstanding balance of ${formatMinorAmount(balance, input.currency)}.`);
    const repayment: DebtRepayment = { id: nanoid(14), businessProfileId: activeId, customerId: customer.id, amountMinor, currency: input.currency, method: input.method, note: input.note?.trim() || undefined, submissionKey, createdAt: now, ...(canonicalAllocations ? {saleAllocations: canonicalAllocations} : {}), ...(staff ? {staffId:staff.id} : {}), ...(shift ? {shiftId:shift.id} : {}) };
    // Re-audit the proposed posting against the saved FULL customer ledger
    // while holding the same write transaction. Every supplied allocation is
    // checked and historical customer-only payments remain unallocated.
    auditRun10CompanyReceivables({
      company:activeId,customers:[customer],sales,
      repayments:[...repayments,repayment],reversals
    });
    if(getActiveBusinessProfileId()!==activeId)
      throw new Error("Company switched during customer repayment authorization.");
    await assertRun7RetailWriteReady(database.appMeta);
    const postingStaff = await requirePermission("sell",database,activeId);
    const postingShift = await activeStaffShift(postingStaff,database);
    if (postingStaff?.role === "cashier" && !postingShift)
      throw new Error("Cashier shift closed before repayment was recorded.");
    await database.repayments.add(repayment);
    if(staff) await database.staffAudits.add({id:nanoid(14),businessProfileId:activeId,staffId:staff.id,action:'repayment.recorded',createdAt:now,details:repayment.id});
    if(getActiveBusinessProfileId()!==activeId)
      throw new Error("Company switched before customer repayment committed.");
    return repayment;
  });
  });
}
