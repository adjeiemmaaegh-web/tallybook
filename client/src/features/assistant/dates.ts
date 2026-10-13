/** Tallybook Assistant: resolves date words into calendar days using the owner's local calendar, matching how the existing reports draw day boundaries. */
import type { SalesPeriodRequest } from "./types";

export interface CalendarDay { year: number; month: number; day: number }

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_ALTERNATION = Object.keys(MONTHS).sort((left, right) => right.length - left.length).join("|");
const WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, tues: 2, wednesday: 3, thursday: 4, thurs: 4, friday: 5, saturday: 6 };
const WEEKDAY_ALTERNATION = Object.keys(WEEKDAYS).sort((left, right) => right.length - left.length).join("|");

export function toCalendarDay(date: Date): CalendarDay { return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }; }
/** Local noon keeps the chosen day stable in every time zone, and lets the existing report code find its own start and end of that day. */
export function calendarDayToDate(day: CalendarDay): Date { return new Date(day.year, day.month - 1, day.day, 12, 0, 0, 0); }
export function toIsoDate(day: CalendarDay): string { return `${String(day.year).padStart(4, "0")}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`; }
export function describeDay(day: CalendarDay): string { return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(calendarDayToDate(day)); }
export function sameDay(left: CalendarDay, right: CalendarDay) { return left.year === right.year && left.month === right.month && left.day === right.day; }
export function isFutureDay(day: CalendarDay, now: Date) { return calendarDayToDate(day).getTime() > calendarDayToDate(toCalendarDay(now)).getTime(); }

function validDay(year: number, month: number, day: number): CalendarDay | null {
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? { year, month, day } : null;
}

function shiftDays(now: Date, offset: number): CalendarDay {
  const date = calendarDayToDate(toCalendarDay(now));
  date.setDate(date.getDate() + offset);
  return toCalendarDay(date);
}

export type DayDetection = { found: false } | { found: true; day: CalendarDay; source: "yesterday" | "weekday" | "date"; text: string } | { found: true; invalid: true; text: string };

