/**
 * Minimal, privacy-preserving client error reporting.
 *
 * Offline-first businesses hold customer and money data in the browser, so the
 * default is that NOTHING leaves the device: errors are kept in a small
 * in-memory list for diagnostics only. If a build sets
 * VITE_TALLYBOOK_ERROR_REPORT_URL (https only), each report is POSTed there as
 * JSON. Reports never contain form values, record contents, URLs' query or
 * hash, or tokens: only a short message, a scrubbed stack, the page path, the
 * release label and the browser string.
 */
export interface ErrorReport {
  message: string;
  stack: string | null;
  source: "window" | "promise" | "react" | "manual";
  path: string;
  release: string;
  online: boolean;
  userAgent: string;
  at: string;
}

const MAX_REPORTS_PER_SESSION = 20;
const DUPLICATE_WINDOW_MS = 60_000;
const KEEP_RECENT = 20;

const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
];

let sent = 0;
const recent: ErrorReport[] = [];
const lastSeen = new Map<string, number>();
let installed = false;

export function getRecentErrors(): readonly ErrorReport[] {
  return recent;
}

/** Test hook: clears counters between cases. */
export function resetErrorReportingForTests() {
  sent = 0; recent.length = 0; lastSeen.clear(); installed = false;
}

function endpoint(): string | null {
  const url = import.meta.env.VITE_TALLYBOOK_ERROR_REPORT_URL?.trim();
  return url && /^https:\/\//i.test(url) ? url : null;
}

function scrubStack(stack: string | undefined | null): string | null {
  if (!stack) return null;
  return stack
    // Keep "file.js:line:col" only; drop origins, query strings and hashes.
    .replace(/https?:\/\/[^\s)]+\/([^\s/)?#]+)(\?[^\s):]*)?(#[^\s):]*)?/g, "$1")
    .slice(0, 4000);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error) ?? String(error); } catch { return String(error); }
}

export function buildReport(error: unknown, source: ErrorReport["source"]): ErrorReport {
  return {
    message: messageOf(error).slice(0, 500),
    stack: error instanceof Error ? scrubStack(error.stack) : null,
    source,
    path: typeof location === "undefined" ? "" : location.pathname,
    release: import.meta.env.VITE_TALLYBOOK_RELEASE?.trim() || "dev",
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 200),
    at: new Date().toISOString(),
  };
}

export function reportError(error: unknown, source: ErrorReport["source"] = "manual"): boolean {
  const report = buildReport(error, source);
  if (NOISE.some(rule => rule.test(report.message) || (report.stack !== null && rule.test(report.stack)))) return false;
  if (sent >= MAX_REPORTS_PER_SESSION) return false;

  const key = `${report.message}|${(report.stack ?? "").split("\n")[1] ?? ""}`;
  const now = Date.now();
  const previous = lastSeen.get(key);
  if (previous !== undefined && now - previous < DUPLICATE_WINDOW_MS) return false;
  lastSeen.set(key, now);
  sent++;

  recent.push(report);
  if (recent.length > KEEP_RECENT) recent.shift();

  const url = endpoint();
  if (url) {
    const body = JSON.stringify(report);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
          && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return true;
      void fetch(url, { method: "POST", body, keepalive: true, credentials: "omit", mode: "no-cors",
        headers: { "Content-Type": "text/plain" } }).catch(() => { /* reporting must never throw */ });
    } catch { /* reporting must never throw */ }
  }
  return true;
}

/** Installs the global listeners once. Safe to call from tests and the app entry. */
export function initErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", event => {
    // Resource load failures (images, scripts) arrive without an error object.
    if (!event.error && !event.message) return;
    reportError(event.error ?? event.message, "window");
  });
  window.addEventListener("unhandledrejection", event => reportError(event.reason, "promise"));
}
