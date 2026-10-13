/**
 * The Assistant's activity log — end to end. It must record exactly what was saved (and what failed), never record what wasn't,
 * never get in the way of a save, stay out of backups, and be removed with its company.
 */
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { clearCompanyData, setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { createBackup, parseBackup, restoreBackup, stringifyBackup } from "@/features/backup/backup";
import { completeSale } from "@/features/sales/sales";
import { createAssistant, type Assistant } from "./assistant";
import { MAX_AUDIT_ENTRIES_PER_COMPANY, listAudit, recordAudit } from "./audit";
import { chip, confirmAction, useAssistantDb } from "./testKit";

const kit = useAssistantDb();
const NOW = new Date(2026, 9, 15, 14, 30, 0);
const at = (now: Date): Assistant => createAssistant({ currency: "GHS", database: kit.database, now: () => now });
const log = () => listAudit(kit.database, "primary");

describe("what gets logged", () => {
  it("a confirmed sale: the owner's words, what the preview showed, the result, and the sale's id", async () => {
    const ai = at(NOW);
    const preview = await ai.send("Sell 2 eggs to Kwame, paid cash");
    expect(await log()).toHaveLength(0); // a preview logs nothing
    await ai.act(confirmAction(preview));

    const [entry] = await log();
    expect(entry).toMatchObject({ businessProfileId: "primary", action: "sale", outcome: "saved", request: "Sell 2 eggs to Kwame, paid cash", createdAt: NOW.toISOString() });
    expect(entry.summary).toMatch(/^Sale recorded: 2 .* Eggs/);
    expect(entry.details.find((row) => row.label === "Customer")?.value).toContain("Kwame Boateng");
    const sale = (await kit.database.sales.toArray()).find((item) => item.id === entry.recordId);
    expect(sale).toBeDefined();
    expect(sale!.totalMinor).toBe(12000);
  });

  it("every kind of save is logged with the id of what it created or changed", async () => {
    const ai = at(NOW);
    await ai.act(confirmAction(await ai.send("Add customer Ama Mensah 0241234567")));
    await ai.act(confirmAction(await ai.send("Add supplier Mama Esi Foods")));
    await ai.act(confirmAction(await ai.send("Add category Drinks")));
    await ai.act(confirmAction(await ai.send("Add product Cola price 5, 10 in stock")));
    await ai.act(confirmAction(await ai.send("I received 5 eggs from Kofi Traders at 40 each")));
    await ai.act(confirmAction(await ai.send("Adwoa paid 100 cash")));
    await ai.act(confirmAction(await ai.send("I counted 20 eggs")));
    const entries = (await log()).reverse(); // oldest first
    expect(entries.map((entry) => entry.action)).toEqual(["create_customer", "create_supplier", "create_category", "create_product", "stock_receipt", "customer_payment", "stock_count"]);
    expect(entries.every((entry) => entry.outcome === "saved" && entry.recordId && entry.request)).toBe(true);
    expect((await kit.database.customers.get(entries[0].recordId!))?.name).toBe("Ama Mensah");
    expect((await kit.database.repayments.get(entries[5].recordId!))?.amountMinor).toBe(10000);
    expect(entries[6].recordId).toBe(kit.products.eggs.id);
  });

  it("questions, previews, cancellations and refusals are not logged", async () => {
    const ai = at(NOW);
    await ai.send("How much does Adwoa owe?");
    await ai.send("Best-sellers this month");
    await ai.send("cancel");
    await ai.send("Sell 2 eggs to Kwame, paid cash");
    await ai.send("cancel");
    await ai.send("Sell 99 eggs to Kwame, paid cash"); // short of stock: a question, not a save
    expect(await log()).toHaveLength(0);
  });

  it("a save that fails is logged as failed, with the reason, and nothing is claimed saved", async () => {
    const ai = at(NOW);
    const preview = await ai.send("I counted 25 eggs");
    await completeSale({ lines: [{ productId: kit.products.eggs.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "60", currency: "GHS" }, kit.database);
    await ai.act(confirmAction(preview));
    const [entry] = await log();
    expect(entry).toMatchObject({ action: "stock_count", outcome: "failed", request: "I counted 25 eggs" });
    expect(entry.summary).toContain("changed from 37 to 36");
    expect(entry.recordId).toBeUndefined();
  });

  it("a multi-line message logs each attempted line in order, under one batch id, and not the lines never attempted", async () => {
    const ai = at(NOW);
    const preview = await ai.send("Sell 1 rice to walk-in customer, paid cash\nSell 37 eggs to walk-in customer, paid cash\nSell 1 laundry soap to walk-in customer, paid cash");
    await completeSale({ lines: [{ productId: kit.products.eggs.id, quantity: 5 }], discount: "0", paymentMethod: "cash", amountPaid: "300", currency: "GHS" }, kit.database);
    await ai.act(confirmAction(preview));
    const entries = (await log()).sort((a, b) => (a.batchPosition ?? 0) - (b.batchPosition ?? 0));
    expect(entries.map((entry) => [entry.batchPosition, entry.outcome])).toEqual([[1, "saved"], [2, "failed"]]);
    expect(new Set(entries.map((entry) => entry.batchId)).size).toBe(1);
    expect(entries[0].request).toBe("Sell 1 rice to walk-in customer, paid cash");
  });

  it("a request that is completed over several messages is logged with the first message", async () => {
    const ai = at(NOW);
    await ai.send("Add customer Ama Mensah");
    await ai.act(confirmAction(await ai.send("0241234567")));
    expect((await log())[0].request).toBe("Add customer Ama Mensah");
  });
});

describe("the log never gets in the way", () => {
  it("if the log can't be written, the sale is still saved and the owner still sees success", async () => {
    const ai = at(NOW);
    const preview = await ai.send("Sell 2 eggs to Kwame, paid cash");
    const original = kit.database.assistantAudit.add.bind(kit.database.assistantAudit);
    (kit.database.assistantAudit as { add: unknown }).add = () => Promise.reject(new Error("disk full"));
    const done = await ai.act(confirmAction(preview));
    (kit.database.assistantAudit as { add: unknown }).add = original;
    expect(done.kind).toBe("success");
    expect(await kit.database.sales.count()).toBe(2);
    expect(await log()).toHaveLength(0);
  });

  it("keeps only the newest entries per company", async () => {
    for (let index = 0; index < MAX_AUDIT_ENTRIES_PER_COMPANY + 3; index += 1) {
      await recordAudit(kit.database, { businessProfileId: "primary", action: "sale", outcome: "saved", summary: `entry ${index}`, details: [] }, new Date(2026, 0, 1, 0, 0, index));
    }
    const entries = await log();
    expect(entries).toHaveLength(MAX_AUDIT_ENTRIES_PER_COMPANY);
    expect(entries.some((entry) => entry.summary === "entry 0")).toBe(false);
    expect(entries[0].summary).toBe(`entry ${MAX_AUDIT_ENTRIES_PER_COMPANY + 2}`);
  }, 30_000);
});

describe("privacy and scope", () => {
  it("each company only sees its own entries, and clearing a company removes only its entries", async () => {
    await recordAudit(kit.database, { businessProfileId: "primary", action: "sale", outcome: "saved", summary: "mine", details: [] }, NOW);
    await recordAudit(kit.database, { businessProfileId: "company-two", action: "sale", outcome: "saved", summary: "theirs", details: [] }, NOW);
    expect((await log()).map((entry) => entry.summary)).toEqual(["mine"]);
    await expect(clearCompanyData("company-two", kit.database)).rejects.toThrow("Switch to the company");
    expect(await kit.database.assistantAudit.count()).toBe(2);
    setActiveBusinessProfileId("company-two");
    await clearCompanyData("company-two", kit.database);
    expect(await kit.database.assistantAudit.count()).toBe(1);
    setActiveBusinessProfileId("primary");
    await clearCompanyData("primary", kit.database);
    expect(await kit.database.assistantAudit.count()).toBe(0);
  });

  it("is not part of a backup, and restoring a backup clears stale audit history", async () => {
    const ai = at(NOW);
    await ai.act(confirmAction(await ai.send("Sell 2 eggs to Kwame, paid cash")));
    const [entry] = await log();
    const backup = await createBackup(kit.database);
    expect(JSON.stringify(backup)).not.toContain("assistantAudit");
    expect(JSON.stringify(backup)).not.toContain(entry.id);
    expect(Object.keys(backup.records)).not.toContain("assistantAudit");
    await restoreBackup(parseBackup(stringifyBackup(backup)), kit.database);
    expect(await log()).toHaveLength(0);
  });
});

describe("asking the assistant what it did", () => {
  it("lists today's entries, newest first, with the words that were used", async () => {
    const earlier = at(new Date(2026, 9, 15, 9, 0));
    await earlier.act(confirmAction(await earlier.send("Add customer Ama Mensah 0241234567")));
    const later = at(new Date(2026, 9, 15, 11, 0));
    await later.act(confirmAction(await later.send("Sell 2 eggs to Kwame, paid cash")));
    const reply = await at(NOW).send("What did the assistant record today?");
    expect(reply.intent).toBe("ACTIVITY_QUERY");
    expect(reply.text).toContain("saved 2 things");
    expect(reply.rows![0].primary).toMatch(/^Sale: Sale recorded/);
    expect(reply.rows![0].secondary).toContain("Sell 2 eggs to Kwame, paid cash");
    expect(reply.rows![1].primary).toMatch(/^Customer added: Customer added: Ama Mensah/);
  });

  it("understands other periods and says plainly when there is nothing", async () => {
    const ai = at(NOW);
    await ai.act(confirmAction(await ai.send("Sell 2 eggs to Kwame, paid cash")));
    expect((await at(new Date(2026, 9, 16, 9, 0)).send("what did you record yesterday?")).rows).toHaveLength(1);
    expect((await at(NOW).send("show assistant activity last month")).text).toContain("hasn't saved anything");
    expect((await at(NOW).send("show assistant activity this month")).rows).toHaveLength(1);
  });

  it("counts failures separately", async () => {
    const ai = at(NOW);
    const preview = await ai.send("I counted 25 eggs");
    await completeSale({ lines: [{ productId: kit.products.eggs.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "60", currency: "GHS" }, kit.database);
    await ai.act(chip(preview, "Correct stock"));
    const reply = await at(NOW).send("what have you done today");
    expect(reply.text).toContain("failed to save 1");
    expect(reply.rows![0].primary).toMatch(/^Failed/);
  });

  it("does not confuse “what can you do?” (help) with a request for the log", async () => {
    expect((await at(NOW).send("what can you do")).intent).not.toBe("ACTIVITY_QUERY");
    expect((await at(NOW).send("what do you do")).intent).not.toBe("ACTIVITY_QUERY");
  });
});

const V11_STORES = {
  appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt", categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt",
  products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt", inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity, purchaseId",
  customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt", sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey",
  saleLines: "id, saleId, productId, businessProfileId", payments: "id, saleId, customerId, createdAt, method, businessProfileId", receipts: "id, saleId, receiptNumber, issuedAt, businessProfileId",
  customerActivities: "id, customerId, saleId, createdAt, activityType, businessProfileId", repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey",
  mobileMoneyProviders: "id, businessProfileId, normalizedName, updatedAt", suppliers: "id, businessProfileId, normalizedName, archivedAt, updatedAt", purchases: "id, businessProfileId, supplierId, purchaseDate, createdAt, &submissionKey",
  purchaseLines: "id, purchaseId, productId, businessProfileId", expenses: "id, businessProfileId, expenseDate, category, createdAt, &submissionKey",
};
const V12_REVERSALS = "id, businessProfileId, originalSaleId, customerId, createdAt, &submissionKey";
const stamp = "2026-01-01T00:00:00.000Z";

describe("upgrading an existing installation to database version 13 (the Assistant activity log)", () => {
  async function upgradeFrom(version: 11 | 12, seed: (old: Dexie) => Promise<void>) {
    const name = `tallybook-upgrade-${version}-${Date.now()}`;
    const old = new Dexie(name);
    old.version(11).stores(V11_STORES);
    if (version === 12) old.version(12).stores({ saleReversals: V12_REVERSALS });
    await old.open();
    await old.table("appMeta").put({ key: "schemaVersion", value: String(version), updatedAt: stamp });
    await old.table("customers").put({ id: "c1", businessProfileId: "primary", name: "Old Customer", normalizedName: "old customer", phone: "0240000000", status: "active", createdAt: stamp, updatedAt: stamp });
    await old.table("products").put({ id: "p1", businessProfileId: "primary", name: "Old Product", normalizedName: "old product", sellingPriceMinor: 500, stockQuantity: 7, lowStockThreshold: 2, createdAt: stamp, updatedAt: stamp });
    await seed(old);
    old.close();
    return { name, upgraded: new TallybookDB(name) };
  }
  const cleanup = async (name: string, upgraded: TallybookDB) => { upgraded.close(); await new Dexie(name).delete(); setActiveBusinessProfileId("primary"); };

  it("from version 11: every record kept, your reversal table created, the log table created, and the marker updated", async () => {
    const { name, upgraded } = await upgradeFrom(11, async () => {});
    try {
      const readiness = await initializeDatabase(upgraded);
      expect(readiness.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
      expect((await upgraded.appMeta.get("schemaVersion"))?.value).toBe(String(DATABASE_SCHEMA_VERSION));
      expect((await upgraded.customers.get("c1"))?.name).toBe("Old Customer");
      expect((await upgraded.products.get("p1"))?.stockQuantity).toBe(7);
      expect(await upgraded.saleReversals.count()).toBe(0);
      expect(await upgraded.assistantAudit.count()).toBe(0);
      expect(await recordAudit(upgraded, { businessProfileId: "primary", action: "sale", outcome: "saved", summary: "works", details: [] }, NOW)).toBe(true);
      expect(await upgraded.assistantAudit.count()).toBe(1);
    } finally { await cleanup(name, upgraded); }
  });

  it("from version 12: existing sale reversals are untouched by the new table", async () => {
    const { name, upgraded } = await upgradeFrom(12, async (old) => {
      await old.table("saleReversals").put({ id: "r1", businessProfileId: "primary", originalSaleId: "s1", customerId: undefined, createdAt: stamp, submissionKey: "reversal-test-1", originalReceiptNumber: "T-1", totalMinor: 500, lines: [] });
    });
    try {
      await initializeDatabase(upgraded);
      expect((await upgraded.saleReversals.get("r1"))?.originalReceiptNumber).toBe("T-1");
      expect((await upgraded.customers.get("c1"))?.name).toBe("Old Customer");
      expect(await upgraded.assistantAudit.count()).toBe(0);
    } finally { await cleanup(name, upgraded); }
  });
});

describe("assistant audit atomic log retention", () => {
  it("rolls back a newly appended activity when retention pruning fails", async () => {
    const database=kit.database;
    const existing=Array.from({length:MAX_AUDIT_ENTRIES_PER_COMPANY},(_,i)=>({
      id:`atomic-audit-${i}`,businessProfileId:"primary",createdAt:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString(),
      action:"sale" as const,outcome:"saved" as const,summary:"existing",request:"sell",details:[],
    }));
    await database.assistantAudit.bulkPut(existing);
    const original=database.assistantAudit.bulkDelete.bind(database.assistantAudit);
    (database.assistantAudit as {bulkDelete:unknown}).bulkDelete=()=>Promise.reject(new Error("simulated prune failure"));
    try {
      expect(await recordAudit(database,{businessProfileId:"primary",action:"sale",outcome:"saved",summary:"must rollback",details:[]},new Date(Date.UTC(2026,1,1)))).toBe(false);
    } finally {
      (database.assistantAudit as {bulkDelete:unknown}).bulkDelete=original;
    }
    expect(await database.assistantAudit.where("businessProfileId").equals("primary").count()).toBe(MAX_AUDIT_ENTRIES_PER_COMPANY);
    expect((await listAudit(database,"primary")).some(entry=>entry.summary==="must rollback")).toBe(false);
  });
});
