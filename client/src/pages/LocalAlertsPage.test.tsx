// S7-04: device notifications are explicit opt-in (a button), denial and unsupported browsers are handled, and the wording is truthful.
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const m = vi.hoisted(() => ({profile: {name: "Test Shop"} as unknown, company: "co1" as string | null, snapshot: vi.fn()}));
vi.mock("@/contexts/BusinessProfileContext", () => ({useBusinessProfile: () => ({profile: m.profile, activeCompanyId: m.company})}));
vi.mock("@/features/inventory/inventory", () => ({getInventorySnapshot: m.snapshot}));
vi.mock("@/features/business/activeCompany", () => ({getActiveBusinessProfileId: () => m.company}));
vi.mock("wouter", () => ({Link: ({children, href}: {children: React.ReactNode; href: string}) => <a href={href}>{children}</a>}));
import LocalAlertsPage from "./LocalAlertsPage";

const product = (id: string, name: string, stock: number, threshold: number) => ({id, name, stockQuantity: stock, lowStockThreshold: threshold, businessProfileId: "co1"});
const original = {Notification: (globalThis as {Notification?: unknown}).Notification, secure: Object.getOwnPropertyDescriptor(window, "isSecureContext")};
let shown: Array<{title: string; body: string}>;
function installNotification(permission: "default" | "granted" | "denied", granted: "granted" | "denied" = "granted") {
  shown = [];
  const N = vi.fn(function (this: unknown, title: string, opts: {body: string}) { shown.push({title, body: opts.body}); }) as unknown as {permission: string; requestPermission: () => Promise<string>};
  N.permission = permission; N.requestPermission = vi.fn(async () => { N.permission = granted; return granted; });
  (globalThis as {Notification?: unknown}).Notification = N; (window as unknown as {Notification?: unknown}).Notification = N;
  return N;
}
beforeEach(() => {
  m.profile = {name: "Test Shop"}; m.company = "co1"; localStorage.clear();
  m.snapshot.mockResolvedValue({products: [product("a", "Rice", 0, 2), product("b", "Oil", 1, 2), product("c", "Salt", 50, 2)]});
  Object.defineProperty(window, "isSecureContext", {configurable: true, value: true});
});
afterEach(() => {
  (globalThis as {Notification?: unknown}).Notification = original.Notification; (window as unknown as {Notification?: unknown}).Notification = original.Notification;
  if (original.secure) Object.defineProperty(window, "isSecureContext", original.secure);
});
const notifyButton = () => screen.getByRole("button", {name: /notif/i});

describe("local stock alerts and device notifications", () => {
  it("shows alerts with no notification permission needed, and asks for nothing on load", async () => {
    const N = installNotification("default");
    render(<LocalAlertsPage />);
    expect(await screen.findByText("Rice")).toBeTruthy(); expect(screen.getByText("Oil")).toBeTruthy(); expect(screen.queryByText("Salt")).toBeNull();
    expect(N.requestPermission).not.toHaveBeenCalled(); expect(shown).toEqual([]);
  });
  it("opt-in is the button press: permission is requested once, a notification is shown, and the message says there is NO background delivery", async () => {
    const N = installNotification("default", "granted");
    render(<LocalAlertsPage />); await screen.findByText("Rice");
    fireEvent.click(notifyButton());
    await waitFor(() => expect(shown).toHaveLength(1));
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
    expect(shown[0].body).toMatch(/2 products need attention in Test Shop/);
    expect(screen.getByText(/while the app is open\. No background delivery is configured/)).toBeTruthy();
  });
  it("denial is respected: no notification, honest message, in-app alerts still there; a stored denial never re-prompts", async () => {
    const N = installNotification("default", "denied");
    render(<LocalAlertsPage />); await screen.findByText("Rice");
    fireEvent.click(notifyButton());
    expect((await screen.findByText(/permission was not granted/)).textContent).toMatch(/still review alerts here/);
    expect(shown).toEqual([]); expect(screen.getByText("Rice")).toBeTruthy();
    const N2 = installNotification("denied");
    fireEvent.click(notifyButton());
    await waitFor(() => expect(screen.getByText(/permission was not granted/)).toBeTruthy());
    expect(N2.requestPermission).not.toHaveBeenCalled();
  });
  it("unsupported or insecure contexts say so and never claim a notification was sent", async () => {
    delete (window as unknown as {Notification?: unknown}).Notification; delete (globalThis as {Notification?: unknown}).Notification;
    render(<LocalAlertsPage />); await screen.findByText("Rice");
    fireEvent.click(notifyButton());
    expect((await screen.findByText(/Device notifications are unavailable here/)).textContent).toMatch(/in-app alerts remain available/);
    const N = installNotification("granted");
    Object.defineProperty(window, "isSecureContext", {configurable: true, value: false});
    fireEvent.click(notifyButton());
    await waitFor(() => expect(screen.getByText(/Device notifications are unavailable here/)).toBeTruthy());
    expect(shown).toEqual([]); expect(N.requestPermission).not.toHaveBeenCalled();
  });
  it("does not notify when the filters hide every alert, and a throwing browser API is reported honestly", async () => {
    installNotification("granted");
    render(<LocalAlertsPage />); await screen.findByText("Rice");
    fireEvent.click(screen.getByLabelText("Out of stock")); fireEvent.click(screen.getByLabelText("Low stock"));
    fireEvent.click(notifyButton());
    expect((await screen.findByText(/No matching stock alerts to notify about/))).toBeTruthy(); expect(shown).toEqual([]);
    fireEvent.click(screen.getByLabelText("Out of stock"));
    (globalThis as {Notification: unknown}).Notification = Object.assign(vi.fn(() => { throw new Error("blocked"); }), {permission: "granted", requestPermission: vi.fn()});
    (window as unknown as {Notification: unknown}).Notification = (globalThis as {Notification: unknown}).Notification;
    fireEvent.click(notifyButton());
    expect((await screen.findByText(/Could not display a device notification/))).toBeTruthy();
  });
  it("damaged saved preferences are reported and locked instead of overwritten", async () => {
    installNotification("granted");
    const {workspaceKey} = await import("@/auth/ownerWorkspace");
    const key = workspaceKey("tallybook:stock-alert-preferences:v1:" + encodeURIComponent("co1"));
    localStorage.setItem(key, "{broken");
    render(<LocalAlertsPage />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/damaged.*have not been overwritten|locked to protect/s);
    expect(localStorage.getItem(key)).toBe("{broken");
    fireEvent.click(screen.getByLabelText("Low stock"));
    expect(localStorage.getItem(key)).toBe("{broken");
  });
  it("without a business it asks for setup and calls nothing", async () => {
    installNotification("granted"); m.profile = null; m.company = null;
    render(<LocalAlertsPage />);
    expect(screen.getByRole("status").textContent).toMatch(/Set up a business/); expect(m.snapshot).not.toHaveBeenCalled();
  });
});
