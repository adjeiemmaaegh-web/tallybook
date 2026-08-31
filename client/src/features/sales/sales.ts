/** Tactile Ledger sales reminder: a completed sale is one all-or-nothing local transaction; a failed sale writes nothing. */
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import type { Customer } from "@/features/customers/customers";
import { formatMinorAmount, parseAmountToMinor, normalizeMoneyInput, type InventoryMovement, type Product } from "@/features/inventory/inventory";

export const SALE_BUSINESS_ID = "primary" as const;
export const paymentMethods = ["cash", "card", "mobile", "credit"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export interface Sale {
  id: string;
  businessProfileId: string;
  customerId?: string;
  receiptNumber: string;
  status: "completed";
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  outstandingMinor: number;
  paymentMethod: PaymentMethod;
  submissionKey: string;
  createdAt: string;
}

export interface SaleLine {
  id: string;
  saleId: string;
  productId: string;
  businessProfileId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface Payment {
  id: string;
  saleId: string;
  businessProfileId: string;
  customerId?: string;
  method: PaymentMethod;
  amountMinor: number;
  mobileMoneyProviderId?: string;
  mobileMoneyProviderName?: string;
  mobileMoneyReference?: string;
  createdAt: string;
}

export interface Receipt {
  id: string;
  saleId: string;
  businessProfileId: string;
  receiptNumber: string;
  issuedAt: string;
}

export interface CustomerActivity {
  id: string;
  customerId: string;
  saleId: string;
  businessProfileId: string;
  activityType: "sale";
  totalMinor: number;
  amountPaidMinor: number;
  outstandingMinor: number;
  createdAt: string;
}

export interface SaleCartLineInput { productId: string; quantity: number; }
export interface CompleteSaleInput { lines: SaleCartLineInput[]; customerId?: string; discount: string; paymentMethod: PaymentMethod; amountPaid: string; currency: string; mobileMoneyProviderId?: string; mobileMoneyReference?: string; submissionKey?: string; }
export interface SaleSnapshot { sales: Sale[]; lines: SaleLine[]; payments: Payment[]; receipts: Receipt[]; }

const lineSchema = z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(9_999_999) });
const validMoneyValue = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(normalizeMoneyInput(value));
export const completeSaleSchema = z.object({ lines: z.array(lineSchema).min(1, "Add at least one product."), customerId: z.string().optional(), discount: z.string().trim().refine(validMoneyValue, "Discount must be a valid amount."), paymentMethod: z.enum(paymentMethods), amountPaid: z.string().trim().refine(validMoneyValue, "Amount paid must be a valid amount."), currency: z.string().min(1), mobileMoneyProviderId: z.string().trim().min(1).max(80).optional(), mobileMoneyReference: z.string().trim().max(120, "Mobile Money reference must be 120 characters or fewer.").optional(), submissionKey: z.string().trim().min(8).max(80).optional() });

export function paymentMethodLabel(method: PaymentMethod) {
  if (method === "mobile") return "Mobile Money";
  return method[0].toUpperCase() + method.slice(1);
}

function parseAmount(value: string, currency: string) { return parseAmountToMinor(value, currency); }

function receiptNumber(now: Date) { return `TB-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${nanoid(5).toUpperCase()}`; }

export async function getSaleSnapshot(database: TallybookDB = db): Promise<SaleSnapshot> {
  const activeId = getActiveBusinessProfileId();
  const [allSales, allLines, allPayments, allReceipts] = await Promise.all([database.sales.orderBy("createdAt").reverse().toArray(), database.saleLines.toArray(), database.payments.orderBy("createdAt").reverse().toArray(), database.receipts.orderBy("issuedAt").reverse().toArray()]);
  return { sales: allSales.filter((sale) => sale.businessProfileId === activeId), lines: allLines.filter((line) => line.businessProfileId === activeId), payments: allPayments.filter((payment) => payment.businessProfileId === activeId), receipts: allReceipts.filter((receipt) => receipt.businessProfileId === activeId) };
}

export async function getCustomerSaleSummary(customerId: string, currency: string, database: TallybookDB = db) {
  const activeId = getActiveBusinessProfileId();
  const [sales, activities] = await Promise.all([database.sales.where("customerId").equals(customerId).and((sale) => sale.businessProfileId === activeId).toArray(), database.customerActivities.where("customerId").equals(customerId).and((activity) => activity.businessProfileId === activeId).reverse().sortBy("createdAt")]);
  const outstandingMinor = sales.reduce((sum, sale) => sum + sale.outstandingMinor, 0);
  return { outstandingMinor, outstandingLabel: formatMinorAmount(outstandingMinor, currency), activities: activities.reverse() };
}

