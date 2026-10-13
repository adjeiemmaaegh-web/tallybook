/**
 * Tallybook Assistant — transaction interpreter.
 *
 * Turns a parsed command into a validated preview and, only after the owner confirms, hands the exact same input object to TallyBook's
 * existing `completeSale`, `completePurchase` or `recordRepayment`. It never writes to the database itself.
 */
import { nanoid } from "nanoid";
import type { TallybookDB } from "@/db/TallybookDB";
import { getCustomerDebtSummary, recordRepayment, type RecordRepaymentInput, type RepaymentMethod } from "@/features/credit/credit";
import { createCustomer, customerFormSchema, getCustomerSnapshot, normalizeCustomerName, type Customer, type CustomerFormValues } from "@/features/customers/customers";
import { adjustStock, categoryFormSchema, createCategory, createProduct, currencyMinorDivisor, formatMinorAmount, getInventorySnapshot, normalizeName, parseAmountToMinor, productFormSchema, type CategoryFormValues, type Product, type ProductFormValues } from "@/features/inventory/inventory";
import { getMobileMoneyProviders } from "@/features/payments/mobileMoney";
import { completePurchase, createSupplier, getPurchasesSnapshot, supplierFormSchema, type PurchaseFormValues, type SupplierFormValues } from "@/features/purchases/purchases";
import { completeSale, paymentMethodLabel, type CompleteSaleInput, type PaymentMethod } from "@/features/sales/sales";
import { withSaleCompletionTimeout } from "@/features/sales/completion";
import { detectPurchaseDay, toIsoDate, describeDay } from "./dates";
import { customerLabel, failure, info, question, resolveRecord, say, type ChoiceOption } from "./replies";
import { matchEntity } from "./entityMatcher";
import { canonicalUnit, displayMention, pluralUnit, tokenize } from "./text";
import type { AssistantAction, AssistantReply, BatchItem, ParsedEntities, ReplyDetail, ResolvedCommand, TransactionPreviewView } from "./types";

export type DraftIntent = "CUSTOMER_BALANCE" | "INVENTORY_QUERY" | "SUPPLIER_PURCHASES" | "RECORD_SALE" | "RECEIVE_STOCK" | "RECORD_CUSTOMER_PAYMENT" | "CREATE_CUSTOMER" | "CREATE_PRODUCT" | "CREATE_CATEGORY" | "CREATE_SUPPLIER" | "ADJUST_INVENTORY";
export type Slot = "item" | "quantity" | "customer" | "payment" | "provider" | "supplier" | "cost" | "amount" | "method" | "product" | "name" | "phone" | "price" | "counted" | "category" | "duplicate" | "discount";

export interface Draft {
  intent: DraftIntent;
  confidence: number;
  entities: ParsedEntities;
  resolved: { productId?: string; customerId?: string; supplierId?: string; providerId?: string; categoryId?: string };
  /** The owner saw a similar existing record and said to add the new one anyway. */
  confirmedNew?: boolean;
  /** What the owner first said or typed to start this request (for the activity log). */
  request?: string;
  awaiting?: Slot;
  options?: ChoiceOption[];
  requireNamedCustomer?: boolean;
  attempts: number;
  submissionKey: string;
  lastReply?: AssistantReply;
}

export type PendingInput =
  | { kind: "sale"; input: CompleteSaleInput }
  | { kind: "stock_receipt"; input: PurchaseFormValues }
  | { kind: "customer_payment"; input: RecordRepaymentInput }
  | { kind: "create_customer"; input: CustomerFormValues }
  | { kind: "create_supplier"; input: SupplierFormValues }
  | { kind: "create_category"; input: CategoryFormValues }
  | { kind: "create_product"; input: ProductFormValues }
  | { kind: "stock_count"; input: { productId: string; counted: number; expectedBefore: number } };

export interface Pending {
  token: string;
  companyId: string;
  view: TransactionPreviewView;
  command: ResolvedCommand;
  payload: PendingInput;
  draft: Draft;
  executing: boolean;
}

export interface TransactionContext { database: TallybookDB; currency: string; now: Date; companyId: string }
export type Step = { type: "reply"; reply: AssistantReply; draft?: Draft } | { type: "preview"; pending: Pending };

export const newDraft = (intent: DraftIntent, entities: ParsedEntities, confidence: number): Draft => ({ intent, confidence, entities: { ...entities }, resolved: {}, attempts: 0, submissionKey: nanoid(18) });

/* ───────────── small helpers ───────────── */

const money = (minor: number, ctx: TransactionContext) => formatMinorAmount(minor, ctx.currency);
const stop = (text: string, extra: Partial<AssistantReply> = {}): Step => ({ type: "reply", reply: failure(text, extra) });
const ask = (draft: Draft, awaiting: Slot, reply: AssistantReply, options?: ChoiceOption[]): Step => { draft.awaiting = awaiting; draft.options = options; return { type: "reply", reply, draft }; };

/** Whole-amount currencies (RWF, TZS, UGX) must not silently round decimals. */
function toMinor(amount: string, ctx: TransactionContext): number | null {
  if (currencyMinorDivisor(ctx.currency) === 1 && amount.includes(".")) return null;
  try { return parseAmountToMinor(amount, ctx.currency); } catch { return null; }
}
function minorToInput(minor: number, ctx: TransactionContext) {
  const divisor = currencyMinorDivisor(ctx.currency);
  return divisor === 1 ? String(minor) : (minor / divisor).toFixed(2);
}

function currencyProblem(entities: ParsedEntities, ctx: TransactionContext): string | undefined {
  if (entities.currency && entities.currency !== ctx.currency) return `This business records in ${ctx.currency}, but you mentioned ${entities.currency}. I can't convert between currencies, so nothing was prepared.`;
  if (entities.currencyAmbiguous && !["KES", "TZS", "UGX"].includes(ctx.currency)) return `You mentioned shillings, but this business records in ${ctx.currency}. Nothing was prepared.`;
  return undefined;
}

const unitInName = (product: Product, unit?: string) => Boolean(unit) && tokenize(product.name).some((word) => canonicalUnit(word) === unit);
const quantityText = (quantity: number, unit?: string) => (unit ? `${quantity} ${pluralUnit(unit, quantity)}` : String(quantity));

function unitNote(product: Product, unit: string | undefined, quantity: number): string | undefined {
  return unit && !unitInName(product, unit) ? `You said ${quantityText(quantity, unit)}. TallyBook counts “${product.name}” as a plain number and stores no units, so I'll record ${quantity}. Check that ${product.name} is counted per ${unit}.` : undefined;
}

