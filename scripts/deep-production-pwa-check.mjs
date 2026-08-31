/* Read-only production PWA check: verifies the built shell on an isolated origin without touching owner records. */
const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.1:4176/?deep-production-pwa";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget() {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open production PWA page (${response.status}).`);
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
    const response = JSON.parse(event.data);
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    response.error ? request.reject(new Error(response.error.message)) : request.resolve(response.result);
  });
  const command = (method, params = {}) => {
    const requestId = ++id;
    const response = new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
    socket.send(JSON.stringify({ id: requestId, method, params }));
    return response;
  };
  return {
    command,
    async evaluate(expression) {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      return result.result.value;
    },
    close: () => socket.close(),
  };
}

const target = await openTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
try {
  await sleep(2_000);
  await cdp.command("Page.reload", { ignoreCache: false });
  await sleep(1_500);
  const online = await cdp.evaluate(`(async () => ({
    controller: Boolean(navigator.serviceWorker?.controller),
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    cacheNames: await caches.keys(),
    visibleShell: Boolean(document.querySelector('.app-frame')) && (document.body.innerText || '').includes('Tallybook'),
  }))()`);
  if (!online.controller || online.registrations < 1 || online.cacheNames.length < 1 || !online.visibleShell) {
    throw new Error(`Production PWA did not activate correctly: ${JSON.stringify(online)}`);
  }
  await cdp.command("Network.enable");
  await cdp.command("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0, connectionType: "none" });
  await cdp.command("Page.reload", { ignoreCache: false });
  await sleep(1_800);
  const offline = await cdp.evaluate(`(async () => {
    const visibleShell = Boolean(document.querySelector('.app-frame')) && (document.body.innerText || '').includes('Tallybook');
    const uncachedNetworkBlocked = await fetch('/__deep-uncached-network-check__.json', { cache: 'no-store' }).then(() => false).catch(() => true);
    return { visibleShell, uncachedNetworkBlocked };
  })()`);
  if (!offline.visibleShell || !offline.uncachedNetworkBlocked) throw new Error(`Production PWA offline reload failed: ${JSON.stringify(offline)}`);
  await cdp.command("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });
  console.log(JSON.stringify({ deepProductionPwaCheck: "passed", online, offline }, null, 2));
} finally {
  cdp.close();
}
