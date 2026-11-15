/**
 * Clementia read-only spending answers. This never reads expenses directly:
 * listExpenses enforces the same scoped reports permission as the Expenses UI.
 * Do not mix legacy/unverified currencies into a financial total.
 */
import type { TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { businessDayKey, shiftBusinessDay } from "@/features/business/businessCalendar.mjs";
import { expenseCategories, expenseCategoryLabels, listExpenses, type ExpenseCategory } from "@/features/expenses/expenses";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { answer, failure, question } from "./replies";
import type { AssistantReply, ReplyDetail } from "./types";

interface ExpenseReviewContext { database: TallybookDB; currency: string; now: Date }
type Period = { label: string; start?: string; end?: string };

const REQUESTS = [
  /^(?:please\s+)?(?:show|list|review|summari[sz]e|check|display)\s+(?:(?:me|my|our|the|business|shop|all|today's|yesterday's)\s+)*(?:expenses?|spending|expenditure)\b/i,
  /^(?:please\s+)?how much (?:did|have) (?:we|i|our shop|my shop|the business) (?:spend|spent)\b/i,
  /^(?:please\s+)?what (?:did|have) (?:we|i|our shop|my shop|the business) (?:spend|spent)\b/i,
  /^(?:please\s+)?what(?:'s| is| was) (?:(?:our|my|the|business|shop)\s+)*(?:expenses?|spending|expenditure)(?:\s+(?:total|summary|breakdown))?\b/i,
  /^(?:please\s+)?(?:expenses?|spending|expenditure) (?:summary|report|breakdown|total)\b/i,
];
export function isExpenseReviewRequest(text: string): boolean {
  return REQUESTS.some((pattern) => pattern.test(text.trim()));
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function requestedPeriod(text: string, now: Date, country?: string): Period | AssistantReply {
  const day = businessDayKey(now, country);
  const mentions = [
    { name: "today", match: /\btoday(?:'s)?\b/i.test(text) },
    { name: "yesterday", match: /\byesterday(?:'s)?\b/i.test(text) },
    { name: "last7", match: /\b(?:last|past) (?:7|seven) days\b/i.test(text) },
    { name: "thisMonth", match: /\bthis month\b/i.test(text) },
    { name: "lastMonth", match: /\blast month\b/i.test(text) },
    { name: "all", match: /\ball time\b|\ball saved\b/i.test(text) },
  ].filter((item) => item.match);
  if (mentions.length > 1) return question("Which expense period do you want? Choose today, yesterday, last 7 days, this month, last month, or all saved expenses.", []);
  if (/\b(?:next|tomorrow)\b|\b(?:this|last|next|past)\s+(?:week|year|quarter|[0-9]+\s+days)\b/i.test(text) && mentions[0]?.name !== "last7") {
    return question("I can review expenses for today, yesterday, last 7 days, this month, last month, or all saved expenses. Which period?", []);
  }
  const selected = mentions[0]?.name ?? "all";
  if (selected === "today") return { label: "Today", start: day, end: day };
  if (selected === "yesterday") {
    const previous = businessDayKey(shiftBusinessDay(now, -1, country), country);
    return { label: "Yesterday", start: previous, end: previous };
  }
  if (selected === "last7") return { label: "Last 7 business-calendar days (including today)", start: businessDayKey(shiftBusinessDay(now, -6, country), country), end: day };
  if (selected === "thisMonth") return { label: "This month", start: day.slice(0, 7) + "-01", end: day };
  if (selected === "lastMonth") {
    const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 2, 1));
    const yearMonth = last.toISOString().slice(0, 7);
    return { label: "Last month", start: yearMonth + "-01", end: yearMonth + "-31" };
  }
  return { label: "All saved expense dates" };
}

/** Returns null when the text is not a spending-read request. Never creates or edits records. */
export async function expenseReviewReply(raw: string, ctx: ExpenseReviewContext): Promise<AssistantReply | null> {
  if (!isExpenseReviewRequest(raw)) return null;
  const companyId = getActiveBusinessProfileId();
  try {
    // This service validates current staff reports permission and rechecks
    // active-company identity before returning company-scoped records.
    const records = await listExpenses(ctx.database);
    const profile = await ctx.database.businessProfiles.get(companyId);
    if (getActiveBusinessProfileId() !== companyId) return failure("The business changed during expense review. Please ask again.");
    if (!profile || profile.currency !== ctx.currency) return failure("The active business or its currency changed. Please select the business and ask again.");
    const period = requestedPeriod(raw, ctx.now, profile.country);
    if ("kind" in period) return period;
    const categories = expenseCategories.filter((item) => new RegExp("\\b" + item + "\\b", "i").test(raw));
    if (categories.length > 1) return question("Please name only one expense category, or ask for all expenses.", []);
    const category: ExpenseCategory | undefined = categories[0];
    const verified = [];
    let excluded = 0;
    let total = 0;
    const totals = new Map<ExpenseCategory, number>();
    for (const record of records) {
      if (category && record.category !== category) continue;
      if (!validDay(record.expenseDate)) { excluded++; continue; }
      if ((period.start && record.expenseDate < period.start) || (period.end && record.expenseDate > period.end)) continue;
      if (record.currency !== ctx.currency || !expenseCategories.includes(record.category) ||
          !Number.isSafeInteger(record.amountMinor) || record.amountMinor <= 0) {
        excluded++;
        continue;
      }
      if (!Number.isSafeInteger(total + record.amountMinor)) return failure("The saved expense total exceeds the safe calculation range. Review Expenses; no total is shown.");
      total += record.amountMinor;
      verified.push(record);
      totals.set(record.category, (totals.get(record.category) ?? 0) + record.amountMinor);
    }
    if (getActiveBusinessProfileId() !== companyId) return failure("The business changed during expense review. Please ask again.");
    const label = period.label + (category ? " — " + expenseCategoryLabels[category] : "");
    const details: ReplyDetail[] = [
      { label: "Period", value: label },
      { label: "Verified expense entries", value: String(verified.length) },
      { label: "Expense total", value: formatMinorAmount(total, ctx.currency) },
      ...expenseCategories.filter((item) => totals.has(item)).map((item) => ({
        label: expenseCategoryLabels[item],
        value: formatMinorAmount(totals.get(item)!, ctx.currency),
      })),
    ];
    const warnings = [
      excluded ? String(excluded) + " saved entries could not be verified for this review (date, currency or amount) and were excluded. This total may be incomplete." : "",
      verified.length > 5 ? "Showing the latest 5 of " + verified.length + " verified entries." : "",
      "These figures are local recorded expenses, not confirmation of external payment settlement.",
    ].filter(Boolean).join(" ");
    return answer(verified.length
      ? label + ": " + verified.length + " verified expenses totalling " + formatMinorAmount(total, ctx.currency) + "."
      : label + ": no verified expenses found.", {
      details,
      rows: verified.slice(0, 5).map((entry) => ({
        primary: expenseCategoryLabels[entry.category],
        secondary: entry.expenseDate + (entry.note ? " · " + entry.note : ""),
        amount: formatMinorAmount(entry.amountMinor, ctx.currency),
      })),
      moreText: warnings,
      link: { label: "Open Expenses", href: "/expenses" },
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Expense review is unavailable.");
  }
}
