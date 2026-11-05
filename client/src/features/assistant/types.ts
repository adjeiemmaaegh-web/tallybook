/** Tallybook Assistant types. The parser produces a `ParsedCommand`; the router validates it against real records and hands it to existing services. */
import type { PaymentMethod } from "@/features/sales/sales";

export const assistantIntents = [
  "CUSTOMER_BALANCE", "INVENTORY_QUERY", "TODAY_SALES", "SALES_QUERY",
  "RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT",
  "SUPPLIER_PURCHASES", "SUPPLIER_BALANCE", "UNSUPPORTED_ACTION", "HELP",
  // Aggregate queries:
  "TOP_DEBTORS", "LOW_STOCK", "BEST_SELLING", "CUSTOMERS_WHO_BOUGHT",
  "INSIGHTS_QUERY",
  // Create new records:
  "CREATE_CUSTOMER", "CREATE_PRODUCT", "CREATE_CATEGORY", "CREATE_SUPPLIER",
  // Inventory management:
  "ADJUST_INVENTORY",
  // Read-only: what the Assistant itself saved, from the activity log:
  "ACTIVITY_QUERY",
  // Application knowledge: navigation, discovery, help, and explanations.
  "NAVIGATE", "FEATURE_DISCOVERY", "APP_HELP", "APP_EXPLANATION",
] as const;
export type AssistantIntent = (typeof assistantIntents)[number] | "UNKNOWN";
export type AppIntent = "NAVIGATE" | "FEATURE_DISCOVERY" | "APP_HELP" | "APP_EXPLANATION";

/** Confidence bands: at or above HIGH the assistant acts; between MEDIUM and HIGH it asks; below MEDIUM it says it does not support the request. */
export const CONFIDENCE_HIGH = 0.75;
export const CONFIDENCE_MEDIUM = 0.45;

/** Calendar ranges the existing reports have no button for. They are answered by filtering the same saved sales by date. */
export type RangeId = "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "lastDays" | "thisWeek" | "lastWeek" | "thisQuarter" | "lastQuarter";

export type SalesPeriodRequest =
  | { kind: "today" }
  | { kind: "range"; id: RangeId; days?: number }
  | { kind: "day"; year: number; month: number; day: number; source: "yesterday" | "weekday" | "date" }
  | { kind: "last7"; approximatesWeek?: boolean }
  | { kind: "all" }
  | { kind: "unsupported"; text: string }
  | { kind: "unspecified" };

export interface BatchItem {
  /** Index in the batch (0-based). */
  index: number;
  /** The intent for this item (only transaction types: RECORD_SALE, RECEIVE_STOCK, RECORD_CUSTOMER_PAYMENT). */
  intent: "RECORD_SALE" | "RECEIVE_STOCK" | "RECORD_CUSTOMER_PAYMENT";
  /** Parsed entities for this item. */
  entities: ParsedEntities;
  /** The words the owner wrote for this item. */
  text: string;
  /** A one-line description of what will be recorded, shown in the batch preview. */
  summary?: string;
  /** Status: pending, preview ready, executing, success, or failed. */
  status: "pending" | "ready" | "executing" | "success" | "error";
  /** If error, the friendly message. */
  error?: string;
}

export type BatchRequest = {
  kind: "batch";
  items: BatchItem[];
  /** Lines in the message that were not understood as transactions. They are shown to the owner, never silently dropped. */
  skipped: string[];
};

export type UnsupportedTopic = "change_record" | "expense";

/** Raw words the owner used. Nothing here has been checked against TallyBook data yet. */
export interface ParsedEntities {
  customerText?: string;
  walkIn?: boolean;
  productText?: string;
  unit?: string;
  /** Digits found next to the item, exactly as typed, when they are not a valid whole quantity. */
  quantity?: number;
  invalidQuantityText?: string;
  supplierText?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: "paid" | "unpaid";
  paymentConflict?: boolean;
  providerHint?: string;
  mobileMoneyReference?: string;
  /** A money amount as a plain decimal string, e.g. "1200.50". */
  amount?: string;
  currency?: string;
  currencyAmbiguous?: boolean;
  unitCost?: string;
  totalCost?: string;
  /** The owner mentioned a price the assistant will not use. */
  priceMentioned?: string;
  discountMentioned?: boolean;
  /** The words describe a sale, delivery or payment that hasn't happened yet ("will pay next week"). Nothing is offered for recording. */
  plannedAction?: boolean;
  dateText?: string;
  ambiguousReceipt?: boolean;
  /** Creating records: a category name (for a new category, or the category a new product belongs to). */
  categoryText?: string;
  phone?: string;
  /** Selling price of a product being created, as a plain decimal string. */
  price?: string;
  costPrice?: string;
  openingStock?: number;
  lowStockLevel?: number;
  /** Stock count: what the owner physically counted, and (if they said it) what they think TallyBook shows. */
  counted?: number;
  statedRecorded?: number;
}

