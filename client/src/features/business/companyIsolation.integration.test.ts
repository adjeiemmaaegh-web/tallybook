import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { updateCompanyReturnPolicy } from "@/features/business/returnPolicySettings";
import { getCustomerSnapshot, archiveCustomer } from "@/features/customers/customers";
import { getCustomerDebtSummary, getCustomerRepaymentTargets } from "@/features/credit/credit";
import { getCustomerRetention } from "@/features/customers/retentionInsights";
import { recordCustomerBenefit, setCustomerPolicy } from "@/features/customers/customerBenefits";
import { createExpense, listExpenses, localExpenseDate } from "@/features/expenses/expenses";
import { adjustStock, createProduct, getInventorySnapshot } from "@/features/inventory/inventory";
import { prepareStockCount, postStockCount } from "@/features/inventory/advancedInventory";
import { registerBatch, setCatalogueOptions } from "@/features/inventory/stage2Inventory";
import { completePurchase, getPurchasesSnapshot } from "@/features/purchases/purchases";
import { recordRepayment } from "@/features/credit/credit";
import { executeLatestSaleReversal, prepareLatestSaleReversal } from "@/features/assistant/reversals";
import { loadPeriodSales } from "@/features/assistant/salesAnalytics";
import { completeSale, getSaleSnapshot } from "@/features/sales/sales";
import { recordConfirmedCashPartialReturn } from "@/features/sales/cashPartialReturnPosting";
import { getSupplierPayables, recognizeUnpaidPurchase, recordSupplierSettlement } from "@/features/purchases/supplierPayables.ts";
import { createStaff, listStaff, lockStaff, openShift, setStaffPermissions, unlockStaff } from "@/features/staff/staff";

const COMPANY_A = "primary";
const COMPANY_B = "company-two";
const STAMP = "2026-10-23T12:00:00.000Z";
const databases: TallybookDB[] = [];
let sequence = 0;

function makeDatabase() {
  const database = new TallybookDB(`stage1-company-isolation-${Date.now()}-${++sequence}`);
  databases.push(database);
  return database;
}

async function seedCompanies(database: TallybookDB) {
  await initializeDatabase(database);
  await database.businessProfiles.bulkPut([
    { id: COMPANY_A, name: "Company A", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: STAMP, updatedAt: STAMP },
    { id: COMPANY_B, name: "Company B", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: STAMP, updatedAt: STAMP },
  ] as never[]);
  setActiveBusinessProfileId(COMPANY_A);
}

async function unlockSaleStaff(database: TallybookDB) {
  const owner = await createStaff("Isolation test owner", "owner", "123456", database);
  await unlockStaff(owner.id, "123456", database);
  await openShift(0, database);
  return owner;
}

