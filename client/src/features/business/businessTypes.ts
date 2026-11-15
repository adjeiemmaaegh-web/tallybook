/** Shared canonical classification labels. Category is metadata, never permissions,
 * refund policy, stock behavior, tax mode or cloud/local business binding.
 */
export const businessTypes = [
  "Retail shop",
  "Clothing or fashion",
  "Salon or barber",
  "Food or restaurant",
  "Mechanic or repair",
  "Professional service",
  "Market trader",
  "Wholesale",
  "Home-based business",
  "Other"
] as const;
export type BusinessType=(typeof businessTypes)[number];
export function isBusinessType(value:unknown):value is BusinessType{
 return typeof value==="string" && (businessTypes as readonly string[]).includes(value);
}
