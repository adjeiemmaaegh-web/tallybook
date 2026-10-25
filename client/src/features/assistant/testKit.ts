/** Shared setup for Assistant end-to-end tests: a real TallybookDB on fake-indexeddb, seeded like assistant.test.ts, no mocks. */
import Dexie from "dexie";
import { afterEach, beforeEach } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createCustomer } from "@/features/customers/customers";
import { completeSale } from "@/features/sales/sales";
import { createProduct } from "@/features/inventory/inventory";
import { createSupplier } from "@/features/purchases/purchases";
import { createAssistant, type Assistant } from "./assistant";
import { createStaff, unlockStaff, openShift, lockStaff } from "@/features/staff/staff";
import { updateCompanyReturnPolicy } from "@/features/business/returnPolicySettings";
import type { AssistantAction, AssistantReply } from "./index";

export interface Kit {
  database: TallybookDB;
  assistant: Assistant;
  products: Record<"eggs" | "rice" | "soap", { id: string }>;
  customers: Record<"adwoa" | "kwame", { id: string }>;
  /** Replaces the assistant with one that believes it is `now`. */
  assistantAt(now: Date): Assistant;
}

let sequence = 0;

export function useAssistantDb(): Kit {
  const names = new Set<string>();
  const opened: Dexie[] = [];
  const kit = {} as Kit;

  beforeEach(async () => {
    setActiveBusinessProfileId("primary");
    const database = new TallybookDB(`tallybook-kit-${Date.now()}-${++sequence}`);
    names.add(database.name); opened.push(database);
    await initializeDatabase(database);
    await saveBusinessProfile({ name: "Test Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, database);
    const owner = await createStaff("Assistant test owner", "owner", "123456", database);
    await unlockStaff(owner.id, "123456", database);
    await openShift(0, database);
    await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, "Enable assistant test returns", database);
    const product = (name: string, price: string, stock: string, cost = "") => createProduct({ name, sku: "", categoryId: "uncategorized", sellingPrice: price, costPrice: cost, initialStock: stock, lowStockThreshold: "5" }, "GHS", database);
    const eggs = await product("Eggs", "60.00", "37", "45.00");
    const rice = await product("Rice", "150.00", "20");
    const soap = await product("Laundry soap", "12.50", "1");
    const adwoa = await createCustomer({ name: "Adwoa Mensah", phone: "0244000001", email: "", address: "", notes: "", status: "active" }, database);
    const kwame = await createCustomer({ name: "Kwame Boateng", phone: "0244000002", email: "", address: "", notes: "", status: "active" }, database);
    await createSupplier({ name: "Kofi Traders", phone: "", email: "", address: "", notes: "" }, database);
    await createSupplier({ name: "ABC Suppliers", phone: "", email: "", address: "", notes: "" }, database);
    await completeSale({ lines: [{ productId: rice.id, quantity: 3 }], customerId: adwoa.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
    Object.assign(kit, { database, products: { eggs, rice, soap }, customers: { adwoa, kwame }, assistant: createAssistant({ currency: "GHS", database }), assistantAt: (now: Date) => createAssistant({ currency: "GHS", database, now: () => now }) });
  });

  afterEach(async () => {
    lockStaff("primary");
    setActiveBusinessProfileId("primary");
    opened.splice(0).forEach((item) => item.close());
    await Promise.all(Array.from(names).map((name) => new Dexie(name).delete()));
    names.clear();
  });
  return kit;
}

export const chip = (reply: AssistantReply, label: RegExp | string): AssistantAction => {
  const found = reply.actions?.find((action) => (typeof label === "string" ? action.label === label : label.test(action.label)));
  if (!found) throw new Error(`No action “${String(label)}” in: ${JSON.stringify(reply.actions?.map((action) => action.label))}. Reply was: ${reply.text}`);
  return found;
};

export const confirmAction = (reply: AssistantReply): AssistantAction => {
  const found = reply.actions?.find((action) => action.type === "confirm");
  if (!found) throw new Error(`No confirm button. Reply was: ${reply.kind} — ${reply.text}`);
  return found;
};

export const row = (reply: AssistantReply, label: string) => reply.preview?.rows.find((item) => item.label === label)?.value;

/** Row counts of the tables a sale/purchase/payment would touch — used to prove nothing was written. */
export async function ledgerCounts(database: TallybookDB) {
  return { sales: await database.sales.count(), saleLines: await database.saleLines.count(), payments: await database.payments.count(), purchases: await database.purchases.count(), repayments: await database.repayments.count() };
}
