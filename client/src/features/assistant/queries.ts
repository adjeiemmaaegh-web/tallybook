/**
 * Tallybook Assistant — read-only answers.
 *
 * Every figure comes straight from an existing TallyBook service (`getCustomerDebtSummary`, `getInventorySnapshot`, `getReportsSnapshot`,
 * `getPurchasesSnapshot`). This module only chooses which one to call and words the result.
 */
import type { TallybookDB } from "@/db/TallybookDB";
import { getCustomerDebtSummary } from "@/features/credit/credit";
import { getCustomerSnapshot, type Customer } from "@/features/customers/customers";
import { formatMinorAmount, getInventorySnapshot, isLowStock, type Product } from "@/features/inventory/inventory";
import { getPurchasesSnapshot, type Supplier } from "@/features/purchases/purchases";
import { getReportsSnapshot, type SalesReportRow } from "@/features/reports/reports";
import { paymentMethodLabel } from "@/features/sales/sales";
import { calendarDayToDate, describeDay } from "./dates";
import { answer, say } from "./replies";
import { AUDIT_ACTION_LABELS, listAudit } from "./audit";
import { loadPeriodSales, periodWindow } from "./salesAnalytics";
import { canonicalUnit, tokenize } from "./text";
import type { AssistantAction, AssistantReply, SalesPeriodRequest } from "./types";

export interface QueryContext { database: TallybookDB; currency: string; now: Date }

export async function customerBalanceReply(customer: Customer, ctx: QueryContext): Promise<AssistantReply> {
  const summary = await getCustomerDebtSummary(customer.id, ctx.currency, ctx.database);
  const details = summary.outstandingMinor > 0 || summary.repaidMinor > 0
    ? [
      { label: "Owed from credit sales", value: formatMinorAmount(summary.salesOutstandingMinor, ctx.currency) },
      ...(summary.repaidMinor > 0 ? [{ label: "Repaid so far", value: formatMinorAmount(summary.repaidMinor, ctx.currency) }] : []),
    ]
    : undefined;
  return answer(
    summary.outstandingMinor > 0 ? `${customer.name} currently owes ${summary.outstandingLabel}.` : `${customer.name} has no outstanding balance.`,
    { details,
      rows: summary.activities.slice(0, 5).map(activity => ({
        primary: activity.type === "sale" ? `Sale ${activity.receiptNumber}` : activity.type === "repayment" ? "Customer repayment" : `Reversal ${activity.receiptNumber}`,
        secondary: new Date(activity.createdAt).toLocaleDateString(),
        amount: formatMinorAmount(activity.type === "sale" ? activity.outstandingMinor : activity.type === "repayment" ? activity.amountMinor : activity.amountMinor, ctx.currency),
      })),
      moreText: summary.activities.length > 5 ? `Showing 5 of ${summary.activities.length} saved balance events. Open Customers for the full audit trail.` : undefined,
      link: { label: "Open Customers", href: "/customers" } },
  );
}

export function inventoryReply(products: Product[], unit: string | undefined, currency: string): AssistantReply {
  const describe = (product: Product) => product.stockQuantity === 0 ? `${product.name} is out of stock.` : `${product.name}: ${product.stockQuantity} in stock.`;
  const unitNote = (product: Product) => unit && !tokenize(product.name).some((word) => canonicalUnit(word) === unit) && canonicalUnit(product.baseUnit ?? "") !== unit
    ? product.baseUnit ? `${product.name} is stored in ${product.baseUnit}; this answer is not a conversion to ${unit}.` : `TallyBook does not have a verified unit for ${product.name}, so I can't confirm a ${unit} conversion.`
    : undefined;
  if (products.length === 1) {
    const [product] = products;
    const details = [
      { label: "Selling price", value: formatMinorAmount(product.sellingPriceMinor, currency) },
      ...(isLowStock(product) && product.stockQuantity > 0 ? [{ label: "Low-stock level", value: `${product.lowStockThreshold} — running low` }] : []),
    ];
    return answer(describe(product), { details, moreText: unitNote(product), link: { label: "Open Stock", href: "/inventory" } });
  }
  return answer(`I found ${products.length} products that match. Here is the stock for each:`, {
    rows: products.slice(0, 8).map((product) => ({ primary: product.name, secondary: isLowStock(product) && product.stockQuantity > 0 ? "Running low" : undefined, amount: product.stockQuantity === 0 ? "Out of stock" : `${product.stockQuantity} in stock` })),
    moreText: products.length > 8 ? `${products.length - 8} more not shown. Open Stock to see them all.` : undefined,
    link: { label: "Open Stock", href: "/inventory" },
  });
}

