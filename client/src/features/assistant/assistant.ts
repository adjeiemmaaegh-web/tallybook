/**
 * Tallybook Assistant — session and router.
 *
 *   text → parseCommand → (validate against real records) → existing query  OR  preview → owner confirms → existing transaction service
 *
 * The session holds only conversation state (a half-finished request and at most one preview). Business records live only in TallyBook's
 * existing IndexedDB stores and are read and written only through the existing feature services.
 */
import { nanoid } from "nanoid";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { getCustomerSnapshot } from "@/features/customers/customers";
import { getInventorySnapshot } from "@/features/inventory/inventory";
import { getPurchasesSnapshot } from "@/features/purchases/purchases";
import { matchEntity } from "./entityMatcher";
import { recordAudit, type AuditAction } from "./audit";
import { createConversationMemory, resolveFollowUp } from "./conversation";
import { parseCountAnswer, parseNewNameAnswer, parsePersonAnswer, parsePhoneAnswer, parsePriceAnswer } from "./recordParsers";
import { parseCommand, parseCostAnswer, parseCustomerAnswer, parseItemAnswer, parseMoneyAnswer, parseNameAnswer, parsePaymentAnswer, parseQuantityAnswer } from "./intentParser";
import { activityReply, bestSellingProductReply, customersWhoSoldToReply, customerBalanceReply, inventoryReply, lowStockReply, salesReply, supplierPurchasesReply, topDebtorsReply } from "./queries";
import { periodSalesComparison, reorderInsight, slowMoversInsight } from "./insights";
import {getRun17Evidence} from "@/features/insights/run17Service";
import { answer, customerLabel, failure, helpReply, info, notUnderstood, question, resolveRecord, say, unsupported, type ChoiceOption } from "./replies";
import { displayMention, prepareText, sanitizeInput } from "./text";
import { notFoundActions, advanceBatch, advanceTransaction, executeBatch, executeCompoundSale, executePending, friendlyError, isSlowSave, newDraft, type Draft, type DraftIntent, type Pending, type Slot, type Step, type TransactionContext } from "./transactions";
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, type AssistantAction, type AssistantIntent, type AssistantPlan, type AssistantReply, type BatchItem, type BatchRequest, type ParsedCommand, type ParsedEntities, type ReplyDetail } from "./types";
import { MAX_BATCH_LINES, parseBatch, requestLines } from "./batchParser";
import { compoundItemWarning } from "./transactionSafety";
import { expandCompoundSale } from "./compoundSales";
import { planForText } from "./taskPlanner";
import { simulateSale } from "./dryRun";
import { executeLatestSaleReversal, prepareLatestSaleReversal } from "./reversals";
import { listStoredAliases, recordAssistantHistory, saveStoredWorkflow } from "./assistantLocalStore";
import { applyCustomAliases } from "./aliases";
import { normalizeSoleInterfaceRequest } from "./soleInterfaceLanguage";
import { soleInterfaceGuide } from "./soleInterfaceGuides";
import { createExpenseAssistantSession, isExpenseRecordingRequest } from "./expenseAssistant";
import { listAssistantTools, registerAssistantTool } from "./toolRegistry";
import { applicationReply, parseApplicationRequest, type AppCapability } from "./appKnowledge";
import { resolveContextFirst, type ContextFirstResolution } from "./tinyNluV2/contextFirstResolver";
import { isQuotationRequest, respondToQuotationRequest } from "./quotationAssistant";
import { createQuotationDraftSession } from "./quotationDraft";

export interface AssistantOptions {
  currency: string;
  database?: TallybookDB;
  now?: () => Date;
}

export interface Assistant {
  send(text: string): Promise<AssistantReply>;
  act(action: AssistantAction): Promise<AssistantReply>;
  clearContext(): void;
  /** Token of the preview currently waiting for confirmation, if any. */
  pendingToken(): string | null;
}

const CONFIRM = /^(?:yes|yep|yeah|y|ok|okay|confirm|confirmed|go ahead|do it|save|save it|record it|proceed|sure|correct|that is right|looks good)$/;
const CANCEL = /^(?:no|nope|n|cancel|stop|never ?mind|forget it|abort|discard|not now|wrong)$/;
/** A name that matched nothing in a question: offer to add it as a new record. */
function withAddOffer(reply: AssistantReply, noun: "customer" | "product" | "supplier", mention?: string): AssistantReply {
  return reply.kind === "error" && mention ? { ...reply, actions: notFoundActions(noun, displayMention(mention)) } : reply;
}

const BATCH_LABEL: Record<BatchItem["intent"], string> = { RECORD_SALE: "Sale", RECEIVE_STOCK: "Stock received", RECORD_CUSTOMER_PAYMENT: "Customer payment" };
const CREATING: AssistantIntent[] = ["CREATE_CUSTOMER", "CREATE_SUPPLIER", "CREATE_CATEGORY", "CREATE_PRODUCT"];
const RESUMABLE: AssistantIntent[] = ["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT"];
const TRANSACTIONS: AssistantIntent[] = ["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT", "CREATE_CUSTOMER", "CREATE_PRODUCT", "CREATE_CATEGORY", "CREATE_SUPPLIER", "ADJUST_INVENTORY"];
const PERIOD_CHIPS: AssistantAction[] = [say("Today", "Show today's sales"), say("Yesterday", "Show yesterday's sales"), say("Last 7 days", "Show sales for the last 7 days"), say("This month", "Show sales for this month"), say("Last month", "Show sales for last month")];
/** Period choices that keep the original question, e.g. "Best-selling products this month". */
const periodChips = (subject: string): AssistantAction[] => ["today", "yesterday", "this month", "last month"].map((when) => say(when[0].toUpperCase() + when.slice(1), `${subject} ${when}`));

const CONTEXT_FALLBACK_INTENTS = new Set<AssistantIntent>(["CUSTOMER_BALANCE", "INVENTORY_QUERY", "SALES_QUERY", "TODAY_SALES", "BEST_SELLING", "LOW_STOCK", "INSIGHTS_QUERY", "TOP_DEBTORS", "ACTIVITY_QUERY"]);
function parsedFromContextFirst(result: ContextFirstResolution, raw: string): ParsedCommand | null {
  const intent = result.candidates[0]?.intent as AssistantIntent | undefined;
  if (!intent || !CONTEXT_FALLBACK_INTENTS.has(intent) || result.safety.safety !== "READ_ONLY") return null;
  return {
    intent,
    confidence: Math.min(0.78, Math.max(0.46, result.confidence)),
    entities: {
      ...(result.roles.customerEntity ? { customerText: result.roles.customerEntity.value } : result.roles.customer ? { customerText: result.roles.customer } : {}),
      ...(result.roles.productEntity ? { productText: result.roles.productEntity.value } : result.roles.product ? { productText: result.roles.product } : {}),
      ...(result.roles.supplierEntity ? { supplierText: result.roles.supplierEntity.value } : result.roles.supplier ? { supplierText: result.roles.supplier } : {}),
    },
    alternatives: result.candidates.slice(1, 3).map((candidate) => ({ intent: candidate.intent as AssistantIntent, confidence: candidate.score })),
    raw,
  };
}

/** Tells other open pages (which already refresh on window focus) that saved records changed. No data is passed. */
function notifyRecordsChanged() { if (typeof window !== "undefined") window.dispatchEvent(new Event("focus")); }

