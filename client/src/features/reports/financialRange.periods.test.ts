// S3-02: calendar, DST, Ghana (UTC) and custom windows over event boundaries.
import {afterEach, describe, expect, it} from "vitest";
import {financialRange} from "./financialIntelligence";

const iso = (d: Date) => d.toISOString();
const originalTz = process.env.TZ;
afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz; });

describe("quarter period (regression: explicit undefined day produced an Invalid Date)", () => {
  it("returns a valid range starting on the first day of the calendar quarter, in Ghana and local time", () => {
    const cases: [string, string][] = [["2026-01-15T10:00:00Z", "2026-01-01"], ["2026-03-31T10:00:00Z", "2026-01-01"], ["2026-04-01T10:00:00Z", "2026-04-01"],
      ["2026-08-20T10:00:00Z", "2026-07-01"], ["2026-11-18T10:00:00Z", "2026-10-01"], ["2026-12-31T10:00:00Z", "2026-10-01"]];
    for (const [now, first] of cases) {
      const g = financialRange("quarter", new Date(now), undefined, undefined, "Ghana");
      expect(Number.isFinite(g.start.getTime()) && Number.isFinite(g.end.getTime())).toBe(true);
      expect(iso(g.start)).toBe(first + "T00:00:00.000Z");
      expect(g.start < g.end).toBe(true);
      const l = financialRange("quarter", new Date(now.replace("Z", "").replace("T10", "T12")));
      expect(Number.isFinite(l.start.getTime())).toBe(true);
      expect([l.start.getDate(), l.start.getMonth() % 3, l.start.getHours()]).toEqual([1, 0, 0]);
    }
  });
});

describe("financialRange in Ghana (UTC, no DST)", () => {
  const c = "Ghana";
  it("starts week on Monday, month/quarter/year on their first day, end is next day exclusive", () => {
    const wed = new Date("2026-11-18T15:30:00Z"); // Wednesday
    expect(iso(financialRange("today", wed, undefined, undefined, c).start)).toBe("2026-11-18T00:00:00.000Z");
    expect(iso(financialRange("today", wed, undefined, undefined, c).end)).toBe("2026-11-19T00:00:00.000Z");
    expect(iso(financialRange("week", wed, undefined, undefined, c).start)).toBe("2026-11-16T00:00:00.000Z");
    expect(iso(financialRange("month", wed, undefined, undefined, c).start)).toBe("2026-11-01T00:00:00.000Z");
    expect(iso(financialRange("quarter", wed, undefined, undefined, c).start)).toBe("2026-10-01T00:00:00.000Z");
    expect(iso(financialRange("year", wed, undefined, undefined, c).start)).toBe("2026-01-01T00:00:00.000Z");
  });
  it("on a Sunday the week still started the previous Monday; on a Monday it starts that day", () => {
    expect(iso(financialRange("week", new Date("2026-11-22T10:00:00Z"), undefined, undefined, c).start)).toBe("2026-11-16T00:00:00.000Z");
    expect(iso(financialRange("week", new Date("2026-11-16T00:00:00Z"), undefined, undefined, c).start)).toBe("2026-11-16T00:00:00.000Z");
  });
  it("an event at the last millisecond of the day is inside; midnight belongs to the next day", () => {
    const r = financialRange("custom", new Date("2026-11-18T12:00:00Z"), "2026-11-18", "2026-11-18", c);
    const inside = (t: string) => new Date(t) >= r.start && new Date(t) < r.end;
    expect(inside("2026-11-18T00:00:00.000Z")).toBe(true);
    expect(inside("2026-11-18T23:59:59.999Z")).toBe(true);
    expect(inside("2026-11-19T00:00:00.000Z")).toBe(false);
    expect(inside("2026-11-17T23:59:59.999Z")).toBe(false);
  });
  it("handles a leap day and year boundary", () => {
    const leap = financialRange("custom", new Date("2028-02-29T12:00:00Z"), "2028-02-29", "2028-02-29", c);
    expect(iso(leap.end)).toBe("2028-03-01T00:00:00.000Z");
    const span = financialRange("custom", new Date("2026-12-31T12:00:00Z"), "2026-12-31", "2027-01-01", c);
    expect((span.end.getTime() - span.start.getTime()) / 86400000).toBe(2);
  });
  it("custom range validation: shape, calendar, order, ten-year cap", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(() => financialRange("custom", now, "2026-1-1", "2026-11-18", c)).toThrow(/valid start and end/);
    expect(() => financialRange("custom", now, undefined, "2026-11-18", c)).toThrow(/valid start and end/);
    expect(() => financialRange("custom", now, "2027-02-29", "2027-03-01", c)).toThrow(/Invalid calendar date/);
    expect(() => financialRange("custom", now, "2026-11-19", "2026-11-18", c)).toThrow(/cannot be after/);
    expect(() => financialRange("custom", now, "2010-01-01", "2026-11-18", c)).toThrow(/ten years/);
    expect(() => financialRange("custom", now, "2016-11-19", "2026-11-18", c)).not.toThrow();
  });
});

describe("financialRange with a local timezone that has DST", () => {
  it("a spring-forward day is 23 hours and a fall-back day is 25 hours, never skipping or doubling a date", () => {
    process.env.TZ = "America/New_York";
    const probe = new Date("2026-03-08T12:00:00");
    if (probe.getTimezoneOffset() !== 240) return; // runtime ignored the TZ switch: cannot assert DST here
    const spring = financialRange("custom", new Date("2026-03-08T12:00:00"), "2026-03-08", "2026-03-08");
    expect((spring.end.getTime() - spring.start.getTime()) / 3600000).toBe(23);
    const fall = financialRange("custom", new Date("2026-11-01T12:00:00"), "2026-11-01", "2026-11-01");
    expect((fall.end.getTime() - fall.start.getTime()) / 3600000).toBe(25);
    const across = financialRange("custom", new Date("2026-03-07T12:00:00"), "2026-03-07", "2026-03-09");
    expect((across.end.getTime() - across.start.getTime()) / 3600000).toBe(24 + 23 + 24);
  });
  it("month and week starts land on local midnight", () => {
    process.env.TZ = "America/New_York";
    const now = new Date("2026-03-18T12:00:00");
    const m = financialRange("month", now), w = financialRange("week", now);
    expect([m.start.getHours(), m.start.getMinutes(), m.start.getDate()]).toEqual([0, 0, 1]);
    expect([w.start.getHours(), w.start.getDay()]).toEqual([0, 1]);
  });
});
