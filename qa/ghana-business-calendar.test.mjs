import test from "node:test";
import assert from "node:assert/strict";
import { GHANA_TIME_ZONE, businessTimeZone, businessDayKey, businessDayStart, businessDayEnd, shiftBusinessDay, businessDateLabel, businessDateTimeLabel } from "../client/src/features/business/businessCalendar.mjs";
import {reconcileFinancialPeriodDisplay} from "../client/src/features/reports/financialPeriodConservation.mjs";

test("Ghana posting day is GMT and independent of the user's device timezone", () => {
  assert.equal(GHANA_TIME_ZONE, "Africa/Accra");
  assert.equal(businessTimeZone("Ghana"), "Africa/Accra");
  assert.equal(businessTimeZone("Kenya"), undefined);
  assert.equal(businessDayKey("2026-11-08T23:59:59.999Z", "Ghana"), "2026-11-08");
  assert.equal(businessDayKey("2026-11-09T00:00:00.000Z", "Ghana"), "2026-11-09");
  assert.equal(businessDayKey("2026-11-08T23:30:00-02:00", "Ghana"), "2026-11-09");
  assert.equal(businessDayStart("2026-11-08T23:30:00-02:00", "Ghana").toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(businessDayEnd("2026-11-08T23:59:59Z", "Ghana").toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(shiftBusinessDay("2026-03-01T01:00:00Z", -1, "Ghana").toISOString(), "2026-02-28T00:00:00.000Z");
});
test("non-Ghana businesses retain the existing device-local calendar", () => {
  const date = new Date("2026-11-08T23:30:00Z");
  const expected = [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");
  assert.equal(businessDayKey(date, "Kenya"), expected);
  assert.equal(businessDayStart(date, "Kenya").getHours(), 0);
  assert.equal(date.toISOString(), "2026-11-08T23:30:00.000Z");
});
test("Ghana labels show the Ghana day and reject invalid timestamps", () => {
  assert.match(businessDateLabel("2026-11-09T01:00:00+04:00", "Ghana"), /8 November 2026/);
  assert.match(businessDateTimeLabel("2026-11-09T01:00:00+04:00", "Ghana"), /2026/);
  assert.throws(() => businessDayKey("invalid", "Ghana"), /Invalid business timestamp/);
  assert.throws(() => shiftBusinessDay(new Date(), 1.1, "Ghana"), /offset/);
});

test("Ghana financial daily conservation groups original postings at GMT midnight", () => {
  const result = reconcileFinancialPeriodDisplay({
    sales: [{createdAt:"2026-11-08T23:59:59.000Z", totalMinor:1000}],
    payments: [{createdAt:"2026-11-09T00:00:01.000Z", amountMinor:1000}]
  }, new Map(), {revenue:1000,collections:1000,expenses:0}, "Ghana");
  assert.deepEqual(result.daily.map(row=>[row.day,row.revenueMinor,row.collectionsMinor]),[
    ["2026-11-08",1000,0],["2026-11-09",0,1000]
  ]);
});
