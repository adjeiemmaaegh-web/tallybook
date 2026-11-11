/**
 * Client side of the owner's accounts view. The server adds up the shop's own
 * records; this only reads its text amounts into safe numbers and writes the
 * spreadsheet. Nothing here recalculates money.
 */
import { currencyMinorDivisor, formatMinorAmount } from "@/features/inventory/inventory";
import { escapeCsvSpreadsheetFormula } from "@/features/inventory/catalogCsv";
import { callShop } from "./shopClient";

export const ACCOUNTS = ["cash", "mobile", "card", "bank"] as const;
export type AccountId = (typeof ACCOUNTS)[number];
export const ACCOUNT_LABEL: Record<AccountId, string> = { cash: "Cash", mobile: "Mobile money", card: "Card", bank: "Bank" };
export const ACCOUNT_HINT: Record<AccountId, string> = {
  cash: "the drawer", mobile: "your mobile money wallet balance", card: "card payments not yet paid out to you", bank: "your bank statement balance",
};

export interface Components { sales: number; repayments: number; transfersIn: number; refunds: number; suppliers: number; expenses: number; transfersOut: number }
export interface AccountSummary {
  components: Components; inMinor: number; outMinor: number; netMinor: number; expectedNowMinor: number | null;
  lastReconciliation: { reconciliationId: string; asOf: string; actualMinor: number; differenceMinor: number | null } | null;
}
export interface AccountsOverview {
  from: string; to: string; accounts: Record<AccountId, AccountSummary>;
  position: { customersOweMinor: number; oweSuppliersMinor: number; stockAtCostMinor: number; stockLinesWithoutCost: number };
}
export interface Reconciliation { reconciliationId: string; account: AccountId; asOf: string; actualMinor: number; expectedMinor: number | null; differenceMinor: number | null; note: string | null }
export interface AccountTransfer { transferId: string; from: AccountId; to: AccountId; amountMinor: number; note: string | null; recordedAt: string; voided: boolean; voidReason: string | null }

function minor(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`The accounts have an amount that cannot be shown exactly (${label}).`);
  return n;
}
const maybe = (v: unknown, label: string) => v == null ? null : minor(v, label);
const rec = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`The accounts are incomplete (${label}).`);
  return value as Record<string, unknown>;
};

export function parseAccountsOverview(raw: unknown): AccountsOverview {
  const r = rec(raw, "overview"), accounts = rec(r.accounts, "accounts"), pos = rec(r.position, "position");
  const out = {} as Record<AccountId, AccountSummary>;
  for (const id of ACCOUNTS) {
    const a = rec(accounts[id], id), c = rec(a.components, `${id} components`);
    const last = a.lastReconciliation == null ? null : rec(a.lastReconciliation, `${id} count`);
    out[id] = {
      components: { sales: minor(c.sales, "sales"), repayments: minor(c.repayments, "repayments"), transfersIn: minor(c.transfersIn, "transfers in"), refunds: minor(c.refunds, "refunds"),
        suppliers: minor(c.suppliers, "suppliers"), expenses: minor(c.expenses, "expenses"), transfersOut: minor(c.transfersOut, "transfers out") },
      inMinor: minor(a.inMinor, "in"), outMinor: minor(a.outMinor, "out"), netMinor: minor(a.netMinor, "net"), expectedNowMinor: maybe(a.expectedNowMinor, "expected"),
      lastReconciliation: last && { reconciliationId: String(last.reconciliationId), asOf: String(last.asOf), actualMinor: minor(last.actualMinor, "counted"), differenceMinor: maybe(last.differenceMinor, "difference") },
    };
  }
  return { from: String(r.from), to: String(r.to), accounts: out,
    position: { customersOweMinor: minor(pos.customersOweMinor, "customers owe"), oweSuppliersMinor: minor(pos.oweSuppliersMinor, "owed to suppliers"),
      stockAtCostMinor: minor(pos.stockAtCostMinor, "stock at cost"), stockLinesWithoutCost: minor(pos.stockLinesWithoutCost, "stock without cost") } };
}
export const parseReconciliations = (raw: unknown): Reconciliation[] => {
  const list = rec(raw, "list").reconciliations;
  if (!Array.isArray(list)) throw new Error("Unexpected response from Tallybook.");
  return list.map(item => { const r = rec(item, "count");
    return { reconciliationId: String(r.reconciliationId), account: r.account as AccountId, asOf: String(r.asOf), actualMinor: minor(r.actualMinor, "counted"),
      expectedMinor: maybe(r.expectedMinor, "expected"), differenceMinor: maybe(r.differenceMinor, "difference"), note: typeof r.note === "string" ? r.note : null }; });
};
export const parseTransfers = (raw: unknown): AccountTransfer[] => {
  const list = rec(raw, "list").transfers;
  if (!Array.isArray(list)) throw new Error("Unexpected response from Tallybook.");
  return list.map(item => { const r = rec(item, "transfer");
    return { transferId: String(r.transferId), from: r.from as AccountId, to: r.to as AccountId, amountMinor: minor(r.amountMinor, "transfer"), note: typeof r.note === "string" ? r.note : null,
      recordedAt: String(r.recordedAt), voided: r.voided === true, voidReason: typeof r.voidReason === "string" ? r.voidReason : null }; });
};

