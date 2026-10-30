/** Tactile Ledger testing reminder: sales either write every dependent record and stock movement together, or leave the ledger unchanged. */
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setCustomerPolicy } from "@/features/customers/customerBenefits";
import { createCustomer } from "@/features/customers/customers";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import { createProduct, getInventorySnapshot } from "@/features/inventory/inventory";
import { addMobileMoneyProvider } from "@/features/payments/mobileMoney";
import { completeSale, getCustomerSaleSummary, getSaleSnapshot } from "@/features/sales/sales";
import { recoverSavedCheckout } from "@/features/sales/recoverSavedCheckout";
import { createStaff, unlockStaff, openShift, lockStaff, currentStaffId } from "@/features/staff/staff";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import {validateCentralSaleEvent} from '@/features/sync/centralSaleEvent';

const databaseNames = new Set<string>();
const openDatabases: Dexie[] = [];
let sequence = 0;

function makeDatabase() {
  const database = new TallybookDB(`tallybook-sale-test-${Date.now()}-${++sequence}`);
  databaseNames.add(database.name);
  openDatabases.push(database);
  return database;
}

async function createProductFixture(database: TallybookDB, name: string, stockQuantity: string, price = "10.00") {
  const company = getActiveBusinessProfileId();
  if (!await database.businessProfiles.get(company))
    await saveBusinessProfile({ name: "Sales test business", country: "Ghana", currency: "GHS", businessType: "Retail shop" }, database);
  let owner = await database.staffMembers.where("businessProfileId").equals(company).first();
  if (!owner) owner = await createStaff("Sales test owner", "owner", "123456", database);
  if (currentStaffId(company) !== owner.id) await unlockStaff(owner.id, "123456", database);
  const shifts = await database.staffShifts.where("businessProfileId").equals(company).toArray();
  if (!shifts.some(shift => shift.staffId === owner!.id && !shift.closedAt)) await openShift(0, database);
  return createProduct({ name, sku: "", categoryId: "uncategorized", sellingPrice: price, costPrice: "", initialStock: stockQuantity, lowStockThreshold: "1" }, "GHS", database);
}