type ProductRecord = Product & { aliases?: string[] };
async function pickProduct(draft: Draft, ctx: TransactionContext): Promise<{ product: Product } | { step: Step }> {
  const snapshot = await getInventorySnapshot(ctx.database);
  const active: ProductRecord[] = snapshot.products.map((product) => ({ ...product, aliases: product.sku ? [product.sku] : [] }));
  if (draft.resolved.productId) {
    const product = active.find((item) => item.id === draft.resolved.productId);
    return product ? { product } : { step: stop("That product is no longer available, so nothing was prepared.", { link: { label: "Open Stock", href: "/inventory" } }) };
  }
  const resolution = resolveRecord("product", draft.entities.productText ?? "", active, snapshot.archivedProducts, "product", (product) => `${product.name} · ${product.stockQuantity} in stock`);
  if (resolution.ok) { draft.resolved.productId = resolution.record.id; return { product: resolution.record }; }
  return { step: resolution.options ? ask(draft, "product", resolution.reply, resolution.options) : notFoundStep(draft, "product", resolution.reply, draft.entities.productText) };
}

/** A name that matched nothing: keep the request open so a corrected name works, and offer to add it as a new record. */
function notFoundStep(draft: Draft, noun: "customer" | "product" | "supplier", reply: AssistantReply, mention?: string): Step {
  if (reply.kind !== "error" || !mention) return { type: "reply", reply };
  return ask(draft, noun, { ...reply, actions: notFoundActions(noun, displayMention(mention)) });
}

async function pickCustomer(draft: Draft, ctx: TransactionContext): Promise<{ customer?: Customer } | { step: Step }> {
  const snapshot = await getCustomerSnapshot(ctx.database);
  if (draft.resolved.customerId) {
    const customer = snapshot.customers.find((item) => item.id === draft.resolved.customerId);
    return customer ? { customer } : { step: stop("That customer is no longer available, so nothing was prepared.", { link: { label: "Open Customers", href: "/customers" } }) };
  }
  if (!draft.entities.customerText) return { customer: undefined };
  const resolution = resolveRecord("customer", draft.entities.customerText, snapshot.customers, snapshot.archivedCustomers, "customer", customerLabel);
  if (resolution.ok) { draft.resolved.customerId = resolution.record.id; return { customer: resolution.record }; }
  return { step: resolution.options ? ask(draft, "customer", resolution.reply, resolution.options) : notFoundStep(draft, "customer", resolution.reply, draft.entities.customerText) };
}

const resolvedCommand = (draft: Draft, entities: ResolvedCommand["entities"]): ResolvedCommand => ({ intent: draft.intent, confidence: draft.confidence, entities });

function buildPending(draft: Draft, ctx: TransactionContext, kind: TransactionPreviewView["kind"], title: string, confirmLabel: string, rows: ReplyDetail[], notes: string[], payload: PendingInput, command: ResolvedCommand): Step {
  const token = nanoid(10);
  return { type: "preview", pending: { token, companyId: ctx.companyId, view: { token, kind, title, rows, notes, confirmLabel }, command, payload, draft, executing: false } };
}

const PAYMENT_CHIPS: AssistantAction[] = [
  { type: "fill", label: "Cash", slot: "payment", value: "cash" }, { type: "fill", label: "Mobile Money", slot: "payment", value: "mobile" },
  { type: "fill", label: "Card", slot: "payment", value: "card" }, { type: "fill", label: "On credit", slot: "payment", value: "credit" }, { type: "cancel", label: "Cancel" },
];

/* ───────────── sale ───────────── */

