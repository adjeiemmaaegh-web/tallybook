/** Normalize cart quantities before any financial or inventory writes. */
export function mergeCheckoutQuantities(lines: readonly { productId: string; quantity: number }[]): Map<string, number> {
  if (lines.length === 0) throw new Error("Add at least one product.");
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (typeof line.productId !== "string" || !line.productId.trim() || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 9_999_999) {
      throw new Error("Invalid checkout item or quantity.");
    }
    const sum = (merged.get(line.productId) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(sum) || sum > 9_999_999) throw new Error("Combined checkout quantity exceeds the permitted limit.");
    merged.set(line.productId, sum);
  }
  return merged;
}
