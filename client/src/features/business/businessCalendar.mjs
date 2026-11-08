/** Ghana retail business calendar: stored timestamps remain ISO UTC.
 * For Ghana, group by Africa/Accra (GMT); other countries retain device-local days.
 */
export const GHANA_TIME_ZONE = "Africa/Accra";
const isGhana = country => typeof country === "string" && country.trim().toLowerCase() === "ghana";
const instant = value => {
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(result.getTime())) throw new Error("Invalid business timestamp.");
  return result;
};
export function businessTimeZone(country) { return isGhana(country) ? GHANA_TIME_ZONE : undefined; }
export function businessDayKey(value, country) {
  const date = instant(value);
  if (isGhana(country)) return date.toISOString().slice(0, 10);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
export function businessDayStart(value, country) {
  const date = instant(value);
  if (isGhana(country)) return new Date(businessDayKey(date, country) + "T00:00:00.000Z");
  date.setHours(0, 0, 0, 0);
  return date;
}
export function shiftBusinessDay(value, days, country) {
  if (!Number.isSafeInteger(days) || Math.abs(days) > 36600) throw new Error("Invalid business day offset.");
  const date = businessDayStart(value, country);
  if (isGhana(country)) date.setUTCDate(date.getUTCDate() + days);
  else date.setDate(date.getDate() + days);
  return date;
}
export function businessDayEnd(value, country) { return shiftBusinessDay(value, 1, country); }
export function businessDateLabel(value, country) {
  return new Intl.DateTimeFormat(isGhana(country) ? "en-GH" : undefined, {
    ...(isGhana(country) ? { timeZone: GHANA_TIME_ZONE } : {}),
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  }).format(instant(value));
}
export function businessWeekdayLabel(value, country) {
  return new Intl.DateTimeFormat(isGhana(country) ? "en-GH" : undefined, {
    ...(isGhana(country) ? { timeZone: GHANA_TIME_ZONE } : {}), weekday: "short"
  }).format(instant(value));
}
export function businessDateTimeLabel(value, country) {
  return new Intl.DateTimeFormat(isGhana(country) ? "en-GH" : undefined, {
    ...(isGhana(country) ? { timeZone: GHANA_TIME_ZONE, timeZoneName: "short" } : {}),
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(instant(value));
}