function periodLabel(period: SalesPeriodRequest, now: Date = new Date()): string {
  return periodWindow(period, now).label;
}

/** Sales come from the same `getReportsSnapshot` the Reports page uses. A specific day is asked for by passing that day as `now`. */
export async function salesReply(period: SalesPeriodRequest, ctx: QueryContext): Promise<AssistantReply> {
  if (period.kind === "range") return rangeSalesReply(period, ctx);
  const snapshot = period.kind === "day"
    ? await getReportsSnapshot("today", calendarDayToDate(period), ctx.database)
    : period.kind === "last7" ? await getReportsSnapshot("last7", ctx.now, ctx.database)
      : period.kind === "all" ? await getReportsSnapshot("all", ctx.now, ctx.database)
        : await getReportsSnapshot("today", ctx.now, ctx.database);
  const label = periodLabel(period, ctx.now);
  const note = period.kind === "last7" && period.approximatesWeek ? "TallyBook's weekly report covers the last 7 days, so that is what this shows." : undefined;
  if (!snapshot.totals.transactionCount) return answer(`${label}: no sales recorded.`, { moreText: note, link: { label: "Open Reports", href: "/reports" } });
  const count = snapshot.totals.transactionCount;
  const showDate = period.kind === "last7" || period.kind === "all";
  const rows = snapshot.sales.slice(0, 5).map((sale) => {
    const when = new Date(sale.createdAt);
    const time = showDate ? when.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return {
      primary: sale.customerName ?? "Walk-in customer",
      secondary: `${time} · ${paymentMethodLabel(sale.paymentMethod)}${sale.outstandingMinor > 0 ? ` · ${formatMinorAmount(sale.outstandingMinor, ctx.currency)} unpaid` : ""}`,
      amount: formatMinorAmount(sale.totalMinor, ctx.currency),
    };
  });
  return answer(`${label}: ${count} ${count === 1 ? "sale" : "sales"} totalling ${formatMinorAmount(snapshot.totals.salesMinor, ctx.currency)}.`, {
    details: [
      { label: "Sales total", value: formatMinorAmount(snapshot.totals.salesMinor, ctx.currency) },
      { label: "Money collected", value: formatMinorAmount(snapshot.totals.receivedMinor, ctx.currency) },
    ],
    rows,
    moreText: [note, count > rows.length ? `${count - rows.length} more ${count - rows.length === 1 ? "sale" : "sales"} not shown. Open Reports to see them all.` : undefined].filter(Boolean).join(" ") || undefined,
    link: { label: "Open Reports", href: "/reports" },
  });
}

