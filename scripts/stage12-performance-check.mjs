/* Read-only Stage 12 performance sample: measures the local development preview without touching business data. */
const DEBUGGING_URL = "http://127.0.0.1:9222";
const APP_URL = "http://127.0.0.4:3000/?stage12=performance";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget() {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(APP_URL)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open performance-check page (${response.status}).`);
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
  await sleep(1500);
  const metrics = await cdp.evaluate(`(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    return entry ? {
      durationMs: Math.round(entry.duration),
      responseStartMs: Math.round(entry.responseStart),
      domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
      loadMs: Math.round(entry.loadEventEnd),
      transferBytes: entry.transferSize,
      resourceCount: performance.getEntriesByType('resource').length,
    } : null;
  })()`);
  if (!metrics || metrics.durationMs < 0 || metrics.resourceCount < 1) throw new Error(`Invalid local performance sample: ${JSON.stringify(metrics)}`);
  console.log(JSON.stringify({ stage12LocalPerformanceSample: "passed", metrics }, null, 2));
} finally {
  cdp.close();
}