export function createAssistant(options: AssistantOptions): Assistant {
  const database = options.database ?? db;
  let draft: Draft | null = null;
  /** A sale, stock receipt or payment waiting while the owner adds a customer, product or supplier it needs. */
  let parked: Draft | null = null;
  let pending: Pending | null = null;
  let confirmable = false;
  let queue: Promise<unknown> = Promise.resolve();
  let batchState: { items: BatchItem[]; pendings: Array<Pending | undefined>; confirmToken: string; companyId: string; compound: boolean } | null = null;
  /** The words that started the request now being handled, for the activity log. */
  let newRequest = "";
  /** What the owner asked for when a sale reversal was prepared, for the activity log. */
  let reversalRequest = "";
  let lastPlan: AssistantPlan | null = null;
  let pendingReversalToken: string | null = null;
  let pendingReversalSaleId: string | null = null;
  let pendingReversalCompanyId: string | null = null;
  /** Current application feature awaiting a short follow-up such as “add one”. */
  let appContext: AppCapability | null = null;

  const context = (): TransactionContext => ({ database, currency: options.currency, now: options.now?.() ?? new Date(), companyId: getActiveBusinessProfileId() });
  registerAssistantTool({ id: "sales-comparison", description: "Compare this month with last month", mode: "read", run: async (_input, ctx) => periodSalesComparison(ctx.database, ctx.now) });
  registerAssistantTool({ id: "reorder-suggestions", description: "Estimate reorder quantities from recent sales", mode: "read", run: async (_input, ctx) => reorderInsight(ctx.database, ctx.now) });
  registerAssistantTool({ id: "slow-movers", description: "Find stocked products with no recent sales", mode: "read", run: async (_input, ctx) => slowMoversInsight(ctx.database, ctx.now) });
  registerAssistantTool({ id: "run17-operating-review", description: "Inspect local evidence-backed business exceptions and source records; read only", mode: "read",
    run: async (_input, ctx) => getRun17Evidence("last7",ctx.now,ctx.database) });
  const serial = <T,>(work: () => Promise<T>): Promise<T> => { const run = queue.then(work, work); queue = run.catch(() => undefined); return run; };
  const memory = createConversationMemory(() => options.now?.() ?? new Date());
  const quotationDraft = createQuotationDraftSession(database, options.currency, () => options.now?.() ?? new Date());
  const expenseSession = createExpenseAssistantSession(database, options.currency, () => options.now?.() ?? new Date());
  // Conversation state is scoped to the active company, not merely to this assistant instance.
  // The app can switch business profiles while the assistant component remains mounted.
  let conversationCompanyId = getActiveBusinessProfileId();
  function resetOnBusinessChange(): boolean {
    const currentCompanyId = getActiveBusinessProfileId();
    if (currentCompanyId === conversationCompanyId) return false;
    conversationCompanyId = currentCompanyId;
    memory.forget();
    quotationDraft.clear();
    expenseSession.clear();
    draft = null;
    parked = null;
    pending = null;
    confirmable = false;
    batchState = null;
    lastPlan = null;
    pendingReversalToken = null;
    pendingReversalSaleId = null;
    pendingReversalCompanyId = null;
    appContext = null;
    return true;
  }


  /* ───────── turning a step into a reply and updating session state ───────── */

  function finish(step: Step, notice?: string): AssistantReply {
    if (step.type === "preview") {
      pending = step.pending; draft = null; confirmable = true;
      const seen = step.pending.command.entities;
      if (seen.customer?.id && seen.customer.name && !seen.customer.walkIn) memory.rememberCustomer({ id: seen.customer.id, name: seen.customer.name });
      if (seen.product?.id && seen.product.name) memory.rememberProduct({ id: seen.product.id, name: seen.product.name });
      return {
        kind: "preview", text: "Please check this. Nothing is saved until you confirm.", preview: step.pending.view, notice,
        actions: [{ type: "confirm", label: step.pending.view.confirmLabel, token: step.pending.token }, { type: "cancel", label: "Cancel" }],
      };
    }
    draft = step.draft ?? null;
    const reply = { ...step.reply, notice: notice ?? step.reply.notice };
    if (draft) draft.lastReply = reply;
    return reply;
  }

  async function advance(target: Draft, notice?: string): Promise<AssistantReply> {
    const ctx = context();
    const transaction = advanceTransaction(target, ctx);
    if (transaction) return finish(await transaction, notice);
    return finish(await advanceQuery(target, ctx), notice);
  }

  /* ───────── read-only questions, resolved against real records ───────── */

  async function advanceQuery(target: Draft, ctx: TransactionContext): Promise<Step> {
    const e = target.entities;
    const stay = (slot: Slot, text: string, options?: ChoiceOption[]): Step => { target.awaiting = slot; target.options = options; return { type: "reply", reply: question(text, [{ type: "cancel", label: "Cancel" }]), draft: target }; };
    if (target.intent === "CUSTOMER_BALANCE") {
      if (!target.resolved.customerId && !e.customerText) return stay("customer", "Whose balance would you like to see? Type the customer's name.");
      const snapshot = await getCustomerSnapshot(ctx.database);
      const known = snapshot.customers.find((customer) => customer.id === target.resolved.customerId);
      const resolution = known ? { ok: true as const, record: known } : resolveRecord("customer", e.customerText ?? "", snapshot.customers, snapshot.archivedCustomers, "customer", customerLabel);
      if (!resolution.ok) { if (resolution.options) { target.awaiting = "customer"; target.options = resolution.options; return { type: "reply", reply: resolution.reply, draft: target }; } return { type: "reply", reply: withAddOffer(resolution.reply, "customer", e.customerText) }; }
      memory.rememberCustomer({ id: resolution.record.id, name: resolution.record.name });
      return { type: "reply", reply: await customerBalanceReply(resolution.record, ctx) };
    }
    if (target.intent === "INVENTORY_QUERY") {
      if (!target.resolved.productId && !e.productText) return stay("product", "Which product? Type its name.");
      const snapshot = await getInventorySnapshot(ctx.database);
      const known = snapshot.products.find((product) => product.id === target.resolved.productId);
      if (known) { memory.rememberProduct({ id: known.id, name: known.name }); return { type: "reply", reply: inventoryReply([known], e.unit, ctx.currency) }; }
      const resolution = resolveRecord("product", e.productText ?? "", snapshot.products, snapshot.archivedProducts, "product", (product) => `${product.name} · ${product.stockQuantity} in stock`);
      if (resolution.ok) { memory.rememberProduct({ id: resolution.record.id, name: resolution.record.name }); return { type: "reply", reply: inventoryReply([resolution.record], e.unit, ctx.currency) }; }
      if (resolution.options && !resolution.suggestion) return { type: "reply", reply: inventoryReply(resolution.options.flatMap((option) => snapshot.products.filter((product) => product.id === option.id)), e.unit, ctx.currency) };
      if (resolution.options) { target.awaiting = "product"; target.options = resolution.options; return { type: "reply", reply: resolution.reply, draft: target }; }
      return { type: "reply", reply: withAddOffer(resolution.reply, "product", e.productText) };
    }
    if (target.intent === "SUPPLIER_PURCHASES") {
      if (!target.resolved.supplierId && !e.supplierText) return stay("supplier", "Which supplier? Type their name.");
      const snapshot = await getPurchasesSnapshot(ctx.database);
      const known = snapshot.suppliers.find((supplier) => supplier.id === target.resolved.supplierId);
      const resolution = known ? { ok: true as const, record: known } : resolveRecord("supplier", e.supplierText ?? "", snapshot.suppliers, snapshot.archivedSuppliers, "supplier", (supplier) => supplier.name);
      if (!resolution.ok) { if (resolution.options) { target.awaiting = "supplier"; target.options = resolution.options; return { type: "reply", reply: resolution.reply, draft: target }; } return { type: "reply", reply: withAddOffer(resolution.reply, "supplier", e.supplierText) }; }
      memory.rememberSupplier({ id: resolution.record.id, name: resolution.record.name });
      return { type: "reply", reply: await supplierPurchasesReply(resolution.record, ctx) };
    }
    return { type: "reply", reply: notUnderstood() };
  }

  /* ───────── commands ───────── */


  async function start(intent: DraftIntent, entities: ParsedEntities, confidence: number): Promise<AssistantReply> {
    const isTransaction = TRANSACTIONS.includes(intent);
    const notice = isTransaction && pending ? "The earlier preview was dropped. Nothing was recorded for it." : undefined;
    if (isTransaction) pending = null;
    // Adding a missing customer/product/supplier in the middle of a request: remember the request so it can carry on afterwards.
    if (CREATING.includes(intent) && draft && RESUMABLE.includes(draft.intent)) parked = draft;
    else if (!CREATING.includes(intent)) parked = null;
    draft = newDraft(intent, entities, confidence);
    draft.request = newRequest;
    return advance(draft, notice);
  }

  async function bareMentionReply(mention: string): Promise<AssistantReply> {
    const ctx = context();
    const [customers, inventory, purchases] = await Promise.all([getCustomerSnapshot(ctx.database), getInventorySnapshot(ctx.database), getPurchasesSnapshot(ctx.database)]);
    const chips: AssistantAction[] = [];
    const customerMatch = matchEntity(mention, customers.customers);
    if (customerMatch.status === "one") chips.push(say(`${customerMatch.match.name}'s balance`, `How much does ${customerMatch.match.name} owe?`), say(`${customerMatch.match.name} paid…`, `${customerMatch.match.name} paid`));
    if (customerMatch.status === "many") chips.push(...customerMatch.matches.slice(0, 3).map((customer) => say(`${customerLabel(customer)} — balance`, `How much does ${customer.name} owe?`)));
    const productMatch = matchEntity(mention, inventory.products);
    if (productMatch.status === "one") chips.push(say(`${productMatch.match.name} stock`, `How many ${productMatch.match.name} are left?`), say(`Sell ${productMatch.match.name}`));
    if (productMatch.status === "many") chips.push(...productMatch.matches.slice(0, 3).map((product) => say(`${product.name} stock`, `How many ${product.name} are left?`)));
    const supplierMatch = matchEntity(mention, purchases.suppliers);
    if (supplierMatch.status === "one") chips.push(say(`Received from ${supplierMatch.match.name}`, `What did we receive from ${supplierMatch.match.name}?`));
    return chips.length ? question(`What would you like to do with “${displayMention(mention)}”?`, chips.slice(0, 5)) : notUnderstood();
  }

  function canonicalChips(intent: AssistantIntent, entities: ParsedEntities): AssistantAction[] {
    if (intent === "CUSTOMER_BALANCE" && entities.customerText) return [say(`How much does ${displayMention(entities.customerText)} owe?`)];
    if (intent === "INVENTORY_QUERY" && entities.productText) return [say(`How many ${entities.productText} are left?`)];
    if (intent === "RECORD_CUSTOMER_PAYMENT" && entities.customerText && entities.amount) return [say(`${displayMention(entities.customerText)} paid ${entities.amount}`, `${displayMention(entities.customerText)} paid ${entities.amount}`)];
    if (intent === "SUPPLIER_PURCHASES" && entities.supplierText) return [say(`What did we receive from ${displayMention(entities.supplierText)}?`)];
    if (intent === "RECORD_SALE") return [say("Record a sale")];
    if (intent === "RECEIVE_STOCK") return [say("Record a purchase")];
    if (intent === "TODAY_SALES" || intent === "SALES_QUERY") return [say("Show today's sales")];
    return [];
  }

  function clarify(parsed: ParsedCommand): AssistantReply {
    if (parsed.entities.ambiguousReceipt || parsed.alternatives.some((alt) => alt.intent === "RECORD_CUSTOMER_PAYMENT" && parsed.intent === "RECEIVE_STOCK")) {
      const payment = canonicalChips("RECORD_CUSTOMER_PAYMENT", { customerText: parsed.entities.customerText, amount: parsed.entities.amount });
      return question("Did a customer pay you money, or did you receive stock from a supplier?", [...payment, say("I received stock", "Record a purchase")]);
    }
    const chips = [parsed.intent, ...parsed.alternatives.map((alt) => alt.intent)].slice(0, 3).flatMap((intent) => canonicalChips(intent, parsed.entities));
    return chips.length ? question("I'm not sure I understood. Did you mean one of these?", chips.slice(0, 4)) : notUnderstood();
  }

  async function handle(parsed: ParsedCommand): Promise<AssistantReply> {
    if (parsed.intent === "HELP") return helpReply();
    if (parsed.intent === "UNKNOWN" || parsed.confidence < CONFIDENCE_MEDIUM) return parsed.bareMention ? bareMentionReply(parsed.bareMention) : notUnderstood();
    if (parsed.confidence < CONFIDENCE_HIGH) return clarify(parsed);
    if (draft && !TRANSACTIONS.includes(draft.intent)) draft = null;
    if (!CREATING.includes(parsed.intent)) parked = null;
    const e = parsed.entities;
    memory.rememberQuery(parsed.intent);
    switch (parsed.intent) {
      case "CUSTOMER_BALANCE": case "INVENTORY_QUERY": case "SUPPLIER_PURCHASES": return start(parsed.intent, e, parsed.confidence);
      case "RECORD_SALE": case "RECEIVE_STOCK": case "RECORD_CUSTOMER_PAYMENT": return start(parsed.intent, e, parsed.confidence);
      case "TODAY_SALES": case "SALES_QUERY": {
        const period = parsed.period ?? { kind: "unspecified" as const };
        if (period.kind === "unsupported") return question(`I can show sales for today, yesterday, one specific day, the last 7 or 30 days, this month, last month, this year or last year. I can't do “${period.text}”. Which would you like?`, PERIOD_CHIPS);
        if (parsed.qualifier) return question(`I can show total sales for a period, but I can't filter them by “${parsed.qualifier}” yet. Would you like the totals instead?`, PERIOD_CHIPS);
        if (period.kind === "unspecified") return question("Which period would you like sales for?", PERIOD_CHIPS);
        return salesReply(period, context());
      }
      case "SUPPLIER_BALANCE": {
        const name = e.supplierText ? displayMention(e.supplierText) : undefined;
        return unsupported("TallyBook doesn't track what you owe suppliers — purchases are recorded with their cost, but not as a balance — so I can't answer that from your records.", { actions: name ? [say(`What did we receive from ${name}?`)] : undefined });
      }
      case "TOP_DEBTORS": {
        const period = parsed.period ?? { kind: "unspecified" as const };
        if (period.kind === "unsupported") return question(`I can do today, yesterday, one specific day, the last 7 or 30 days, this month, last month, this year or last year. Which period?`, periodChips("Top debtors"));
        return topDebtorsReply(3, context(), period);
      }
      case "LOW_STOCK": return lowStockReply(context());
      case "BEST_SELLING": {
        const period = parsed.period ?? { kind: "unspecified" as const };
        if (period.kind === "unsupported") return question(`I can do today, yesterday, one specific day, the last 7 or 30 days, this month, last month, this year or last year. Which would you like?`, periodChips("Best-selling products"));
        return bestSellingProductReply(period, context());
      }
      case "CUSTOMERS_WHO_BOUGHT": {
        const period = parsed.period ?? { kind: "unspecified" as const };
        if (period.kind === "unsupported") return question(`I can do today, yesterday, one specific day, the last 7 or 30 days, this month, last month, this year or last year. Which would you like?`, periodChips("Which customers bought"));
        if (e.productText) {
          const snapshot = await getInventorySnapshot(database);
          const resolution = resolveRecord("product", e.productText, snapshot.products, snapshot.archivedProducts, "product", (product) => `${product.name} \u00b7 ${product.stockQuantity} in stock`);
          if (!resolution.ok) return withAddOffer(resolution.reply, "product", e.productText);
          memory.rememberProduct({ id: resolution.record.id, name: resolution.record.name });
          return customersWhoSoldToReply(period, context(), { id: resolution.record.id, name: resolution.record.name });
        }
        return customersWhoSoldToReply(period, context());
      }
      case "ACTIVITY_QUERY": {
        const period = parsed.period && parsed.period.kind !== "unspecified" ? parsed.period : { kind: "today" as const };
        if (period.kind === "unsupported") return question(`I can look back over today, yesterday, one specific day, the last 7 or 30 days, this month, last month, this year or last year. Which would you like?`, periodChips("What did the assistant record"));
        return activityReply(period, context());
      }
      case "INSIGHTS_QUERY": {
        const now = context().now;
        const result = parsed.qualifier === "reorder"
          ? await reorderInsight(database, now)
          : parsed.qualifier === "slow-movers"
            ? await slowMoversInsight(database, now)
            : await periodSalesComparison(database, now);
        const followUps = parsed.qualifier === "reorder"
          ? [say("Show slow movers", "What are the slow movers?"), say("Show low stock", "What is running low?")]
          : parsed.qualifier === "slow-movers"
            ? [say("Check reorder suggestions", "What should I reorder?"), say("Show sales", "Show this month's sales")]
            : [say("Check reorder suggestions", "What should I reorder?"), say("Show slow movers", "What are the slow movers?")];
        return answer(result.text, { details: result.facts, intent: parsed.intent, confidence: parsed.confidence, actions: followUps });
      }
      case "CREATE_CUSTOMER": case "CREATE_SUPPLIER": case "CREATE_CATEGORY": case "CREATE_PRODUCT": case "ADJUST_INVENTORY":
        return start(parsed.intent, e, parsed.confidence);
      case "UNSUPPORTED_ACTION": {
        if (parsed.unsupportedTopic === "expense") return unsupported("I don't record expenses yet. You can do that on the Expenses page.", { link: { label: "Open Expenses", href: "/expenses" } });
        return unsupported("I can't edit, delete, refund or clear records — that keeps your ledger safe. Please make that change on the app page where the record lives.");
      }
      default: return notUnderstood();
    }
  }

  /* ───────── answering a question the assistant asked ───────── */

  function reAsk(target: Draft): AssistantReply {
    target.attempts += 1;
    if (target.attempts >= 3) { draft = null; return info("I couldn't understand that, so I stopped. Nothing was recorded. You can start again whenever you like."); }
    const last = target.lastReply ?? notUnderstood();
    return { ...last, text: `Sorry, I didn't catch that. ${last.text}`, notice: undefined };
  }

  async function applyAnswer(target: Draft, text: string): Promise<AssistantReply> {
    const e = target.entities;
    if (target.options?.length) {
      const chosen = CONFIRM.test(prepareText(text)) && target.options.length === 1 ? target.options[0] : (() => {
        const match = matchEntity(text, target.options!.map((option) => ({ id: option.id, name: option.name })));
        return match.status === "one" ? target.options!.find((option) => option.id === match.match.id) : undefined;
      })();
      return chosen ? fill(target.awaiting!, chosen.name, chosen.id) : reAsk(target);
    }
    const isQuery = !TRANSACTIONS.includes(target.intent);
    switch (target.awaiting) {
      case "item": {
        const item = parseItemAnswer(text);
        if (!item.product && !item.quantity) return reAsk(target);
        if (item.product) { e.productText = item.product; target.resolved.productId = undefined; }
        if (item.quantity) e.quantity = item.quantity;
        e.unit = item.unit ?? e.unit; e.invalidQuantityText = item.invalidQuantityText;
        break;
      }
      case "quantity": { const quantity = parseQuantityAnswer(text); if (!quantity) return reAsk(target); e.quantity = quantity; e.invalidQuantityText = undefined; break; }
      case "customer": {
        if (isQuery) { const name = parseNameAnswer(text); if (!name) return reAsk(target); e.customerText = name; target.resolved.customerId = undefined; break; }
        const answer = parseCustomerAnswer(text);
        if (answer.walkIn && !target.requireNamedCustomer) { e.walkIn = true; break; }
        if (!answer.name) return reAsk(target);
        e.customerText = answer.name; e.walkIn = false; target.resolved.customerId = undefined; break;
      }
      case "payment": case "method": {
        const payment = parsePaymentAnswer(text);
        if (!payment.method || payment.conflict || (target.awaiting === "method" && payment.method === "credit")) return reAsk(target);
        e.paymentMethod = payment.method; e.paymentConflict = undefined; e.providerHint = payment.providerHint ?? e.providerHint; break;
      }
      case "supplier": { const name = parseNameAnswer(text); if (!name) return reAsk(target); e.supplierText = name; target.resolved.supplierId = undefined; break; }
      case "product": { const name = parseNameAnswer(text); if (!name) return reAsk(target); e.productText = name; target.resolved.productId = undefined; break; }
      case "cost": {
        const cost = parseCostAnswer(text);
        if (!cost || cost.invalid) return reAsk(target);
        e.unitCost = cost.unitCost; e.totalCost = cost.totalCost; break;
      }
      case "amount": {
        const money = parseMoneyAnswer(text);
        if (!money.amount) return reAsk(target);
        e.amount = money.amount; if (money.currency.code) e.currency = money.currency.code; break;
      }
      case "mobileReference": {
        const reference = text.trim();
        if (!/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,119}$/.test(reference)) return reAsk(target);
        e.mobileMoneyReference = reference;
        break;
      }
      case "name": {
        const person = target.intent === "CREATE_CUSTOMER" || target.intent === "CREATE_SUPPLIER";
        const answer = person ? parsePersonAnswer(text) : { name: parseNewNameAnswer(text), phone: undefined };
        if (!answer.name) return reAsk(target);
        if (target.intent === "CREATE_CUSTOMER") e.customerText = answer.name;
        else if (target.intent === "CREATE_SUPPLIER") e.supplierText = answer.name;
        else if (target.intent === "CREATE_CATEGORY") e.categoryText = answer.name;
        else e.productText = answer.name;
        if (answer.phone) e.phone = answer.phone;
        target.confirmedNew = false; break;
      }
      case "phone": { const phone = parsePhoneAnswer(text); if (!phone) return reAsk(target); e.phone = phone; break; }
      case "price": { const price = parsePriceAnswer(text); if (!price) return reAsk(target); e.price = price; break; }
      case "counted": { const counted = parseCountAnswer(text); if (counted === undefined) return reAsk(target); e.counted = counted; break; }
      default: return reAsk(target);
    }
    target.awaiting = undefined; target.options = undefined; target.attempts = 0;
    return advance(target);
  }

  async function fill(slot: string, value: string, id?: string): Promise<AssistantReply> {
    if (!draft) return info("That question is no longer open, so nothing was changed.");
    const target = draft; const e = target.entities;
    if (id && !target.options?.some((option) => option.id === id)) return info("That choice is no longer available. Please answer the latest question.");
    if (slot === "product" && id) target.resolved.productId = id;
    else if (slot === "customer" && id) { target.resolved.customerId = id; e.walkIn = false; }
    else if (slot === "customer") { if (target.requireNamedCustomer) return reAsk(target); e.walkIn = true; }
    else if (slot === "supplier" && id) target.resolved.supplierId = id;
    else if (slot === "provider" && id) target.resolved.providerId = id;
    else if ((slot === "payment" || slot === "method") && ["cash", "card", "mobile", "credit"].includes(value)) { if (slot === "method" && value === "credit") return reAsk(target); e.paymentMethod = value as ParsedEntities["paymentMethod"]; e.paymentConflict = undefined; }
    else if (slot === "quantity" && /^\d+$/.test(value) && Number(value) >= 1) { e.quantity = Number(value); e.invalidQuantityText = undefined; }
    else if (slot === "amount" && /^\d+(?:\.\d+)?$/.test(value)) e.amount = value;
    else if (slot === "discount" && value === "full-price") e.discountMentioned = false;
    else if (slot === "duplicate" && id === "new") target.confirmedNew = true;
    else if (slot === "category" && id) target.resolved.categoryId = id;
    else return info("That choice doesn't apply any more.");
    target.awaiting = undefined; target.options = undefined; target.attempts = 0;
    return advance(target);
  }

  /** After adding the customer/product/supplier a request was waiting for, carry on with that request. */
  async function resumeParked(created: AssistantReply): Promise<AssistantReply> {
    const target = parked!; parked = null;
    const record = created.created!; const e = target.entities;
    if (record.kind === "customer" && e.customerText) { target.resolved.customerId = record.id; e.walkIn = false; }
    else if (record.kind === "product" && e.productText) target.resolved.productId = record.id;
    else if (record.kind === "supplier" && e.supplierText) target.resolved.supplierId = record.id;
    else return created;
    target.awaiting = undefined; target.options = undefined; target.attempts = 0; draft = target;
    return advance(target, `${created.text} Carrying on with your request.`);
  }

  /* ───────── confirming and cancelling ───────── */

  function cancel(): AssistantReply {
    const had = pending !== null || draft !== null || batchState !== null;
    pending = null; draft = null; parked = null; batchState = null; confirmable = false;
    return had ? info("Cancelled. Nothing was recorded.") : info("There is nothing waiting to cancel.");
  }

  async function confirm(token: string): Promise<AssistantReply> {
    if (!pending || pending.token !== token) return info("That preview is no longer active, so nothing was recorded.");
    if (pending.executing) return info("This is already being saved.");
    if (getActiveBusinessProfileId() !== pending.companyId) { pending = null; return failure("You switched business after this preview was prepared, so nothing was recorded. Ask again in the business you want."); }
    const current = pending;
    current.executing = true;
    try {
      const reply = await executePending(current, context());
      pending = null; draft = null; confirmable = false;
      notifyRecordsChanged();
      await recordAudit(database, { businessProfileId: current.companyId, action: current.payload.kind as AuditAction, outcome: "saved", summary: reply.text, request: current.draft.request, details: current.view.rows, recordId: reply.recordId ?? reply.created?.id }, context().now);
      return reply.created && parked ? resumeParked(reply) : reply;
    } catch (error) {
      const message = friendlyError(error);
      if (isSlowSave(message)) { current.executing = false; confirmable = true; return failure(message, { actions: [{ type: "confirm", label: "Try again", token: current.token }, { type: "cancel", label: "Cancel" }] }); }
      pending = null; confirmable = false;
      await recordAudit(database, { businessProfileId: current.companyId, action: current.payload.kind as AuditAction, outcome: "failed", summary: `${message} Nothing was saved.`, request: current.draft.request, details: current.view.rows }, context().now);
      return failure(`${message} Nothing was saved.`);
    }
  }

  async function editPendingCost(current: Pending, cost: NonNullable<ReturnType<typeof parseCostAnswer>>): Promise<AssistantReply> {
    if (cost.invalid) return failure(`I can't use “${cost.invalid}” as a cost. Use a positive amount with at most two decimals.`);
    const next: Draft = { ...current.draft, entities: { ...current.draft.entities, unitCost: cost.unitCost, totalCost: cost.totalCost }, resolved: { ...current.draft.resolved }, awaiting: undefined, options: undefined };
    pending = null;
    return advance(next);
  }

  /* ───────── public surface ───────── */

  async function sendNow(rawText: string): Promise<AssistantReply> {
    const text = sanitizeInput(rawText);
    if (!text) return info("Type a question or a command, for example “How much does Adwoa owe?”.");
    const storedAliases = await listStoredAliases(getActiveBusinessProfileId());
    // Preserve pending drafts verbatim: only first-turn commands get wrapper normalization.
    const canonicalText = applyCustomAliases(!draft && !pending && !batchState && !quotationDraft.hasDraft() ? normalizeSoleInterfaceRequest(text) : text, storedAliases);
    const prepared = prepareText(canonicalText);
    const contextFirst = resolveContextFirst(canonicalText);
    if (expenseSession.hasDraft()) {
      if (CONFIRM.test(prepared)) return info("Use the Confirm expense button on the preview. A typed yes cannot post an expense.");
      return (await expenseSession.handle(text)) ?? failure("The expense conversation expired. Nothing was recorded.");
    }
    if (quotationDraft.hasDraft()) {
      if (CANCEL.test(prepared)) { quotationDraft.clear(); return info('Quotation preparation cancelled. No records were changed.'); }
      if (CONFIRM.test(prepared)) return quotationDraft.token() ? quotationDraft.confirm(quotationDraft.token()!) : info('The quotation needs a customer and at least one product.');
      return quotationDraft.update(canonicalText);
    }
    if (!draft && !pending && !batchState && isQuotationRequest(canonicalText) && /\b(?:create|make|prepare|draft|new)\b/i.test(canonicalText) && !/\b(?:convert|accept|issue|decline|delete)\b/i.test(canonicalText)) return quotationDraft.update(canonicalText);
    const canConfirm = confirmable; confirmable = false;
    if (pending && canConfirm && CONFIRM.test(prepared)) return confirm(pending.token);
    if (batchState && canConfirm && CONFIRM.test(prepared)) return confirmBatch();
    if (CANCEL.test(prepared)) { pendingReversalToken = null; pendingReversalSaleId = null; pendingReversalCompanyId = null; return cancel(); }
    if (CONFIRM.test(prepared) && !(draft?.options?.length === 1)) return info(pending || batchState ? "Press the confirm button on the preview to proceed." : "There is nothing waiting for confirmation. Ask me a question or give me a command.");

    // Quotation operations always belong to the authoritative quotations UI.
    // Answer only when no financial draft or confirmation is pending.
    if (!draft && !pending && !batchState && isQuotationRequest(canonicalText)) {
      return respondToQuotationRequest(canonicalText, database, options.currency);
    }

    // A supported expense entry takes precedence over old unsupported-action
    // guidance. All actual writes still require a separate confirmed action.
    if (!draft && !pending && !batchState && isExpenseRecordingRequest(canonicalText)) {
      const expense = await expenseSession.handle(canonicalText);
      if (expense) return expense;
    }

    // First-time help questions and unsupported operations deserve concrete,
    // truthful instructions rather than a misleading generic parser fallback.
    // Never run guidance over an open draft or financial confirmation.
    if (!draft && !pending && !batchState) {
      const guide=soleInterfaceGuide(canonicalText);
      if (guide) return guide;
    }

    // Run 17 analytic questions never execute an AI-generated financial plan.
    // Only respond when no sale, credit, reversal or other confirmation is open.
    if (!draft && !pending && !batchState &&
      /\b(?:business pulse|operational alerts|business exceptions|business anomalies|analytics evidence|run 17 insights|what needs attention in (?:my|the) business|operating review)\b/i.test(canonicalText)) {
      const report=await getRun17Evidence("last7",options.now?.()??new Date(),database);
      const urgent=report.findings.filter(f=>f.severity==="attention");
      const rows=report.findings.slice(0,6).map(item=>({
        primary:item.title,secondary:item.evidence,
        amount:item.confidence==="limited"?"Incomplete evidence":"Review only"
      }));
      return answer(
        urgent.length
          ? urgent.length+" operating findings need human review. These are saved-device observations, not proof of loss, fraud, a forecast or financial settlement."
          : "No attention-level operating findings in this local snapshot. This does not prove that all records are complete.",
        {details:[
          {label:"Period",value:"Last 7 days"},
          {label:"Recorded sale invoices",value:report.summary.recordedSaleCount+" (gross invoice minor units "+report.summary.grossRecordedInvoiceMinor+")"},
          {label:"Full reversals / partial-return affected",value:report.summary.fullyReversedSaleCount+" / "+report.summary.partialReturnAffectedSaleCount},
          {label:"Unreceived store transfers",value:String(report.summary.pendingDispatchedTransferCount)},
          {label:"Source",value:"Local saved company records; no remote model or settlement verification"}
        ],rows,moreText:report.incompleteFindingCount?"More findings were omitted from this reply. Open Insights for the source-linked review.":"Open Insights to verify individual source records before acting.",
        link:{label:"Review evidence in Insights",href:"/insights"},
        intent:"INSIGHTS_QUERY",confidence:1}
      );
    }

    // Application-level follow-ups are resolved before business parsing, but only while no financial draft is open.
    if (!draft && !pending && !batchState && appContext) {
      const followAction = appContext.actions.find((action) => action.prompt && /^(?:add|create|record|open|show|check|find|view|one|it|that|low stock|more)\b/.test(prepared) && (action.id === "add-supplier" || action.id === "add-customer" || action.id === "add-product" || action.id === "record-purchase" || action.id === "record-expense" || action.id === "record" || action.id === "low-stock" || action.id === "show" || action.id === "balance"));
      if (followAction?.prompt) { appContext = null; return sendNow(followAction.prompt); }
      if (/^(?:add|create)\s+(?:one|another|new)\b/.test(prepared)) {
        const add = appContext.actions.find((action) => action.prompt && /^add-/.test(action.id));
        if (add?.prompt) { appContext = null; return sendNow(add.prompt); }
      }
    }

    // Application knowledge is read-only and is evaluated before generic business parsing so “where are suppliers?”
    // cannot become a supplier-purchase or transaction request. Explicit transaction verbs remain outside this route.
    if (!draft && !pending && !batchState) {
      if (contextFirst.disposition === "ASK_CLARIFICATION" && contextFirst.view?.kind === "AMBIGUOUS" && contextFirst.clarification && contextFirst.safety.safety === "READ_ONLY" && /\b(?:show|see|view|display|check|look)\b/i.test(canonicalText) && !/\b(?:activity|audit|what did|what have)\b/i.test(canonicalText)) {
        return question(contextFirst.clarification, []);
      }
      if (contextFirst.disposition === "NAVIGATE" && contextFirst.view?.capability) {
        const kind = contextFirst.view.kind === "HELP" ? "help" : contextFirst.view.kind === "QUERY" ? "discover" : "navigate";
        if (kind !== "help" || contextFirst.view.capability) {
          appContext = contextFirst.view.capability;
          return applicationReply({ kind, capability: contextFirst.view.capability, confidence: contextFirst.confidence, phrase: contextFirst.input.normalized });
        }
      }
      if (contextFirst.mode === "HELP" && contextFirst.safety.safety === "READ_ONLY") {
        if (contextFirst.view?.capability) {
          appContext = contextFirst.view.capability;
          return applicationReply({ kind: "help", capability: contextFirst.view.capability, confidence: contextFirst.confidence, phrase: contextFirst.input.normalized });
        }
        return helpReply();
      }
      const applicationRequest = parseApplicationRequest(canonicalText);
      if (applicationRequest) {
        appContext = applicationRequest.capability;
        return applicationReply(applicationRequest);
      }
    }

    const saveWorkflowMatch = /^save (?:this|that) as (?:my )?(.+)$/i.exec(text);
    if (saveWorkflowMatch) {
      if (!lastPlan) return info("I need a plan or check first. Ask me for a morning check, end-of-day summary, or business overview, then save it by name.");
      const name = saveWorkflowMatch[1].trim();
      await saveStoredWorkflow({ businessProfileId: getActiveBusinessProfileId(), name, description: lastPlan.goal, commands: lastPlan.steps.map((step) => step.label) });
      return info(`Saved local workflow “${name}”. It is stored on this device only.`);
    }

    const dryRun = /^(?:what happens if|dry run|simulate)\s+(?:i\s+)?sell\s+(\d+)\s+(.+?)(?:\s+to\s+(.+?))?(?:\s+(?:on\s+)?credit)?$/i.exec(canonicalText);
    if (dryRun) {
      const customerText = dryRun[3]?.replace(/\s+on\s+credit$/i, "").trim(); const credit = /\bcredit\b/i.test(text);
      try { const result = await simulateSale({ productText: dryRun[2].replace(/\s+on\s+credit$/i, "").trim(), quantity: Number(dryRun[1]), customerText, credit }, options.currency, database); return { kind: "answer", text: result.text, details: [{ label: "Mode", value: "Dry run — no records changed" }, { label: "Available next step", value: "Open the normal confirmation preview" }], actions: [{ type: "say", label: "Prepare this sale", text: `Sell ${dryRun[1]} ${dryRun[2]}${customerText ? ` to ${customerText}` : ""}${credit ? " on credit" : ""}` }, { type: "cancel", label: "Cancel" }] }; }
      catch (error) { return failure(error instanceof Error ? error.message : "I couldn't simulate that sale safely."); }
    }
    if (/^(?:undo|reverse|cancel)\s+(?:the\s+)?(?:last|most recent)\s+sale/i.test(canonicalText)) {
      try { const reversal = await prepareLatestSaleReversal(options.currency, database); pendingReversalToken = `reverse-${nanoid(12)}`; pendingReversalSaleId = reversal.saleId; pendingReversalCompanyId = getActiveBusinessProfileId(); reversalRequest = text; return { kind: "preview", text: reversal.text, details: reversal.lines.map((line) => ({ label: line.productName, value: `${line.quantity} units would be restored` })), actions: [{ type: "confirm_reversal", label: "Confirm reversal", token: pendingReversalToken }, { type: "cancel", label: "Cancel" }] }; }
      catch (error) { return failure(error instanceof Error ? error.message : "I couldn't prepare a reversal."); }
    }

    batchState = null; // a new message replaces any batch preview that was waiting
    // Several transactions in one message. This reads the ORIGINAL text, because cleaning it for single commands flattens the line breaks.
    const lines = requestLines(rawText);
    if (lines.length > MAX_BATCH_LINES) return info(`That's more than ${MAX_BATCH_LINES} lines. Please send them in smaller groups so each can be checked.`);
    const expandedSale = expandCompoundSale(rawText);
    const batch = parseBatch((expandedSale?.join("\n") ?? rawText).slice(0, 4000), { now: options.now?.(), normalize: (line) => applyCustomAliases(line, storedAliases) });
    if (batch) return handleBatch(batch, Boolean(expandedSale));

    const compoundWarning = compoundItemWarning(canonicalText);
    if (compoundWarning) return info(compoundWarning);

    const planned = planForText(canonicalText);
    if (planned) { lastPlan = planned.plan; return planned.reply; }
    if (lines.length >= 2) return info("I can record several sales, stock receipts or payments in one message, one per line, each complete (for example \u201cSell 2 eggs to Kwame, cash\u201d). I couldn't read this as separate requests, so nothing was recorded. Please send them one at a time, or rewrite the lines.");

    // Refuse to record a planned transaction even when there is insufficient
    // information for the sale parser to form an ordinary write candidate.
    if (/^(?:record|log|enter|save)\s+(?:my|a|an|our|the)?\s*(?:planned|future|scheduled)\s+(?:sale|payment|stock\s+delivery)\b/i.test(prepared))
      return info("That transaction is planned, not completed. I haven't saved anything. Tell me after it really happens.");

    const parsed = parseCommand(canonicalText, { now: options.now?.() });
    if (parsed.entities.plannedAction) return info("That sounds like something planned, not done yet, so I haven't recorded anything. Tell me again once the sale, delivery or payment has actually happened.");
    const contextFallback = parsed.intent === "UNKNOWN" ? parsedFromContextFirst(contextFirst, canonicalText) : null;
    if (contextFallback) return handle(contextFallback);
    if (pending?.payload.kind === "stock_receipt" && parsed.confidence < CONFIDENCE_HIGH) {
      const cost = parseCostAnswer(text);
      if (cost) return editPendingCost(pending, cost);
    }
    if (draft && parsed.confidence < CONFIDENCE_HIGH) return applyAnswer(draft, text);
    if (!draft) {
      const follow = resolveFollowUp(canonicalText, memory, options.now?.() ?? new Date(), parsed);
      if (follow?.kind === "ask") return question(follow.text, []);
      newRequest = text;
      if (follow?.kind === "parsed") { const reply = await handle(follow.parsed); return { ...reply, notice: [reply.notice, follow.notice].filter(Boolean).join(" ") }; }
    }
    newRequest = text;
    return handle(parsed);
  }

  async function runPlan(plan: AssistantPlan): Promise<AssistantReply> {
    const commands = plan.steps.map((step) => step.type === "read_sales" ? "Show today's sales" : step.type === "read_inventory" ? "What is running low?" : step.type === "read_debt" ? "Which customers owe us the most?" : "What should I reorder?");
    const replies = await Promise.all(commands.map((command) => handle(parseCommand(command, { now: options.now?.() }))));
    const details = replies.flatMap((reply, index) => [{ label: commands[index], value: reply.text }]);
    return { kind: "answer", text: `${plan.goal} complete. All figures came from your local saved records.`, details, plan, actions: [say("Show detailed sales", "Show today's sales"), say("Check reorder suggestions", "What should I reorder?")] };
  }

  async function handleBatch(batch: BatchRequest, requireAll = false): Promise<AssistantReply> {
    pending = null; draft = null; parked = null;
    const plan = await advanceBatch(batch.items, context());
    const rows: ReplyDetail[] = [
      ...plan.items.map((item, index) => ({ label: `[${index + 1}] ${BATCH_LABEL[item.intent]}`, value: item.status === "ready" ? item.summary ?? "Ready" : `Not included. ${item.error}` })),
      ...batch.skipped.map((line) => ({ label: "Not understood", value: `\u201c${line}\u201d was not included.` })),
    ];
    if (requireAll && (plan.errorCount > 0 || batch.skipped.length > 0 || plan.readyCount !== batch.items.length)) {
      batchState = null;
      return failure("I could not safely prepare every product in this combined sale. Nothing was recorded. Please correct the items below and try again.", { details: rows });
    }
    if (plan.readyCount === 0) { batchState = null; return failure("I couldn't prepare any of these lines, so nothing will be recorded.", { details: rows }); }
    const token = nanoid(18);
    const lineCount = plan.items.length + batch.skipped.length;
    const problems = plan.errorCount + batch.skipped.length;
    const label = requireAll ? `Confirm one sale with ${plan.readyCount} products` : problems ? `Record the ${plan.readyCount} ready ${plan.readyCount === 1 ? "line" : "lines"}` : `Confirm all ${plan.readyCount}`;
    batchState = { items: plan.items, pendings: plan.pendings, confirmToken: token, companyId: getActiveBusinessProfileId(), compound: requireAll };
    confirmable = true;
    return {
      kind: "preview",
      text: problems ? `Only ${plan.readyCount} of ${lineCount} lines are ready. The others will NOT be recorded.` : "Please check all of these. Nothing is saved until you confirm.",
      preview: {
        token, kind: "batch", title: requireAll ? `One sale with ${plan.readyCount} products — not saved yet` : `${plan.readyCount} transactions — not saved yet`, rows, confirmLabel: label,
        notes: [requireAll ? "All products are saved together as one sale, with one receipt. A failure saves nothing." : problems ? "Lines marked \u201cNot included\u201d will not be recorded. Fix them and send them again if you still need them." : "They are saved in this order, and saving stops at the first problem."],
      },
      actions: [{ type: "confirm", label, token }, { type: "cancel", label: "Cancel" }],
    };
  }

  async function confirmBatch(): Promise<AssistantReply> {
    const state = batchState;
    if (!state) return info("That preview is no longer active, so nothing was recorded.");
    batchState = null; confirmable = false; // single use: pressing confirm twice can't save twice
    if (getActiveBusinessProfileId() !== state.companyId) return failure("You switched business after this preview was prepared, so nothing was recorded. Ask again in the business you want.");
    const outcome = state.compound ? await executeCompoundSale(state.items, state.pendings, context(), state.confirmToken) : await executeBatch(state.items, state.pendings, context());
    if (outcome.savedCount) notifyRecordsChanged();
    const batchId = nanoid(18);
    if (state.compound) {
      // One compound sale creates ONE receipt and must have ONE audit entry.
      // Recording each expanded preview line separately would misrepresent ledger activity.
      const first = state.pendings[0];
      const failed = outcome.failedAt !== undefined;
      if (first) await recordAudit(database, {
        businessProfileId: state.companyId, action: "sale", outcome: failed ? "failed" : "saved",
        summary: failed ? `${outcome.items[outcome.failedAt!].error} Nothing was saved.` : outcome.replies[0]?.text ?? "Combined sale saved",
        request: state.items.map((item) => item.text).join("; "),
        details: state.items.flatMap((_, index) => state.pendings[index]?.view.rows ?? []),
        recordId: failed ? undefined : outcome.replies[0]?.recordId, batchId,
      }, context().now);
    } else {
      for (let index = 0; index < outcome.items.length; index += 1) {
        const item = outcome.items[index];
        const saved = state.pendings[index];
        if (!saved || (item.status !== "success" && outcome.failedAt !== index)) continue;
        const reply = outcome.replies[index];
        await recordAudit(database, { businessProfileId: state.companyId, action: saved.payload.kind as AuditAction, outcome: item.status === "success" ? "saved" : "failed", summary: item.status === "success" ? reply?.text ?? "Saved" : `${item.error} Nothing was saved for this line.`, request: item.text, details: saved.view.rows, recordId: reply?.recordId, batchId, batchPosition: index + 1 }, context().now);
      }
    }
    const rows: ReplyDetail[] = outcome.items.map((item, index) => ({
      label: `[${index + 1}] ${BATCH_LABEL[item.intent]}`,
      value: item.status === "success" ? outcome.replies[index]?.text ?? "Saved" : outcome.failedAt === index ? `Failed. ${item.error}` : item.status === "ready" ? "Not attempted" : `Not included. ${item.error}`,
    }));
    if (outcome.failedAt === undefined) return { kind: "success", text: state.compound ? outcome.replies[0]?.text ?? "Multi-item sale saved." : `${outcome.savedCount} ${outcome.savedCount === 1 ? "transaction" : "transactions"} saved.`, details: state.compound ? outcome.replies[0]?.details ?? rows : rows, link: { label: "Open Reports", href: "/reports" } };
    return failure(state.compound ? `Nothing was saved. ${outcome.items[outcome.failedAt].error}` : `Saved ${outcome.savedCount}, then line ${outcome.failedAt + 1} failed: ${outcome.items[outcome.failedAt].error} The lines after it were not attempted.`, { details: rows });
  }

  async function actNow(action: AssistantAction): Promise<AssistantReply> {
    if (action.type === "say") return sendNow(action.text);
    if (action.type === "navigate") return info(`Open this section using the “${action.label}” link.`);
    if (action.type === "run_plan") return runPlan(action.plan);
    if (action.type === "confirm_reversal") {
      if (!pendingReversalToken || action.token !== pendingReversalToken) return failure("This reversal preview is no longer current. Ask me to reverse the latest sale again.");
      const reviewedSaleId = pendingReversalSaleId;
      const reviewedCompanyId = pendingReversalCompanyId;
      // One confirmation is single-use, including failed or stale confirmations.
      pendingReversalToken = null;
      pendingReversalSaleId = null;
      pendingReversalCompanyId = null;
      if (!reviewedSaleId || !reviewedCompanyId || reviewedCompanyId !== getActiveBusinessProfileId())
        return failure("Your company or reviewed sale changed since this preview. Ask me to review it again before reversing.");
      try {
        const reversal = await executeLatestSaleReversal(options.currency, database, action.token, reviewedSaleId);
        const details = reversal.lines.map((line) => ({ label: line.productName, value: `${line.quantity} restored` }));
        const text = `Reversal recorded for ${reversal.originalReceiptNumber}. The original sale remains in the audit history, stock was restored, and derived totals will include the correction.`;
        await recordAudit(database, { businessProfileId: getActiveBusinessProfileId(), action: "sale_reversal", outcome: "saved", summary: text, request: reversalRequest, details, recordId: reversal.id }, context().now);
        notifyRecordsChanged();
        return { kind: "success", text, details };
      }
      catch (error) {
        const message = error instanceof Error ? error.message : "I couldn't record the reversal safely.";
        await recordAudit(database, { businessProfileId: getActiveBusinessProfileId(), action: "sale_reversal", outcome: "failed", summary: message, request: reversalRequest, details: [] }, context().now);
        return failure(message);
      }
    }
    if (action.type === "confirm" && expenseSession.token() === action.token) { const result = await expenseSession.confirm(action.token); if(result.kind==="success")notifyRecordsChanged(); return result; }
    if (action.type === "cancel" && expenseSession.hasDraft()) return (await expenseSession.handle("cancel")) ?? info("Expense recording cancelled.");
    if (action.type === "confirm" && quotationDraft.token() === action.token) return quotationDraft.confirm(action.token);
    if (action.type === "cancel" && quotationDraft.hasDraft()) { quotationDraft.clear(); return info("Quotation preparation cancelled; nothing was saved."); }
    if (action.type === "confirm") return batchState?.confirmToken === action.token ? confirmBatch() : confirm(action.token);
    if (action.type === "cancel") return cancel();
    return fill(action.slot, action.value, action.id);
  }

  return {
    send: (text) => serial(async () => { resetOnBusinessChange(); const historyCompanyId = getActiveBusinessProfileId(); const reply = await sendNow(text); const recent = memory.customer(); const preparedRequest = prepareText(text); const usesCustomerContext = recent && (reply.intent === "CUSTOMER_BALANCE" || preparedRequest.includes(prepareText(recent.name)) || /\b(?:owe|owes|owing|debt|balance|paid|pay|she|he|they|her|him|them|that customer|same customer|their)\b/.test(preparedRequest)); const withContext = usesCustomerContext ? { ...reply, context: `Using recent context: ${recent.name}` } : reply; // Do not put a reply from one company into another company's history if the
      // owner switched companies while this asynchronous answer was prepared.
      if (getActiveBusinessProfileId() === historyCompanyId) {
        void recordAssistantHistory({ businessProfileId: historyCompanyId, input: text, replyText: reply.text, intent: reply.intent, replayText: text })
          .catch(() => console.warn("Tallybook Assistant: local conversation history could not be saved."));
      }
      return withContext; }),
    act: (action) => serial(async () => resetOnBusinessChange() ? failure("You switched business. The earlier assistant action was cleared; nothing was recorded. Please start again in this business.") : actNow(action)),
    clearContext: () => { expenseSession.clear(); quotationDraft.clear(); memory.forget(); appContext = null; draft = null; parked = null; },
    pendingToken: () => { resetOnBusinessChange(); return expenseSession.token() ?? quotationDraft.token() ?? pending?.token ?? batchState?.confirmToken ?? null; },
  };
}
