export interface QuoteRequest { item: string; quantity: number; currency: string }
export interface SupplierQuote { supplierId?: string; supplierName: string; currency: string; packPriceMinor: number; packSize?: number; minOrderUnits?: number;
  shippingMinor?: number; packagingMinor?: number; discountMinor?: number; taxIncluded?: boolean; taxMinor?: number; leadTimeDays?: number; validUntil: string; promoted?: boolean }
export interface PricedQuote { supplierId: string | null; supplierName: string; promoted: boolean; status: "comparable" | "incomplete" | "excluded"; reason?: string; missing?: string[];
  unitsOrdered?: number; adjustedQuantity?: boolean; adjustmentNote?: string | null; landedTotalMinor?: bigint; landedTotal?: string; perUnitMinor?: string; perUnitMillis?: string;
  leadTimeDays?: number | null; validUntil?: string; isLowerBoundOnly?: boolean }
export interface Baseline { item: string; currency: string; complete: boolean; paidAt: string; landedPerUnitMillis: number }
export type Savings = { claimed: false; reason?: string; savedPerUnitMillis?: string; savedBps?: number } | { claimed: true; savedPerUnitMillis: string; savedBps: number; note: string };
export interface Comparison { item: string; quantity: number; currency: string; comparable: PricedQuote[]; incomplete: PricedQuote[]; excluded: PricedQuote[]; rankingNote: string; cheapest: string | null; savings: Savings }
export function priceQuote(request: QuoteRequest, quote: SupplierQuote, now?: number): PricedQuote;
export function compareQuotes(input: { request: QuoteRequest; quotes: SupplierQuote[]; baseline?: Baseline; now?: number }): Comparison;
export function savingsAgainst(best: PricedQuote, baseline: Baseline | undefined, req: { item: string; currency: string }, now?: number): Savings;