async function advanceSale(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  if (e.discountMentioned) return ask(draft, "discount", question("I can't apply discounts from here. I can record this sale at the full saved price instead, or you can make the discounted sale on the Sales page.", [{ type: "fill", label: "Record at full price", slot: "discount", value: "full-price" }, CANCEL], { link: { label: "Open Sales", href: "/sales" } }));
  const problem = currencyProblem(e, ctx);
  if (problem) return stop(problem);
  if (e.invalidQuantityText) return wholeQuantityStep(draft, e.invalidQuantityText, e.productText ?? "items");
  if (e.paymentConflict) { e.paymentConflict = undefined; e.paymentMethod = undefined; return ask(draft, "payment", question("You mentioned more than one way of paying. How was this sale paid?", PAYMENT_CHIPS)); }
  if (!draft.resolved.productId && !e.productText) return ask(draft, "item", question("What did you sell, and how many? For example: “2 crates of eggs”.", [{ type: "cancel", label: "Cancel" }]));

  const productPick = await pickProduct(draft, ctx);
  if ("step" in productPick) return productPick.step;
  const { product } = productPick;
  if (!e.quantity) return ask(draft, "quantity", question(`How many ${product.name} should I record?`, [{ type: "cancel", label: "Cancel" }]));
  const quantity = e.quantity;
  if (quantity > product.stockQuantity) return stockShortStep(draft, product, quantity);

  if (!draft.resolved.customerId && !e.walkIn && !e.customerText) {
    const chips: AssistantAction[] = [...(draft.requireNamedCustomer ? [] : [{ type: "fill", label: "Walk-in customer", slot: "customer", value: "walk-in" } as AssistantAction]), { type: "cancel", label: "Cancel" }];
    return ask(draft, "customer", question(draft.requireNamedCustomer ? "This needs a named customer, because part of the money is still owed. Who is it for? Type their name." : "I understand you want to record a sale, but I need to know who it was sold to.", chips));
  }
  const customerPick = await pickCustomer(draft, ctx);
  if ("step" in customerPick) return customerPick.step;
  const { customer } = customerPick;

  const totalMinor = product.sellingPriceMinor * quantity;
  let method: PaymentMethod | undefined = e.paymentMethod;
  if (method === "credit" && e.amount) { e.paymentMethod = undefined; e.amount = undefined; return ask(draft, "payment", question("You mentioned both credit and an amount paid. How was this sale paid?", PAYMENT_CHIPS)); }
  if (!method) return ask(draft, "payment", question("Was it paid in cash, mobile money, card, or on credit?", PAYMENT_CHIPS));
  if (method === "credit" && !customer) { e.walkIn = false; draft.requireNamedCustomer = true; return ask(draft, "customer", question("Credit sales need a named customer. Who is buying on credit? Type their name.", [{ type: "cancel", label: "Cancel" }])); }

  let paidMinor = totalMinor;
  if (method === "credit") paidMinor = 0;
  else if (e.amount) {
    const given = toMinor(e.amount, ctx);
    if (given === null) { e.amount = undefined; return ask(draft, "amount", question(`${ctx.currency} amounts are recorded as whole numbers, so I can't use that. How much was paid? The total is ${money(totalMinor, ctx)}.`, [{ type: "fill", label: `Paid in full (${money(totalMinor, ctx)})`, slot: "amount", value: minorToInput(totalMinor, ctx) }, CANCEL])); }
    if (given > totalMinor) { e.amount = undefined; return ask(draft, "amount", question(`You said ${money(given, ctx)} was paid, but this sale only totals ${money(totalMinor, ctx)}. How much was actually paid?`, [{ type: "fill", label: `Paid in full (${money(totalMinor, ctx)})`, slot: "amount", value: minorToInput(totalMinor, ctx) }, CANCEL])); }
    paidMinor = given;
  }
  if (paidMinor < totalMinor && !customer) { e.walkIn = false; draft.requireNamedCustomer = true; return ask(draft, "customer", question("Part of this is unpaid, so it needs a named customer. Who is it for? Type their name.", [{ type: "cancel", label: "Cancel" }])); }
  if (paidMinor === 0 && method !== "credit") method = "credit";
  if (method === "credit" && paidMinor !== 0) paidMinor = 0;

  let providerName: string | undefined;
  let providerId: string | undefined;
  if (method === "mobile" && paidMinor > 0) {
    const providers = await getMobileMoneyProviders(ctx.database, false);
    if (!providers.length) return stop("No Mobile Money provider is set up yet. Add one in Business settings, then try again.", { link: { label: "Open Business", href: "/business" } });
    let chosen = providers.find((provider) => provider.id === draft.resolved.providerId);
    if (!chosen && e.providerHint) { const byHint = matchEntity(e.providerHint, providers); if (byHint.status === "one") chosen = byHint.match; }
    if (!chosen && providers.length === 1) chosen = providers[0];
    if (!chosen) {
      const options = providers.map((provider) => ({ id: provider.id, name: provider.name, label: provider.name }));
      return ask(draft, "provider", question("Which Mobile Money provider was used?", [...options.map((option): AssistantAction => ({ type: "fill", label: option.label, slot: "provider", value: option.name, id: option.id })), { type: "cancel", label: "Cancel" }]), options);
    }
    draft.resolved.providerId = chosen.id; providerId = chosen.id; providerName = chosen.name;
  }

  const outstanding = totalMinor - paidMinor;
  const paymentText = method === "credit" ? `On credit — nothing paid now; ${money(totalMinor, ctx)} will be added to ${customer!.name}'s balance`
    : outstanding > 0 ? `${paymentMethodLabel(method)} — ${money(paidMinor, ctx)} paid now, ${money(outstanding, ctx)} still owed by ${customer!.name}` : `${paymentMethodLabel(method)} — paid in full`;
  const notes = [unitNote(product, e.unit, quantity), e.priceMentioned ? `You mentioned a price (“${e.priceMentioned}”). I don't set prices — TallyBook's saved price of ${money(product.sellingPriceMinor, ctx)} is used.` : undefined].filter((note): note is string => Boolean(note));
  const input: CompleteSaleInput = { lines: [{ productId: product.id, quantity }], customerId: customer?.id, discount: "0", paymentMethod: method, amountPaid: method === "credit" ? "0" : minorToInput(paidMinor, ctx), currency: ctx.currency, ...(providerId ? { mobileMoneyProviderId: providerId } : {}), submissionKey: draft.submissionKey };
  return buildPending(draft, ctx, "sale", "Sale preview — not saved yet", "Confirm sale", [
    { label: "Product", value: product.name }, { label: "Quantity", value: quantityText(quantity, e.unit) },
    { label: "Price", value: `${money(product.sellingPriceMinor, ctx)} each (from TallyBook)` }, { label: "Total", value: money(totalMinor, ctx) },
    { label: "Customer", value: customer?.name ?? "Walk-in customer" }, { label: "Payment", value: paymentText },
    ...(providerName ? [{ label: "Provider", value: providerName }] : []),
  ], notes, { kind: "sale", input }, resolvedCommand(draft, {
    product: { text: e.productText ?? product.name, id: product.id, name: product.name }, quantity, unit: e.unit,
    customer: customer ? { text: e.customerText ?? customer.name, id: customer.id, name: customer.name } : { text: "walk-in customer", walkIn: true },
    paymentMethod: method, paymentStatus: outstanding > 0 ? "unpaid" : "paid", amount: minorToInput(paidMinor, ctx),
  }));
}

/* ───────────── stock receipt ───────────── */

