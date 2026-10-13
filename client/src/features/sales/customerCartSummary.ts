export interface DisplayCartLine { name: string; quantity: number; unitPriceMinor: number }
/** Presentation-only totals. The checkout service remains authoritative. */
export function calculateDisplayCart(lines: DisplayCartLine[], discountMinor: number) {
  let subtotalMinor = 0;
  for (const line of lines) {
    if (!line.name.trim() || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) throw new Error("Invalid customer display item.");
    const amount = line.quantity * line.unitPriceMinor;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(subtotalMinor + amount)) throw new Error("Customer display amount overflow.");
    subtotalMinor += amount;
  }
  if (!Number.isSafeInteger(discountMinor) || discountMinor < 0 || discountMinor > subtotalMinor) throw new Error("Invalid customer display discount.");
  return { subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor };
}
