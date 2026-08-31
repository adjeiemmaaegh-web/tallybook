const CDP_HTTP = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.77:3000/sales";

function pause(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function createTarget() {
  const response = await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open the isolated browser target (${response.status}).`);
  return response.json();
}

async function attach(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data); const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  });
  return {
    async evaluate(expression) {
      const id = ++nextId; const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      const result = await response; if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed."); return result.result.value;
    },
    close() { socket.close(); },
  };
}

const seedExpression = `
  (async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const stores = Array.from(database.objectStoreNames);
    const transaction = database.transaction(stores, "readwrite");
    const now = "2026-08-26T00:00:00.000Z";
    stores.forEach((store) => transaction.objectStore(store).clear());
    transaction.objectStore("appMeta").put({ key: "databaseCreatedAt", value: now, updatedAt: now });
    transaction.objectStore("appMeta").put({ key: "schemaVersion", value: "8", updatedAt: now });
    transaction.objectStore("businessProfiles").put({ id: "primary", name: "Stage 1 Browser Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: now, updatedAt: now });
    transaction.objectStore("customers").put({ id: "stage1-customer", businessProfileId: "primary", name: "Stage 1 Customer", normalizedName: "stage 1 customer", phone: "+233 20 111 9000", status: "active", createdAt: now, updatedAt: now });
    transaction.objectStore("products").put({ id: "stage1-product", businessProfileId: "primary", name: "Stage 1 Product", normalizedName: "stage 1 product", sellingPriceMinor: 2000, stockQuantity: 6, lowStockThreshold: 1, createdAt: now, updatedAt: now });
    transaction.objectStore("inventoryMovements").put({ id: "stage1-opening", businessProfileId: "primary", productId: "stage1-product", movementType: "initial", quantityDelta: 6, previousQuantity: 0, resultingQuantity: 6, note: "Browser opening stock", createdAt: now });
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
    database.close(); return "seeded";
  })()
`;

const interactionExpression = `
  (async () => {
    const waitFor = async (predicate, label) => { for (let count = 0; count < 160; count += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Timed out waiting for " + label + ". Visible text: " + bodyText().slice(0, 500)); };
    const bodyText = () => document.body.textContent || "";
    const setValue = (input, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); };
    const clickButton = (label) => { const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim().startsWith(label)); if (!button) throw new Error("Missing button: " + label); button.click(); };
    const choose = async (triggerText, optionText) => { const trigger = [...document.querySelectorAll('[data-slot="select-trigger"]')].find((entry) => entry.textContent?.includes(triggerText)); if (!trigger) throw new Error("Missing select trigger: " + triggerText); trigger.click(); await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((entry) => entry.textContent?.includes(optionText)), "option " + optionText); const option = [...document.querySelectorAll('[role="option"]')].find((entry) => entry.textContent?.includes(optionText)); option.click(); };
    const addProduct = async () => { await choose("Select product", "Stage 1 Product"); clickButton("Add"); await waitFor(() => bodyText().includes("Stage 1 Product") && document.querySelectorAll(".sale-cart-row").length === 1, "cart product"); };
    const selectCustomer = async () => { await choose("Walk-in customer", "Stage 1 Customer"); };
    const completeAndWait = async (duplicate = false) => { const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent?.trim() === "Complete sale"); if (!button) throw new Error("Complete sale control unavailable"); button.click(); if (duplicate) button.click(); await waitFor(() => bodyText().includes("Receipt saved") && document.querySelectorAll(".sale-cart-row").length === 0 && document.querySelector('[aria-busy="true"]') === null, "completed receipt and recovered control"); };

    await waitFor(() => bodyText().includes("Stage 1 Product"), "seeded POS");

    await addProduct();
    await completeAndWait(true);

    await addProduct();
    await selectCustomer();
    await choose("Cash", "Mobile Money");
    await waitFor(() => bodyText().includes("No Mobile Money provider is set up yet"), "in-context provider path");
    const providerInput = document.querySelector('input[aria-label="New Mobile Money provider name"]');
    setValue(providerInput, "StagePay Money");
    clickButton("Add provider");
    await waitFor(() => bodyText().includes("Choose the provider") && !bodyText().includes("No Mobile Money provider is set up yet"), "added provider without losing draft");
    if (!bodyText().includes("Stage 1 Customer") || document.querySelectorAll(".sale-cart-row").length !== 1) throw new Error("Adding a provider changed the current sale draft.");
    await choose("Choose a provider", "StagePay Money");
    const referenceInput = [...document.querySelectorAll("input")].find((entry) => entry.placeholder === "For example, 123456");
    setValue(referenceInput, "STAGE1-FULL");
    await completeAndWait();

    await addProduct();
    await selectCustomer();
    await choose("Cash", "Mobile Money");
    await choose("Choose a provider", "StagePay Money");
    const amountInput = [...document.querySelectorAll("input")].find((entry) => entry.getAttribute("aria-describedby") === "payment-amount-help");
    setValue(amountInput, "6.00");
    await waitFor(() => bodyText().includes("Part payment · Mobile Money") && bodyText().includes("14.00"), "part-payment summary");
    await completeAndWait();

    await addProduct();
    await selectCustomer();
    clickButton("Pay later");
    await waitFor(() => bodyText().includes("Pay later · Credit") && bodyText().includes("20.00 remains"), "credit summary");
    await completeAndWait();

    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const getAll = (store) => new Promise((resolve, reject) => { const request = database.transaction(store, "readonly").objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const [sales, payments, receipts, products, providers] = await Promise.all([getAll("sales"), getAll("payments"), getAll("receipts"), getAll("products"), getAll("mobileMoneyProviders")]);
    database.close();
    if (sales.length !== 4 || payments.length !== 3 || receipts.length !== 4 || products[0].stockQuantity !== 2 || providers.length !== 1) throw new Error(JSON.stringify({ sales: sales.length, payments: payments.length, receipts: receipts.length, stock: products[0]?.stockQuantity, providers: providers.length }));
    const mobilePayments = payments.filter((payment) => payment.method === "mobile");
    if (mobilePayments.length !== 2 || !mobilePayments.some((payment) => payment.mobileMoneyProviderName === "StagePay Money" && payment.mobileMoneyReference === "STAGE1-FULL")) throw new Error("Mobile Money payment history did not preserve provider/reference details.");
    return { sales: sales.length, payments: payments.length, receipts: receipts.length, stock: products[0].stockQuantity, providers: providers.length, mobilePaymentLabels: mobilePayments.map((payment) => ({ provider: payment.mobileMoneyProviderName, reference: payment.mobileMoneyReference })) };
  })()
`;

const persistenceExpression = `
  (async () => {
    const waitFor = async (predicate) => { for (let count = 0; count < 120; count += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Refresh persistence view did not render."); };
    await waitFor(() => (document.body.textContent || "").includes("Mobile Money") && (document.body.textContent || "").includes("StagePay Money"));
    return { labelsVisible: true, recentSalesVisible: (document.body.textContent || "").includes("Every completed sale has a line.") };
  })()
`;

const target = await createTarget();
const cdp = await attach(target.webSocketDebuggerUrl);
try {
  await pause(900);
  await cdp.evaluate(seedExpression);
  await cdp.evaluate("location.reload(); 'reloading';");
  await pause(1_000);
  const interaction = await cdp.evaluate(interactionExpression);
  await cdp.evaluate("location.reload(); 'reloading';");
  await pause(1_000);
  const persistence = await cdp.evaluate(persistenceExpression);
  console.log(JSON.stringify({ browserFlow: "passed", interaction, persistence }, null, 2));
} finally {
  cdp.close();
}
