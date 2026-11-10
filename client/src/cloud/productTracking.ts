/**
 * Services and items the owner does not count are sold without a stock check.
 * Absent means a normal, counted good, which is what a server that has not
 * been upgraded to product details returns.
 */
export const tracksStock = (product: { trackStock?: boolean }) => product.trackStock !== false;