async function advanceReceive(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  const problem = currencyProblem(e, ctx);
  if (problem) return stop(problem);
  if (e.invalidQuantityText) return wholeQuantityStep(draft, e.invalidQuantityText, e.productText ?? "items");
  if (!draft.resolved.productId && !e.productText) return ask(draft, "item", question("What stock did you receive, and how many? For example: “10 crates of eggs”.", [{ type: "cancel", label: "Cancel" }]));
  const productPick = await pickProduct(draft, ctx);
  if ("step" in productPick) return productPick.step;
  const { product } = productPick;
  if (!e.quantity) return ask(draft, "quantity", question(`How many ${product.name} did you receive?`, [{ type: "cancel", label: "Cancel" }]));
  const quantity = e.quantity;

  const purchases = await getPurchasesSnapshot(ctx.database);
  let supplier = purchases.suppliers.find((item) => item.id === draft.resolved.supplierId);
  if (!supplier) {
    if (!e.supplierText) return ask(draft, "supplier", question("Which supplier did you receive it from? Type their name.", [{ type: "cancel", label: "Cancel" }]));
    const resolution = resolveRecord("supplier", e.supplierText, purchases.suppliers, purchases.archivedSuppliers, "supplier", (item) => item.name);
    if (!resolution.ok) return resolution.options ? ask(draft, "supplier", resolution.reply, resolution.options) : notFoundStep(draft, "supplier", resolution.reply, e.supplierText);
    supplier = resolution.record; draft.resolved.supplierId = supplier.id;
  }

  const day = detectPurchaseDay(e.dateText ?? "", ctx.now);
  if ("error" in day) return stop(day.error);

  let unitCostMinor: number | undefined;
  let costSource: "stated" | "saved" = "stated";
  if (e.unitCost) unitCostMinor = toMinor(e.unitCost, ctx) ?? undefined;
  else if (e.totalCost) {
    const total = toMinor(e.totalCost, ctx);
    if (total === null) return stop(`${ctx.currency} amounts are recorded as whole numbers, so I can't use “${e.totalCost}”.`);
    if (total % quantity !== 0) { e.totalCost = undefined; return ask(draft, "cost", question(`${money(total, ctx)} doesn't divide evenly across ${quantity}. Tell me the cost of one instead, for example “25 each”.`, [CANCEL])); }
    unitCostMinor = total / quantity;
  } else if (product.costPriceMinor && product.costPriceMinor > 0) { unitCostMinor = product.costPriceMinor; costSource = "saved"; }
  if ((e.unitCost || e.totalCost) && unitCostMinor === undefined) return stop(`${ctx.currency} amounts are recorded as whole numbers, so I can't use that cost.`);
  if (unitCostMinor === undefined) return ask(draft, "cost", question(`What did each ${e.unit ?? "unit"} of ${product.name} cost? TallyBook needs a cost to record a purchase. For example: “25 each”.`, [{ type: "cancel", label: "Cancel" }]));

  const totalMinor = unitCostMinor * quantity;
  const notes = [
    unitNote(product, e.unit, quantity),
    costSource === "saved" ? `No cost was given, so I used the cost price saved on ${product.name}. To change it, reply with a cost such as “28 each”.` : undefined,
  ].filter((note): note is string => Boolean(note));
  const input: PurchaseFormValues = { supplierId: supplier.id, purchaseDate: toIsoDate(day.day), note: "", lines: [{ productId: product.id, quantity: String(quantity), unitCost: minorToInput(unitCostMinor, ctx) }], submissionKey: draft.submissionKey };
  return buildPending(draft, ctx, "stock_receipt", "Stock receipt preview — not saved yet", "Confirm stock receipt", [
    { label: "Product", value: product.name }, { label: "Quantity", value: quantityText(quantity, e.unit) }, { label: "Supplier", value: supplier.name },
    { label: "Cost each", value: `${money(unitCostMinor, ctx)}${costSource === "saved" ? " (saved cost price)" : ""}` }, { label: "Total cost", value: money(totalMinor, ctx) },
    { label: "Date", value: day.explicit ? describeDay(day.day) : `Today, ${describeDay(day.day)}` },
    { label: "Stock after", value: `${product.stockQuantity} → ${product.stockQuantity + quantity}` },
  ], notes, { kind: "stock_receipt", input }, resolvedCommand(draft, {
    product: { text: e.productText ?? product.name, id: product.id, name: product.name }, supplier: { text: e.supplierText ?? supplier.name, id: supplier.id, name: supplier.name }, quantity, unit: e.unit, unitCost: minorToInput(unitCostMinor, ctx),
  }));
}

/* ───────────── customer payment ───────────── */

const METHOD_CHIPS: AssistantAction[] = [
  { type: "fill", label: "Cash", slot: "method", value: "cash" }, { type: "fill", label: "Mobile Money", slot: "method", value: "mobile" }, { type: "fill", label: "Card", slot: "method", value: "card" }, { type: "cancel", label: "Cancel" },
];

async function advancePayment(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  const problem = currencyProblem(e, ctx);
  if (problem) return stop(problem);
  if (e.invalidQuantityText) return stop(`I can't use “${e.invalidQuantityText}” as an amount. Use a positive amount with at most two decimals.`);
  if (e.paymentConflict) { e.paymentConflict = undefined; e.paymentMethod = undefined; }
  if (!e.amount) return ask(draft, "amount", question("How much did they pay?", [{ type: "cancel", label: "Cancel" }]));
  if (!draft.resolved.customerId && !e.customerText) return ask(draft, "customer", question("Which customer paid? Type their name.", [{ type: "cancel", label: "Cancel" }]));
  const customerPick = await pickCustomer(draft, ctx);
  if ("step" in customerPick) return customerPick.step;
  const customer = customerPick.customer!;
  const amountMinor = toMinor(e.amount, ctx);
  if (amountMinor === null || amountMinor <= 0) { e.amount = undefined; return ask(draft, "amount", question(`${ctx.currency} amounts are recorded as whole numbers, so I can't use that. How much did ${customer.name} pay?`, [CANCEL])); }
  const method = e.paymentMethod as RepaymentMethod | undefined;
  if (!method) return ask(draft, "method", question(`How did ${customer.name} pay ${money(amountMinor, ctx)}?`, METHOD_CHIPS));

  const summary = await getCustomerDebtSummary(customer.id, ctx.currency, ctx.database);
  if (summary.outstandingMinor <= 0) return stop(`${customer.name} has no outstanding balance to pay off, so I can't record a payment.`);
  if (amountMinor > summary.outstandingMinor) { e.amount = undefined; return ask(draft, "amount", question(`${customer.name} owes ${summary.outstandingLabel}, so I can't record a payment of ${money(amountMinor, ctx)}. How much did they pay?`, [{ type: "fill", label: `Record the full ${summary.outstandingLabel}`, slot: "amount", value: minorToInput(summary.outstandingMinor, ctx) }, CANCEL])); }
  const input: RecordRepaymentInput = { customerId: customer.id, amount: minorToInput(amountMinor, ctx), method, note: "", currency: ctx.currency, submissionKey: draft.submissionKey };
  return buildPending(draft, ctx, "customer_payment", "Payment preview — not saved yet", "Confirm payment", [
    { label: "Customer", value: customer.name }, { label: "Amount", value: money(amountMinor, ctx) }, { label: "Method", value: paymentMethodLabel(method) },
    { label: "Owes now", value: summary.outstandingLabel }, { label: "Would owe after", value: money(summary.outstandingMinor - amountMinor, ctx) },
  ], [], { kind: "customer_payment", input }, resolvedCommand(draft, {
    customer: { text: e.customerText ?? customer.name, id: customer.id, name: customer.name }, amount: minorToInput(amountMinor, ctx), paymentMethod: method, paymentStatus: "paid",
  }));
}

/* ───────────── creating records (customer, supplier, category, product) ───────────── */

const CANCEL: AssistantAction = { type: "cancel", label: "Cancel" };

/**
 * Before adding a record, looks for one the owner already has. An identical name never creates a second record; a similar name asks first.
 * Returns a Step when the flow must stop or ask, or undefined when it is safe to continue.
 */
function duplicateGuard<T extends { id: string; name: string }>(draft: Draft, noun: string, name: string, records: readonly T[], describe: (record: T) => string, followUp?: (record: T) => AssistantAction[]): Step | undefined {
  const exact = records.find((record) => normalizeName(record.name) === normalizeName(name));
  if (exact) return { type: "reply", reply: info(`You already have a ${noun} called “${exact.name}” (${describe(exact)}), so I haven't added another.`, { actions: followUp?.(exact) }) };
  if (draft.confirmedNew) return undefined;
  const found = matchEntity(name, records);
  const similar = found.status === "one" ? [found.match] : found.status === "many" || found.status === "suggest" ? found.matches : [];
  if (!similar.length) return undefined;
  const names = similar.slice(0, 3).map((record) => `“${record.name}”`).join(" and ");
  const options: ChoiceOption[] = [{ id: "new", name, label: `Yes, add “${name}” as a new ${noun}` }];
  return ask(draft, "duplicate", question(`You already have ${names}. Is “${name}” a different ${noun}?`, [
    { type: "fill", label: options[0].label, slot: "duplicate", value: name, id: "new" }, CANCEL,
  ]), options);
}