function product(id: string, businessProfileId: string, stockQuantity = 5) {
  return {
    id,
    businessProfileId,
    name: id,
    normalizedName: id,
    sellingPriceMinor: 1000,
    costPriceMinor: 100,
    stockQuantity,
    lowStockThreshold: 1,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

function customer(id: string, businessProfileId: string) {
  return {
    id,
    businessProfileId,
    name: id,
    normalizedName: id,
    phone: "0240000000",
    status: "active",
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

function sale(id: string, businessProfileId: string, customerId?: string) {
  return {
    id,
    businessProfileId,
    customerId,
    receiptNumber: `receipt-${id}`,
    currency: "GHS",
    status: "completed",
    subtotalMinor: 1000,
    discountMinor: 0,
    totalMinor: 1000,
    amountPaidMinor: 1000,
    outstandingMinor: 0,
    paymentMethod: "cash",
    submissionKey: `submission-${id}`,
    createdAt: STAMP,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  lockStaff(COMPANY_A);
  lockStaff(COMPANY_B);
  setActiveBusinessProfileId(COMPANY_A);
  await Promise.all(databases.splice(0).map(async (database) => {
    database.close();
    await new Dexie(database.name).delete();
  }));
});

it("keeps actual Dexie customer, sale, inventory, supplier, expense, and staff reads inside the selected company", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await database.customers.bulkPut([customer("customer-a", COMPANY_A), customer("customer-b", COMPANY_B)] as never[]);
  await database.products.bulkPut([product("product-a", COMPANY_A), product("product-b", COMPANY_B)] as never[]);
  await database.sales.bulkPut([sale("sale-a", COMPANY_A), sale("sale-b", COMPANY_B)] as never[]);
  await database.saleLines.bulkPut([
    { id: "line-a", saleId: "sale-a", businessProfileId: COMPANY_A, productId: "product-a", quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000 },
    { id: "line-b", saleId: "sale-b", businessProfileId: COMPANY_B, productId: "product-b", quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000 },
  ] as never[]);
  await database.payments.bulkPut([
    { id: "payment-a", saleId: "sale-a", businessProfileId: COMPANY_A, amountMinor: 1000, method: "cash", createdAt: STAMP },
    { id: "payment-b", saleId: "sale-b", businessProfileId: COMPANY_B, amountMinor: 1000, method: "cash", createdAt: STAMP },
  ] as never[]);
  await database.receipts.bulkPut([
    { id: "receipt-a", saleId: "sale-a", businessProfileId: COMPANY_A, receiptNumber: "receipt-sale-a", issuedAt: STAMP },
    { id: "receipt-b", saleId: "sale-b", businessProfileId: COMPANY_B, receiptNumber: "receipt-sale-b", issuedAt: STAMP },
  ] as never[]);
  await database.inventoryMovements.bulkPut([
    { id: "movement-a", businessProfileId: COMPANY_A, productId: "product-a", movementType: "initial", quantityDelta: 5, previousQuantity: 0, resultingQuantity: 5, createdAt: STAMP },
    { id: "movement-b", businessProfileId: COMPANY_B, productId: "product-b", movementType: "initial", quantityDelta: 5, previousQuantity: 0, resultingQuantity: 5, createdAt: STAMP },
  ] as never[]);
  await database.suppliers.bulkPut([
    { id: "supplier-a", businessProfileId: COMPANY_A, name: "Supplier A", normalizedName: "supplier a", createdAt: STAMP, updatedAt: STAMP },
    { id: "supplier-b", businessProfileId: COMPANY_B, name: "Supplier B", normalizedName: "supplier b", createdAt: STAMP, updatedAt: STAMP },
  ] as never[]);
  await database.purchases.bulkPut([
    { id: "purchase-a", businessProfileId: COMPANY_A, supplierId: "supplier-a", supplierName: "Supplier A", purchaseDate: "2026-10-01", totalCostMinor: 100, createdAt: STAMP },
    { id: "purchase-b", businessProfileId: COMPANY_B, supplierId: "supplier-b", supplierName: "Supplier B", purchaseDate: "2026-10-01", totalCostMinor: 100, createdAt: STAMP },
  ] as never[]);
  await database.purchaseLines.bulkPut([
    { id: "purchase-line-a", businessProfileId: COMPANY_A, purchaseId: "purchase-a", productId: "product-a", quantity: 1, unitCostMinor: 100, lineTotalMinor: 100 },
    { id: "purchase-line-b", businessProfileId: COMPANY_B, purchaseId: "purchase-b", productId: "product-b", quantity: 1, unitCostMinor: 100, lineTotalMinor: 100 },
  ] as never[]);
  await database.expenses.bulkPut([
    { id: "expense-a", businessProfileId: COMPANY_A, category: "transport", amountMinor: 100, expenseDate: "2026-10-01", submissionKey: "expense-a-key", createdAt: STAMP },
    { id: "expense-b", businessProfileId: COMPANY_B, category: "transport", amountMinor: 200, expenseDate: "2026-10-01", submissionKey: "expense-b-key", createdAt: STAMP },
  ] as never[]);
  const ownerA = await createStaff("Owner A", "owner", "123456", database);
  await unlockStaff(ownerA.id, "123456", database);
  setActiveBusinessProfileId(COMPANY_B);
  const ownerB = await createStaff("Owner B", "owner", "123456", database);
  await unlockStaff(ownerB.id, "123456", database);
  setActiveBusinessProfileId(COMPANY_A);
  await unlockStaff(ownerA.id, "123456", database);

  const readIds = async () => ({
    customers: (await getCustomerSnapshot(database)).customers.map((record) => record.id),
    sales: (await getSaleSnapshot(database)).sales.map((record) => record.id),
    inventory: (await getInventorySnapshot(database)).products.map((record) => record.id),
    suppliers: (await getPurchasesSnapshot(database)).suppliers.map((record) => record.id),
    purchases: (await getPurchasesSnapshot(database)).purchases.map((record) => record.id),
    expenses: (await listExpenses(database)).map((record) => record.id),
    staff: (await listStaff(database)).map((record) => record.id),
  });

  expect(await readIds()).toEqual({
    customers: ["customer-a"], sales: ["sale-a"], inventory: ["product-a"],
    suppliers: ["supplier-a"], purchases: ["purchase-a"], expenses: ["expense-a"], staff: [ownerA.id],
  });
  setActiveBusinessProfileId(COMPANY_B);
  await unlockStaff(ownerB.id, "123456", database);
  expect(await readIds()).toEqual({
    customers: ["customer-b"], sales: ["sale-b"], inventory: ["product-b"],
    suppliers: ["supplier-b"], purchases: ["purchase-b"], expenses: ["expense-b"], staff: [ownerB.id],
  });
});

it("rejects foreign-company product, customer, supplier, repayment, stock, refund, and customer mutations without writes", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await unlockSaleStaff(database);
  await database.products.bulkPut([product("product-a", COMPANY_A), product("product-b", COMPANY_B)] as never[]);
  await database.customers.bulkPut([customer("customer-a", COMPANY_A), customer("customer-b", COMPANY_B)] as never[]);
  await database.suppliers.bulkPut([
    { id: "supplier-a", businessProfileId: COMPANY_A, name: "Supplier A", normalizedName: "supplier a", createdAt: STAMP, updatedAt: STAMP },
    { id: "supplier-b", businessProfileId: COMPANY_B, name: "Supplier B", normalizedName: "supplier b", createdAt: STAMP, updatedAt: STAMP },
  ] as never[]);
  await database.sales.put(sale("sale-b", COMPANY_B));
  await database.saleLines.put({ id: "line-b", saleId: "sale-b", businessProfileId: COMPANY_B, productId: "product-b", quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000 } as never);
  const before = {
    productA: await database.products.get("product-a"),
    productB: await database.products.get("product-b"),
    customerB: await database.customers.get("customer-b"),
    inventoryMovements: await database.inventoryMovements.toArray(),
    inventoryCosts: await database.inventoryCostEvents.toArray(),
    sales: await database.sales.toArray(),
    saleLines: await database.saleLines.toArray(),
    repayments: await database.repayments.toArray(),
    purchases: await database.purchases.toArray(),
    returns: await database.cashPartialReturns.toArray(),
  };

  await expect(completeSale({ lines: [{ productId: "product-b", quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10.00", currency: "GHS" }, database)).rejects.toThrow(/products are no longer available/i);
  await expect(completeSale({ lines: [{ productId: "product-a", quantity: 1 }], customerId: "customer-b", discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, database)).rejects.toThrow(/active customer/i);
  await expect(adjustStock("product-b", { movementType: "increase", quantity: "1" }, database)).rejects.toThrow(/unavailable for adjustment/i);
  await expect(archiveCustomer("customer-b", database)).rejects.toThrow(/archived or unavailable/i);
  await expect(recordRepayment({ customerId: "customer-b", amount: "1.00", method: "cash", currency: "GHS" }, database)).rejects.toThrow(/active customer/i);
  await expect(completePurchase({ supplierId: "supplier-b", purchaseDate: "2026-10-01", lines: [{ productId: "product-a", quantity: "1", unitCost: "1.00" }] }, "GHS", database)).rejects.toThrow(/active supplier/i);
  await expect(completePurchase({ supplierId: "supplier-a", purchaseDate: "2026-10-01", lines: [{ productId: "product-b", quantity: "1", unitCost: "1.00" }] }, "GHS", database)).rejects.toThrow(/active/i);
  await expect(recordConfirmedCashPartialReturn({
    originalSaleId: "sale-b", submissionKey: "foreign-return-1", lines: [{ saleLineId: "line-b", quantity: 1 }],
    cashWasRefunded: true, confirmedRefundMinor: 1000, disposition: "restockable",
  }, database)).rejects.toThrow(/unavailable in this company/i);

  expect({
    productA: await database.products.get("product-a"),
    productB: await database.products.get("product-b"),
    customerB: await database.customers.get("customer-b"),
    inventoryMovements: await database.inventoryMovements.toArray(),
    inventoryCosts: await database.inventoryCostEvents.toArray(),
    sales: await database.sales.toArray(),
    saleLines: await database.saleLines.toArray(),
    repayments: await database.repayments.toArray(),
    purchases: await database.purchases.toArray(),
    returns: await database.cashPartialReturns.toArray(),
  }).toEqual(before);
});

it("rolls back an expense and its audit context if the company changes during the write transaction", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  const originalAdd = database.expenses.add.bind(database.expenses);
  vi.spyOn(database.expenses, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });

  await expect(createExpense({ category: "transport", amount: "1.00", expenseDate: localExpenseDate(), currency: "GHS", submissionKey: "expense-switch-key" }, database)).rejects.toThrow(/Company (changed|switched)/i);

  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.expenses.toArray()).toEqual([]);
  expect(await database.staffAudits.toArray()).toEqual([]);
});

it("rolls back a complete sale and all stock/ledger writes if the company changes during commit", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await unlockSaleStaff(database);
  const savedProduct = await createProduct({ name: "Sale race product", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "3", lowStockThreshold: "0" }, "GHS", database);
  const originalAdd = database.sales.add.bind(database.sales);
  vi.spyOn(database.sales, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });

  await expect(completeSale({ lines: [{ productId: savedProduct.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10.00", currency: "GHS", submissionKey: "sale-switch-key-1" }, database)).rejects.toThrow(/Company (changed|switched)/i);

  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.sales.toArray()).toEqual([]);
  expect(await database.payments.toArray()).toEqual([]);
  expect(await database.receipts.toArray()).toEqual([]);
  expect(await database.inventoryMovements.where("movementType").equals("sale").toArray()).toEqual([]);
  expect((await database.products.get(savedProduct.id))?.stockQuantity).toBe(3);
});

it("rolls back a purchase, cost event, movement, and stock increase if the company changes during commit", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  const savedProduct = await createProduct({ name: "Purchase race product", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "2", lowStockThreshold: "0" }, "GHS", database);
  await database.suppliers.put({ id: "supplier-a", businessProfileId: COMPANY_A, name: "Supplier A", normalizedName: "supplier a", createdAt: STAMP, updatedAt: STAMP } as never);
  const originalAdd = database.purchases.add.bind(database.purchases);
  vi.spyOn(database.purchases, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });

  await expect(completePurchase({ supplierId: "supplier-a", purchaseDate: "2026-10-01", lines: [{ productId: savedProduct.id, quantity: "1", unitCost: "2.00" }], submissionKey: "purchase-switch-key" }, "GHS", database)).rejects.toThrow(/Company (changed|switched)/i);

  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.purchases.toArray()).toEqual([]);
  expect(await database.purchaseLines.toArray()).toEqual([]);
  expect(await database.inventoryMovements.where("movementType").equals("purchase").toArray()).toEqual([]);
  expect((await database.products.get(savedProduct.id))?.stockQuantity).toBe(2);
});

it("rolls back repayment writes if the company changes during ledger posting", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await unlockSaleStaff(database);
  const savedCustomer = customer("customer-a", COMPANY_A);
  await database.customers.add(savedCustomer as never);
  const savedProduct = await createProduct({ name: "Repayment race product", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "3", lowStockThreshold: "0" }, "GHS", database);
  await completeSale({ lines: [{ productId: savedProduct.id, quantity: 1 }], customerId: savedCustomer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS", submissionKey: "repayment-credit-sale" }, database);
  const auditsBeforeRepayment = await database.staffAudits.toArray();
  const originalAdd = database.repayments.add.bind(database.repayments);
  vi.spyOn(database.repayments, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });

  await expect(recordRepayment({ customerId: savedCustomer.id, amount: "1.00", method: "cash", currency: "GHS", submissionKey: "repayment-switch-key" }, database)).rejects.toThrow(/Company (changed|switched)/i);

  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.repayments.toArray()).toEqual([]);
  expect(await database.staffAudits.toArray()).toEqual(auditsBeforeRepayment);
  expect((await database.products.get(savedProduct.id))?.stockQuantity).toBe(2);
});

it("rolls back refund stock and FIFO entries if the company changes before refund commit", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await unlockSaleStaff(database);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, "Enable test returns", database);
  const savedProduct = await createProduct({ name: "Return race product", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "3", lowStockThreshold: "0" }, "GHS", database);
  const checkout = await completeSale({ lines: [{ productId: savedProduct.id, quantity: 2 }], discount: "0", paymentMethod: "cash", amountPaid: "20.00", currency: "GHS", submissionKey: "return-race-sale" }, database);
  const beforeMovementCount = await database.inventoryMovements.count();
  const beforeCostCount = await database.inventoryCostEvents.count();
  const originalAdd = database.cashPartialReturns.add.bind(database.cashPartialReturns);
  vi.spyOn(database.cashPartialReturns, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });

  await expect(recordConfirmedCashPartialReturn({
    originalSaleId: checkout.sale.id, submissionKey: "return-switch-key", lines: [{ saleLineId: checkout.lines[0].id, quantity: 1 }],
    cashWasRefunded: true, confirmedRefundMinor: 1000, disposition: "restockable",
  }, database)).rejects.toThrow(/Company (changed|switched)/i);

  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.cashPartialReturns.toArray()).toEqual([]);
  expect((await database.products.get(savedProduct.id))?.stockQuantity).toBe(1);
  expect(await database.inventoryMovements.count()).toBe(beforeMovementCount);
  expect(await database.inventoryCostEvents.count()).toBe(beforeCostCount);
});