async function createMobileMoneyProviderFixture(database: TallybookDB, name = "MTN MoMo") {
  await saveBusinessProfile({ name: "Mobile Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, database);
  return addMobileMoneyProvider({ name }, database);
}

afterEach(async () => {
  lockStaff("primary");
  lockStaff("second-company");
  setActiveBusinessProfileId("primary");
  openDatabases.splice(0).forEach((database) => database.close());
  await Promise.all([...databaseNames].map((name) => new Dexie(name).delete()));
  databaseNames.clear();
});

describe("atomic sales", () => {
  it("retains original credit terms after the customer policy changes", async () => {
    const database=makeDatabase();await initializeDatabase(database);
    const product=await createProductFixture(database,"Credit rice","4");
    const customer=await createCustomer({name:"Credit customer",phone:"0240000002",email:"",address:"",notes:"",status:"active"},database);
    await setCustomerPolicy(customer.id,{paymentDueDays:30},database);
    const result=await completeSale({lines:[{productId:product.id,quantity:1}],customerId:customer.id,
      discount:"0",paymentMethod:"credit",amountPaid:"0",currency:"GHS"},database);
    const due=new Date(result.sale.createdAt);due.setUTCDate(due.getUTCDate()+30);
    expect(result.sale.creditTermsAtSale).toEqual({version:1,paymentDueDays:30,dueDateUtc:due.toISOString().slice(0,10)});
    await setCustomerPolicy(customer.id,{paymentDueDays:0},database);
    expect((await database.sales.get(result.sale.id))?.creditTermsAtSale).toEqual(result.sale.creditTermsAtSale);
    const event=await database.centralSaleEvents.get(`sale:${result.sale.id}`);
    expect(event?.payload.sale.creditTermsAtSale).toEqual(result.sale.creditTermsAtSale);
    expect(()=>validateCentralSaleEvent({...event!,payload:{...event!.payload,sale:{...event!.payload.sale,
      creditTermsAtSale:{...result.sale.creditTermsAtSale!,dueDateUtc:"2000-01-01"}}}})).toThrow();
  });
  it("commits distinct exact-sales for the same retry key in independent companies",async()=>{
    setActiveBusinessProfileId("primary");
    const database=makeDatabase();await initializeDatabase(database);
    await saveBusinessProfile({name:"Primary Retail",country:"Ghana",currency:"GHS",businessType:"Retail shop"},database);
    const primaryProduct=await createProductFixture(database,"Primary rice","4","10.00");
    const submissionKey="cross-company-sale-001";
    const first=await completeSale({lines:[{productId:primaryProduct.id,quantity:1}],
      discount:"0",paymentMethod:"cash",amountPaid:"10",currency:"GHS",submissionKey},database);
    setActiveBusinessProfileId("second-company");
    await saveBusinessProfile({name:"Second Retail",country:"Ghana",currency:"GHS",businessType:"Retail shop"},database);
    const secondProduct=await createProductFixture(database,"Second rice","4","10.00");
    const second=await completeSale({lines:[{productId:secondProduct.id,quantity:1}],
      discount:"0",paymentMethod:"cash",amountPaid:"10",currency:"GHS",submissionKey},database);
    expect(second.sale.id).not.toBe(first.sale.id);
    expect(await database.sales.count()).toBe(2);
    expect((await completeSale({lines:[{productId:secondProduct.id,quantity:1}],
      discount:"0",paymentMethod:"cash",amountPaid:"10",currency:"GHS",submissionKey},database)).sale.id)
      .toBe(second.sale.id);
    expect((await database.products.get(primaryProduct.id))?.stockQuantity).toBe(3);
    expect((await database.products.get(secondProduct.id))?.stockQuantity).toBe(3);
    expect(await database.payments.count()).toBe(2);
    expect(await database.centralSaleEvents.count()).toBe(2);
    setActiveBusinessProfileId("primary");
    const owner = await database.staffMembers.where("businessProfileId").equals("primary").first();
    await unlockStaff(owner!.id, "123456", database);
    expect((await getSaleSnapshot(database)).sales).toHaveLength(1);
  });

  it("enforces customer discount limits without changing stock or financial records", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Discounted rice", "8", "10.00");
    const customer = await createCustomer({ name: "Kojo", phone: "0240000001", email: "", address: "", notes: "", status: "active" }, database);
    await setCustomerPolicy(customer.id, { maxDiscountPercent: 10 }, database);
    const input = { lines: [{ productId: product.id, quantity: 2 }], customerId: customer.id, paymentMethod: "cash" as const, amountPaid: "17.00", currency: "GHS", discount: "3.00" };
    await expect(completeSale(input, database)).rejects.toThrow("approved maximum discount");
    expect(await database.sales.count()).toBe(0);
    expect(await database.inventoryMovements.where("movementType").equals("sale").count()).toBe(0);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(8);
    const saved = await completeSale({ ...input, discount: "2.00", amountPaid: "18.00" }, database);
    expect(saved.sale.discountMinor).toBe(200);
    expect(saved.sale.totalMinor).toBe(1800);
  });

  it("completes a cash sale by writing sale, line, payment, receipt, and stock movement together", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Laundry soap", "5", "12.50");

    const result = await completeSale({ lines: [{ productId: product.id, quantity: 2 }], discount: "0", paymentMethod: "cash", amountPaid: "25.00", currency: "GHS" }, database);
    const snapshot = await getSaleSnapshot(database);
    const inventory = await getInventorySnapshot(database);

    expect(result.sale).toMatchObject({ totalMinor: 2500, amountPaidMinor: 2500, outstandingMinor: 0, paymentMethod: "cash" });
    expect(snapshot.sales).toHaveLength(1);
    expect(snapshot.lines).toMatchObject([{ saleId: result.sale.id, productId: product.id, quantity: 2, lineTotalMinor: 2500 }]);
    expect(snapshot.payments).toMatchObject([{ saleId: result.sale.id, amountMinor: 2500, method: "cash" }]);
    expect(snapshot.receipts).toMatchObject([{ saleId: result.sale.id, receiptNumber: result.sale.receiptNumber }]);
    expect(inventory.products).toMatchObject([{ id: product.id, stockQuantity: 3 }]);
    expect(inventory.movements[0]).toMatchObject({ productId: product.id, movementType: "sale", quantityDelta: -2, resultingQuantity: 3 });
    const event = await database.centralSaleEvents.get(`sale:${result.sale.id}`);
    expect(event).toMatchObject({ businessProfileId: result.sale.businessProfileId,
      operationId: `sale:${result.sale.id}`, entityId: result.sale.id,
      deliveryStatus: 'local_only', shopId: null, deviceId: null });
    expect(event?.payload).toEqual({ sale: result.sale, lines: result.lines,
      payment: result.payment, receipt: result.receipt,postingEvidence:{version:1,storeAccountingActive:false,
       stockMovements:inventory.movements.filter(m=>m.movementType==='sale'),
       costIssues:await database.inventoryCostEvents.where('saleId').equals(result.sale.id).toArray(),
       storeEntries:[],batchAfter:[],customerActivity:null,benefits:[]}});
    const corrupted=structuredClone(event!);
    corrupted.payload.postingEvidence!.stockMovements[0].quantityDelta=-1;
    expect(()=>validateCentralSaleEvent(corrupted)).toThrow(/posting evidence/);
    const missingCost=structuredClone(event!);
    missingCost.payload.postingEvidence!.costIssues=[];
    expect(()=>validateCentralSaleEvent(missingCost)).toThrow(/posting evidence/);
  });

  it('rolls back checkout and stock when durable event insertion fails', async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, 'Journal rollback product', '3');
    const stockBefore = (await database.products.get(product.id))!.stockQuantity;
    const failed = vi.spyOn(database.centralSaleEvents, 'add').mockRejectedValueOnce(new Error('simulated event storage failure'));
    try {
      await expect(completeSale({ lines: [{ productId: product.id, quantity: 1 }],
        discount: '0', paymentMethod: 'cash', amountPaid: '10.00', currency: 'GHS' }, database))
        .rejects.toThrow(/event storage failure/);
    } finally { failed.mockRestore(); }
    expect(await database.sales.count()).toBe(0);
    expect(await database.receipts.count()).toBe(0);
    expect(await database.centralSaleEvents.count()).toBe(0);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(stockBefore);
  });

  it("recovers a committed two-item partial-payment receipt from IndexedDB without writing again", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const rice = await createProductFixture(database, "Rice", "8", "10.00");
    const oil = await createProductFixture(database, "Oil", "6", "15.00");
    const customer = await createCustomer({ name: "Ama", phone: "0240000002", email: "", address: "", notes: "", status: "active" }, database);
    const key = "recovery-integrated-001";
    const saved = await completeSale({ lines: [{ productId: rice.id, quantity: 2 }, { productId: oil.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "cash", amountPaid: "12.00", currency: "GHS", submissionKey: key }, database);
    const before = { sales: await database.sales.count(), lines: await database.saleLines.count(), payments: await database.payments.count(), receipts: await database.receipts.count(), movements: await database.inventoryMovements.count() };
    // Emulate a browser reload by retrieving authoritative records, not calling completeSale again.
    const snapshot = await getSaleSnapshot(database);
    const recovered = recoverSavedCheckout(snapshot, saved.sale.businessProfileId, key);
    expect(recovered?.sale.id).toBe(saved.sale.id);
    expect(recovered?.receipt.receiptNumber).toBe(saved.receipt.receiptNumber);
    expect(recovered?.sale.outstandingMinor).toBe(2300);
    expect(recovered?.payment?.amountMinor).toBe(1200);
    expect({ sales: await database.sales.count(), lines: await database.saleLines.count(), payments: await database.payments.count(), receipts: await database.receipts.count(), movements: await database.inventoryMovements.count() }).toEqual(before);
    expect((await database.products.get(rice.id))?.stockQuantity).toBe(6);
    expect((await database.products.get(oil.id))?.stockQuantity).toBe(5);
  });

  it("rejects corrupted persisted payment data on recovery without changing the ledger", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const rice = await createProductFixture(database, "Rice", "3", "10.00");
    const result = await completeSale({ lines: [{ productId: rice.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10.00", currency: "GHS", submissionKey: "recovery-corrupt-001" }, database);
    const initial = await getSaleSnapshot(database);
    expect(recoverSavedCheckout(initial, result.sale.businessProfileId, result.sale.submissionKey)?.sale.id).toBe(result.sale.id);
    await database.payments.update(result.payment!.id, { amountMinor: 500 });
    const changed = await getSaleSnapshot(database);
    expect(() => recoverSavedCheckout(changed, result.sale.businessProfileId, result.sale.submissionKey)).toThrow(/payment/);
    expect(await database.sales.count()).toBe(1);
    expect((await database.products.get(rice.id))?.stockQuantity).toBe(2);
  });

  it("accepts a comma-grouped full payment amount and records the sale once", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Bulk cooking oil", "2", "10000.00");

    const result = await completeSale({ lines: [{ productId: product.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10,000.00", currency: "GHS" }, database);

    expect(result.sale).toMatchObject({ totalMinor: 1_000_000, amountPaidMinor: 1_000_000, outstandingMinor: 0 });
    expect(await database.sales.count()).toBe(1);
    expect(await database.receipts.count()).toBe(1);
  });

  it("handles a partial customer sale and derives the customer outstanding amount from saved sales", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Cooking oil", "4", "20.00");
    const customer = await createCustomer({ name: "Ama Mensah", phone: "+233 20 000 0000", email: "", address: "", notes: "", status: "active" }, database);
    const provider = await createMobileMoneyProviderFixture(database);

    const result = await completeSale({ lines: [{ productId: product.id, quantity: 2 }], customerId: customer.id, discount: "5.00", paymentMethod: "mobile", amountPaid: "15.00", currency: "GHS", mobileMoneyProviderId: provider.id, mobileMoneyReference: "MOMO-001" }, database);
    const summary = await getCustomerSaleSummary(customer.id, "GHS", database);

    expect(result.sale).toMatchObject({ totalMinor: 3500, amountPaidMinor: 1500, outstandingMinor: 2000, customerId: customer.id });
    expect(summary.outstandingMinor).toBe(2000);
    expect(summary.outstandingLabel).toContain("20.00");
    expect(summary.activities).toMatchObject([{ saleId: result.sale.id, outstandingMinor: 2000 }]);
    expect(await database.payments.where("saleId").equals(result.sale.id).first()).toMatchObject({ method: "mobile", mobileMoneyProviderId: provider.id, mobileMoneyProviderName: "MTN MoMo", mobileMoneyReference: "MOMO-001" });
  });

  it("writes a full Mobile Money payment and provider snapshot atomically, then returns the same result for a repeat key", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Data bundle", "3", "30.00");
    const provider = await createMobileMoneyProviderFixture(database, "Airtel Money");
    const request = { lines: [{ productId: product.id, quantity: 1 }], discount: "0", paymentMethod: "mobile" as const, amountPaid: "30.00", currency: "GHS", mobileMoneyProviderId: provider.id, mobileMoneyReference: "AIRTEL-4488", submissionKey: "mobile-money-retry-key" };

    const first = await completeSale(request, database);
    const repeated = await completeSale(request, database);

    expect(repeated.sale.id).toBe(first.sale.id);
    expect(first.payment).toMatchObject({ method: "mobile", amountMinor: 3000, mobileMoneyProviderId: provider.id, mobileMoneyProviderName: "Airtel Money", mobileMoneyReference: "AIRTEL-4488" });
    expect(await database.sales.count()).toBe(1);
    expect(await database.payments.count()).toBe(1);
    expect(await database.receipts.count()).toBe(1);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(2);
  });

  it("rejects a reused provider transaction reference without posting a second sale", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Reference guarded stock", "3", "30.00");
    const provider = await createMobileMoneyProviderFixture(database);
    const request = { lines: [{ productId: product.id, quantity: 1 }], discount: "0", paymentMethod: "mobile" as const, amountPaid: "30.00", currency: "GHS", mobileMoneyProviderId: provider.id };
    await completeSale({ ...request, mobileMoneyReference: "MOMO-REFERENCE-1", submissionKey: "mobile-reference-first" }, database);
    await expect(completeSale({ ...request, mobileMoneyReference: "momo-reference-1", submissionKey: "mobile-reference-second" }, database)).rejects.toThrow(/already recorded/);
    expect(await database.sales.count()).toBe(1);
    expect(await database.payments.count()).toBe(1);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(2);
  });

  it("rejects a Mobile Money payment without a configured provider before creating records or changing stock", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Phone cover", "1", "15.00");

    await expect(completeSale({ lines: [{ productId: product.id, quantity: 1 }], discount: "0", paymentMethod: "mobile", amountPaid: "15.00", currency: "GHS" }, database)).rejects.toThrow("Select a saved Mobile Money provider.");

    expect(await database.sales.count()).toBe(0);
    expect(await database.payments.count()).toBe(0);
    expect(await database.receipts.count()).toBe(0);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
  });

  it("returns the same completed sale on a repeated checkout key without duplicating stock, payment, receipt, or customer activity", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Rice", "5", "8.00");
    const customer = await createCustomer({ name: "Esi Boateng", phone: "+233 26 000 0000", email: "", address: "", notes: "", status: "active" }, database);
    const request = { lines: [{ productId: product.id, quantity: 2 }], customerId: customer.id, discount: "0", paymentMethod: "cash" as const, amountPaid: "8.00", currency: "GHS", submissionKey: "sale-retry-key-001" };

    const first = await completeSale(request, database);
    const second = await completeSale(request, database);
    const summary = await getCustomerSaleSummary(customer.id, "GHS", database);

    expect(second.sale.id).toBe(first.sale.id);
    expect(await database.sales.count()).toBe(1);
    expect(await database.payments.count()).toBe(1);
    expect(await database.receipts.count()).toBe(1);
    expect(await database.customerActivities.count()).toBe(1);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(3);
    expect(summary.outstandingMinor).toBe(800);
  });

  it("supports a credit sale and an atomic multi-product stock update", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const first = await createProductFixture(database, "Batteries", "3", "5.00");
    const second = await createProductFixture(database, "Earphones", "2", "30.00");
    const customer = await createCustomer({ name: "Kofi Antwi", phone: "+233 24 000 0000", email: "", address: "", notes: "", status: "active" }, database);

    const result = await completeSale({ lines: [{ productId: first.id, quantity: 2 }, { productId: second.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database);
    const inventory = await getInventorySnapshot(database);

    expect(result.sale).toMatchObject({ totalMinor: 4000, amountPaidMinor: 0, outstandingMinor: 4000, paymentMethod: "credit" });
    expect(await database.saleLines.where("saleId").equals(result.sale.id).count()).toBe(2);
    expect(await database.payments.where("saleId").equals(result.sale.id).count()).toBe(0);
    expect(inventory.products).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id, stockQuantity: 1 }), expect.objectContaining({ id: second.id, stockQuantity: 1 })]));
    expect((await database.inventoryMovements.filter((movement) => movement.note === `Sale ${result.sale.receiptNumber}`).count())).toBe(2);
  });

  it("rejects changed cart or payment details for an already committed checkout key", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const first = await createProductFixture(database, "Rice", "6", "10.00");
    const second = await createProductFixture(database, "Oil", "5", "12.00");
    const base = { lines: [{ productId: first.id, quantity: 1 }], discount: "0", paymentMethod: "cash" as const, amountPaid: "10.00", currency: "GHS", submissionKey: "checkout-immutable-001" };
    const saved = await completeSale(base, database);
    await expect(completeSale({ ...base, lines: [{ productId: second.id, quantity: 1 }] }, database)).rejects.toThrow("different details");
    await expect(completeSale({ ...base, amountPaid: "9.00" }, database)).rejects.toThrow("different details");
    const retried = await completeSale(base, database);
    expect(retried.sale.id).toBe(saved.sale.id);
    expect(await database.sales.count()).toBe(1);
    expect(await database.saleLines.count()).toBe(1);
    expect(await database.payments.count()).toBe(1);
    expect(await database.receipts.count()).toBe(1);
    expect((await database.products.get(first.id))?.stockQuantity).toBe(5);
    expect((await database.products.get(second.id))?.stockQuantity).toBe(5);
  });

  it("rejects a changed partial payment on retry without duplicating customer debt", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Soap", "4", "20.00");
    const customer = await createCustomer({ name: "Abena", phone: "0240000003", email: "", address: "", notes: "", status: "active" }, database);
    const request = { lines: [{ productId: product.id, quantity: 1 }], customerId: customer.id, discount: "0", paymentMethod: "cash" as const, amountPaid: "5.00", currency: "GHS", submissionKey: "partial-retry-immutable" };
    await completeSale(request, database);
    await expect(completeSale({ ...request, amountPaid: "10.00" }, database)).rejects.toThrow("different details");
    expect((await getCustomerSaleSummary(customer.id, "GHS", database)).outstandingMinor).toBe(1500);
    expect(await database.sales.count()).toBe(1);
    expect(await database.payments.count()).toBe(1);
  });

  it("rejects insufficient stock and customerless credit without leaving partial records", async () => {
    const database = makeDatabase();
    await initializeDatabase(database);
    const product = await createProductFixture(database, "Phone charger", "1", "15.00");

    await expect(completeSale({ lines: [{ productId: product.id, quantity: 2 }], discount: "0", paymentMethod: "cash", amountPaid: "30.00", currency: "GHS" }, database)).rejects.toThrow("only 1 units available");
    await expect(completeSale({ lines: [{ productId: product.id, quantity: 1 }], discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database)).rejects.toThrow("Choose a customer");

    expect(await database.sales.count()).toBe(0);
    expect(await database.saleLines.count()).toBe(0);
    expect(await database.payments.count()).toBe(0);
    expect(await database.receipts.count()).toBe(0);
    expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
    expect(await database.inventoryMovements.count()).toBe(1);
  });

  it("migrates a Stage 4 customer database into the sale schema without removing existing records", async () => {
    const name = `tallybook-sale-migration-${Date.now()}-${++sequence}`;
    databaseNames.add(name);
    const legacy = new Dexie(name);
    legacy.version(4).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt", categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt", products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt", inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity", customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt" });
    await legacy.open();
    await legacy.table("customers").put({ id: "customer-legacy", businessProfileId: "primary", name: "Legacy Customer", normalizedName: "legacy customer", phone: "+233 27 000 0000", status: "active", createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" });
    legacy.close();

    const upgraded = new TallybookDB(name);
    openDatabases.push(upgraded);
    const readiness = await initializeDatabase(upgraded);

    expect(readiness.schemaVersion).toBe(DATABASE_SCHEMA_VERSION);
    expect(await upgraded.customers.get("customer-legacy")).toMatchObject({ name: "Legacy Customer" });
    expect(await upgraded.sales.count()).toBe(0);
  });

  it("upgrades a version-7 database with a historical mobile payment without rewriting it and creates an empty provider store", async () => {
    const name = `tallybook-mobile-v7-migration-${Date.now()}-${++sequence}`;
    databaseNames.add(name);
    const legacy = new Dexie(name);
    legacy.version(7).stores({ appMeta: "key, updatedAt", businessProfiles: "id, name, country, currency, businessType, updatedAt", categories: "id, businessProfileId, name, normalizedName, archivedAt, updatedAt", products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt", inventoryMovements: "id, businessProfileId, productId, createdAt, movementType, resultingQuantity", customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt", sales: "id, businessProfileId, customerId, receiptNumber, createdAt, outstandingMinor, paymentMethod, &submissionKey", saleLines: "id, saleId, productId", payments: "id, saleId, customerId, createdAt, method", receipts: "id, saleId, receiptNumber, issuedAt", customerActivities: "id, customerId, saleId, createdAt, activityType", repayments: "id, businessProfileId, customerId, createdAt, method, &submissionKey" });
    await legacy.open();
    await legacy.table("payments").put({ id: "legacy-mobile-payment", saleId: "legacy-sale", method: "mobile", amountMinor: 1200, createdAt: "2026-08-25T00:00:00.000Z" });
    legacy.close();

    const upgraded = new TallybookDB(name);
    openDatabases.push(upgraded);
    await initializeDatabase(upgraded);

    expect(await upgraded.payments.get("legacy-mobile-payment")).toMatchObject({ method: "mobile", amountMinor: 1200 });
    expect(await upgraded.mobileMoneyProviders.count()).toBe(0);
  });
});
