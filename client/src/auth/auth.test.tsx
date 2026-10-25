import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AuthGate } from "./AuthGate";

// Run 4 confines cloud identity to /cloud-account. Local staff and company
// authorization remain in the ledger services and have separate tests.
const cloud = vi.hoisted(() => ({ status: "signed-out" as "signed-out" | "offline" | "error", calls: 0 }));
vi.mock("./useRun4CloudSession", () => ({
  useRun4CloudSession: () => {
    cloud.calls += 1;
    return { state: { status: cloud.status, userId: null, expiresAtEpochMs: null, generation: 0 }, retry: vi.fn(), signOut: vi.fn() };
  },
}));
function mount(path: string) {
  const location = memoryLocation({ path, record: true });
  const view = render(<Router hook={location.hook}><AuthGate enabled signIn={<p>Sign in here</p>}><p>Ledger content</p></AuthGate></Router>);
  return { ...view, location };
}
beforeEach(() => { cloud.status = "signed-out"; cloud.calls = 0; });
afterEach(() => vi.clearAllMocks());
describe("offline-first authentication boundary", () => {
  it.each(["/", "/sales", "/inventory", "/reports", "/backup"])("keeps %s available without invoking cloud identity", path => {
    mount(path);
    expect(screen.getByText("Ledger content")).toBeInTheDocument();
    expect(cloud.calls).toBe(0);
  });
  it("withholds cloud content from a signed-out visitor", () => {
    const { location } = mount("/cloud-account");
    expect(location.history.at(-1)).toBe("/signin");
    expect(cloud.calls).toBe(1);
  });
  it("withholds cloud content offline while directing users to their local business", () => {
    cloud.status = "offline";
    mount("/cloud-account");
    expect(screen.queryByText("Ledger content")).not.toBeInTheDocument();
    expect(screen.getByText(/local Tallybook business remains available/)).toBeInTheDocument();
  });
  it("fails closed on a cloud verification error without erasing local data", () => {
    cloud.status = "error";
    localStorage.setItem("records-marker", "retained");
    mount("/cloud-account");
    expect(screen.queryByText("Ledger content")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No cloud membership has been granted");
    expect(localStorage.getItem("records-marker")).toBe("retained");
  });
});