export interface ParsedCommand {
  intent: AssistantIntent;
  confidence: number;
  entities: ParsedEntities;
  period?: SalesPeriodRequest;
  /** Words left over in a sales question that the assistant cannot apply (for example a product or customer filter). */
  qualifier?: string;
  unsupportedTopic?: UnsupportedTopic;
  alternatives: Array<{ intent: AssistantIntent; confidence: number }>;
  /** A short text (at most four words) that names nothing but might be a record, used to offer helpful choices. */
  bareMention?: string;
  raw: string;
}

/* ───────────── replies shown to the owner ───────────── */

export type ReplyKind = "answer" | "question" | "preview" | "success" | "error" | "unsupported" | "info";

export interface ReplyDetail { label: string; value: string }
export interface ReplyRow { primary: string; secondary?: string; amount?: string }
export interface AssistantPlan {
  goal: string;
  steps: Array<{ type: string; label: string }>;
  requiresConfirmation: boolean;
}

export type AssistantAction =
  /** Behaves exactly as if the owner had typed the text. */
  | { type: "say"; label: string; text: string }
  | { type: "run_plan"; label: string; plan: AssistantPlan }
  | { type: "confirm_reversal"; label: string; token: string }
  /** Opens a route verified by the application knowledge registry; it never writes business data. */
  | { type: "navigate"; label: string; href: string }
  /** Answers the question the assistant just asked. `id` is set when the answer is an existing record. */
  | { type: "fill"; label: string; slot: string; value: string; id?: string }
  | { type: "confirm"; label: string; token: string }
  | { type: "cancel"; label: string };

export interface TransactionPreviewView {
  token: string;
  kind: "sale" | "stock_receipt" | "customer_payment" | "batch" | "create_record" | "stock_count";
  title: string;
  rows: ReplyDetail[];
  notes: string[];
  confirmLabel: string;
}

export interface AssistantReply {
  kind: ReplyKind;
  text: string;
  details?: ReplyDetail[];
  rows?: ReplyRow[];
  moreText?: string;
  actions?: AssistantAction[];
  link?: { label: string; href: string };
  preview?: TransactionPreviewView;
  /** Set when this reply replaced an earlier unconfirmed preview. */
  notice?: string;
  /** Set on the success reply after a record was created, so a request that was waiting for it can carry on. */
  created?: { kind: "customer" | "supplier" | "product" | "category"; id: string; name: string };
  intent?: AssistantIntent;
  confidence?: number;
  plan?: AssistantPlan;
  context?: string;
  /** The id of the record a successful save created or changed (sale, purchase, repayment, product…), for the activity log. */
  recordId?: string;
}

/* ───────────── the resolved intermediate representation (spec §17) ───────────── */

export interface ResolvedRef { text: string; id?: string; name?: string }

export interface ResolvedCommand {
  intent: AssistantIntent;
  confidence: number;
  entities: {
    product?: ResolvedRef;
    customer?: ResolvedRef & { walkIn?: boolean };
    supplier?: ResolvedRef;
    quantity?: number;
    unit?: string;
    paymentMethod?: string;
    paymentStatus?: "paid" | "unpaid";
    amount?: string;
    unitCost?: string;
  };
}

/* ───────────── session memory for context-aware responses ───────────── */

export interface SessionTurn {
  /** What the owner said. */
  text: string;
  /** The intent the assistant recognized. */
  intent: AssistantIntent;
  /** If this turn resolved to a customer (used by "he paid" / "they bought", etc). */
  resolvedCustomerId?: string;
  resolvedCustomerName?: string;
  /** If this turn resolved to a product. */
  resolvedProductId?: string;
  resolvedProductName?: string;
  /** Timestamp so we can expire old context (>15 min). */
  timestamp: number;
}