export async function supplierPurchasesReply(supplier: Supplier, ctx: QueryContext): Promise<AssistantReply> {
  const { purchases } = await getPurchasesSnapshot(ctx.database);
  const mine = purchases.filter((purchase) => purchase.supplierId === supplier.id);
  if (!mine.length) return answer(`No purchases are recorded from ${supplier.name} yet.`, { link: { label: "Open Purchases", href: "/purchases" } });
  const rows = mine.slice(0, 5).map((purchase) => ({
    primary: new Date(`${purchase.purchaseDate}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }),
    secondary: purchase.lines.map((line) => `${line.quantity} × ${line.productName}`).join(", "),
    amount: formatMinorAmount(purchase.totalCostMinor, ctx.currency),
  }));
  return answer(`${supplier.name}: ${mine.length} ${mine.length === 1 ? "purchase" : "purchases"} recorded. Latest first:`, {
    rows,
    moreText: mine.length > rows.length ? `${mine.length - rows.length} older ${mine.length - rows.length === 1 ? "purchase" : "purchases"} not shown.` : undefined,
    link: { label: "Open Purchases", href: "/purchases" },
  });
}

/* ───────────── aggregate queries: multi-entity comparisons ───────────── */

const MORE_PERIODS = (subject: string): AssistantAction[] => ["today", "this month", "last month"].map((when) => say(when[0].toUpperCase() + when.slice(1), `${subject} ${when}`));

/** Sales totals for a calendar range, from the same saved sales the Reports page uses. */
async function rangeSalesReply(period: Extract<SalesPeriodRequest, { kind: "range" }>, ctx: QueryContext): Promise<AssistantReply> {
  const { window, sales } = await loadPeriodSales(period, ctx.database, ctx.now);
  if (!sales.length) return answer(`${window.label}: no sales recorded.`, { link: { label: "Open Reports", href: "/reports" } });
  const total = sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
  const collected = sales.reduce((sum, sale) => sum + sale.amountPaidMinor - (sale.walletAppliedMinor ?? 0), 0);
  const unpaid = sales.reduce((sum, sale) => sum + sale.outstandingMinor, 0);
  return answer(`${window.label}: ${sales.length} ${sales.length === 1 ? "sale" : "sales"} totalling ${formatMinorAmount(total, ctx.currency)}.`, {
    details: [
      { label: "Sales total", value: formatMinorAmount(total, ctx.currency) },
      { label: "Money received at sale (excludes prepaid wallet use)", value: formatMinorAmount(collected, ctx.currency) },
      ...(unpaid > 0 ? [{ label: "Left unpaid (credit)", value: formatMinorAmount(unpaid, ctx.currency) }] : []),
    ],
    moreText: "This is the sum of original saved sales before any separate reversals. Later customer repayments and earlier prepaid wallet deposits are not included. Open Reports for reconciled totals.",
    link: { label: "Open Reports", href: "/reports" },
  });
}

/**
 * Who owes the most. With no period this is each customer's current balance (the same figure as their customer page).
 * With a period it is the credit given in that period, since a balance has no date: the unpaid part of that period's credit sales.
 */
export async function topDebtorsReply(count: number, ctx: QueryContext, period?: SalesPeriodRequest): Promise<AssistantReply> {
  const customers = (await getCustomerSnapshot(ctx.database)).customers;
  const withPeriod = period && period.kind !== "unspecified" && period.kind !== "all" && period.kind !== "unsupported";
  if (!withPeriod) {
    const withDebt = await Promise.all(customers.map(async (customer: Customer) => ({ customer, debt: await getCustomerDebtSummary(customer.id, ctx.currency, ctx.database) })));
    const sorted = withDebt.filter((entry) => entry.debt.outstandingMinor > 0).sort((a, b) => b.debt.outstandingMinor - a.debt.outstandingMinor);
    if (!sorted.length) return answer("No customers have an outstanding balance.");
    const top = sorted.slice(0, count);
    return answer(`Customers who owe the most right now:`, {
      rows: top.map((entry) => ({ primary: entry.customer.name, secondary: entry.customer.phone ? `…${entry.customer.phone.replace(/\D/g, "").slice(-4)}` : undefined, amount: entry.debt.outstandingLabel })),
      moreText: sorted.length > top.length ? `${sorted.length - top.length} more customers have outstanding balances.` : undefined,
      actions: MORE_PERIODS("Top debtors"), link: { label: "Open Customers", href: "/customers" },
    });
  }
  const { window, sales } = await loadPeriodSales(period, ctx.database, ctx.now);
  const byCustomer = new Map<string, number>();
  sales.filter((sale) => sale.customerId && sale.outstandingMinor > 0).forEach((sale) => byCustomer.set(sale.customerId!, (byCustomer.get(sale.customerId!) ?? 0) + sale.outstandingMinor));
  const ranked = Array.from(byCustomer.entries()).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return answer(`${window.label}: no sales were left unpaid.`, { link: { label: "Open Customers", href: "/customers" } });
  const top = ranked.slice(0, count);
  const rows = await Promise.all(top.map(async ([customerId, creditMinor]) => {
    const customer = customers.find((item) => item.id === customerId);
    const now = customer ? (await getCustomerDebtSummary(customer.id, ctx.currency, ctx.database)).outstandingLabel : undefined;
    return { primary: customer?.name ?? "A customer", secondary: now ? `Owes ${now} in total today` : undefined, amount: formatMinorAmount(creditMinor, ctx.currency) };
  }));
  return answer(`${window.label}: customers given the most credit (the amount left unpaid on their sales that period):`, {
    rows, moreText: ranked.length > top.length ? `${ranked.length - top.length} more customers were left unpaid. Payments made later are not subtracted from these amounts.` : "Payments made later are not subtracted from these amounts.",
    link: { label: "Open Customers", href: "/customers" },
  });
}

export async function lowStockReply(ctx: QueryContext): Promise<AssistantReply> {
  const snapshot = await getInventorySnapshot(ctx.database);
  const low = snapshot.products.filter((product: Product) => isLowStock(product)).sort((a, b) => a.stockQuantity - b.stockQuantity || a.name.localeCompare(b.name));
  if (!low.length) return answer("Nothing is running low. Every product is above its low-stock level.");
  const rows = low.slice(0, 8).map((product: Product) => ({
    primary: product.name,
    secondary: `Low-stock level: ${product.lowStockThreshold}`,
    amount: product.stockQuantity === 0 ? "Out of stock" : `${product.stockQuantity} left`,
  }));
  return answer(`${low.length} ${low.length === 1 ? "product is" : "products are"} out of stock or running low:`, {
    rows,
    moreText: low.length > rows.length ? `${low.length - rows.length} more products are low on stock.` : undefined,
    link: { label: "Open Stock", href: "/inventory" },
  });
}

/** Best-selling products: grouped by product, ranked by quantity sold and then by money earned (the same ranking the dashboard uses). */
export async function bestSellingProductReply(period: SalesPeriodRequest, ctx: QueryContext): Promise<AssistantReply> {
  const { window, lines } = await loadPeriodSales(period, ctx.database, ctx.now);
  if (!lines.length) return answer(`${window.label}: no sales recorded, so there is no best seller yet.`, { actions: MORE_PERIODS("Best-selling products"), link: { label: "Open Reports", href: "/reports" } });
  const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
  lines.forEach((line) => {
    const current = byProduct.get(line.productId) ?? { name: line.productName, quantity: 0, revenue: 0 };
    current.quantity += line.quantity; current.revenue += line.lineTotalMinor;
    byProduct.set(line.productId, current);
  });
  const ranked = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name));
  const top = ranked.slice(0, 5);
  return answer(`${window.label}: best-selling products (by quantity sold):`, {
    rows: top.map((product, index) => ({ primary: `${index + 1}. ${product.name}`, secondary: `${product.quantity} sold`, amount: formatMinorAmount(product.revenue, ctx.currency) })),
    moreText: ranked.length > top.length ? `${ranked.length - top.length} more products were sold.` : undefined,
    actions: period.kind === "all" || period.kind === "unspecified" ? MORE_PERIODS("Best-selling products") : undefined,
    link: { label: "Open Reports", href: "/reports" },
  });
}

/** Customers who bought in the period, biggest spenders first. */
export async function customersWhoSoldToReply(period: SalesPeriodRequest, ctx: QueryContext, product?: { id: string; name: string }): Promise<AssistantReply> {
  const loaded = await loadPeriodSales(period, ctx.database, ctx.now);
  const { window } = loaded;
  const withProduct = product ? new Set(loaded.lines.filter((line) => line.productId === product.id).map((line) => line.saleId)) : undefined;
  const sales = withProduct ? loaded.sales.filter((sale) => withProduct.has(sale.id)) : loaded.sales;
  const what = product ? ` for ${product.name}` : "";
  const customers = (await getCustomerSnapshot(ctx.database)).customers;
  const named = sales.filter((sale) => sale.customerId);
  const walkIns = sales.length - named.length;
  if (!sales.length) return answer(`${window.label}: no sales recorded${what}.`, { actions: MORE_PERIODS("Which customers bought"), link: { label: "Open Reports", href: "/reports" } });
  const byCustomer = new Map<string, { count: number; total: number }>();
  named.forEach((sale) => { const current = byCustomer.get(sale.customerId!) ?? { count: 0, total: 0 }; current.count += 1; current.total += sale.totalMinor; byCustomer.set(sale.customerId!, current); });
  const ranked = Array.from(byCustomer.entries()).sort((a, b) => b[1].total - a[1].total);
  if (!ranked.length) return answer(`${window.label}: all ${walkIns} ${walkIns === 1 ? "sale was" : "sales were"} to walk-in customers, so there are no named customers to list.`);
  const top = ranked.slice(0, 8);
  return answer(`${window.label}: ${ranked.length} ${ranked.length === 1 ? "customer" : "customers"} bought${product ? ` ${product.name}` : ""}, biggest spenders first:`, {
    rows: top.map(([customerId, entry]) => ({ primary: customers.find((customer) => customer.id === customerId)?.name ?? "A customer", secondary: `${entry.count} ${entry.count === 1 ? "sale" : "sales"}`, amount: formatMinorAmount(entry.total, ctx.currency) })),
    moreText: [ranked.length > top.length ? `${ranked.length - top.length} more customers.` : undefined, walkIns ? `${walkIns} walk-in ${walkIns === 1 ? "sale is" : "sales are"} not listed.` : undefined].filter(Boolean).join(" ") || undefined,
    actions: period.kind === "all" || period.kind === "unspecified" ? MORE_PERIODS("Which customers bought") : undefined,
    link: { label: "Open Reports", href: "/reports" },
  });
}

/** What the Assistant itself saved (or tried to), from its activity log. */
export async function activityReply(period: SalesPeriodRequest, ctx: QueryContext & { companyId: string }): Promise<AssistantReply> {
  const window = periodWindow(period, ctx.now);
  const entries = await listAudit(ctx.database, ctx.companyId, { since: window.start, until: window.end });
  const reply = (r: AssistantReply): AssistantReply => ({ ...r, intent: "ACTIVITY_QUERY" });
  if (!entries.length) return reply(answer(`${window.label}: the assistant hasn't saved anything.`));
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const shown = entries.slice(0, 15);
  const failed = entries.filter((entry) => entry.outcome === "failed").length;
  return reply(answer(`${window.label}: the assistant saved ${entries.length - failed} ${entries.length - failed === 1 ? "thing" : "things"}${failed ? ` and failed to save ${failed}` : ""}.`, {
    rows: shown.map((entry) => ({
      primary: `${entry.outcome === "failed" ? "Failed \u2014 " : ""}${AUDIT_ACTION_LABELS[entry.action]}: ${entry.summary}`.slice(0, 140),
      secondary: `${when.format(new Date(entry.createdAt))}${entry.request ? ` \u00b7 \u201c${entry.request.slice(0, 80)}\u201d` : ""}`,
    })),
    moreText: entries.length > shown.length ? `${entries.length - shown.length} older entries are not shown.` : "This log is kept on this device only and is not part of backups.",
  }));
}