/** Shows the first problem the real form schema finds, and goes back to ask for the field it belongs to. */
function schemaProblem(draft: Draft, issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>, fields: Record<string, { slot: Slot; clear: () => void; prompt: string }>): Step | undefined {
  const issue = issues[0];
  if (!issue) return undefined;
  const field = fields[String(issue.path[0])];
  if (!field) return stop(issue.message);
  field.clear();
  return ask(draft, field.slot, question(`${issue.message} ${field.prompt}`, [CANCEL]));
}

async function advanceCreateCustomer(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  if (!e.customerText) return ask(draft, "name", question("What's the customer's name?", [CANCEL]));
  const snapshot = await getCustomerSnapshot(ctx.database);
  const guard = duplicateGuard(draft, "customer", e.customerText, snapshot.customers, customerLabel, (customer) => [say(`How much does ${customer.name} owe?`)]);
  if (guard) return guard;
  if (!e.phone) return ask(draft, "phone", question(`What's ${e.customerText}'s phone number? TallyBook keeps a phone number for every customer.`, [CANCEL]));
  const input: CustomerFormValues = { name: e.customerText, phone: e.phone, email: "", address: "", notes: "", status: "active" };
  const check = customerFormSchema.safeParse(input);
  if (!check.success) return schemaProblem(draft, check.error.issues, { name: { slot: "name", clear: () => { e.customerText = undefined; }, prompt: "What's the customer's name?" }, phone: { slot: "phone", clear: () => { e.phone = undefined; }, prompt: "What's their phone number?" } })!;
  return buildPending(draft, ctx, "create_record", "New customer — not saved yet", "Add customer", [{ label: "Name", value: e.customerText }, { label: "Phone", value: e.phone }],
    ["Email, address and notes can be added later on the Customers page."], { kind: "create_customer", input }, resolvedCommand(draft, { customer: { text: e.customerText, name: e.customerText } }));
}

async function advanceCreateSupplier(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  if (!e.supplierText) return ask(draft, "name", question("What's the supplier's name?", [CANCEL]));
  const snapshot = await getPurchasesSnapshot(ctx.database);
  const guard = duplicateGuard(draft, "supplier", e.supplierText, snapshot.suppliers, (supplier) => supplier.phone ?? "no phone saved", (supplier) => [say(`What did we receive from ${supplier.name}?`)]);
  if (guard) return guard;
  const input: SupplierFormValues = { name: e.supplierText, phone: e.phone ?? "", email: "", address: "", notes: "" };
  const check = supplierFormSchema.safeParse(input);
  if (!check.success) return schemaProblem(draft, check.error.issues, { name: { slot: "name", clear: () => { e.supplierText = undefined; }, prompt: "What's the supplier's name?" } }) ?? stop(check.error.issues[0].message);
  return buildPending(draft, ctx, "create_record", "New supplier — not saved yet", "Add supplier", [{ label: "Name", value: e.supplierText }, ...(e.phone ? [{ label: "Phone", value: e.phone }] : [])],
    ["Phone, email and address can be added later on the Purchases page."], { kind: "create_supplier", input }, resolvedCommand(draft, { supplier: { text: e.supplierText, name: e.supplierText } }));
}

async function advanceCreateCategory(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  if (!e.categoryText) return ask(draft, "name", question("What should the category be called?", [CANCEL]));
  const snapshot = await getInventorySnapshot(ctx.database);
  const guard = duplicateGuard(draft, "category", e.categoryText, snapshot.categories, () => "already in Stock");
  if (guard) return guard;
  const input: CategoryFormValues = { name: e.categoryText };
  const check = categoryFormSchema.safeParse(input);
  if (!check.success) return schemaProblem(draft, check.error.issues, { name: { slot: "name", clear: () => { e.categoryText = undefined; }, prompt: "What should the category be called?" } }) ?? stop(check.error.issues[0].message);
  return buildPending(draft, ctx, "create_record", "New category — not saved yet", "Add category", [{ label: "Name", value: e.categoryText }],
    ["You can choose it when adding or editing a product."], { kind: "create_category", input }, resolvedCommand(draft, {}));
}

async function advanceCreateProduct(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  if (!e.productText) return ask(draft, "name", question("What's the product called?", [CANCEL]));
  const snapshot = await getInventorySnapshot(ctx.database);
  const guard = duplicateGuard(draft, "product", e.productText, snapshot.products, (product) => `${product.stockQuantity} in stock`, (product) => [say(`How many ${product.name} are left?`)]);
  if (guard) return guard;

  if (!e.price) return ask(draft, "price", question(`What's the selling price of ${e.productText}? For example “12” or “12.50”.`, [CANCEL]));
  const priceMinor = toMinor(e.price, ctx);
  if (priceMinor === null || priceMinor <= 0) { e.price = undefined; return ask(draft, "price", question(`${ctx.currency} prices are recorded as whole numbers, so I can't use that. What's the selling price of ${e.productText}?`, [CANCEL])); }

  if (e.categoryText && !draft.resolved.categoryId) {
    const found = matchEntity(e.categoryText, snapshot.categories);
    if (found.status === "one") draft.resolved.categoryId = found.match.id;
    else {
      const options: ChoiceOption[] = [...snapshot.categories.slice(0, 5).map((category) => ({ id: category.id, name: category.name, label: category.name })), { id: "uncategorized", name: "Uncategorized", label: "Leave uncategorized" }];
      const hint = snapshot.categories.length ? "Pick one, or leave it uncategorized." : "You have no categories yet, so I can leave it uncategorized, or you can say “add category …” first.";
      return ask(draft, "category", question(`I don't have a category called “${e.categoryText}”. ${hint}`, [...options.map((option): AssistantAction => ({ type: "fill", label: option.label, slot: "category", value: option.name, id: option.id })), CANCEL]), options);
    }
  }
  const categoryId = draft.resolved.categoryId ?? "uncategorized";
  const category = snapshot.categories.find((item) => item.id === categoryId);

  const costMinor = e.costPrice ? toMinor(e.costPrice, ctx) : undefined;
  const input: ProductFormValues = {
    name: e.productText, sku: "", categoryId, sellingPrice: minorToInput(priceMinor, ctx), costPrice: costMinor ? minorToInput(costMinor, ctx) : "",
    initialStock: String(e.openingStock ?? 0), lowStockThreshold: String(e.lowStockLevel ?? 0),
  };
  const check = productFormSchema.safeParse(input);
  if (!check.success) return schemaProblem(draft, check.error.issues, { name: { slot: "name", clear: () => { e.productText = undefined; }, prompt: "What's the product called?" }, sellingPrice: { slot: "price", clear: () => { e.price = undefined; }, prompt: "What's the selling price?" } }) ?? stop(check.error.issues[0].message);

  const opening = e.openingStock ?? 0;
  const notes = [
    opening > 0 ? "The opening stock is recorded as the first entry in this product's stock history." : "Opening stock is 0. After saving, say something like “I received 20 …” to add stock.",
    ...(e.costPrice && costMinor === null ? [`I left out the cost price because ${ctx.currency} amounts are recorded as whole numbers.`] : []),
    ...((e.lowStockLevel ?? 0) === 0 ? ["The low-stock level is 0. Say “low stock at 5” when adding, or change it later on the Stock page."] : []),
  ];
  return buildPending(draft, ctx, "create_record", "New product — not saved yet", "Add product", [
    { label: "Name", value: e.productText }, { label: "Selling price", value: money(priceMinor, ctx) },
    ...(costMinor ? [{ label: "Cost price", value: money(costMinor, ctx) }] : []),
    { label: "Opening stock", value: String(opening) }, { label: "Category", value: category?.name ?? "Uncategorized" }, { label: "Low-stock level", value: String(e.lowStockLevel ?? 0) },
  ], notes, { kind: "create_product", input }, resolvedCommand(draft, { product: { text: e.productText, name: e.productText } }));
}

