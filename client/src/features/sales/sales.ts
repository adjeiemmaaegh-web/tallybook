import Dexie from "dexie";
import { withCrossTabDataLock } from "@/features/backup/crossTabDataLock.mjs";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
/** Tactile Ledger sales reminder: a completed sale is one all-or-nothing local transaction; a failed sale writes nothing. */
import { calculateTax, taxPolicyKey, type TaxSnapshot } from "./tax";
import {snapshotSaleTaxConfiguration,type Run12SaleTaxConfiguration} from '@/features/reports/run12SaleTaxAudit.mjs';
import {saleReturnPolicySnapshot,type ReturnPolicySnapshot} from '@/features/business/returnPolicy.mjs';
import { nanoid } from "nanoid";
import { postStoreStockDelta } from "@/features/stores/storeStockLedger";
import {reservedRun16Units} from "@/features/commerce/run16Availability";
import {consumeRun16OrderForSale} from "@/features/commerce/run16Orders";
import { mergeCheckoutQuantities } from "./checkoutQuantities";
import { calculateCheckoutLines } from "./checkoutMoney.mjs";
import { checkedMinorSum, checkedCreditExposure, reconcileCreditLedger, inspectReceivableCurrency, assertReceivableWriteCurrency } from "./creditLedger.mjs";
import { requirePermission, consumeCheckoutDiscountApproval } from "@/features/staff/staff";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { selectUnitPrice } from "@/features/inventory/stage2Inventory";
import { allocationCost, appendInventoryCostChange } from "@/features/inventory/costLedger";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import type { Customer } from "@/features/customers/customers";
import { formatMinorAmount, parseAmountToMinor, normalizeMoneyInput, type InventoryMovement, type Product } from "@/features/inventory/inventory";

export const SALE_BUSINESS_ID = "primary" as const;
export const paymentMethods = ["cash", "card", "mobile", "credit", "wallet"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export interface Sale {
  storeId?: string;
  commerceOrderId?:string;
  tax?: TaxSnapshot;
  /** Captured on new checkouts: OFF is explicit, legacy absence remains unverified. */
  taxConfigurationAtSale?:Run12SaleTaxConfiguration;
  /** Immutable snapshot of company return terms at original checkout. */
  returnPolicyAtSale?:ReturnPolicySnapshot;
  id: string;
  businessProfileId: string;
  customerId?: string;
  receiptNumber: string;
  /** Currency captured when the sale was saved; absent on unverifiable legacy sales. */
  currency?: string;
  status: "completed";
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  walletAppliedMinor?: number;
  loyaltyRedeemedPoints?: number;
  loyaltyRedeemedMinor?: number;
  outstandingMinor: number;
  paymentMethod: PaymentMethod;
  submissionKey: string;
  createdAt: string;
  staffId?: string;
  shiftId?: string;
  costStatus?: "verified" | "unavailable";
  cogsMinor?: number;
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
  stockTracked?: boolean;
  costStatus?: "verified" | "unavailable";
  cogsMinor?: number;
  costEventId?: string;
  batchAllocations?: Array<{ batchId: string; quantity: number }>;
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
  walletAppliedMinor?: number;
  loyaltyRedeemedPoints?: number;
  loyaltyRedeemedMinor?: number;
  outstandingMinor: number;
  createdAt: string;
}

export interface SaleCartLineInput { productId: string; quantity: number; }
export interface CompleteSaleInput { commerceOrderId?:string; storeId?: string; taxReviewKey?: string; lines: SaleCartLineInput[]; customerId?: string; discount: string; paymentMethod: PaymentMethod; amountPaid: string; currency: string; mobileMoneyProviderId?: string; mobileMoneyReference?: string; submissionKey?: string; redeemPoints?: number; }
export interface SaleSnapshot { sales: Sale[]; lines: SaleLine[]; payments: Payment[]; receipts: Receipt[]; }

const lineSchema = z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(9_999_999) });
const validMoneyValue = (value: string) => /^\d+(?:\.\d{1,2})?$/.test(normalizeMoneyInput(value));
export const completeSaleSchema = z.object({ commerceOrderId:z.string().min(1).max(128).optional(), storeId: z.string().min(1).max(200).optional(), taxReviewKey: z.string().max(400).optional(), lines: z.array(lineSchema).min(1, "Add at least one product."), customerId: z.string().optional(), discount: z.string().trim().refine(validMoneyValue, "Discount must be a valid amount."), paymentMethod: z.enum(paymentMethods), amountPaid: z.string().trim().refine(validMoneyValue, "Amount paid must be a valid amount."), currency: z.string().regex(/^[A-Z]{3}$/, "Use an uppercase three-letter currency code."), mobileMoneyProviderId: z.string().trim().min(1).max(80).optional(), mobileMoneyReference: z.string().trim().max(120, "Mobile Money reference must be 120 characters or fewer.").optional(), submissionKey: z.string().trim().min(8).max(80).optional(), redeemPoints: z.number().int().min(0).max(1000000).optional() });