it("rejects customer debt, repayment-target, and retention reads when the company changes during Dexie reads", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await database.customers.put(customer("customer-a", COMPANY_A) as never);
  await database.sales.put(sale("sale-a", COMPANY_A, "customer-a") as never);

  const assertReadFailsClosed = async (read: () => Promise<unknown>) => {
    setActiveBusinessProfileId(COMPANY_A);
    const switchDuringRead = (record: unknown) => { setActiveBusinessProfileId(COMPANY_B); return record; };
    database.sales.hook("reading").subscribe(switchDuringRead);
    try {
      await expect(read()).rejects.toThrow(/Company (changed|switched)/i);
    } finally {
      database.sales.hook("reading").unsubscribe(switchDuringRead);
    }
  };

  await assertReadFailsClosed(() => getCustomerDebtSummary("customer-a", "GHS", database));
  await assertReadFailsClosed(() => getCustomerRepaymentTargets("customer-a", "GHS", database));
  await assertReadFailsClosed(() => getCustomerRetention("customer-a", database));
});

it("rejects assistant period-sales results when the active company changes during table reads", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await database.sales.put(sale("period-sale-a", COMPANY_A) as never);
  const switchDuringRead = (record: unknown) => { setActiveBusinessProfileId(COMPANY_B); return record; };
  database.sales.hook("reading").subscribe(switchDuringRead);
  try {
    await expect(loadPeriodSales({ kind: "all" }, database, new Date("2026-10-23T23:00:00.000Z"))).rejects.toThrow(/Company (changed|switched)/i);
  } finally {
    database.sales.hook("reading").unsubscribe(switchDuringRead);
  }
});