/* ───────────── stock count (reconciliation) ───────────── */

async function advanceCount(draft: Draft, ctx: TransactionContext): Promise<Step> {
  const e = draft.entities;
  if (!draft.resolved.productId && !e.productText) return ask(draft, "product", question("Which product did you count? Type its name.", [CANCEL]));
  const productPick = await pickProduct(draft, ctx);
  if ("step" in productPick) return productPick.step;
  const { product } = productPick;
  if (e.counted === undefined) return ask(draft, "counted", question(`TallyBook shows ${product.stockQuantity} ${product.name}. How many did you actually count?`, [CANCEL]));
  const counted = e.counted;
  const difference = counted - product.stockQuantity;
  if (difference === 0) return { type: "reply", reply: info(`TallyBook already shows ${counted} ${product.name}, the same as your count, so there is nothing to correct.`) };
  const notes = [
    e.statedRecorded !== undefined && e.statedRecorded !== product.stockQuantity ? `You said TallyBook had ${e.statedRecorded}, but it currently shows ${product.stockQuantity}. I'm correcting from ${product.stockQuantity}.` : undefined,
    "This corrects the stock quantity only. Past sales, purchases and customer balances are not changed, and the correction is added to the product's stock history.",
  ].filter((note): note is string => Boolean(note));
  return buildPending(draft, ctx, "stock_count", "Stock count preview — not saved yet", "Correct stock", [
    { label: "Product", value: product.name }, { label: "TallyBook shows", value: String(product.stockQuantity) }, { label: "You counted", value: String(counted) },
    { label: "Difference", value: difference < 0 ? `${-difference} fewer than recorded` : `${difference} more than recorded` }, { label: "Stock after", value: `${product.stockQuantity} → ${counted}` },
  ], notes, { kind: "stock_count", input: { productId: product.id, counted, expectedBefore: product.stockQuantity } }, resolvedCommand(draft, { product: { text: e.productText ?? product.name, id: product.id, name: product.name }, quantity: counted }));
}

/* ───────────── recovery: instead of refusing, offer the nearest thing that works ───────────── */

function stockShortStep(draft: Draft, product: Product, requested: number): Step {
  const have = product.stockQuantity;
  const chips: AssistantAction[] = [
    ...(have > 0 ? [{ type: "fill", label: `Sell the ${have} I have`, slot: "quantity", value: String(have) } as AssistantAction] : []),
    say(`Receive more ${product.name}`, `Receive stock of ${product.name}`),
    say(`Recount ${product.name}`, `Recount ${product.name}`),
    CANCEL,
  ];
  const text = have === 0
    ? `TallyBook shows ${product.name} as out of stock, so I can't record this sale yet. If you have it on the shelf, recount it; if new stock arrived, receive it. Or type a smaller quantity.`
    : `TallyBook shows only ${have} ${product.name}, but you asked for ${requested}. Choose one of these, or type a different quantity.`;
  return ask(draft, "quantity", question(text, chips));
}

/** "2.5 crates" and "0 crates" can't be recorded; offer the whole numbers either side. */
function wholeQuantityStep(draft: Draft, typed: string, what: string): Step {
  const value = Number(typed.replace(",", "."));
  const options = Number.isFinite(value) && value >= 1 ? Array.from(new Set([Math.floor(value), Math.ceil(value)])).filter((n) => n >= 1 && n <= 9_999_999) : [];
  draft.entities.invalidQuantityText = undefined;
  return ask(draft, "quantity", question(`TallyBook records whole quantities only, so I can't use “${typed}”. ${options.length ? `Which should I record?` : `How many ${what} should I record? Use a whole number such as 2.`}`, [
    ...options.map((n): AssistantAction => ({ type: "fill", label: `Record ${n}`, slot: "quantity", value: String(n) })), CANCEL,
  ]));
}

/** Not found: offer to add the record, and keep the half-finished request so it can carry on afterwards. */
export const notFoundActions = (noun: "customer" | "product" | "supplier", mention: string): AssistantAction[] => [say(`Add “${mention}” as a new ${noun}`, `Add ${noun} ${mention}`), CANCEL];

export function advanceTransaction(draft: Draft, ctx: TransactionContext): Promise<Step> | undefined {
  if (draft.intent === "RECORD_SALE") return advanceSale(draft, ctx);
  if (draft.intent === "RECEIVE_STOCK") return advanceReceive(draft, ctx);
  if (draft.intent === "RECORD_CUSTOMER_PAYMENT") return advancePayment(draft, ctx);
  if (draft.intent === "CREATE_CUSTOMER") return advanceCreateCustomer(draft, ctx);
  if (draft.intent === "CREATE_PRODUCT") return advanceCreateProduct(draft, ctx);
  if (draft.intent === "CREATE_CATEGORY") return advanceCreateCategory(draft, ctx);
  if (draft.intent === "CREATE_SUPPLIER") return advanceCreateSupplier(draft, ctx);
  if (draft.intent === "ADJUST_INVENTORY") return advanceCount(draft, ctx);
  return undefined;
}

