/* Disposable Sales UI reproduction check: uses a separate loopback origin and never opens owner records. */
const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.4:3000/sales?stage6repair=isolated";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget() {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open isolated sales page (${response.status}).`);
  return response.json();
}

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let identifier = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => { const response = JSON.parse(event.data); const request = pending.get(response.id); if (!request) return; pending.delete(response.id); response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result); });
  return {
    async evaluate(expression) {
      const id = ++identifier;
      const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      const result = await response;
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
      return result.result.value;
    },
    close: () => socket.close(),
  };
}

const seed = `
  (async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const stores = ["appMeta", "businessProfiles", "categories", "products", "inventoryMovements", "customers", "sales", "saleLines", "payments", "receipts", "customerActivities", "repayments"];
    const transaction = db.transaction(stores, "readwrite");
    const now = "2026-08-25T00:00:00.000Z";
    stores.forEach((store) => transaction.objectStore(store).clear());
    transaction.objectStore("appMeta").put({ key: "databaseCreatedAt", value: now, updatedAt: now });
    transaction.objectStore("appMeta").put({ key: "schemaVersion", value: "7", updatedAt: now });
    transaction.objectStore("businessProfiles").put({ id: "primary", name: "Browser Sales Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: now, updatedAt: now });
    transaction.objectStore("products").put({ id: "browser-product", businessProfileId: "primary", name: "Browser Product", normalizedName: "browser product", categoryId: "uncategorized", sellingPriceMinor: 1000000, stockQuantity: 3, lowStockThreshold: 1, createdAt: now, updatedAt: now });
    transaction.objectStore("customers").put({ id: "browser-customer", businessProfileId: "primary", name: "Browser Customer", normalizedName: "browser customer", phone: "+233 20 000 7878", status: "active", createdAt: now, updatedAt: now });
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
    db.close();
    return "seeded";
  })()
`;

const exercise = `
  (async () => {
    const copy = () => document.body.innerText || "";
    const waitFor = async (predicate, label) => { for (let attempt = 0; attempt < 120; attempt += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Timed out waiting for " + label + ". Screen: " + copy().replace(/\\s+/g, " ").slice(0, 700)); };
    const setInput = (element, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); };
    const buttonWithText = (label) => [...document.querySelectorAll("button")].find((element) => element.textContent?.trim().startsWith(label));
    const completeButton = () => document.querySelector("button.sale-complete-action");
    const choose = async (labelText, optionText) => {
      const label = [...document.querySelectorAll("label")].find((element) => element.querySelector("span")?.textContent?.trim() === labelText);
      const trigger = label?.querySelector('[role="combobox"]');
      if (!trigger) throw new Error("Missing select trigger for " + labelText);
      trigger.click();
      await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((option) => option.textContent?.startsWith(optionText)), optionText + " option");
      [...document.querySelectorAll('[role="option"]')].find((option) => option.textContent?.startsWith(optionText)).click();
    };
    await waitFor(() => copy().includes("1 READY TO SELL"), "seeded sales data");
    const productTrigger = [...document.querySelectorAll('[role="combobox"]')][0];
    productTrigger.click();
    await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((option) => option.textContent?.startsWith("Browser Product")), "product option");
    [...document.querySelectorAll('[role="option"]')].find((option) => option.textContent?.startsWith("Browser Product")).click();
    await waitFor(() => productTrigger.textContent?.includes("Browser Product"), "selected product");
    buttonWithText("Add").click();
    await waitFor(() => copy().includes("Browser Product") && !copy().includes("Your cart is empty."), "cart line");
    await choose("Customer", "Browser Customer");
    const amount = document.querySelector('input[aria-describedby="payment-amount-help"]');
    setInput(amount, "10,000.00");
    await new Promise((resolve) => setTimeout(resolve, 100));
    completeButton().click();
    await new Promise((resolve) => setTimeout(resolve, 900));
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const saleCount = await new Promise((resolve, reject) => { const request = db.transaction("sales", "readonly").objectStore("sales").count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close();
    if (saleCount !== 1 || completeButton().disabled || !completeButton().textContent?.includes("Complete sale") || completeButton().getAttribute("aria-busy") !== "false") throw new Error(JSON.stringify({ saleCount, label: completeButton().textContent?.trim(), disabled: completeButton().disabled, busy: completeButton().getAttribute("aria-busy") }));
    return { saleCount, completionControlLabel: completeButton().textContent?.trim(), completionControlDisabled: completeButton().disabled, completionControlBusy: completeButton().getAttribute("aria-busy"), receiptVisible: copy().includes("Receipt saved") };
  })()
`;

const target = await openTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
try {
  await sleep(800);
  await cdp.evaluate(seed);
  await cdp.evaluate("location.reload(); 'reloading';");
  await sleep(900);
  console.log(JSON.stringify({ salesBrowserFlow: "passed", result: await cdp.evaluate(exercise) }, null, 2));
} finally { cdp.close(); }
