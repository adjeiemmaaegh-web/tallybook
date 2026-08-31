const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = process.env.STAGE4_APP_URL ?? "http://127.0.0.4:3000/?stage4=isolated";
const APP_ORIGIN = new URL(APP_URL).origin;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget(url = APP_URL) {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open Stage 4 browser target (${response.status}).`);
  return response.json();
}

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let identifier = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const response = JSON.parse(event.data);
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result);
  });
  const command = async (method, params = {}) => {
    const id = ++identifier;
    const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return response;
  };
  return {
    async evaluate(expression) {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
      return result.result.value;
    },
    command,
    close: () => socket.close(),
  };
}

async function hasControlledCachedShell(cdp) {
  return cdp.evaluate(`(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(() => resolve(null), 10_000))]);
    if (!registration?.active) return false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (navigator.serviceWorker.controller) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  })()`);
}

async function ensureControlledCachedShell(cdp, url) {
  if (await hasControlledCachedShell(cdp)) return true;
  await cdp.command("Page.navigate", { url: `${url}${url.includes("?") ? "&" : "?"}stage4=worker-warmup` });
  await sleep(1_000);
  return hasControlledCachedShell(cdp);
}

const seedLocalRecords = `(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("tallybook-db");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stores = Array.from(db.objectStoreNames);
  const tx = db.transaction(stores, "readwrite");
  const now = new Date().toISOString();
  stores.forEach((store) => tx.objectStore(store).clear());
  tx.objectStore("appMeta").put({ key: "databaseCreatedAt", value: now, updatedAt: now });
  tx.objectStore("appMeta").put({ key: "schemaVersion", value: "8", updatedAt: now });
  tx.objectStore("businessProfiles").put({ id: "primary", name: "Stage 4 Offline Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "", createdAt: now, updatedAt: now });
  tx.objectStore("products").put({ id: "stage4-product", businessProfileId: "primary", name: "Stage 4 Offline Soap", normalizedName: "stage 4 offline soap", sku: "S4-SOAP", categoryId: "uncategorized", sellingPriceMinor: 1000, costPriceMinor: null, stockQuantity: 3, lowStockThreshold: 1, createdAt: now, updatedAt: now });
  tx.objectStore("customers").put({ id: "stage4-customer", businessProfileId: "primary", name: "Stage 4 Offline Customer", normalizedName: "stage 4 offline customer", phone: "+233 20 400 4400", email: "", address: "", notes: "", status: "active", createdAt: now, updatedAt: now });
  tx.objectStore("mobileMoneyProviders").put({ id: "stage4-provider", businessProfileId: "primary", name: "Stage 4 MoMo", normalizedName: "stage 4 momo", active: true, createdAt: now, updatedAt: now });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  return { stores, seeded: true };
})()`;

const offlineWorkflow = `(async () => {
  const copy = () => document.body.innerText || "";
  const hasText = (text) => copy().toLocaleLowerCase().includes(text.toLocaleLowerCase());
  const waitFor = async (predicate, label) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for " + label + ". Screen: " + copy().replace(/\\s+/g, " ").slice(0, 1200));
  };
  const setInput = (element, value) => {
    if (!element) throw new Error("Input was not found.");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const clickText = (selector, text) => {
    const element = [...document.querySelectorAll(selector)].find((node) => node.textContent?.trim() === text || node.textContent?.trim().startsWith(text));
    if (!element) throw new Error("Could not find " + text + ".");
    element.click();
    return element;
  };
  const clickRoute = (href) => {
    const links = [...document.querySelectorAll('a[href="' + href + '"]')];
    const link = links.find((node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0) ?? links[0];
    if (!link) throw new Error("Could not find route " + href + ".");
    link.click();
    return link;
  };
  const choose = async (triggerIndex, optionPrefix) => {
    const trigger = [...document.querySelectorAll('[role="combobox"]')][triggerIndex];
    if (!trigger) throw new Error("Missing select trigger " + triggerIndex + ".");
    trigger.click();
    await waitFor(() => [...document.querySelectorAll('[role="option"]')].some((option) => option.textContent?.trim().startsWith(optionPrefix)), optionPrefix + " option");
    const option = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent?.trim().startsWith(optionPrefix));
    option?.click();
  };

  await waitFor(() => hasText("Offline — changes saved on this device"), "persistent offline status");
  clickRoute("/sales");
  await waitFor(() => hasText("Make a sale."), "sales workspace");
  await choose(0, "Stage 4 Offline Soap");
  clickText("button", "Add");
  await waitFor(() => hasText("Stage 4 Offline Soap") && !hasText("Your cart is empty."), "cart line");
  await choose(1, "Stage 4 Offline Customer");
  await choose(2, "Mobile Money");
  await choose(3, "Stage 4 MoMo");
  clickText("button", "Part payment");
  setInput(document.querySelector('input[aria-describedby="payment-amount-help"]'), "4.00");
  setInput(document.querySelector('input[placeholder="For example, 123456"]'), "S4-MOMO-REF");
  clickText("button", "Complete sale");
  await waitFor(() => hasText("Receipt saved") && document.querySelector("button.sale-complete-action")?.getAttribute("aria-busy") === "false", "saved offline sale");
  clickText("button", "View receipt");
  await waitFor(() => hasText("Stage 4 Offline Shop") && hasText("S4-MOMO-REF"), "offline receipt detail");
  clickText("button", "Done");
  clickRoute("/customers");
  await waitFor(() => hasText("Customers and money owed") && document.querySelector("button.customer-record-main"), "customer workspace");
  const customerControl = document.querySelector("button.customer-record-main");
  if (!customerControl || !customerControl.textContent?.includes("Stage 4 Offline Customer")) throw new Error("Could not find the seeded customer row.");
  customerControl.click();
  await waitFor(() => hasText("Record payment"), "customer debt detail");
  clickText("button", "Record payment");
  await waitFor(() => hasText("Customer pays now (GHS)"), "repayment dialog");
  setInput([...document.querySelectorAll("input")].find((input) => input.parentElement?.parentElement?.textContent?.includes("Customer pays now (GHS)")), "1.00");
  clickText("button", "Save customer payment");
  await waitFor(() => hasText("repayment was recorded"), "offline repayment confirmation");

  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("tallybook-db");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(["sales", "payments", "receipts", "products", "inventoryMovements", "customerActivities", "repayments"], "readonly");
    const sale = tx.objectStore("sales").getAll();
    const payment = tx.objectStore("payments").getAll();
    const receipt = tx.objectStore("receipts").count();
    const product = tx.objectStore("products").get("stage4-product");
    const movements = tx.objectStore("inventoryMovements").count();
    const activities = tx.objectStore("customerActivities").count();
    const repayments = tx.objectStore("repayments").getAll();
    tx.oncomplete = () => resolve({ sales: sale.result, payments: payment.result, receipts: receipt.result, stock: product.result?.stockQuantity, movements: movements.result, activities: activities.result, repayments: repayments.result });
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return {
    offlineStatus: hasText("Offline — changes saved on this device"),
    sales: result.sales.length,
    receipts: result.receipts,
    payments: result.payments.length,
    mobilePayment: result.payments[0] ? { method: result.payments[0].method, amountMinor: result.payments[0].amountMinor, provider: result.payments[0].mobileMoneyProviderName, reference: result.payments[0].mobileMoneyReference } : null,
    stock: result.stock,
    movements: result.movements,
    activities: result.activities,
    repayments: result.repayments.map((repayment) => ({ amountMinor: repayment.amountMinor, method: repayment.method })),
  };
})()`;

const seedTarget = await openTarget();
const seedCdp = await connect(seedTarget.webSocketDebuggerUrl);
try {
  await sleep(900);
  await seedCdp.evaluate(seedLocalRecords);
} finally {
  seedCdp.close();
}

const workflowTarget = await openTarget();
const workflowCdp = await connect(workflowTarget.webSocketDebuggerUrl);
let offlineResult;
let reconnected = false;
try {
  await sleep(1_100);
  if (!await ensureControlledCachedShell(workflowCdp, APP_URL)) throw new Error("The cached application shell was not ready before offline validation.");
  await workflowCdp.command("Network.enable");
  await workflowCdp.command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" });
  offlineResult = await workflowCdp.evaluate(offlineWorkflow);
  await workflowCdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });
  reconnected = await workflowCdp.evaluate(`(async () => { for (let attempt = 0; attempt < 80; attempt += 1) { const text = document.body.innerText || ""; if (text.includes("Connection restored") && text.includes("Nothing was uploaded.")) return true; await new Promise((resolve) => setTimeout(resolve, 50)); } return false; })()`);
} finally {
  try { await workflowCdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" }); } catch { /* Browser target may already be closed. */ }
  workflowCdp.close();
}

const reopenedTarget = await openTarget(`${APP_ORIGIN}/sales?stage4=reopen`);
const reopenedCdp = await connect(reopenedTarget.webSocketDebuggerUrl);
let reopened = null;
try {
  await sleep(1_000);
  if (!await ensureControlledCachedShell(reopenedCdp, `${APP_ORIGIN}/sales?stage4=reopen`)) throw new Error("The reopened tab did not receive the current application shell.");
  reopened = await reopenedCdp.evaluate(`(async () => {
    const copy = () => (document.body.innerText || "").toLocaleLowerCase();
    for (let attempt = 0; attempt < 180; attempt += 1) {
      if (copy().includes("stage 4 offline shop") && copy().includes("s4-momo-ref")) {
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const summary = await new Promise((resolve, reject) => {
          const tx = db.transaction(["sales", "payments", "receipts", "products", "repayments"], "readonly");
          const sales = tx.objectStore("sales").count(); const payments = tx.objectStore("payments").count(); const receipts = tx.objectStore("receipts").count(); const product = tx.objectStore("products").get("stage4-product"); const repayments = tx.objectStore("repayments").count();
          tx.oncomplete = () => resolve({ sales: sales.result, payments: payments.result, receipts: receipts.result, stock: product.result?.stockQuantity, repayments: repayments.result });
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return { shell: true, ...summary };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { shell: false };
  })()`);
} finally {
  reopenedCdp.close();
}

const expected = offlineResult?.offlineStatus
  && offlineResult.sales === 1
  && offlineResult.receipts === 1
  && offlineResult.payments === 1
  && offlineResult.mobilePayment?.method === "mobile"
  && offlineResult.mobilePayment?.amountMinor === 400
  && offlineResult.mobilePayment?.provider === "Stage 4 MoMo"
  && offlineResult.mobilePayment?.reference === "S4-MOMO-REF"
  && offlineResult.stock === 2
  && offlineResult.movements === 1
  && offlineResult.activities === 1
  && offlineResult.repayments.length === 1
  && offlineResult.repayments[0]?.amountMinor === 100
  && offlineResult.repayments[0]?.method === "cash"
  && reconnected
  && reopened?.shell
  && reopened.sales === 1
  && reopened.payments === 1
  && reopened.receipts === 1
  && reopened.stock === 2
  && reopened.repayments === 1;

if (!expected) throw new Error(JSON.stringify({ offlineResult, reconnected, reopened }, null, 2));
console.log(JSON.stringify({ stage4OfflineBrowserFlow: "passed", offlineResult, reconnected, reopened }, null, 2));
