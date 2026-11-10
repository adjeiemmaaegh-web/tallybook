import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildReport, getRecentErrors, initErrorReporting, reportError, resetErrorReportingForTests } from "./errorReporting";

beforeEach(() => { resetErrorReportingForTests(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-10T10:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("error reporting", () => {
  it("keeps errors on the device and sends nothing when no endpoint is configured", () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const beacon = vi.fn(); Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    expect(reportError(new Error("Till exploded"), "manual")).toBe(true);
    expect(getRecentErrors()).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("refuses a non-https endpoint", () => {
    vi.stubEnv("VITE_TALLYBOOK_ERROR_REPORT_URL", "http://insecure.example/report");
    const beacon = vi.fn().mockReturnValue(true); Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    reportError(new Error("x1"));
    expect(beacon).not.toHaveBeenCalled();
  });

  it("posts a scrubbed report to a configured https endpoint", () => {
    vi.stubEnv("VITE_TALLYBOOK_ERROR_REPORT_URL", "https://reports.example/ingest");
    vi.stubEnv("VITE_TALLYBOOK_RELEASE", "abc1234");
    const beacon = vi.fn().mockReturnValue(true); Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    const error = new Error("Cannot read properties of undefined");
    error.stack = "Error: Cannot read properties of undefined\n    at pay (https://tallybook.app/assets/Sales-ab12.js?token=SECRET#frag:10:5)\n    at run (https://tallybook.app/assets/index-cd34.js:1:2)";
    reportError(error, "window");
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("https://reports.example/ingest");
    const report = getRecentErrors()[0];
    expect(report.release).toBe("abc1234");
    expect(report.stack).not.toContain("SECRET");
    expect(report.stack).not.toContain("https://tallybook.app");
    expect(report.stack).toContain("Sales-ab12.js");
  });

  it("never records the query string or hash of the page", () => {
    window.history.replaceState({}, "", "/shop?email=a@b.com&token=zzz#secret");
    const report = buildReport(new Error("boom"), "manual");
    expect(report.path).toBe("/shop");
    expect(JSON.stringify(report)).not.toMatch(/a@b\.com|zzz|secret/);
    window.history.replaceState({}, "", "/");
  });

  it("drops browser noise, collapses duplicates for a minute and caps the session", () => {
    expect(reportError(new Error("ResizeObserver loop completed with undelivered notifications."))).toBe(false);
    expect(reportError("Script error.")).toBe(false);
    // The same failure from the same place is one problem, not many.
    const sameFailure = () => new Error("same");
    expect(reportError(sameFailure())).toBe(true);
    expect(reportError(sameFailure())).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(reportError(sameFailure())).toBe(true);
    let accepted = 0;
    for (let i = 0; i < 50; i++) if (reportError(new Error(`unique-${i}`))) accepted++;
    expect(accepted).toBe(18); // 20 per session minus the two "same" reports above
    expect(getRecentErrors().length).toBeLessThanOrEqual(20);
  });

  it("captures window errors and unhandled rejections once installed", () => {
    initErrorReporting(); initErrorReporting();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("window-failure"), message: "window-failure" }));
    const rejection = new Event("unhandledrejection") as Event & { reason?: unknown };
    rejection.reason = new Error("promise-failure");
    window.dispatchEvent(rejection);
    const sources = getRecentErrors().map(r => `${r.source}:${r.message}`);
    expect(sources).toEqual(["window:window-failure", "promise:promise-failure"]);
  });
});