export function paymentMethodLabel(method: PaymentMethod) {
  if (method === "mobile") return "Mobile Money";
  return method[0].toUpperCase() + method.slice(1);
}

function parseAmount(value: string, currency: string) { return parseAmountToMinor(value, currency); }

function receiptNumber(now: Date) { return `TB-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${nanoid(5).replaceAll("-", "_").toUpperCase()}`; }

export async function getSaleSnapshot(database: TallybookDB = db): Promise<SaleSnapshot> {
  const activeId = getActiveBusinessProfileId();
  // Read related checkout records from one consistent IndexedDB snapshot.
  // Separate requests could otherwise straddle a committed checkout.
  const [allSales, allLines, allPayments, allReceipts] = await database.transaction("r", [database.sales, database.saleLines, database.payments, database.receipts, database.staffMembers], async () => {
    await requirePermission("sell",database,activeId);
    return Promise.all([database.sales.orderBy("createdAt").reverse().toArray(), database.saleLines.toArray(), database.payments.orderBy("createdAt").reverse().toArray(), database.receipts.orderBy("issuedAt").reverse().toArray()]);
  });
  assertCompanyScope(activeId, getActiveBusinessProfileId());
  await requirePermission("sell",database,activeId);
  return { sales: allSales.filter((sale) => sale.businessProfileId === activeId), lines: allLines.filter((line) => line.businessProfileId === activeId), payments: allPayments.filter((payment) => payment.businessProfileId === activeId), receipts: allReceipts.filter((receipt) => receipt.businessProfileId === activeId) };
}

export async function getCustomerSaleSummary(customerId: string, currency: string, database: TallybookDB = db) {
  const activeId = getActiveBusinessProfileId();
  const [sales, activities, reversals, repayments] = await database.transaction("r", [database.sales, database.customerActivities, database.saleReversals, database.repayments, database.staffMembers], async () => {
    await requirePermission("sell",database,activeId);
    return Promise.all([
    database.sales.where("customerId").equals(customerId).and((sale) => sale.businessProfileId === activeId).toArray(),
    database.customerActivities.where("customerId").equals(customerId).and((activity) => activity.businessProfileId === activeId).reverse().sortBy("createdAt"),
    database.saleReversals.where("customerId").equals(customerId).and((reversal) => reversal.businessProfileId === activeId).toArray(),
    database.repayments.where("customerId").equals(customerId).and((repayment) => repayment.businessProfileId === activeId).toArray(),
  ]);
  });
  assertCompanyScope(activeId, getActiveBusinessProfileId());
  await requirePermission("sell",database,activeId);
  const { outstandingMinor } = reconcileCreditLedger(sales, reversals, repayments);
  const denomination = inspectReceivableCurrency(sales, repayments);
  const outstandingLabel = denomination.hasUnknownMoney
    ? `${outstandingMinor} minor units (historical currency unverified)`
    : formatMinorAmount(outstandingMinor, denomination.currency ?? currency);
  return { outstandingMinor, outstandingLabel, activities: activities.reverse() };
}

export async function completeSale(values: CompleteSaleInput, database: TallybookDB = db) {
  // Quotation conversion already holds a shared Web Lock around its outer
  // IndexedDB transaction. Never await navigator.locks inside that transaction:
  // doing so would cause Dexie to lose its active transaction context.
  return Dexie.currentTransaction ? completeSaleWhileLocked(values, database) : withCrossTabDataLock("shared", () => completeSaleWhileLocked(values, database));
}