it("rolls back loyalty policy and points writes if the company changes at the write boundary", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  await database.customers.put(customer("customer-a", COMPANY_A) as never);
  const originalPut = database.customerPolicies.put.bind(database.customerPolicies);
  vi.spyOn(database.customerPolicies, "put").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalPut(record);
  });

  await expect(setCustomerPolicy("customer-a", { group: "VIP" }, database)).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.customerPolicies.toArray()).toEqual([]);
  expect(await database.staffAudits.toArray()).toEqual([]);

  const originalAdd = database.customerBenefits.add.bind(database.customerBenefits);
  vi.spyOn(database.customerBenefits, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });
  await expect(recordCustomerBenefit({ customerId: "customer-a", kind: "points", delta: 5, reason: "manual correction", submissionKey: "points-switch-001" }, database)).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.customerBenefits.toArray()).toEqual([]);
  expect(await database.staffAudits.toArray()).toEqual([]);
});

it("rejects stock-count previews if the active company changes during product reads", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  const savedProduct = await createProduct({ name: "Count preview race", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "3", lowStockThreshold: "0" }, "GHS", database);
  const switchDuringRead = (record: unknown) => { setActiveBusinessProfileId(COMPANY_B); return record; };
  database.products.hook("reading").subscribe(switchDuringRead);
  try {
    await expect(prepareStockCount([savedProduct.id], database)).rejects.toThrow(/Company (changed|switched)/i);
  } finally {
    database.products.hook("reading").unsubscribe(switchDuringRead);
  }
});

