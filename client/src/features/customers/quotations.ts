import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import { calculateSaleTax, taxReviewKeyForSale, type TaxSnapshot } from "@/features/sales/tax";
import type { GhanaTaxTreatment } from "@/features/sales/ghanaVat.mjs";
import { selectUnitPrice } from "@/features/inventory/stage2Inventory";
import { requirePermission } from "@/features/staff/staff";
/** Offline quotations are offers only: creating or accepting one never changes stock or financial ledgers. */
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db, type TallybookDB } from '@/db/TallybookDB';
import { completeSale, type CompleteSaleInput } from '@/features/sales/sales';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';

export type QuotationStatus = 'draft' | 'issued' | 'accepted' | 'declined' | 'expired';
export interface QuotationLine { productId: string; productName: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }
export interface Quotation { tax?: TaxSnapshot; id: string; businessProfileId: string; customerId: string; currency: string; lines: QuotationLine[]; totalMinor: number; status: QuotationStatus; convertedSaleId?: string; expiresAt?: string; createdAt: string; updatedAt: string }
export const quotationInputSchema = z.object({ taxReviewKey: z.string().max(400).optional(), customerId: z.string().min(1), currency: z.string().min(3).max(6), lines: z.array(z.object({productId: z.string().min(1), quantity: z.number().int().positive().max(999999), expectedPriceMinor: z.number().int().nonnegative().optional()})).min(1).max(100), expiresAt: z.string().datetime().optional() });
export type QuotationInput = z.infer<typeof quotationInputSchema>;