const ops = "tallybook_shop_ops" as const;
export const getAccountsOverview = async (companyId: string, q: { from: string; to: string }) =>
  parseAccountsOverview(await callShop<unknown>("accountsOverview", { companyId, ...q }, ops));
export const reconcileShopAccount = (companyId: string, input: { reconciliationId: string; account: AccountId; actualMinor: number; note?: string }) =>
  callShop<{ reconciliationId: string; expectedMinor: string | null; differenceMinor: string | null; opening?: boolean; replayed: boolean }>("reconcileAccount", { companyId, ...input }, ops);
export const getReconciliations = async (companyId: string) => parseReconciliations(await callShop<unknown>("listReconciliations", { companyId }, ops));
export const recordAccountTransfer = (companyId: string, input: { transferId: string; from: AccountId; to: AccountId; amountMinor: number; note?: string }) =>
  callShop<{ transferId: string; replayed: boolean }>("recordAccountTransfer", { companyId, ...input }, ops);
export const voidAccountTransfer = (companyId: string, transferId: string, reason: string) =>
  callShop<{ transferId: string; voided: boolean }>("voidAccountTransfer", { companyId, transferId, reason }, ops);
export const getAccountTransfers = async (companyId: string) => parseTransfers(await callShop<unknown>("listAccountTransfers", { companyId }, ops));

/** "Over" / "short" in words, for a difference between what was counted and what the records say. */
export function describeDifference(differenceMinor: number | null, currency: string): string {
  if (differenceMinor == null) return "Opening balance set";
  if (differenceMinor === 0) return "Matches the records";
  const m = formatMinorAmount(Math.abs(differenceMinor), currency);
  return differenceMinor > 0 ? `${m} over` : `${m} short`;
}

export interface AccountsCsvOptions { shopName: string; periodLabel: string; currency: string }
/** The period's money by account, as a spreadsheet. */
export function accountsCsv(o: AccountsOverview, opts: AccountsCsvOptions): string {
  // Plain numbers for a spreadsheet: no currency symbol and no thousands separators.
  const m = (v: number) => (v / currencyMinorDivisor(opts.currency)).toFixed(currencyMinorDivisor(opts.currency) === 1 ? 0 : 2);
  // A plain number (even a negative one) cannot run as a formula; any other text is neutralised.
  const f = (v: string | number) => `"${(/^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : escapeCsvSpreadsheetFormula(String(v))).replaceAll('"', '""')}"`;
  const row = (...cells: Array<string | number>) => cells.map(f).join(",");
  const lines = [row("Accounts", opts.shopName), row("Period", opts.periodLabel), row("Currency", opts.currency), "",
    row("Account", "Sales", "Customer repayments", "Transfers in", "Refunds", "Supplier payments", "Expenses", "Transfers out", "In", "Out", "Net", "Last count", "Difference")];
  for (const id of ACCOUNTS) {
    const a = o.accounts[id], c = a.components;
    lines.push(row(ACCOUNT_LABEL[id], m(c.sales), m(c.repayments), m(c.transfersIn), m(c.refunds), m(c.suppliers), m(c.expenses), m(c.transfersOut), m(a.inMinor), m(a.outMinor), m(a.netMinor),
      a.lastReconciliation ? m(a.lastReconciliation.actualMinor) : "", a.lastReconciliation?.differenceMinor == null ? "" : m(a.lastReconciliation.differenceMinor)));
  }
  lines.push("", row("Position", "Amount"), row("Customers owe", m(o.position.customersOweMinor)), row("Owed to suppliers", m(o.position.oweSuppliersMinor)), row("Stock at cost", m(o.position.stockAtCostMinor)));
  if (o.position.stockLinesWithoutCost > 0) lines.push("", row("Note", `${o.position.stockLinesWithoutCost} stock line(s) have no cost recorded and are not in stock at cost.`));
  return lines.join("\r\n");
}
