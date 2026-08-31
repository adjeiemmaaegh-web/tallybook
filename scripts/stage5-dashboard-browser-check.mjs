const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.4:3000/?stage5=isolated";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget(url = APP_URL) {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open Stage 5 browser target (${response.status}).`);
  return response.json();
}

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let identifier = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => { const response = JSON.parse(event.data); const request = pending.get(response.id); if (!request) return; pending.delete(response.id); response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result); });
  const command = async (method, params = {}) => { const id = ++identifier; const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject })); socket.send(JSON.stringify({ id, method, params })); return response; };
  return { async evaluate(expression) { const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed."); return result.result.value; }, command, close: () => socket.close() };
}

const seedRecords = `(async () => {
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const stores = Array.from(db.objectStoreNames);
  const tx = db.transaction(stores, "readwrite");
  const now = new Date(); const stamp = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  stores.forEach((store) => tx.objectStore(store).clear());
  tx.objectStore("appMeta").put({ key: "databaseCreatedAt", value: stamp(10), updatedAt: stamp(10) });
  tx.objectStore("appMeta").put({ key: "schemaVersion", value: "8", updatedAt: stamp(10) });
  tx.objectStore("businessProfiles").put({ id: "primary", name: "Stage 5 Summary Shop", country: "Ghana", currency: "GHS", businessType: "Retail", phone: "", email: "", address: "", createdAt: stamp(10), updatedAt: stamp(10) });
  tx.objectStore("customers").put({ id: "stage5-customer", businessProfileId: "primary", name: "Stage 5 Ama", normalizedName: "stage 5 ama", phone: "+233 20 555 0505", email: "", address: "", notes: "", status: "active", createdAt: stamp(10), updatedAt: stamp(10) });
  [
    { id: "stage5-oil", businessProfileId: "primary", name: "Stage 5 Cooking Oil", normalizedName: "stage 5 cooking oil", sku: "S5-OIL", categoryId: "uncategorized", sellingPriceMinor: 1000, costPriceMinor: null, stockQuantity: 0, lowStockThreshold: 1, createdAt: stamp(10), updatedAt: stamp(5) },
    { id: "stage5-cable", businessProfileId: "primary", name: "Stage 5 USB Cable", normalizedName: "stage 5 usb cable", sku: "S5-CABLE", categoryId: "uncategorized", sellingPriceMinor: 1250, costPriceMinor: null, stockQuantity: 7, lowStockThreshold: 1, createdAt: stamp(10), updatedAt: stamp(4) },
    { id: "stage5-archived", businessProfileId: "primary", name: "Stage 5 Archived Item", normalizedName: "stage 5 archived item", sku: "S5-OLD", categoryId: "uncategorized", sellingPriceMinor: 500, costPriceMinor: null, stockQuantity: 0, lowStockThreshold: 1, archivedAt: stamp(2), createdAt: stamp(10), updatedAt: stamp(2) },
  ].forEach((record) => tx.objectStore("products").put(record));
  tx.objectStore("mobileMoneyProviders").put({ id: "stage5-provider", businessProfileId: "primary", name: "Stage 5 MoMo", normalizedName: "stage 5 momo", active: true, createdAt: stamp(10), updatedAt: stamp(10) });
  [
    { id: "stage5-sale-cash", businessProfileId: "primary", receiptNumber: "S5-001", status: "completed", subtotalMinor: 1000, discountMinor: 0, totalMinor: 1000, amountPaidMinor: 1000, outstandingMinor: 0, paymentMethod: "cash", submissionKey: "stage5-cash-key", createdAt: stamp(6) },
    { id: "stage5-sale-mobile", businessProfileId: "primary", customerId: "stage5-customer", receiptNumber: "S5-002", status: "completed", subtotalMinor: 2500, discountMinor: 0, totalMinor: 2500, amountPaidMinor: 1000, outstandingMinor: 1500, paymentMethod: "mobile", submissionKey: "stage5-mobile-key", createdAt: stamp(5) },
    { id: "stage5-sale-credit", businessProfileId: "primary", customerId: "stage5-customer", receiptNumber: "S5-003", status: "completed", subtotalMinor: 1250, discountMinor: 0, totalMinor: 1250, amountPaidMinor: 0, outstandingMinor: 1250, paymentMethod: "credit", submissionKey: "stage5-credit-key", createdAt: stamp(4) },
  ].forEach((record) => tx.objectStore("sales").put(record));
  [
    { id: "stage5-line-1", saleId: "stage5-sale-cash", productId: "stage5-oil", productName: "Stage 5 Cooking Oil", quantity: 1, unitPriceMinor: 1000, lineTotalMinor: 1000 },
    { id: "stage5-line-2", saleId: "stage5-sale-mobile", productId: "stage5-cable", productName: "Stage 5 USB Cable", quantity: 2, unitPriceMinor: 1250, lineTotalMinor: 2500 },
    { id: "stage5-line-3", saleId: "stage5-sale-credit", productId: "stage5-cable", productName: "Stage 5 USB Cable", quantity: 1, unitPriceMinor: 1250, lineTotalMinor: 1250 },
  ].forEach((record) => tx.objectStore("saleLines").put(record));
  [
    { id: "stage5-payment-cash", saleId: "stage5-sale-cash", method: "cash", amountMinor: 1000, createdAt: stamp(6) },
    { id: "stage5-payment-mobile", saleId: "stage5-sale-mobile", customerId: "stage5-customer", method: "mobile", amountMinor: 1000, mobileMoneyProviderId: "stage5-provider", mobileMoneyProviderName: "Stage 5 MoMo", mobileMoneyReference: "S5-REF", createdAt: stamp(5) },
  ].forEach((record) => tx.objectStore("payments").put(record));
  [{ id: "stage5-receipt-1", saleId: "stage5-sale-cash", receiptNumber: "S5-001", issuedAt: stamp(6) }, { id: "stage5-receipt-2", saleId: "stage5-sale-mobile", receiptNumber: "S5-002", issuedAt: stamp(5) }, { id: "stage5-receipt-3", saleId: "stage5-sale-credit", receiptNumber: "S5-003", issuedAt: stamp(4) }].forEach((record) => tx.objectStore("receipts").put(record));
  [{ id: "stage5-activity-1", customerId: "stage5-customer", saleId: "stage5-sale-mobile", activityType: "sale", totalMinor: 2500, amountPaidMinor: 1000, outstandingMinor: 1500, createdAt: stamp(5) }, { id: "stage5-activity-2", customerId: "stage5-customer", saleId: "stage5-sale-credit", activityType: "sale", totalMinor: 1250, amountPaidMinor: 0, outstandingMinor: 1250, createdAt: stamp(4) }].forEach((record) => tx.objectStore("customerActivities").put(record));
  tx.objectStore("repayments").put({ id: "stage5-repayment", customerId: "stage5-customer", amountMinor: 500, method: "card", submissionKey: "stage5-repayment-key", createdAt: stamp(3) });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  db.close(); return true;
})()`;

const seedTarget = await openTarget();
const seedCdp = await connect(seedTarget.webSocketDebuggerUrl);
try { await sleep(900); await seedCdp.evaluate(seedRecords); } finally { seedCdp.close(); }

const target = await openTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
let online; let offline;
try {
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await sleep(1_200);
  online = await cdp.evaluate(`(async () => { for (let index = 0; index < 160; index += 1) { const text = document.body.innerText || ""; const lower = text.toLocaleLowerCase(); if (lower.includes("daily business summary")) return { sales: text.includes("GHS 47.50"), collected: text.includes("GHS 25.00"), debt: text.includes("GHS 22.50"), count: lower.includes("sales made") && lower.includes("completed sales today"), lowStock: lower.includes("1 low-stock item") && lower.includes("stage 5 cooking oil") && !lower.includes("stage 5 archived item"), bestSeller: lower.includes("stage 5 usb cable") && lower.includes("3 items sold") && text.includes("GHS 37.50"), repaymentActivity: lower.includes("payment from stage 5 ama") && lower.includes("customer payment"), debtLink: document.querySelector('a[href="/customers?view=owing"]')?.textContent?.toLocaleLowerCase().includes("customers owe") === true, backupUnchanged: document.querySelector('a[href="/backup"]') !== null }; await new Promise((resolve) => setTimeout(resolve, 50)); } return { timeout: true, screen: (document.body.innerText || "").slice(0, 1200) }; })()`);
  await cdp.command("Network.enable");
  await cdp.command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" });
  offline = await cdp.evaluate(`(async () => { for (let index = 0; index < 80; index += 1) { const text = document.body.innerText || ""; const lower = text.toLocaleLowerCase(); if (lower.includes("offline — changes saved on this device")) return { status: true, summary: lower.includes("daily business summary") && lower.includes("stage 5 usb cable") && text.includes("GHS 47.50"), noSync: !lower.includes("sync now") }; await new Promise((resolve) => setTimeout(resolve, 50)); } return { status: false }; })()`);
} finally {
  try { await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" }); } catch { /* Browser target may already be closed. */ }
  cdp.close();
}

if (!online?.sales || !online?.collected || !online?.debt || !online?.count || !online?.lowStock || !online?.bestSeller || !online?.repaymentActivity || !online?.debtLink || !online?.backupUnchanged || !offline?.status || !offline?.summary || !offline?.noSync) throw new Error(JSON.stringify({ online, offline }, null, 2));
console.log(JSON.stringify({ stage5DashboardBrowserFlow: "passed", online, offline }, null, 2));
