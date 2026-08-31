/* Disposable Stage 6 acceptance check: it uses a separate 127.0.0.77 origin and deletes no owner data. */
const CDP_HTTP = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.77:3000/customers";

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
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
  });
  return {
    async evaluate(expression) {
      const id = ++nextId;
      const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      const result = await response;
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
      return result.result.value;
    },
    close() { socket.close(); },
  };
}

const seedExpression = `
  (async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("tallybook-db");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ["appMeta", "businessProfiles", "categories", "products", "inventoryMovements", "customers", "sales", "saleLines", "payments", "receipts", "customerActivities", "repayments"];
    const transaction = database.transaction(stores, "readwrite");
    const now = "2026-08-25T00:00:00.000Z";
    stores.forEach((store) => transaction.objectStore(store).clear());
    transaction.objectStore("appMeta").put({ key: "databaseCreatedAt", value: now, updatedAt: now });
    transaction.objectStore("appMeta").put({ key: "schemaVersion", value: "7", updatedAt: now });
    transaction.objectStore("businessProfiles").put({ id: "primary", name: "Isolated Browser Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: now, updatedAt: now });
    transaction.objectStore("customers").put({ id: "browser-customer", businessProfileId: "primary", name: "Browser Test Customer", normalizedName: "browser test customer", phone: "+233 20 000 7777", status: "active", createdAt: now, updatedAt: now });
    transaction.objectStore("sales").put({ id: "browser-sale", businessProfileId: "primary", customerId: "browser-customer", receiptNumber: "TB-TEST-001", status: "completed", subtotalMinor: 2000, discountMinor: 0, totalMinor: 2000, amountPaidMinor: 0, outstandingMinor: 2000, paymentMethod: "credit", submissionKey: "browser-sale-submission", createdAt: now });
    transaction.objectStore("customerActivities").put({ id: "browser-activity", customerId: "browser-customer", saleId: "browser-sale", activityType: "sale", totalMinor: 2000, amountPaidMinor: 0, outstandingMinor: 2000, createdAt: now });
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
    database.close();
    return "seeded";
  })()
`;

const interactionExpression = `
  (async () => {
    const waitFor = async (predicate, label) => {
      for (let count = 0; count < 100; count += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
      throw new Error("Timed out waiting for " + label);
    };
    const text = () => document.body.textContent || "";
    const findButton = (label, inDialog = false) => [...document.querySelectorAll(inDialog ? '[role="dialog"] button' : "button")].find((button) => button.textContent?.trim().startsWith(label));
    const setValue = (input, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); };
    await waitFor(() => text().includes("Browser Test Customer"), "seeded customer");
    findButton("View").click();
    await waitFor(() => text().includes("Outstanding balance") && text().includes("20.00"), "customer debt detail");

    findButton("Record repayment").click();
    await waitFor(() => document.querySelector('[role="dialog"] input[placeholder="0.00"]'), "repayment form");
    setValue(document.querySelector('[role="dialog"] input[placeholder="0.00"]'), "7.50");
    const firstSave = findButton("Record repayment", true);
    firstSave.click();
    firstSave.click();
    await waitFor(() => !document.querySelector('[role="dialog"]') && text().includes("12.50"), "partial repayment saved");

    findButton("Record repayment").click();
    await waitFor(() => document.querySelector('[role="dialog"] input[placeholder="0.00"]'), "overpayment form");
    setValue(document.querySelector('[role="dialog"] input[placeholder="0.00"]'), "20.00");
    findButton("Record repayment", true).click();
    await waitFor(() => text().includes("cannot exceed"), "overpayment rejection");
    setValue(document.querySelector('[role="dialog"] input[placeholder="0.00"]'), "12.50");
    findButton("Record repayment", true).click();
    await waitFor(() => !document.querySelector('[role="dialog"]') && text().includes("0.00"), "full repayment saved");

    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const repaymentCount = await new Promise((resolve, reject) => { const request = database.transaction("repayments", "readonly").objectStore("repayments").count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    database.close();
    if (repaymentCount !== 2) throw new Error("Expected two saved repayments after duplicate click and settlement; got " + repaymentCount);
    return { repaymentCount, finalScreen: text().includes("0.00"), historyVisible: text().includes("Repayment") };
  })()
`;

const persistenceExpression = `
  (async () => {
    const waitFor = async (predicate) => { for (let count = 0; count < 100; count += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Persistence view did not render."); };
    await waitFor(() => (document.body.textContent || "").includes("Browser Test Customer"));
    [...document.querySelectorAll("button")].find((button) => button.textContent?.trim().startsWith("View")).click();
    await waitFor(() => (document.body.textContent || "").includes("0.00") && (document.body.textContent || "").includes("Repayment"));
    return "persistence-confirmed";
  })()
`;

const target = await createTarget();
const cdp = await attach(target.webSocketDebuggerUrl);
try {
  await pause(900);
  await cdp.evaluate(seedExpression);
  await cdp.evaluate("location.reload(); 'reloading';");
  await pause(900);
  const interaction = await cdp.evaluate(interactionExpression);
  await cdp.evaluate("location.reload(); 'reloading';");
  await pause(900);
  const persistence = await cdp.evaluate(persistenceExpression);
  console.log(JSON.stringify({ browserFlow: "passed", interaction, persistence }, null, 2));
} finally {
  cdp.close();
}