async function completeSaleWhileLocked(values: CompleteSaleInput, database: TallybookDB = db) {
  const input = completeSaleSchema.parse(values);
  const mergedLines = mergeCheckoutQuantities(input.lines);
  const activeId = getActiveBusinessProfileId();

  return database.transaction("rw", [database.appMeta, database.businessProfiles, database.products, database.inventoryMovements, database.inventoryCostEvents, database.customers, database.sales, database.saleLines, database.payments, database.receipts, database.customerActivities, database.mobileMoneyProviders, database.inventoryBatches, database.customerPolicies, database.repayments, database.saleReversals, database.customerBenefits, database.staffMembers, database.staffShifts, database.staffAudits, database.storeStockModes, database.storeStockEntries, database.storeLocations, database.storeAssignments, database.storeTransferRequests, database.commerceOrders, database.commerceHolds, database.commerceDeliveryEvents], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const nowDate = new Date();
    const now = nowDate.toISOString();
    const cashier = await requirePermission("sell",database,activeId);
    const shift = cashier ? await database.staffShifts.where("staffId").equals(cashier.id).filter(x => x.businessProfileId === cashier.businessProfileId && !x.closedAt).first() : undefined;

    const submissionKey = input.submissionKey ?? nanoid(18);
    const existingSale = await database.sales.where("submissionKey").equals(submissionKey).and((sale) => sale.businessProfileId === activeId).first();
    if (existingSale) {
      const [existingLines, existingPayment, existingReceipt] = await Promise.all([
        database.saleLines.where("saleId").equals(existingSale.id).toArray(),
        database.payments.where("saleId").equals(existingSale.id).first(),
        database.receipts.where("saleId").equals(existingSale.id).first(),
      ]);
      // A submission key represents one immutable checkout intent, not an arbitrary
      // lookup key. Never acknowledge an earlier sale for a changed cart/payment.
      const expectedLines = new Map(mergedLines);
      const sameLines = existingLines.length === expectedLines.size && existingLines.every((line) =>
        expectedLines.get(line.productId) === line.quantity
      );
      const samePayment = (existingSale.commerceOrderId??undefined)===(input.commerceOrderId??undefined) && (existingSale.storeId??undefined)===(input.storeId??undefined) && existingSale.currency === input.currency && existingSale.paymentMethod === input.paymentMethod &&
        existingSale.amountPaidMinor === parseAmount(input.amountPaid, input.currency) &&
        existingSale.discountMinor - (existingSale.loyaltyRedeemedMinor ?? 0) === parseAmount(input.discount, input.currency) &&
        (existingSale.loyaltyRedeemedPoints ?? 0) === (input.redeemPoints ?? 0) &&
        (existingSale.customerId ?? undefined) === (input.customerId || undefined) &&
        (input.paymentMethod !== "mobile" || (
          (existingPayment?.mobileMoneyProviderId ?? undefined) === (input.mobileMoneyProviderId?.trim() || undefined) &&
          (existingPayment?.mobileMoneyReference ?? undefined) === (input.mobileMoneyReference?.trim() || undefined)
        ));
      if (!sameLines || !samePayment) {
        throw new Error("This checkout was already submitted with different details. Start a new sale to record changes.");
      }
      if (!existingReceipt) throw new Error("The saved sale has no receipt. Open sale history for recovery before trying again.");
      return { sale: existingSale, lines: existingLines, payment: existingPayment, receipt: existingReceipt };
    }
    const storeMode=await database.storeStockModes.get(activeId);
    if(storeMode) {
      if(!input.storeId)throw new Error("Select a store before recording this sale.");
      const store=await database.storeLocations.get(input.storeId);
      if(!store||store.businessProfileId!==activeId||store.status!=="active")
        throw new Error("Selling store is no longer active in the selected company.");
      if(!cashier)throw new Error("Unlock an authorized store attendant.");
      if(cashier.role!=="owner" &&
         !await database.storeAssignments.where("[businessProfileId+staffId+storeId]")
          .equals([activeId,cashier.id,input.storeId]).first())
        throw new Error("Attendant is not assigned to the selling store.");
    } else if(input.storeId)throw new Error("Store stock has not been activated for this company.");
    if (cashier?.role === "cashier" && !shift) throw new Error("Open a cashier shift before completing sales.");
    const requestedLines = Array.from(mergedLines.entries()).map(([productId, quantity]) => ({ productId, quantity }));
    const products = await Promise.all(requestedLines.map(({ productId }) => database.products.get(productId)));
    if (products.some((product) => !product || product.businessProfileId !== activeId || product.archivedAt)) throw new Error("One or more products are no longer available for sale.");
    const productById = new Map(products.filter((product): product is Product => Boolean(product)).map((product) => [product.id, product]));
    for (const line of requestedLines) { const product = productById.get(line.productId)!; if (product.itemKind !== "service" && line.quantity > product.stockQuantity) throw new Error(`${product.name} has only ${product.stockQuantity} units available.`); }
    // Run 16: a merchant-reviewed reservation is a stock commitment, not a
    // payment. Only this SAME transaction can consume it and save the receipt.
    const linkedOrder=input.commerceOrderId?await database.commerceOrders.get(input.commerceOrderId):undefined;
    if(input.commerceOrderId){
      if(!linkedOrder||linkedOrder.businessProfileId!==activeId||linkedOrder.saleId||
        linkedOrder.status!=="reserved"||linkedOrder.storeId!==input.storeId||
        !linkedOrder.reservationExpiresAt||Date.parse(linkedOrder.reservationExpiresAt)<=Date.parse(now))
        throw new Error("Commerce reservation is invalid, expired, already sold, or assigned to another store.");
      const savedLineMap=new Map(linkedOrder.lines.map(line=>[line.productId,line.quantity]));
      if(savedLineMap.size!==requestedLines.length ||
         requestedLines.some(line=>savedLineMap.get(line.productId)!==line.quantity||
           linkedOrder.lines.find(saved=>saved.productId===line.productId)?.unitPriceMinor!==productById.get(line.productId)!.sellingPriceMinor))
        throw new Error("POS quantities must match the original reserved customer order.");
    }
    for(const line of requestedLines){
      const product=productById.get(line.productId)!;
      if(product.itemKind==="service")continue;
      const reserved=await reservedRun16Units(database,activeId,product.id,input.storeId,now,input.commerceOrderId);
      if(line.quantity>product.stockQuantity-reserved)
        throw new Error("Stock is committed to other customer orders; sell only unreserved units.");
    }
    const customer = input.customerId ? await database.customers.get(input.customerId) : undefined;
    if (input.customerId && (!customer || customer.businessProfileId !== activeId || customer.archivedAt)) throw new Error("Choose an active customer or complete this as a walk-in sale.");

    const redemptionPoints = input.redeemPoints ?? 0;
    let redemptionMinor = 0;
    if (redemptionPoints) {
      if (!customer) throw new Error("Choose a customer before redeeming loyalty points.");
      const policy = await database.customerPolicies.get(`${activeId}:${customer.id}`);
      const pointValue = policy?.loyaltyPointValueMinor;
      if (!pointValue || !Number.isSafeInteger(pointValue) || pointValue < 1) throw new Error("Loyalty redemption is not configured for this customer.");
      const entries = await database.customerBenefits.where("customerId").equals(customer.id)
        .and(entry => entry.businessProfileId === activeId && entry.kind === "points").toArray();
      const balance = entries.reduce((sum, entry) => sum + entry.delta, 0);
      if (!Number.isSafeInteger(balance) || redemptionPoints > balance) throw new Error("Insufficient loyalty points for redemption.");
      redemptionMinor = redemptionPoints * pointValue;
      if (!Number.isSafeInteger(redemptionMinor)) throw new Error("Loyalty redemption exceeds safe money limits.");
    }
    const checkoutMoney = calculateCheckoutLines(requestedLines.map(line => ({
      productId: line.productId, quantity: line.quantity,
      unitPriceMinor: selectUnitPrice(productById.get(line.productId)!, line.quantity),
    })));
    const subtotalMinor = checkoutMoney.subtotalMinor;
    const manualDiscountMinor = parseAmount(input.discount, input.currency);
    const discountApprovedBy = manualDiscountMinor > 0 && cashier?.role === "cashier"
      ? await consumeCheckoutDiscountApproval(submissionKey, manualDiscountMinor, subtotalMinor, activeId, database) : undefined;
    if (manualDiscountMinor > 0 && cashier?.role === "cashier" && !discountApprovedBy)
      throw new Error("A supervisor must approve this exact discount before checkout.");
    const discountMinor = manualDiscountMinor + redemptionMinor;
    if (!Number.isSafeInteger(discountMinor)) throw new Error("Combined discount exceeds safe money limits.");
    if (discountMinor > subtotalMinor) throw new Error("Discount cannot exceed the subtotal.");
    if (customer && discountMinor > 0) {
      const customerPolicy = await database.customerPolicies.get(`${activeId}:${customer.id}`);
      if (customerPolicy?.maxDiscountPercent !== undefined &&
          discountMinor * 100 > subtotalMinor * customerPolicy.maxDiscountPercent) {
        throw new Error('Discount exceeds this customer’s approved maximum discount percentage.');
      }
    }
    const savedProfile=await database.businessProfiles.get(activeId);
    if(savedProfile?.currency!==undefined&&savedProfile.currency!==input.currency)
      throw new Error('Sale currency differs from the active company currency; no implicit FX conversion is supported.');
    // Historical pre-setup sale entrypoints remain valid, but cannot gain
    // refund authority: absent business profile is explicitly default OFF.
    const returnPolicyAtSale=saleReturnPolicySnapshot(savedProfile?.returnPolicyHistory);
    if(Date.parse(returnPolicyAtSale.effectiveAt)>Date.parse(now))
      throw new Error('Company return policy effective time is ahead of sale posting; verify the device clock.');
    const policy = savedProfile?.taxPolicy;
    const taxConfigurationAtSale=snapshotSaleTaxConfiguration(policy);
    if ((policy?.enabled || input.taxReviewKey !== undefined) && input.taxReviewKey !== taxPolicyKey(policy)) throw new Error("Tax settings changed or have not been reviewed. Reload checkout and review the total.");
    const tax = calculateTax(subtotalMinor - discountMinor, policy);
    const totalMinor = tax?.totalMinor ?? subtotalMinor - discountMinor;
    const amountPaidMinor = input.paymentMethod === "credit" ? 0 : parseAmount(input.amountPaid, input.currency);
    if (input.paymentMethod === "wallet" && !customer) throw new Error("Select a customer to spend prepaid wallet funds.");
    if (input.paymentMethod === "wallet" && amountPaidMinor > 0) {
      const walletEntries = await database.customerBenefits.where("customerId").equals(customer!.id)
        .and(entry => entry.businessProfileId === activeId && entry.kind === "wallet").toArray();
      const balance = walletEntries.reduce((sum, entry) => sum + entry.delta, 0);
      if (!Number.isSafeInteger(balance) || balance < amountPaidMinor) throw new Error("Insufficient verified prepaid balance; reconcile wallet before checkout.");
    }
    if (amountPaidMinor > totalMinor) throw new Error("Amount paid cannot exceed the sale total.");
    const outstandingMinor = totalMinor - amountPaidMinor;
    if (outstandingMinor > 0 && !customer) throw new Error("Choose a customer before recording an outstanding amount.");
    if (customer && outstandingMinor > 0) {
      // Currency protection is NOT conditional on a configured credit limit.
      // A limit-free account must not mix USD, GHS or unverified legacy debt.
      const [priorSales, priorRepayments, priorReversals] = await Promise.all([
        database.sales.where('customerId').equals(customer.id).and(s=>s.businessProfileId===activeId).toArray(),
        database.repayments.where('customerId').equals(customer.id).and(r=>r.businessProfileId===activeId).toArray(),
        database.saleReversals.where('customerId').equals(customer.id).and(r=>r.businessProfileId===activeId).toArray(),
      ]);
      assertReceivableWriteCurrency(priorSales, priorRepayments, input.currency);
      const exposure = checkedCreditExposure(priorSales, priorReversals, priorRepayments, outstandingMinor);
      const customerPolicy = await database.customerPolicies.get(`${activeId}:${customer.id}`);
      if (customerPolicy?.creditLimitMinor !== undefined &&
          (!Number.isSafeInteger(customerPolicy.creditLimitMinor) || customerPolicy.creditLimitMinor < 0 || exposure > customerPolicy.creditLimitMinor))
        throw new Error('This sale exceeds the customer credit limit or the account needs reconciliation.');
    }

    if (input.paymentMethod === "credit" && input.amountPaid !== "0") throw new Error("Credit sales must record zero paid at completion.");
    if (input.paymentMethod !== "credit" && totalMinor > 0 && amountPaidMinor === 0) throw new Error("Record a payment amount or choose credit.");
    const mobileMoneyProviderId = input.mobileMoneyProviderId?.trim();
    const mobileMoneyReference = input.mobileMoneyReference?.trim() || undefined;
    if (input.paymentMethod !== "mobile" && (mobileMoneyProviderId || mobileMoneyReference)) throw new Error("Mobile Money provider details can only be saved with a Mobile Money payment.");
    if (input.paymentMethod === "mobile" && amountPaidMinor > 0 && !mobileMoneyProviderId) throw new Error("Choose a Mobile Money provider before recording this payment.");
    const mobileMoneyProvider = mobileMoneyProviderId ? await database.mobileMoneyProviders.get(mobileMoneyProviderId) : undefined;
    if (mobileMoneyProviderId && (!mobileMoneyProvider || mobileMoneyProvider.businessProfileId !== activeId || !mobileMoneyProvider.active)) throw new Error("Choose a saved Mobile Money provider before recording this payment.");

    const sale: Sale = { ...(tax ? { tax } : {}),taxConfigurationAtSale,returnPolicyAtSale, ...(input.storeId?{storeId:input.storeId}:{}), ...(input.commerceOrderId?{commerceOrderId:input.commerceOrderId}:{}), id: nanoid(14), businessProfileId: activeId, customerId: customer?.id, receiptNumber: receiptNumber(nowDate), currency: input.currency, status: "completed", subtotalMinor, discountMinor, totalMinor, amountPaidMinor, ...(input.paymentMethod === "wallet" ? { walletAppliedMinor: amountPaidMinor } : {}), ...(redemptionPoints ? { loyaltyRedeemedPoints: redemptionPoints, loyaltyRedeemedMinor: redemptionMinor } : {}), outstandingMinor, paymentMethod: input.paymentMethod, submissionKey, createdAt: now, ...(cashier ? {staffId:cashier.id} : {}), ...(shift ? {shiftId:shift.id} : {}) };
    const saleLines: SaleLine[] = checkoutMoney.lines.map((line) => { const product = productById.get(line.productId)!; return { id: nanoid(14), saleId: sale.id, productId: product.id, businessProfileId: activeId, productName: product.name, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.lineTotalMinor }; });
    const movements: InventoryMovement[] = requestedLines.filter(line => productById.get(line.productId)!.itemKind !== "service").map((line) => { const product = productById.get(line.productId)!; return { id: nanoid(14), businessProfileId: activeId, productId: product.id, movementType: "sale", quantityDelta: -line.quantity, previousQuantity: product.stockQuantity, resultingQuantity: product.stockQuantity - line.quantity, note: `Sale ${sale.receiptNumber}`, createdAt: now }; });
    if(linkedOrder){
      if(!cashier)throw Error("Unlock staff before selling a reserved customer order.");
      await consumeRun16OrderForSale(database,activeId,linkedOrder,sale.id,now,cashier.id);
    }
    for (const movement of movements) await postStoreStockDelta(database,activeId,movement.productId,input.storeId,movement.quantityDelta,movement.id,"sale",now,movement.previousQuantity,movement.resultingQuantity,input.commerceOrderId);
    const payment: Payment | undefined = amountPaidMinor > 0 && input.paymentMethod !== "wallet" ? { id: nanoid(14), saleId: sale.id, businessProfileId: activeId, customerId: customer?.id, method: input.paymentMethod, amountMinor: amountPaidMinor, ...(input.paymentMethod === "mobile" && mobileMoneyProvider ? { mobileMoneyProviderId: mobileMoneyProvider.id, mobileMoneyProviderName: mobileMoneyProvider.name, mobileMoneyReference } : {}), createdAt: now } : undefined;
    const receipt: Receipt = { id: nanoid(14), saleId: sale.id, businessProfileId: activeId, receiptNumber: sale.receiptNumber, issuedAt: now };
    const activity: CustomerActivity | undefined = customer ? { id: nanoid(14), customerId: customer.id, saleId: sale.id, businessProfileId: activeId, activityType: "sale", totalMinor, amountPaidMinor, outstandingMinor, createdAt: now } : undefined;

    // Allocate tracked stock by earliest expiry, atomically with the sale.
    // Partial tracking is refused: it would silently bypass expiry controls.
    const updatedBatches = [];
    for (const line of requestedLines) {
      const product = productById.get(line.productId)!;
      const savedLine = saleLines.find(saved => saved.productId === line.productId)!;
      savedLine.stockTracked = product.itemKind !== "service";
      if (product.itemKind === "service") {
        savedLine.costStatus = "verified";
        savedLine.cogsMinor = 0;
        continue;
      }
      const movement = movements.find(m => m.productId === line.productId)!;
      const costEvent = await appendInventoryCostChange(database, product, -line.quantity, { sourceId: movement.id, createdAt: now, saleId: sale.id, saleLineId: savedLine.id });
      const cogsMinor = allocationCost(costEvent);
      savedLine.costEventId = costEvent.id;
      savedLine.costStatus = cogsMinor === undefined ? "unavailable" : "verified";
      if (cogsMinor !== undefined) savedLine.cogsMinor = cogsMinor;
      const batches = (await database.inventoryBatches.where("productId").equals(product.id).toArray())
        .filter(batch => batch.businessProfileId === activeId);
      if (!batches.length) continue;
      const tracked = batches.reduce((sum, batch) => sum + batch.quantity, 0);
      if (tracked !== product.stockQuantity) throw new Error(`Batch quantities for ${product.name} do not reconcile with stock. Reconcile before selling.`);
      const sorted = batches.sort((a, b) => (a.expiryDate ?? "9999-12-31").localeCompare(b.expiryDate ?? "9999-12-31") || a.createdAt.localeCompare(b.createdAt));
      const today = now.slice(0, 10);
      let remaining = line.quantity;
      for (const batch of sorted) {
        if (batch.expiryDate && batch.expiryDate < today) continue;
        const taken = Math.min(batch.quantity, remaining);
        if (taken) {
          updatedBatches.push({ ...batch, quantity: batch.quantity - taken });
          (savedLine.batchAllocations ??= []).push({ batchId: batch.id, quantity: taken });
        }
        remaining -= taken;
        if (!remaining) break;
      }
      if (remaining) throw new Error(`Not enough unexpired tracked stock for ${product.name}.`);
    }
    sale.costStatus = saleLines.every(line => line.costStatus === "verified") ? "verified" : "unavailable";
    if (sale.costStatus === "verified") sale.cogsMinor = checkedMinorSum(saleLines.map(line => ({ amount: line.cogsMinor! })), "amount");
    if (updatedBatches.length) await database.inventoryBatches.bulkPut(updatedBatches);
    await database.sales.add(sale);
    if (cashier) await database.staffAudits.add({id:nanoid(14),businessProfileId:activeId,staffId:cashier.id,action:"sale.completed",createdAt:now,details:discountApprovedBy?`${sale.id}; discount approved by ${discountApprovedBy}`:sale.id});
    await database.saleLines.bulkAdd(saleLines);
    if (payment) await database.payments.add(payment);
    if (redemptionPoints && customer) {
      await database.customerBenefits.add({ id: nanoid(14), businessProfileId: activeId, customerId: customer.id,
        kind: "points", delta: -redemptionPoints, reason: `Redeemed on sale ${sale.receiptNumber}`,
        submissionKey: `sale-redeemed-${sale.id}`, createdAt: now });
    }
    if (input.paymentMethod === "wallet" && amountPaidMinor > 0 && customer) {
      await database.customerBenefits.add({ id: nanoid(14), businessProfileId: activeId, customerId: customer.id,
        kind: "wallet", delta: -amountPaidMinor, reason: `Wallet applied to sale ${sale.receiptNumber}`,
        submissionKey: `sale-wallet-${sale.id}`, createdAt: now });
    }
    if (customer && amountPaidMinor > 0 && input.paymentMethod !== "wallet") {
      const policy = await database.customerPolicies.get(`${activeId}:${customer.id}`);
      if (policy?.loyaltySpendMinorPerPoint !== undefined) {
        const threshold = policy.loyaltySpendMinorPerPoint;
        if (!Number.isSafeInteger(threshold) || threshold < 1) throw new Error("Invalid customer loyalty policy.");
        const points = Math.floor(amountPaidMinor / threshold);
        if (points > 0) await database.customerBenefits.add({ id: nanoid(14), businessProfileId: activeId,
          customerId: customer.id, kind: "points", delta: points, reason: `Earned on sale ${sale.receiptNumber}`,
          submissionKey: `sale-points-${sale.id}`, createdAt: now });
      }
    }
    await database.receipts.add(receipt);
    if (activity) await database.customerActivities.add(activity);
    await database.products.bulkPut(requestedLines.filter(line => productById.get(line.productId)!.itemKind !== "service").map((line) => { const product = productById.get(line.productId)!; return { ...product, stockQuantity: product.stockQuantity - line.quantity, updatedAt: now }; }));
    await database.inventoryMovements.bulkAdd(movements);
    return { sale, lines: saleLines, payment, receipt };
  });
}