export async function completeSale(values: CompleteSaleInput, database: TallybookDB = db) {
  const input = completeSaleSchema.parse(values);
  const mergedLines = new Map<string, number>();
  input.lines.forEach((line) => mergedLines.set(line.productId, (mergedLines.get(line.productId) ?? 0) + line.quantity));
  const nowDate = new Date();
  const now = nowDate.toISOString();

  return database.transaction("rw", [database.products, database.inventoryMovements, database.customers, database.sales, database.saleLines, database.payments, database.receipts, database.customerActivities, database.mobileMoneyProviders], async () => {
    const activeId = getActiveBusinessProfileId();
    const submissionKey = input.submissionKey ?? nanoid(18);
    const existingSale = await database.sales.where("submissionKey").equals(submissionKey).and((sale) => sale.businessProfileId === activeId).first();
    if (existingSale) {
      const [existingLines, existingPayment, existingReceipt] = await Promise.all([
        database.saleLines.where("saleId").equals(existingSale.id).toArray(),
        database.payments.where("saleId").equals(existingSale.id).first(),
        database.receipts.where("saleId").equals(existingSale.id).first(),
      ]);
      return { sale: existingSale, lines: existingLines, payment: existingPayment, receipt: existingReceipt! };
    }
    const requestedLines = Array.from(mergedLines.entries()).map(([productId, quantity]) => ({ productId, quantity }));
    const products = await Promise.all(requestedLines.map(({ productId }) => database.products.get(productId)));
    if (products.some((product) => !product || product.businessProfileId !== activeId || product.archivedAt)) throw new Error("One or more products are no longer available for sale.");
    const productById = new Map(products.filter((product): product is Product => Boolean(product)).map((product) => [product.id, product]));
    for (const line of requestedLines) { const product = productById.get(line.productId)!; if (line.quantity > product.stockQuantity) throw new Error(`${product.name} has only ${product.stockQuantity} units available.`); }
    const customer = input.customerId ? await database.customers.get(input.customerId) : undefined;
    if (input.customerId && (!customer || customer.businessProfileId !== activeId || customer.archivedAt)) throw new Error("Choose an active customer or complete this as a walk-in sale.");

    const subtotalMinor = requestedLines.reduce((sum, line) => sum + productById.get(line.productId)!.sellingPriceMinor * line.quantity, 0);
    const discountMinor = parseAmount(input.discount, input.currency);
    if (discountMinor > subtotalMinor) throw new Error("Discount cannot exceed the subtotal.");
    const totalMinor = subtotalMinor - discountMinor;
    const amountPaidMinor = input.paymentMethod === "credit" ? 0 : parseAmount(input.amountPaid, input.currency);
    if (amountPaidMinor > totalMinor) throw new Error("Amount paid cannot exceed the sale total.");
    const outstandingMinor = totalMinor - amountPaidMinor;
    if (outstandingMinor > 0 && !customer) throw new Error("Choose a customer before recording an outstanding amount.");
    if (input.paymentMethod === "credit" && input.amountPaid !== "0") throw new Error("Credit sales must record zero paid at completion.");
    if (input.paymentMethod !== "credit" && totalMinor > 0 && amountPaidMinor === 0) throw new Error("Record a payment amount or choose credit.");
    const mobileMoneyProviderId = input.mobileMoneyProviderId?.trim();
    const mobileMoneyReference = input.mobileMoneyReference?.trim() || undefined;
    if (input.paymentMethod !== "mobile" && (mobileMoneyProviderId || mobileMoneyReference)) throw new Error("Mobile Money provider details can only be saved with a Mobile Money payment.");
    if (input.paymentMethod === "mobile" && amountPaidMinor > 0 && !mobileMoneyProviderId) throw new Error("Choose a Mobile Money provider before recording this payment.");
    const mobileMoneyProvider = mobileMoneyProviderId ? await database.mobileMoneyProviders.get(mobileMoneyProviderId) : undefined;
    if (mobileMoneyProviderId && (!mobileMoneyProvider || mobileMoneyProvider.businessProfileId !== activeId || !mobileMoneyProvider.active)) throw new Error("Choose a saved Mobile Money provider before recording this payment.");

    const sale: Sale = { id: nanoid(14), businessProfileId: activeId, customerId: customer?.id, receiptNumber: receiptNumber(nowDate), status: "completed", subtotalMinor, discountMinor, totalMinor, amountPaidMinor, outstandingMinor, paymentMethod: input.paymentMethod, submissionKey, createdAt: now };
    const saleLines: SaleLine[] = requestedLines.map((line) => { const product = productById.get(line.productId)!; return { id: nanoid(14), saleId: sale.id, productId: product.id, businessProfileId: activeId, productName: product.name, quantity: line.quantity, unitPriceMinor: product.sellingPriceMinor, lineTotalMinor: product.sellingPriceMinor * line.quantity }; });
    const movements: InventoryMovement[] = requestedLines.map((line) => { const product = productById.get(line.productId)!; return { id: nanoid(14), businessProfileId: activeId, productId: product.id, movementType: "sale", quantityDelta: -line.quantity, previousQuantity: product.stockQuantity, resultingQuantity: product.stockQuantity - line.quantity, note: `Sale ${sale.receiptNumber}`, createdAt: now }; });
    const payment: Payment | undefined = amountPaidMinor > 0 ? { id: nanoid(14), saleId: sale.id, businessProfileId: activeId, customerId: customer?.id, method: input.paymentMethod, amountMinor: amountPaidMinor, ...(input.paymentMethod === "mobile" && mobileMoneyProvider ? { mobileMoneyProviderId: mobileMoneyProvider.id, mobileMoneyProviderName: mobileMoneyProvider.name, mobileMoneyReference } : {}), createdAt: now } : undefined;
    const receipt: Receipt = { id: nanoid(14), saleId: sale.id, businessProfileId: activeId, receiptNumber: sale.receiptNumber, issuedAt: now };
    const activity: CustomerActivity | undefined = customer ? { id: nanoid(14), customerId: customer.id, saleId: sale.id, businessProfileId: activeId, activityType: "sale", totalMinor, amountPaidMinor, outstandingMinor, createdAt: now } : undefined;

    await database.sales.add(sale);
    await database.saleLines.bulkAdd(saleLines);
    if (payment) await database.payments.add(payment);
    await database.receipts.add(receipt);
    if (activity) await database.customerActivities.add(activity);
    await database.products.bulkPut(requestedLines.map((line) => { const product = productById.get(line.productId)!; return { ...product, stockQuantity: product.stockQuantity - line.quantity, updatedAt: now }; }));
    await database.inventoryMovements.bulkAdd(movements);
    return { sale, lines: saleLines, payment, receipt };
  });
}