it("rolls back catalogue edits, batch registration, and stock corrections when the company changes during commit", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  const savedProduct = await createProduct({ name: "Inventory write race", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "3", lowStockThreshold: "0" }, "GHS", database);
  const originalProductPut = database.products.put.bind(database.products);
  vi.spyOn(database.products, "put").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalProductPut(record);
  });
  await expect(setCatalogueOptions(savedProduct.id, { baseUnit: "piece" }, database)).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect((await database.products.get(savedProduct.id))?.baseUnit).toBeUndefined();
  vi.mocked(database.products.put).mockRestore();

  const originalBatchAdd = database.inventoryBatches.add.bind(database.inventoryBatches);
  vi.spyOn(database.inventoryBatches, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalBatchAdd(record);
  });
  await expect(registerBatch(savedProduct.id, "RACE-LOT", 1, undefined, database)).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.inventoryBatches.toArray()).toEqual([]);
  vi.mocked(database.inventoryBatches.add).mockRestore();

  const preview = await prepareStockCount([savedProduct.id], database);
  const beforeMovements = await database.inventoryMovements.toArray();
  const beforeCosts = await database.inventoryCostEvents.toArray();
  const originalBulkPut = database.products.bulkPut.bind(database.products);
  vi.spyOn(database.products, "bulkPut").mockImplementation(async (records) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalBulkPut(records);
  });
  await expect(postStockCount({ ...preview, lines: preview.lines.map(line => ({ ...line, countedQuantity: line.expectedQuantity - 1 })) }, database)).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect((await database.products.get(savedProduct.id))?.stockQuantity).toBe(3);
  expect(await database.inventoryMovements.toArray()).toEqual(beforeMovements);
  expect(await database.inventoryCostEvents.toArray()).toEqual(beforeCosts);
});