/** Finds one explicit calendar day (yesterday, a weekday, or a written date) in already-prepared text. "Today" is intentionally left to the caller. */
export function detectDay(text: string, now: Date): DayDetection {
  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (iso) { const day = validDay(Number(iso[1]), Number(iso[2]), Number(iso[3])); return day ? { found: true, day, source: "date", text: iso[0] } : { found: true, invalid: true, text: iso[0] }; }

  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(text);
  if (numeric) {
    const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    const day = validDay(year, Number(numeric[2]), Number(numeric[1]));
    return day ? { found: true, day, source: "date", text: numeric[0] } : { found: true, invalid: true, text: numeric[0] };
  }

  const dayFirst = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH_ALTERNATION})\b(?:,?\s+(\d{4}))?`).exec(text);
  const monthFirst = new RegExp(String.raw`\b(${MONTH_ALTERNATION})\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?`).exec(text);
  const written = dayFirst ? { match: dayFirst, day: Number(dayFirst[1]), month: MONTHS[dayFirst[2]], year: dayFirst[3] } : monthFirst ? { match: monthFirst, day: Number(monthFirst[2]), month: MONTHS[monthFirst[1]], year: monthFirst[3] } : null;
  if (written) {
    const day = validDay(written.year ? Number(written.year) : now.getFullYear(), written.month, written.day);
    return day ? { found: true, day, source: "date", text: written.match[0] } : { found: true, invalid: true, text: written.match[0] };
  }

  if (/\b(?:yesterday)\b/.test(text)) return { found: true, day: shiftDays(now, -1), source: "yesterday", text: "yesterday" };

  const weekday = new RegExp(String.raw`\b(last\s+|on\s+|for\s+|this\s+)?(${WEEKDAY_ALTERNATION})\b`).exec(text);
  if (weekday) {
    const target = WEEKDAYS[weekday[2]];
    const strictlyBefore = weekday[1]?.trim() === "last";
    let offset = (now.getDay() - target + 7) % 7;
    if (offset === 0 && strictlyBefore) offset = 7;
    return { found: true, day: shiftDays(now, -offset), source: "weekday", text: weekday[0].trim() };
  }
  return { found: false };
}

/** Which period of sales the owner is asking about. Pass already-prepared (lower-case) text. */
export function detectSalesPeriod(text: string, now: Date): SalesPeriodRequest {
  if (/\b(?:last|previous)\s+quarter\b/.test(text)) return { kind: "range", id: "lastQuarter" };
  if (/\b(?:this|current)\s+quarter\b|\bquarter to date\b/.test(text)) return { kind: "range", id: "thisQuarter" };
  if (/\b(?:last|previous)\s+week\b/.test(text)) return { kind: "range", id: "lastWeek" };
  if (/\bthis week\b|\bweek to date\b/.test(text)) return { kind: "range", id: "thisWeek" };
  if (/\bthis month\b|\bmonth to date\b|\bso far this month\b/.test(text)) return { kind: "range", id: "thisMonth" };
  if (/\b(?:last|previous)\s+month\b/.test(text)) return { kind: "range", id: "lastMonth" };
  if (/\bthis year\b|\byear to date\b/.test(text)) return { kind: "range", id: "thisYear" };
  if (/\b(?:last|previous)\s+year\b/.test(text)) return { kind: "range", id: "lastYear" };
  if (/\bpast month\b/.test(text)) return { kind: "range", id: "lastDays", days: 30 };
  const lastDays = /\b(?:last|past|previous)\s+(\d{1,3})\s+days\b/.exec(text);
  if (lastDays) {
    const days = Number(lastDays[1]);
    if (days === 7) return { kind: "last7", approximatesWeek: false };
    if (days >= 1 && days <= 366) return days === 1 ? { kind: "today" } : { kind: "range", id: "lastDays", days };
    return { kind: "unsupported", text: lastDays[0] };
  }
  const detected = detectDay(text, now);
  if (detected.found) {
    if ("invalid" in detected) return { kind: "unsupported", text: detected.text };
    if (isFutureDay(detected.day, now)) return { kind: "unsupported", text: `${detected.text} (that date has not happened yet)` };
    return { kind: "day", ...detected.day, source: detected.source };
  }
  if (/\btoday'?s?\b|\bso far today\b|\bthis (?:morning|afternoon|evening)\b|\bright now\b/.test(text)) return { kind: "today" };
  if (/\bpast week\b|\bweekly\b|\bthe week\b/.test(text)) return { kind: "last7", approximatesWeek: /\bthe week\b|\bweekly\b/.test(text) };
  if (/\ball[\s-]?time\b|\bever\b|\boverall\b|\bsince (?:the )?(?:beginning|start)\b|\ball (?:saved )?records\b/.test(text)) return { kind: "all" };
  return { kind: "unspecified" };
}

/** The concrete start (inclusive) and end (exclusive) of a calendar range, on the owner's local calendar, with a label for answers. */
export function resolveRange(period: Extract<SalesPeriodRequest, { kind: "range" }>, now: Date): { start: Date; end: Date; label: string } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const monthName = (date: Date) => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
  switch (period.id) {
    case "thisWeek": {
      const mondayOffset = (now.getDay() + 6) % 7;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
      return { start, end: endOfToday, label: `This week (${toIsoDate(toCalendarDay(start))} onward)` };
    }
    case "lastWeek": {
      const mondayOffset = (now.getDay() + 6) % 7;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset - 7);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
      return { start, end, label: `Last week (${toIsoDate(toCalendarDay(start))}–${toIsoDate(toCalendarDay(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)))})` };
    }
    case "thisQuarter": {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), quarterMonth, 1), end: endOfToday, label: `This quarter (Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()})` };
    }
    case "lastQuarter": {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3 - 3;
      const start = new Date(now.getFullYear(), quarterMonth, 1);
      const end = new Date(now.getFullYear(), quarterMonth + 3, 1);
      return { start, end, label: `Last quarter (Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()})` };
    }
    case "thisMonth": { const start = new Date(now.getFullYear(), now.getMonth(), 1); return { start, end: endOfToday, label: `This month (${monthName(start)})` }; }
    case "lastMonth": { const start = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { start, end: new Date(now.getFullYear(), now.getMonth(), 1), label: `Last month (${monthName(start)})` }; }
    case "thisYear": return { start: new Date(now.getFullYear(), 0, 1), end: endOfToday, label: `This year (${now.getFullYear()})` };
    case "lastYear": return { start: new Date(now.getFullYear() - 1, 0, 1), end: new Date(now.getFullYear(), 0, 1), label: `Last year (${now.getFullYear() - 1})` };
    default: { const days = period.days ?? 30; const start = new Date(startOfToday); start.setDate(start.getDate() - (days - 1)); return { start, end: endOfToday, label: `The last ${days} days` }; }
  }
}

/** A purchase date for stock received: today unless the owner named another past day. */
export function detectPurchaseDay(text: string, now: Date): { day: CalendarDay; explicit: boolean } | { error: string } {
  const detected = detectDay(text, now);
  if (!detected.found) return { day: toCalendarDay(now), explicit: false };
  if ("invalid" in detected) return { error: `I couldn't read “${detected.text}” as a real date.` };
  if (isFutureDay(detected.day, now)) return { error: "Stock can only be recorded as received today or on an earlier day." };
  return { day: detected.day, explicit: true };
}