export async function createQuotation(values: QuotationInput, database: TallybookDB = db): Promise<Quotation> {
  const input = quotationInputSchema.parse(values);
  const businessProfileId = getActiveBusinessProfileId();
  const now = new Date().toISOString();
  return database.transaction('rw', [database.businessProfiles, database.customers, database.products, database.quotations, database.staffMembers], async () => {
    await requirePermission("sell", database, businessProfileId);
    const customer = await database.customers.get(input.customerId);
    if (!customer || customer.businessProfileId !== businessProfileId || customer.archivedAt || customer.status !== 'active') throw new Error('Select an active customer from this business.');
    if (input.expiresAt && input.expiresAt <= now) throw new Error('Quotation expiry must be in the future.');
    const seen = new Set<string>();
    const lines: QuotationLine[] = [];
    const taxLines: Array<{productId: string; amountMinor: number; treatment?: GhanaTaxTreatment}> = [];
    for (const line of input.lines) {
      if (seen.has(line.productId)) throw new Error('Combine duplicate products before saving the quotation.');
      seen.add(line.productId);
      const product = await database.products.get(line.productId);
      if (!product || product.businessProfileId !== businessProfileId || product.archivedAt) throw new Error('A selected product is unavailable in this business.');
      const unitPriceMinor = product.sellingPriceMinor;
      if (line.expectedPriceMinor !== undefined && line.expectedPriceMinor !== unitPriceMinor) throw new Error('Catalogue prices changed. Review the quotation again before saving.');
      const lineTotalMinor = unitPriceMinor * line.quantity;
      if (!Number.isSafeInteger(lineTotalMinor) || lineTotalMinor < 0) throw new Error('Quotation amount is outside the supported range.');
      lines.push({productId: product.id, productName: product.name, quantity: line.quantity, unitPriceMinor, lineTotalMinor});
      taxLines.push({productId: product.id, amountMinor: lineTotalMinor, treatment: product.ghanaTaxTreatment});
    }
    const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    const policy = (await database.businessProfiles.get(businessProfileId))?.taxPolicy;
    if ((policy?.enabled || input.taxReviewKey !== undefined) && input.taxReviewKey !== taxReviewKeyForSale(policy,taxLines)) throw new Error("Tax settings changed. Review the quotation again.");
    const tax = calculateSaleTax(taxLines, 0, policy);
    const totalMinor = tax?.totalMinor ?? subtotalMinor;
    if (!Number.isSafeInteger(totalMinor)) throw new Error('Quotation total exceeds the supported range.');
    const quote: Quotation = {...(tax ? {tax} : {}), id: nanoid(14), businessProfileId, customerId: customer.id, currency: input.currency, lines, totalMinor, status: 'draft', expiresAt: input.expiresAt, createdAt: now, updatedAt: now};
    await database.quotations.add(quote);
    return quote;
  });
}
export async function listQuotations(database: TallybookDB = db): Promise<Quotation[]> {
  const businessProfileId = getActiveBusinessProfileId();
  return (await database.quotations.where('businessProfileId').equals(businessProfileId).toArray()).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function setQuotationStatus(id: string, status: Exclude<QuotationStatus,'draft'|'expired'>, database: TallybookDB = db): Promise<Quotation> {
  await requirePermission("sell", database);
  const businessProfileId = getActiveBusinessProfileId();
  return database.transaction('rw', [database.quotations, database.staffMembers], async () => {
    await requirePermission("sell", database, businessProfileId);
    const quote = await database.quotations.get(id);
    if (!quote || quote.businessProfileId !== businessProfileId) throw new Error('Quotation not found for this business.');
    if (quote.expiresAt && quote.expiresAt <= new Date().toISOString()) throw new Error('This quotation has expired.');
    const allowed: Record<string,string[]> = {draft:['issued'], issued:['accepted','declined']};
    if (!allowed[quote.status]?.includes(status)) throw new Error('This quotation status change is not allowed.');
    const updated = {...quote, status, updatedAt: new Date().toISOString()};
    await database.quotations.put(updated);
    return updated;
  });
}

/** Preview today's authoritative catalogue prices before converting an old offer.
 * This is read-only and does not reserve stock or guarantee a later price.
 */
export async function previewQuotationConversion(id: string, database: TallybookDB = db) {
  const activeId = getActiveBusinessProfileId();
  return database.transaction('r', [database.businessProfiles, database.quotations, database.customers, database.products], async () => {
    const quote = await database.quotations.get(id);
    if (!quote || quote.businessProfileId !== activeId || quote.status !== 'accepted' || quote.convertedSaleId) throw new Error('Only unconverted accepted quotations can be previewed.');
    if (quote.expiresAt && quote.expiresAt <= new Date().toISOString()) throw new Error('This quotation has expired.');
    const customer = await database.customers.get(quote.customerId);
    if (!customer || customer.businessProfileId !== activeId || customer.archivedAt || customer.status !== 'active') throw new Error('The quotation customer is unavailable.');
    let currentTotalMinor = 0;
    const lines = [] as Array<{productName:string; quantity:number; quotedMinor:number; currentMinor:number}>;
    const taxLines: Array<{productId: string; amountMinor: number; treatment?: GhanaTaxTreatment}> = [];
    for (const line of quote.lines) {
      const product = await database.products.get(line.productId);
      if (!product || product.businessProfileId !== activeId || product.archivedAt) throw new Error(`Quoted product ${line.productName} is unavailable.`);
      const currentMinor = selectUnitPrice(product, line.quantity) * line.quantity;
      if (!Number.isSafeInteger(currentMinor) || currentMinor < 0) throw new Error('Current catalogue price is invalid.');
      currentTotalMinor += currentMinor;
      if (!Number.isSafeInteger(currentTotalMinor)) throw new Error('Current quotation total exceeds the supported range.');
      lines.push({productName: product.name,quantity:line.quantity,quotedMinor:line.lineTotalMinor,currentMinor});
      taxLines.push({productId: product.id, amountMinor: currentMinor, treatment: product.ghanaTaxTreatment});
    }
    const policy = (await database.businessProfiles.get(activeId))?.taxPolicy;
    const tax = calculateSaleTax(taxLines, 0, policy);
    currentTotalMinor = tax?.totalMinor ?? currentTotalMinor;
    return {taxReviewKey: taxReviewKeyForSale(policy,taxLines), tax, quotationId:id, quotedTotalMinor:quote.totalMinor,currentTotalMinor,priceChanged:quote.totalMinor!==currentTotalMinor,lines};
  });
}

/** An accepted quotation is only converted by executing the normal validated POS transaction.
 * Stock, payments, receipt and customer debt are written solely by completeSale.
 * A stable submission key prevents duplicates if conversion is retried after interruption.
 */
export async function convertQuotationToSale(id: string, payment: Pick<CompleteSaleInput, 'paymentMethod' | 'amountPaid' | 'discount' | 'storeId'> & {expectedTotalMinor: number}, database: TallybookDB = db) {
  // Acquire the cross-tab shared lock before opening the IndexedDB write transaction.
  return withCrossTabDataLock("shared", () => convertQuotationToSaleWhileLocked(id, payment, database));
}

async function convertQuotationToSaleWhileLocked(id: string, payment: Pick<CompleteSaleInput, 'paymentMethod' | 'amountPaid' | 'discount' | 'storeId'> & {expectedTotalMinor: number}, database: TallybookDB = db) {
  const activeId = getActiveBusinessProfileId();
  return database.transaction('rw', database.tables, async () => {
  await requirePermission("sell", database, activeId);
  const quote = await database.quotations.get(id);
  if (!quote || quote.businessProfileId !== activeId || quote.status !== 'accepted') throw new Error('Only accepted quotations can be converted.');
  if (quote.expiresAt && quote.expiresAt <= new Date().toISOString()) throw new Error('This quotation has expired.');
  if (quote.convertedSaleId) throw new Error('This quotation has already been converted.');
  if (!Number.isSafeInteger(payment.expectedTotalMinor) || payment.expectedTotalMinor < 0) throw new Error('A reviewed current total is required.');
  const preview = await previewQuotationConversion(id, database);
  if (preview.currentTotalMinor !== payment.expectedTotalMinor) throw new Error('Catalogue prices changed after preview. Review the quotation again before recording a sale.');
  const result = await completeSale({...(payment.storeId?{storeId:payment.storeId}:{}),taxReviewKey: preview.taxReviewKey, lines: quote.lines.map(({productId,quantity}) => ({productId,quantity})), customerId: quote.customerId, currency: quote.currency, paymentMethod: payment.paymentMethod, amountPaid: payment.amountPaid, discount: payment.discount, submissionKey: `quote-${quote.id}`}, database);
  // The quotation link and the sale/cost/stock writes share one transaction.
  // A failed link write rolls the entire checkout back.
  await database.transaction('rw', database.quotations, async () => {
    const current = await database.quotations.get(id);
    if (!current || current.businessProfileId !== activeId || current.status !== 'accepted') throw new Error('Quotation status changed; sale was saved. Review sale history.');
    if (current.convertedSaleId && current.convertedSaleId !== result.sale.id) throw new Error('Quotation is linked to a different sale.');
    await database.quotations.put({...current, convertedSaleId: result.sale.id, updatedAt: new Date().toISOString()});
  });
  return result;
  });
}
