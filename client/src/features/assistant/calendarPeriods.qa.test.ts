import { describe, expect, it } from "vitest";
import { detectSalesPeriod, resolveRange } from "./dates";

const period = (text: string, now: Date) => {
  const detected = detectSalesPeriod(text, now);
  if (detected.kind !== "range") throw new Error(`Expected a date range for: ${text}`);
  return resolveRange(detected, now);
};
const iso = (value: Date) => [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");

describe("financial assistant calendar periods", () => {
  it("uses Monday-Sunday for last week, excluding current week", () => {
    const r = period("sales last week", new Date(2026, 9, 9, 12));
    expect([iso(r.start), iso(r.end)]).toEqual(["2026-09-28", "2026-10-05"]);
  });
  it("limits current week to today and includes the first day", () => {
    const r = period("sales this week", new Date(2026, 9, 9, 12));
    expect([iso(r.start), iso(r.end)]).toEqual(["2026-10-05", "2026-10-10"]);
  });
  it("uses the previous completed quarter", () => {
    const r = period("best sellers last quarter", new Date(2026, 9, 9, 12));
    expect([iso(r.start), iso(r.end)]).toEqual(["2026-07-01", "2026-10-01"]);
  });
  it("handles quarter and week rollover into the previous year", () => {
    const now = new Date(2027, 0, 1, 12);
    const q = period("last quarter", now);
    const w = period("last week", now);
    expect([iso(q.start), iso(q.end)]).toEqual(["2026-10-01", "2027-01-01"]);
    expect([iso(w.start), iso(w.end)]).toEqual(["2026-12-21", "2026-12-28"]);
  });
});
