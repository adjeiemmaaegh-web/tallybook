const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.4:3000/end-of-day?stage6=isolated";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget(url = APP_URL) {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open Stage 6 browser target (${response.status}).`);
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
  const stores = Array.from(db.objectStoreNames); const tx = db.transaction(stores, "readwrite"); const now = new Date(); const stamp = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  stores.forEach((store) => tx.objectStore(store).clear());
  tx.objectStore("appMeta").put({ key: "databaseCreatedAt", value: stamp(20), updatedAt: stamp(20) }); tx.objectStore("appMeta").put({ key: "schemaVersion", value: "8", updatedAt: stamp(20) });
  tx.objectStore("businessProfiles").put({ id: "primary", name: "Stage 6 Day Shop", country: "Ghana", currency: "GHS", businessType: "Retail", phone: "", email: "", address: "", createdAt: stamp(20), updatedAt: stamp(20) });
  [{ id: "stage6-ama", businessProfileId: "primary", name: "Stage 6 Ama", normalizedName: "stage 6 ama", phone: "+233 20 606 0001", email: "", address: "", notes: "", status: "active", createdAt: stamp(20), updatedAt: stamp(20) }, { id: "stage6-kojo", businessProfileId: "primary", name: "Stage 6 Kojo", normalizedName: "stage 6 kojo", phone: "+233 20 606 0002", email: "", address: "", notes: "", status: "active", createdAt: stamp(20), updatedAt: stamp(20) }].forEach((record) => tx.objectStore("customers").put(record));
  [{ id: "stage6-oil", businessProfileId: "primary", name: "Stage 6 Cooking Oil", normalizedName: "stage 6 cooking oil", sku: "S6-OIL", categoryId: "uncategorized", sellingPriceMinor: 1000, costPriceMinor: null, stockQuantity: 1, lowStockThreshold: 1, createdAt: stamp(20), updatedAt: stamp(5) }, { id: "stage6-archive", businessProfileId: "primary", name: "Stage 6 Archived Salt", normalizedName: "stage 6 archived salt", sku: "S6-SALT", categoryId: "uncategorized", sellingPriceMinor: 500, costPriceMinor: null, stockQuantity: 0, lowStockThreshold: 1, archivedAt: stamp(2), createdAt: stamp(20), updatedAt: stamp(2) }].forEach((record) => tx.objectStore("products").put(record));
  tx.objectStore("mobileMoneyProviders").put({ id: "stage6-momo", businessProfileId: "primary", name: "Stage 6 MoMo", normalizedName: "stage 6 momo", active: true, createdAt: stamp(20), updatedAt: stamp(20) });
  [{ id: "stage6-cash", businessProfileId: "primary", receiptNumber: "S6-001", status: "completed", subtotalMinor: 1000, discountMinor: 0, totalMinor: 1000, amountPaidMinor: 1000, outstandingMinor: 0, paymentMethod: "cash", submissionKey: "stage6-cash-key", createdAt: stamp(12) }, { id: "stage6-mobile", businessProfileId: "primary", customerId: "stage6-ama", receiptNumber: "S6-002", status: "completed", subtotalMinor: 2500, discountMinor: 0, totalMinor: 2500, amountPaidMinor: 1000, outstandingMinor: 1500, paymentMethod: "mobile", submissionKey: "stage6-mobile-key", createdAt: stamp(10) }, { id: "stage6-card", businessProfileId: "primary", customerId: "stage6-ama", receiptNumber: "S6-003", status: "completed", subtotalMinor: 2000, discountMinor: 0, totalMinor: 2000, amountPaidMinor: 2000, outstandingMinor: 0, paymentMethod: "card", submissionKey: "stage6-card-key", createdAt: stamp(8) }, { id: "stage6-credit", businessProfileId: "primary", customerId: "stage6-kojo", receiptNumber: "S6-004", status: "completed", subtotalMinor: 1250, discountMinor: 0, totalMinor: 1250, amountPaidMinor: 0, outstandingMinor: 1250, paymentMethod: "credit", submissionKey: "stage6-credit-key", createdAt: stamp(6) }].forEach((record) => tx.objectStore("sales").put(record));
  [{ id: "stage6-payment-cash", saleId: "stage6-cash", method: "cash", amountMinor: 1000, createdAt: stamp(12) }, { id: "stage6-payment-mobile", saleId: "stage6-mobile", customerId: "stage6-ama", method: "mobile", amountMinor: 1000, mobileMoneyProviderId: "stage6-momo", mobileMoneyProviderName: "Stage 6 MoMo", mobileMoneyReference: "S6-REF", createdAt: stamp(10) }, { id: "stage6-payment-card", saleId: "stage6-card", customerId: "stage6-ama", method: "card", amountMinor: 2000, createdAt: stamp(8) }].forEach((record) => tx.objectStore("payments").put(record));
  tx.objectStore("repayments").put({ id: "stage6-repayment", businessProfileId: "primary", customerId: "stage6-ama", amountMinor: 500, method: "mobile", submissionKey: "stage6-repayment-key", createdAt: stamp(4) });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); db.close(); return true;
})()`;

const seedTarget = await openTarget(); const seedCdp = await connect(seedTarget.webSocketDebuggerUrl);
try { await sleep(850); await seedCdp.evaluate(seedRecords); } finally { seedCdp.close(); }

const target = await openTarget(); const cdp = await connect(target.webSocketDebuggerUrl); let online; let offline;
try {
  await cdp.command("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }); await sleep(1_200);
  online = await cdp.evaluate(`(async () => { for (let index = 0; index < 160; index += 1) { const text = document.body.innerText || ""; const lower = text.toLocaleLowerCase(); if (lower.includes("optional daily review")) return { sales: text.includes("GHS 67.50") && lower.includes("4 sales completed") && lower.includes("sales recorded today"), received: text.includes("GHS 45.00"), unpaid: text.includes("GHS 27.50"), namedCustomers: lower.includes("named customers served") && text.includes("2"), salesMethods: lower.includes("cash sales") && lower.includes("mobile money sales") && lower.includes("card sales") && lower.includes("credit sales") && text.includes("GHS 25.00") && text.includes("GHS 20.00") && text.includes("GHS 12.50"), receivedMethods: lower.includes("payments actually recorded") && text.includes("GHS 15.00") && text.includes("GHS 20.00"), lowStock: lower.includes("1 low-stock product") && lower.includes("stage 6 cooking oil") && !lower.includes("stage 6 archived salt"), noClose: lower.includes("does not close, reset, or lock your day") && !lower.includes("close day"), debtLink: document.querySelector('a[href="/customers?view=owing"]') !== null, stockLink: document.querySelector('a[href="/inventory"]') !== null }; await new Promise((resolve) => setTimeout(resolve, 50)); } return { timeout: true, screen: (document.body.innerText || "").slice(0, 1400) }; })()`);
  await cdp.command("Network.enable"); await cdp.command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" });
  offline = await cdp.evaluate(`(async () => { for (let index = 0; index < 80; index += 1) { const text = document.body.innerText || ""; const lower = text.toLocaleLowerCase(); if (lower.includes("offline — changes saved on this device")) return { status: true, summary: lower.includes("optional daily review") && text.includes("GHS 67.50") && text.includes("GHS 45.00"), noSync: !lower.includes("sync now") && !lower.includes("uploaded") }; await new Promise((resolve) => setTimeout(resolve, 50)); } return { status: false }; })()`);
} finally { try { await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" }); } catch { /* Browser target may already be closed. */ } cdp.close(); }

if (!online?.sales || !online?.received || !online?.unpaid || !online?.namedCustomers || !online?.salesMethods || !online?.receivedMethods || !online?.lowStock || !online?.noClose || !online?.debtLink || !online?.stockLink || !offline?.status || !offline?.summary || !offline?.noSync) throw new Error(JSON.stringify({ online, offline }, null, 2));
console.log(JSON.stringify({ stage6EndOfDayBrowserFlow: "passed", online, offline }, null, 2));
