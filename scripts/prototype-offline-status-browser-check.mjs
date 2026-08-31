const APP_URL = "http://127.0.0.4:3000/?prototype-offline-status";
const DEBUGGING_URL = "http://127.0.0.1:9222";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget() {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Unable to open the isolated offline status page (${response.status}).`);
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

const target = await openTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
try {
  await sleep(900);
  await cdp.command("Network.enable");
  await cdp.command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" });
  const offlineVisible = await cdp.evaluate(`(async () => { for (let i = 0; i < 80; i += 1) { if ((document.body.innerText || "").toLocaleLowerCase().includes("offline — changes saved on this device")) return true; await new Promise((resolve) => setTimeout(resolve, 50)); } return false; })()`);
  await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });
  const restoredVisible = await cdp.evaluate(`(async () => { for (let i = 0; i < 80; i += 1) { const copy = document.body.innerText || ""; if (copy.includes("Connection restored") && copy.includes("Nothing was uploaded.")) return true; await new Promise((resolve) => setTimeout(resolve, 50)); } return false; })()`);
  if (!offlineVisible || !restoredVisible) throw new Error(JSON.stringify({ offlineVisible, restoredVisible }));
  console.log(JSON.stringify({ prototypeOfflineStatusFlow: "passed", offlineVisible, restoredVisible }, null, 2));
} finally {
  await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" }).catch(() => undefined);
  cdp.close();
}
