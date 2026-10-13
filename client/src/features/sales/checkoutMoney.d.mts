export interface CheckoutMoneyLine { productId: string; quantity: number; unitPriceMinor: number }
export declare function calculateCheckoutLines<T extends CheckoutMoneyLine>(lines: readonly T[]): { subtotalMinor: number; lines: (T & { lineTotalMinor: number })[] };