/* ───────────── execution: the only place a write can happen, and it calls existing services ───────────── */

function friendlyError(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError") {
    const issues = (error as Error & { issues?: Array<{ message?: string }> }).issues;
    return issues?.[0]?.message ?? "That entry was not valid.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
export const isSlowSave = (message: string) => /taking longer than expected/i.test(message);
export { friendlyError };

export async function executePending(pending: Pending, ctx: TransactionContext): Promise<AssistantReply> {
  const { payload } = pending;
  if (payload.kind === "sale") {
    const result = await withSaleCompletionTimeout(completeSale(payload.input, ctx.database));
    const line = result.lines[0];
    const snapshot = await getInventorySnapshot(ctx.database);
    const left = snapshot.products.find((product) => product.id === line.productId)?.stockQuantity;
    return {
      kind: "success",
      text: `Sale recorded: ${line.quantity} × ${line.productName} for ${money(result.sale.totalMinor, ctx)}.`,
      details: [
        { label: "Receipt", value: result.sale.receiptNumber }, { label: "Total", value: money(result.sale.totalMinor, ctx) },
        { label: "Paid now", value: money(result.sale.amountPaidMinor, ctx) },
        ...(result.sale.outstandingMinor > 0 ? [{ label: "Still owed", value: money(result.sale.outstandingMinor, ctx) }] : []),
        { label: "Payment", value: `${paymentMethodLabel(result.sale.paymentMethod)}${result.payment?.mobileMoneyProviderName ? ` · ${result.payment.mobileMoneyProviderName}` : ""}` },
        ...(left !== undefined ? [{ label: `${line.productName} left`, value: String(left) }] : []),
      ],
      link: { label: "Open Sales", href: "/sales" },
      recordId: result.sale.id,
    };
  }
  if (payload.kind === "stock_receipt") {
    const purchase = await completePurchase(payload.input, ctx.currency, ctx.database);
    const productId = payload.input.lines[0].productId;
    const snapshot = await getInventorySnapshot(ctx.database);
    const product = snapshot.products.find((item) => item.id === productId);
    return {
      kind: "success",
      text: `Stock received: ${payload.input.lines[0].quantity} × ${product?.name ?? "product"} from ${purchase.supplierName}.`,
      details: [{ label: "Total cost", value: money(purchase.totalCostMinor, ctx) }, ...(product ? [{ label: `${product.name} in stock now`, value: String(product.stockQuantity) }] : [])],
      link: { label: "Open Purchases", href: "/purchases" },
      recordId: purchase.id,
    };
  }
  if (payload.kind === "create_customer") {
    const customer = await createCustomer(payload.input, ctx.database);
    return { kind: "success", text: `Customer added: ${customer.name}.`, details: [{ label: "Phone", value: customer.phone }], link: { label: "Open Customers", href: "/customers" }, created: { kind: "customer", id: customer.id, name: customer.name } };
  }
  if (payload.kind === "create_supplier") {
    const supplier = await createSupplier(payload.input, ctx.database);
    return { kind: "success", text: `Supplier added: ${supplier.name}.`, link: { label: "Open Purchases", href: "/purchases" }, created: { kind: "supplier", id: supplier.id, name: supplier.name } };
  }
  if (payload.kind === "create_category") {
    const category = await createCategory(payload.input, ctx.database);
    return { kind: "success", text: `Category added: ${category.name}.`, link: { label: "Open Stock", href: "/inventory" }, created: { kind: "category", id: category.id, name: category.name } };
  }
  if (payload.kind === "create_product") {
    const product = await createProduct(payload.input, ctx.currency, ctx.database);
    return {
      kind: "success", text: `Product added: ${product.name}.`,
      details: [{ label: "Selling price", value: money(product.sellingPriceMinor, ctx) }, { label: "In stock", value: String(product.stockQuantity) }],
      link: { label: "Open Stock", href: "/inventory" }, created: { kind: "product", id: product.id, name: product.name },
    };
  }
  if (payload.kind === "stock_count") {
    const { productId, counted, expectedBefore } = payload.input;
    const product = (await getInventorySnapshot(ctx.database)).products.find((item) => item.id === productId);
    if (!product) throw new Error("This product is no longer active.");
    if (product.stockQuantity !== expectedBefore) throw new Error(`Stock for ${product.name} changed from ${expectedBefore} to ${product.stockQuantity} after this was prepared, because a sale or purchase was recorded. Please count again and ask me again.`);
    await adjustStock(productId, { movementType: "correction", quantity: String(counted), note: "Stock count entered in the Assistant" }, ctx.database);
    return {
      kind: "success", text: `Stock corrected: ${product.name} is now ${counted} (it was ${expectedBefore}).`,
      details: [{ label: "Change", value: `${counted - expectedBefore > 0 ? "+" : ""}${counted - expectedBefore}` }], link: { label: "Open Stock", href: "/inventory" }, recordId: productId,
    };
  }
  if (payload.kind === "customer_payment") {
    const repayment = await recordRepayment(payload.input, ctx.database);
    const summary = await getCustomerDebtSummary(repayment.customerId, ctx.currency, ctx.database);
    const customer = (await getCustomerSnapshot(ctx.database)).customers.find((item) => item.id === repayment.customerId);
    return {
      kind: "success",
      text: `Payment recorded: ${customer?.name ?? "Customer"} paid ${money(repayment.amountMinor, ctx)}.`,
      details: [{ label: "Method", value: paymentMethodLabel(repayment.method) }, { label: "Now owes", value: summary.outstandingMinor > 0 ? summary.outstandingLabel : `${money(0, ctx)} — fully paid` }],
      link: { label: "Open Customers", href: "/customers" },
      recordId: repayment.id,
    };
  }
  return { kind: "error", text: "Unexpected payload type." };
}

/* ───────────── batch operations: several transactions, checked together, then saved for real ───────────── */

export interface BatchPlan { items: BatchItem[]; pendings: Array<Pending | undefined>; readyCount: number; errorCount: number }

const oneLine = (view: TransactionPreviewView) => view.rows.map((row) => `${row.label}: ${row.value}`).join(" · ");

/**
 * Checks every item against the real records, in order. A line that needs more detail is reported, never guessed at.
 * Earlier lines count against later ones, so two sales of the same product can't both use the same stock, and two
 * payments can't together exceed what a customer owes.
 */
export async function advanceBatch(items: BatchItem[], ctx: TransactionContext): Promise<BatchPlan> {
  const checked: BatchItem[] = [];
  const pendings: Array<Pending | undefined> = [];
  for (const item of items) {
    try {
      const step = await advanceTransaction(newDraft(item.intent, item.entities, 0.85), ctx);
      if (step?.type === "preview") { checked.push({ ...item, status: "ready", summary: oneLine(step.pending.view) }); pendings.push(step.pending); }
      else { checked.push({ ...item, status: "error", error: step ? `Needs more detail. ${step.reply.text}` : "This line could not be checked." }); pendings.push(undefined); }
    } catch (error) {
      checked.push({ ...item, status: "error", error: friendlyError(error) }); pendings.push(undefined);
    }
  }

  const snapshot = await getInventorySnapshot(ctx.database);
  const stock = new Map(snapshot.products.map((product) => [product.id, product.stockQuantity]));
  const owed = new Map<string, number>();
  const reject = (index: number, error: string) => { checked[index] = { ...checked[index], status: "error", error, summary: undefined }; pendings[index] = undefined; };
  for (let index = 0; index < checked.length; index += 1) {
    const payload = pendings[index]?.payload;
    if (!payload) continue;
    if (payload.kind === "sale") {
      const short = payload.input.lines.find((line) => (stock.get(line.productId) ?? 0) < line.quantity);
      if (short) { reject(index, `Not enough ${snapshot.products.find((product) => product.id === short.productId)?.name ?? "stock"} after the lines above: only ${stock.get(short.productId) ?? 0} would be left.`); continue; }
      payload.input.lines.forEach((line) => stock.set(line.productId, (stock.get(line.productId) ?? 0) - line.quantity));
    } else if (payload.kind === "customer_payment") {
      const customerId = payload.input.customerId;
      if (!owed.has(customerId)) owed.set(customerId, (await getCustomerDebtSummary(customerId, ctx.currency, ctx.database)).outstandingMinor);
      const amount = toMinor(payload.input.amount, ctx);
      if (amount === null || amount > (owed.get(customerId) ?? 0)) { reject(index, `This is more than the customer would still owe after the payments above (${money(owed.get(customerId) ?? 0, ctx)}).`); continue; }
      owed.set(customerId, (owed.get(customerId) ?? 0) - amount);
    }
  }
  return { items: checked, pendings, readyCount: checked.filter((item) => item.status === "ready").length, errorCount: checked.filter((item) => item.status === "error").length };
}

/** Commit a compound sale as ONE ledger transaction, never as individually persisted lines.
 * The existing completeSale service owns the Dexie transaction (sale, lines, stock, payment and receipt).
 * This method deliberately rejects inconsistent payment/customer terms instead of guessing an allocation.
 */
export async function executeCompoundSale(items: BatchItem[], pendings: Array<Pending | undefined>, ctx: TransactionContext, submissionKey?: string): Promise<BatchOutcome> {
  const fail = (reason: string): BatchOutcome => ({
    items: items.map((item, index) => ({ ...item, status: index === 0 ? "error" : item.status, ...(index === 0 ? { error: reason } : {}) })),
    replies: [], savedCount: 0, failedAt: 0,
  });
  if (!items.length || items.some((item) => item.status !== "ready") || pendings.length !== items.length) return fail("Not every item is ready. Nothing was saved.");
  const sales = pendings.map((pending) => pending?.payload.kind === "sale" ? pending.payload.input : null);
  if (sales.some((sale) => !sale)) return fail("This group contains an unsupported item. Nothing was saved.");
  const [first] = sales as CompleteSaleInput[];
  const inputs = sales as CompleteSaleInput[];
  if (inputs.some((input) => input.customerId !== first.customerId || input.paymentMethod !== first.paymentMethod || input.currency !== first.currency || input.mobileMoneyProviderId !== first.mobileMoneyProviderId || input.mobileMoneyReference !== first.mobileMoneyReference || input.discount !== "0")) {
    return fail("Products must share the same customer and payment terms, with no item-specific discount. Nothing was saved.");
  }
  const paid = inputs.map((input) => toMinor(input.amountPaid, ctx));
  if (paid.some((amount) => amount === null)) return fail("One payment amount is invalid. Nothing was saved.");
  const totalPaidMinor = paid.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
  if (!Number.isSafeInteger(totalPaidMinor)) return fail("Combined payment is too large. Nothing was saved.");
  try {
    const result = await completeSale({ ...first, lines: inputs.flatMap((input) => input.lines), amountPaid: minorToInput(totalPaidMinor, ctx), ...(submissionKey ? { submissionKey } : {}) }, ctx.database);
    const reply: AssistantReply = {
      kind: "success", text: `Sale recorded: ${result.lines.length} product lines on one receipt (${result.sale.receiptNumber}), total ${money(result.sale.totalMinor, ctx)}.`,
      details: [
        { label: "Receipt", value: result.sale.receiptNumber },
        { label: "Total", value: money(result.sale.totalMinor, ctx) },
        { label: "Paid", value: money(result.sale.amountPaidMinor, ctx) },
        { label: "Outstanding", value: money(result.sale.outstandingMinor, ctx) },
      ], link: { label: "Open Sales", href: "/sales" }, recordId: result.sale.id,
    };
    return { items: items.map((item) => ({ ...item, status: "success" })), replies: items.map(() => reply), savedCount: 1 };
  } catch (error) { return fail(friendlyError(error)); }
}

export interface BatchOutcome { items: BatchItem[]; replies: Array<AssistantReply | undefined>; savedCount: number; failedAt?: number }

/**
 * Saves the ready items one after another, each exactly as previewed, using the same service calls as a single confirmation.
 * Stops at the first failure so the owner knows precisely what was and wasn't saved.
 */
export async function executeBatch(items: BatchItem[], pendings: Array<Pending | undefined>, ctx: TransactionContext): Promise<BatchOutcome> {
  const done = [...items];
  const replies: Array<AssistantReply | undefined> = [];
  let savedCount = 0;
  for (let index = 0; index < done.length; index += 1) {
    const pending = pendings[index];
    if (done[index].status !== "ready" || !pending) continue;
    done[index] = { ...done[index], status: "executing" };
    try {
      replies[index] = await executePending(pending, ctx);
      done[index] = { ...done[index], status: "success" };
      savedCount += 1;
    } catch (error) {
      done[index] = { ...done[index], status: "error", error: friendlyError(error) };
      return { items: done, replies, savedCount, failedAt: index };
    }
  }
  return { items: done, replies, savedCount };
}
