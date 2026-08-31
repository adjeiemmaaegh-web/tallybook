/* Stage 11 browser check: disposable local IndexedDB only; verifies company isolation, company-scoped backup, guarded clear, offline operation, and persistence. */
const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = process.env.STAGE11_APP_URL ?? "http://127.0.0.4:3000/business?view=companies&stage11=isolated";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget(url = APP_URL) {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open isolated Stage 11 page (${response.status})`);
  return response.json();
}
async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id || !pending.has(message.id)) return; const request = pending.get(message.id); pending.delete(message.id); if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result); });
  return { command(method, params = {}) { return new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); }); }, evaluate(expression) { return this.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }).then((response) => { if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "Browser evaluation failed"); return response.result?.value; }); }, close() { socket.close(); } };
}

const seed = `(async () => {
  const requiredStores = ["appMeta", "businessProfiles", "categories", "products", "inventoryMovements", "customers", "sales", "saleLines", "payments", "receipts", "customerActivities", "repayments", "mobileMoneyProviders", "suppliers", "purchases", "purchaseLines", "expenses"];
  const database = await new Promise((resolve, reject) => { const attempt = () => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => { const opened = request.result; if (requiredStores.every((store) => opened.objectStoreNames.contains(store))) resolve(opened); else { opened.close(); setTimeout(attempt, 100); } }; request.onerror = () => reject(request.error); }; attempt(); });
  const now = "2026-08-30T10:00:00.000Z";
  const records = {
    appMeta: [{ key: "databaseCreatedAt", value: now, updatedAt: now }, { key: "schemaVersion", value: "11", updatedAt: now }, { key: "activeBusinessProfileId", value: "primary", updatedAt: now }],
    businessProfiles: [
      { id: "primary", name: "Stage 11 Main Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "", createdAt: now, updatedAt: now },
      { id: "company-two", name: "Stage 11 Catering", country: "Ghana", currency: "GHS", businessType: "Food or restaurant", phone: "", email: "", address: "", createdAt: now, updatedAt: now },
    ],
    categories: [],
    products: [
      { id: "main-product", businessProfileId: "primary", name: "Main soap", normalizedName: "main soap", sku: "", categoryId: "uncategorized", sellingPriceMinor: 1000, costPriceMinor: 500, stockQuantity: 2, lowStockThreshold: 1, createdAt: now, updatedAt: now },
      { id: "second-product", businessProfileId: "company-two", name: "Catering tray", normalizedName: "catering tray", sku: "", categoryId: "uncategorized", sellingPriceMinor: 2000, costPriceMinor: 900, stockQuantity: 4, lowStockThreshold: 1, createdAt: now, updatedAt: now },
    ],
    inventoryMovements: [
      { id: "main-movement", businessProfileId: "primary", productId: "main-product", movementType: "initial", quantityDelta: 2, previousQuantity: 0, resultingQuantity: 2, note: "Main opening stock", createdAt: now },
      { id: "second-movement", businessProfileId: "company-two", productId: "second-product", movementType: "initial", quantityDelta: 4, previousQuantity: 0, resultingQuantity: 4, note: "Catering opening stock", createdAt: now },
    ],
    customers: [
      { id: "main-customer", businessProfileId: "primary", name: "Main customer", normalizedName: "main customer", phone: "+233201111111", email: "", address: "", notes: "Main customer note", status: "active", createdAt: now, updatedAt: now },
      { id: "second-customer", businessProfileId: "company-two", name: "Catering customer", normalizedName: "catering customer", phone: "+233202222222", email: "", address: "", notes: "Catering customer note", status: "active", createdAt: now, updatedAt: now },
    ],
    sales: [
      { id: "main-sale", businessProfileId: "primary", customerId: "main-customer", receiptNumber: "TB-MAIN-001", status: "completed", subtotalMinor: 1000, discountMinor: 0, totalMinor: 1000, amountPaidMinor: 1000, outstandingMinor: 0, paymentMethod: "cash", submissionKey: "main-sale-key", createdAt: now },
      { id: "second-sale", businessProfileId: "company-two", customerId: "second-customer", receiptNumber: "TB-SECOND-001", status: "completed", subtotalMinor: 2000, discountMinor: 0, totalMinor: 2000, amountPaidMinor: 2000, outstandingMinor: 0, paymentMethod: "cash", submissionKey: "second-sale-key", createdAt: now },
    ],
    saleLines: [
      { id: "main-sale-line", saleId: "main-sale", productId: "main-product", businessProfileId: "primary", productName: "Main soap", quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000 },
      { id: "second-sale-line", saleId: "second-sale", productId: "second-product", businessProfileId: "company-two", productName: "Catering tray", quantity: 1, unitPriceMinor: 2000, lineTotalMinor: 2000 },
    ],
    payments: [
      { id: "main-payment", saleId: "main-sale", businessProfileId: "primary", customerId: "main-customer", method: "cash", amountMinor: 1000, createdAt: now },
      { id: "second-payment", saleId: "second-sale", businessProfileId: "company-two", customerId: "second-customer", method: "cash", amountMinor: 2000, createdAt: now },
    ],
    receipts: [
      { id: "main-receipt", saleId: "main-sale", businessProfileId: "primary", receiptNumber: "TB-MAIN-001", issuedAt: now },
      { id: "second-receipt", saleId: "second-sale", businessProfileId: "company-two", receiptNumber: "TB-SECOND-001", issuedAt: now },
    ],
    customerActivities: [], repayments: [], mobileMoneyProviders: [], suppliers: [], purchases: [], purchaseLines: [], expenses: [],
  };
  await new Promise((resolve, reject) => { const names = Object.keys(records); const transaction = database.transaction(names, "readwrite"); for (const name of names) { const store = transaction.objectStore(name); store.clear(); for (const record of records[name]) store.put(record); } transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); database.close(); return true;
})()`;

const exercise = `(async () => {
  const text = () => document.body.innerText || "";
  const waitFor = async (predicate, label) => { for (let attempt = 0; attempt < 220; attempt += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Timed out waiting for " + label + ". " + text().replace(/\\s+/g, " ").slice(0, 1600)); };
  const activeSelect = () => document.querySelector('select[aria-label="Active company"]');
  const setActive = (id) => { const select = activeSelect(); if (!select) throw new Error("Missing active-company selector"); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; setter.call(select, id); select.dispatchEvent(new Event("change", { bubbles: true })); };
  const setInput = (input, value) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); };
  const go = async (href, label) => { window.history.pushState({}, "", href); window.dispatchEvent(new PopStateEvent("popstate")); await waitFor(() => window.location.pathname + window.location.search === href, label); };
  const assertScopedScreen = async (href, ownText, foreignText, label) => { await go(href, label + " route"); await waitFor(() => text().includes(ownText) && !text().includes(foreignText), label + " company-scoped records"); };
  await waitFor(() => text().includes("Stage 11 Main Shop") && text().includes("Stage 11 Catering") && text().includes("Switch without mixing records."), "local company management");
  const localCopy = text().toLowerCase();
  if (!localCopy.includes("on this device") || (!localCopy.includes("no cloud") && !localCopy.includes("automatic upload"))) throw new Error("Missing local-only company boundary copy: " + text().replace(/\\s+/g, " ").slice(0, 1800));
  setActive("company-two");
  await waitFor(() => text().includes("Type “Stage 11 Catering” to confirm") && text().includes("A fresh backup for this company is required first."), "company switch and unbacked state");
  await assertScopedScreen("/inventory", "Catering tray", "Main soap", "Inventory");
  await assertScopedScreen("/customers", "Catering customer", "Main customer", "Customers");
  await assertScopedScreen("/sales", "TB-SECOND-001", "TB-MAIN-001", "Sales");
  await assertScopedScreen("/reports", "TB-SECOND-001", "TB-MAIN-001", "Reports");
  await go("/business?view=companies", "company management return");
  const productsWhileSecond = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => { const database = request.result; const transaction = database.transaction("products", "readonly"); const get = transaction.objectStore("products").getAll(); get.onsuccess = () => { database.close(); resolve(get.result); }; get.onerror = () => reject(get.error); }; request.onerror = () => reject(request.error); });
  if (!productsWhileSecond.some((product) => product.id === "second-product") || !productsWhileSecond.some((product) => product.id === "main-product")) throw new Error("Seeded company records are missing before isolation check");
  const clearButtonBeforeBackup = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes("Clear Stage 11 Catering"));
  if (!clearButtonBeforeBackup || !clearButtonBeforeBackup.disabled) throw new Error("Clear action was not disabled before a company backup");
  const backupLink = [...document.querySelectorAll("a")].find((node) => node.getAttribute("href") === "/backup"); if (!backupLink) throw new Error("Missing Backup route"); backupLink.click();
  await waitFor(() => text().includes("Download local backup") && text().includes("Stage 11 Catering"), "company-scoped backup page");
  const download = [...document.querySelectorAll("button")].find((node) => node.textContent?.trim().startsWith("Download local backup")); if (!download) throw new Error("Missing local backup action"); download.click();
  await waitFor(() => text().includes("Last export for Stage 11 Catering") && text().includes("Backup ready for Stage 11 Catering"), "company-scoped export status");
  const companiesLink = [...document.querySelectorAll("a")].find((node) => node.getAttribute("href") === "/business?view=companies"); if (!companiesLink) throw new Error("Missing Companies route"); companiesLink.click();
  await waitFor(() => text().includes("Stage 11 Catering") && text().toLowerCase().includes("your companies"), "company management after export");
  setActive("primary"); await waitFor(() => text().includes("Type “Stage 11 Main Shop” to confirm") && text().includes("A fresh backup for this company is required first."), "switch to main company");
  setActive("company-two"); await waitFor(() => text().includes("Fresh backup recorded for this company."), "fresh-backup clear gate");
  const clearInput = document.querySelector('input[placeholder="Stage 11 Catering"]'); if (!clearInput) throw new Error("Missing clear confirmation input"); setInput(clearInput, "Stage 11 Catering");
  const clearButton = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes("Clear Stage 11 Catering")); if (!clearButton || clearButton.disabled) throw new Error("Clear action did not unlock after exact company backup and name confirmation"); clearButton.click();
  await waitFor(() => text().includes("The company was cleared from this device") && !text().includes("Stage 11 Catering"), "selected company clear");
  const finalRecords = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => { const database = request.result; const names = ["appMeta", "businessProfiles", "products"]; const transaction = database.transaction(names, "readonly"); const result = {}; for (const name of names) { const get = transaction.objectStore(name).getAll(); get.onsuccess = () => { result[name] = get.result; }; } transaction.oncomplete = () => { database.close(); resolve(result); }; transaction.onerror = () => reject(transaction.error); }; request.onerror = () => reject(request.error); });
  if (!finalRecords.businessProfiles.some((profile) => profile.id === "primary") || finalRecords.businessProfiles.some((profile) => profile.id === "company-two")) throw new Error("Clear removed the wrong company profile");
  if (!finalRecords.products.some((product) => product.id === "main-product") || finalRecords.products.some((product) => product.id === "second-product")) throw new Error("Clear removed or retained the wrong company product");
  if (finalRecords.appMeta.find((record) => record.key === "activeBusinessProfileId")?.value !== "primary") throw new Error("Clear did not select the remaining company");
  return { offline: navigator.onLine === false, switchedCompany: true, unbackedClearDisabled: true, scopedExport: text().includes("The company was cleared from this device"), clearedOnlySelectedCompany: true, remainingCompany: finalRecords.businessProfiles.find((profile) => profile.id === "primary")?.name };
})()`;

const seedTarget = await openTarget();
const seedCdp = await connect(seedTarget.webSocketDebuggerUrl);
try { await sleep(700); await seedCdp.evaluate(seed); } finally { seedCdp.close(); }
const target = await openTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
let result;
try { await sleep(950); await cdp.evaluate(`navigator.serviceWorker?.ready ? navigator.serviceWorker.ready.then(() => true) : true`); await cdp.command("Page.reload", { ignoreCache: false }); await sleep(1000); const serviceWorkerState = await cdp.evaluate(`({ supported: "serviceWorker" in navigator, controlled: Boolean(navigator.serviceWorker?.controller) })`); if (serviceWorkerState.supported && !serviceWorkerState.controlled) throw new Error("PWA service worker did not control the isolated page before offline test: " + JSON.stringify(serviceWorkerState)); await cdp.command("Network.enable"); await cdp.command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" }); result = await cdp.evaluate(exercise); await cdp.command("Page.reload", { ignoreCache: false }); await sleep(1200); const reopened = await cdp.evaluate(`(async () => { for (let attempt = 0; attempt < 120; attempt += 1) { const body = document.body.innerText || ""; if (body.includes("Tallybook Africa") || body.includes("Stage 11 Main Shop") || body.includes("ERR_INTERNET_DISCONNECTED")) return { body, online: navigator.onLine }; await new Promise((resolve) => setTimeout(resolve, 50)); } return { body: document.body.innerText || "", online: navigator.onLine }; })()`); if (!reopened.body.includes("Stage 11 Main Shop") || reopened.body.includes("Stage 11 Catering") || !reopened.body.includes("Saved on this device")) throw new Error("Offline reopen did not preserve the remaining company state: " + JSON.stringify(reopened)); result.reopenedOffline = true; result.reopenedNavigatorOnline = reopened.online; } finally { try { await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" }); } catch { /* target may already be closed */ } cdp.close(); }
if (!result?.offline || !result?.switchedCompany || !result?.unbackedClearDisabled || !result?.clearedOnlySelectedCompany || !result?.reopenedOffline) throw new Error(`Stage 11 browser assertions failed: ${JSON.stringify(result, null, 2)}`);
console.log(JSON.stringify({ stage11MultipleCompaniesBrowserOffline: "passed", result }, null, 2));
