/* Read-only deep route check: navigates isolated browser tabs and writes no owner business data. */
const DEBUGGING_URL = "http://127.0.0.1:9222";
const BASE_URL = "http://127.0.0.4:3000";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openTarget() {
  const response = await fetch(`${DEBUGGING_URL}/json/new?${encodeURIComponent(`${BASE_URL}/?deep-route-check`)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open route-check page (${response.status}).`);
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

const expectedRoutes = [
  ["/", "Home page"],
  ["/business", "Business page"],
  ["/inventory", "Stock page"],
  ["/customers", "Customers page"],
  ["/sales", "Sales page"],
  ["/reports", "Reports page"],
  ["/backup", "Backup page"],
  ["/not-a-ledger-route", "This page is not in your ledger"],
];

const target = await openTarget();
const cdp = await connect(target.webSocketDebuggerUrl);
try {
  const observations = [];
  for (const [path, expectedText] of expectedRoutes) {
    await cdp.command("Page.navigate", { url: `${BASE_URL}${path}?deep-route-check` });
    await sleep(700);
    const observation = await cdp.evaluate(`(() => ({
      hasMain: Boolean(document.querySelector('main')),
      language: document.documentElement.lang,
      text: document.body.innerText,
    }))()`);
    if (!observation.hasMain || observation.language !== "en" || !observation.text.includes(expectedText)) {
      throw new Error(`Route ${path} did not render as expected: ${JSON.stringify(observation)}`);
    }
    observations.push({ path, expectedText });
  }
  console.log(JSON.stringify({ deepRouteCheck: "passed", observations }, null, 2));
} finally {
  cdp.close();
}
