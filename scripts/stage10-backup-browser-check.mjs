/* Stage 10 browser check: disposable loopback IndexedDB only; verifies local export status, restore safeguards, offline operation, and persistence. */
const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = process.env.STAGE10_APP_URL ?? "http://127.0.0.4:3000/backup?stage10=isolated";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget(url = APP_URL) {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open isolated Stage 10 page (${response.status})`);
  return response.json();
}

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  });
  return { command(method, params = {}) { return new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); }); }, evaluate(expression) { return this.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }).then((result) => result.result?.value); }, close() { socket.close(); } };
}

const seed = `(async () => {
  const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = { appMeta: [{ key: "databaseCreatedAt", value: "2026-08-28T10:00:00.000Z", updatedAt: "2026-08-28T10:00:00.000Z" }, { key: "schemaVersion", value: "10", updatedAt: "2026-08-28T10:00:00.000Z" }], businessProfiles: [{ id: "primary", name: "Stage 10 Test Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "", updatedAt: "2026-08-28T10:00:00.000Z" }], categories: [], products: [], inventoryMovements: [], customers: [], sales: [], saleLines: [], payments: [], receipts: [], customerActivities: [], repayments: [], mobileMoneyProviders: [], suppliers: [], purchases: [], purchaseLines: [], expenses: [] };
  await new Promise((resolve, reject) => { const names = Object.keys(records); const transaction = database.transaction(names, "readwrite"); for (const name of names) { const store = transaction.objectStore(name); store.clear(); for (const record of records[name]) store.put(record); } transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); database.close(); return true;
})()`;

const exercise = `(async () => {
  const copy = () => document.body.innerText || "";
  const waitFor = async (predicate, label) => { for (let attempt = 0; attempt < 180; attempt += 1) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("Timed out waiting for " + label + ". " + copy().replace(/\\s+/g, " ").slice(0, 1200)); };
  const findButton = (label) => [...document.querySelectorAll("button")].find((node) => node.textContent?.trim().startsWith(label));
  const click = (label) => { const button = findButton(label); if (!button) throw new Error("Missing button " + label); button.click(); };
  await waitFor(() => copy().includes("Stage 10 Test Shop") && copy().includes("No export recorded on this device yet") && copy().includes("Offline"), "offline backup workspace");
  click("Download local backup");
  await waitFor(() => copy().includes("Backup ready:") && copy().includes("Last export:"), "export status");
  const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tallybook-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const names = [...database.objectStoreNames];
  const readRecords = () => new Promise((resolve, reject) => { const transaction = database.transaction(names, "readonly"); const records = {}; for (const name of names) records[name] = []; for (const name of names) { const request = transaction.objectStore(name).getAll(); request.onsuccess = () => { records[name] = request.result; }; } transaction.oncomplete = () => resolve(records); transaction.onerror = () => reject(transaction.error); });
  const before = await readRecords();
  if (!before.appMeta.some((record) => record.key === "lastBackupAt")) throw new Error("Last export metadata was not saved locally");
  const backup = { kind: "tallybook-local-backup", formatVersion: 1, createdAt: "2026-08-28T10:00:00.000Z", databaseSchemaVersion: 10, records: before };
  await new Promise((resolve, reject) => { const transaction = database.transaction(names, "readwrite"); for (const name of names) transaction.objectStore(name).clear(); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
  const input = document.querySelector('input[type="file"]'); if (!input) throw new Error("Missing backup file input");
  const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(backup)], "stage10-backup.json", { type: "application/json" })); Object.defineProperty(input, "files", { configurable: true, value: transfer.files }); input.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => copy().includes("Backup file checked") && copy().includes("Stage 10 Test Shop"), "checked restore file");
  click("Restore backup"); await waitFor(() => copy().includes("Replace this device’s current records?"), "restore confirmation");
  const replacement = findButton("Replace with backup"); if (!replacement) throw new Error("Missing replacement confirmation"); replacement.click();
  await waitFor(() => copy().includes("Local backup restored") && copy().includes("Last export:"), "restored backup status");
  const after = await readRecords(); database.close();
  return { offline: copy().includes("Offline — changes saved on this device"), exportStatus: copy().includes("Last export:"), restoreConfirmation: true, restoredBusiness: after.businessProfiles?.[0]?.name === "Stage 10 Test Shop", restoredMeta: after.appMeta?.some((record) => record.key === "lastBackupAt"), recordsBefore: Object.fromEntries(Object.entries(before).map(([key, value]) => [key, value.length])), recordsAfter: Object.fromEntries(Object.entries(after).map(([key, value]) => [key, value.length])) };
})()`;

const seedTarget = await openTarget();
const seedCdp = await connect(seedTarget.webSocketDebuggerUrl);
try { await sleep(700); await seedCdp.evaluate(seed); } finally { seedCdp.close(); }
const target = await openTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
let result;
try { await sleep(900); await cdp.command("Network.enable"); await cdp.command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" }); result = await cdp.evaluate(exercise); } finally { try { await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" }); } catch { /* target may already be closed */ } cdp.close(); }
const passed = result?.offline && result?.exportStatus && result?.restoreConfirmation && result?.restoredBusiness && result?.restoredMeta;
if (!passed) throw new Error(JSON.stringify(result, null, 2));
console.log(JSON.stringify({ stage10BackupBrowserOffline: "passed", result }, null, 2));