it("rolls back a sale reversal and stock restoration when the company changes during posting", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  const owner = await unlockSaleStaff(database);
  await updateCompanyReturnPolicy({ enabled: true, allowFullReversal: true, allowCashPartial: true, maxAgeDays: 30 }, "Enable test returns", database);
  const savedProduct = await createProduct({ name: "Reversal race product", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "3", lowStockThreshold: "0" }, "GHS", database);
  const checkout = await completeSale({ lines: [{ productId: savedProduct.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10.00", currency: "GHS", submissionKey: "reversal-race-sale" }, database);
  const switchDuringPreview = (record: unknown) => { setActiveBusinessProfileId(COMPANY_B); return record; };
  database.saleLines.hook("reading").subscribe(switchDuringPreview);
  try {
    await expect(prepareLatestSaleReversal("GHS", database)).rejects.toThrow(/Company (changed|switched)/i);
  } finally {
    database.saleLines.hook("reading").unsubscribe(switchDuringPreview);
  }
  setActiveBusinessProfileId(COMPANY_A);
  await unlockStaff(owner.id, "123456", database);
  const beforeCosts = await database.inventoryCostEvents.toArray();
  const beforeMovements = await database.inventoryMovements.toArray();
  const originalAdd = database.saleReversals.add.bind(database.saleReversals);
  vi.spyOn(database.saleReversals, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });

  await expect(executeLatestSaleReversal("GHS", database, "reversal-company-switch-1")).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.saleReversals.toArray()).toEqual([]);
  expect((await database.products.get(savedProduct.id))?.stockQuantity).toBe(2);
  expect(await database.inventoryCostEvents.toArray()).toEqual(beforeCosts);
  expect(await database.inventoryMovements.toArray()).toEqual(beforeMovements);
  expect((await database.sales.get(checkout.sale.id))?.businessProfileId).toBe(COMPANY_A);
});

it("rolls back supplier payable recognition and settlement, and rejects reads, after a company switch", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  const savedProduct = await createProduct({ name: "Payable race product", categoryId: "uncategorized", sellingPrice: "10.00", costPrice: "1.00", initialStock: "2", lowStockThreshold: "0" }, "GHS", database);
  await database.suppliers.put({ id: "supplier-a", businessProfileId: COMPANY_A, name: "Supplier A", normalizedName: "supplier a", createdAt: STAMP, updatedAt: STAMP } as never);
  const purchase = await completePurchase({ supplierId: "supplier-a", purchaseDate: "2026-10-01", lines: [{ productId: savedProduct.id, quantity: "1", unitCost: "2.00" }], submissionKey: "payable-race-purchase" }, "GHS", database);
  const originalAdd = database.supplierPayableEntries.add.bind(database.supplierPayableEntries);
  vi.spyOn(database.supplierPayableEntries, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });

  await expect(recognizeUnpaidPurchase(purchase.id, "recognition-switch-01", database)).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.supplierPayableEntries.toArray()).toEqual([]);

  vi.mocked(database.supplierPayableEntries.add).mockRestore();
  await recognizeUnpaidPurchase(purchase.id, "recognition-switch-02", database);
  const spy = vi.spyOn(database.supplierPayableEntries, "add").mockImplementation(async (record) => {
    setActiveBusinessProfileId(COMPANY_B);
    return originalAdd(record);
  });
  await expect(recordSupplierSettlement({ purchaseId: purchase.id, kind: "payment", amountMinor: 100, method: "cash", submissionKey: "settlement-switch-01" }, database)).rejects.toThrow(/Company (changed|switched)/i);
  setActiveBusinessProfileId(COMPANY_A);
  expect(await database.supplierPayableEntries.count()).toBe(1);
  expect(await database.staffAudits.toArray()).toEqual([]);
  spy.mockRestore();

  const switchDuringRead = (record: unknown) => { setActiveBusinessProfileId(COMPANY_B); return record; };
  database.supplierPayableEntries.hook("reading").subscribe(switchDuringRead);
  try {
    await expect(getSupplierPayables(database)).rejects.toThrow(/Company (changed|switched)/i);
  } finally {
    database.supplierPayableEntries.hook("reading").unsubscribe(switchDuringRead);
  }
});

it("does not allow an unlocked owner to mutate a staff record belonging to another company", async () => {
  const database = makeDatabase();
  await seedCompanies(database);
  const owner = await createStaff("Owner A", "owner", "123456", database);
  await unlockStaff(owner.id, "123456", database);
  const foreignStaff = {
    id: "foreign-cashier",
    businessProfileId: COMPANY_B,
    name: "Cashier B",
    role: "cashier",
    salt: "test-salt",
    pinHash: "not-used-for-this-target-check",
    createdAt: STAMP,
  };
  await database.staffMembers.put(foreignStaff as never);
  const before = await database.staffMembers.get(foreignStaff.id);
  const auditsBefore = await database.staffAudits.toArray();

  await expect(setStaffPermissions(foreignStaff.id, ["sell"], database)).rejects.toThrow(/cannot be modified/i);

  expect(await database.staffMembers.get(foreignStaff.id)).toEqual(before);
  expect(await database.staffAudits.toArray()).toEqual(auditsBefore);
});
