/** Fail closed on unsafe monetary arithmetic before checkout writes. All amounts are minor units. */
export function calculateCheckoutLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('Add at least one product.');
  let subtotalMinor = 0;
  const computed = [];
  for (const line of lines) {
    if (typeof line.productId !== 'string' || !line.productId.trim() ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 9_999_999 ||
        !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) {
      throw new Error('Invalid checkout quantity or unit price.');
    }
    const lineTotalMinor = line.quantity * line.unitPriceMinor;
    if (!Number.isSafeInteger(lineTotalMinor)) throw new Error('Checkout line exceeds safe money limits.');
    subtotalMinor += lineTotalMinor;
    if (!Number.isSafeInteger(subtotalMinor)) throw new Error('Checkout subtotal exceeds safe money limits.');
    computed.push({ ...line, lineTotalMinor });
  }
  return { subtotalMinor, lines: computed };
}
