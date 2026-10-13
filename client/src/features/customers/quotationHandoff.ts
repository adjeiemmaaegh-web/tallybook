import { nanoid } from "nanoid";

export interface QuotationHandoff {
  companyId: string;
  customerId: string;
  currency: string;
  lines: Array<{ productId: string; quantity: number; priceMinor: number }>;
}
// Ephemeral navigation state, never an offer, reservation, payment or ledger write.
// Reloading the app discards it, so old links cannot recover private customer data.
const prepared = new Map<string, { value: QuotationHandoff; expiresAt: number }>();
export function prepareQuotationHandoff(value: QuotationHandoff, now = Date.now()) {
  for (const [key, entry] of prepared) if (entry.expiresAt <= now) prepared.delete(key);
  const token = nanoid(24);
  prepared.set(token, { value: structuredClone(value), expiresAt: now + 15 * 60_000 });
  return token;
}
export function readQuotationHandoff(token: string, companyId: string, now = Date.now()) {
  const entry = prepared.get(token);
  if (!entry || entry.expiresAt <= now || entry.value.companyId !== companyId) return null;
  return structuredClone(entry.value);
}
export function clearQuotationHandoff(token: string) { prepared.delete(token); }
