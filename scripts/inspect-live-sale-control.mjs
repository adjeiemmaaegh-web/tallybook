/* Read-only diagnostic for the live Sales page. It never writes IndexedDB or clicks the page. */
const pages = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = pages.find((candidate) => candidate.type === "page" && /127\.0\.0\.(2|3):3000\/sales$/.test(candidate.url));
if (!page) throw new Error("No non-disposable live Sales page is open in the browser.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
const response = await new Promise((resolve, reject) => {
  socket.addEventListener("message", (event) => resolve(JSON.parse(event.data)), { once: true });
  socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { returnByValue: true, expression: `(() => { const button = document.querySelector('button.sale-complete-action'); if (!button) return { found: false, visibleText: document.body.innerText.slice(0, 1200) }; const style = getComputedStyle(button); return { found: true, text: button.textContent?.trim(), disabled: button.disabled, ariaBusy: button.getAttribute('aria-busy'), cursor: style.cursor, opacity: style.opacity, className: button.className, title: button.title || null, checkoutText: button.closest('section')?.innerText ?? '', activeElement: document.activeElement?.tagName }; })()` } }));
  socket.addEventListener("error", reject, { once: true });
});
socket.close();
if (response.error || response.result?.exceptionDetails) throw new Error(response.error?.message ?? response.result?.exceptionDetails?.text ?? "Live control inspection failed.");
console.log(JSON.stringify(response.result.result.value, null, 2));
