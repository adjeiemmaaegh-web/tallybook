import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicListing } from "@/cloud/connectedCommerce/discover";

const m = vi.hoisted(() => ({ search: vi.fn(), send: vi.fn(), status: vi.fn(), cancel: vi.fn() }));
vi.mock("@/cloud/connectedCommerce/discover", async importOriginal => ({ ...(await importOriginal<typeof import("@/cloud/connectedCommerce/discover")>()),
  searchDiscover: m.search, sendDiscoverRequest: m.send, discoverRequestStatus: m.status, cancelDiscoverRequest: m.cancel }));
import DiscoverShopperPage from "./DiscoverShopperPage";

const L = (over: Partial<PublicListing> = {}): PublicListing => ({ listingId: "l1", title: "Rice 5kg", description: "", kind: "good", priceMinor: "12000", currency: "GHS", availability: "limited",
  availabilityAsOf: new Date().toISOString(), shop: { name: "Ama Provisions", category: "groceries", area: "Madina", contact: null, verification: "Not verified by Tallybook", externallyVerified: false }, ...over });
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); localStorage.clear(); m.search.mockResolvedValue({ results: [L()], next: null, note: "Availability is the shop's own statement." }); });
afterEach(() => localStorage.clear());

const fill = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Send a request" }));
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Kofi Mensah" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+233 24 111 2222" } });
};

describe("Discover shopper page", () => {
  it("explains a request is not a purchase and shows the shop's own availability statement with its time; unverified shops are not called verified", async () => {
    render(<DiscoverShopperPage />);
    const row = await screen.findByTestId("dp-result-l1");
    expect(row.textContent).toMatch(/Limited \(shop confirmed today\)/);
    expect(row.textContent).toMatch(/Not verified by Tallybook/);
    expect(row.textContent).not.toMatch(/Verified by Tallybook$/);
    expect(screen.getAllByText(/does not|not buy|Nothing/i).length).toBeGreaterThan(0);
  });
  it("shows an honest empty state", async () => {
    m.search.mockResolvedValue({ results: [], next: null, note: "" });
    render(<DiscoverShopperPage />);
    expect((await screen.findByRole("note")).textContent).toMatch(/only appear after they choose to publish/);
  });
  it("will not send without consent and validates before calling the server", async () => {
    render(<DiscoverShopperPage />); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/agree/);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("sends once with consent, shows nothing-paid/nothing-reserved, and keeps the cancel token on the device", async () => {
    m.send.mockResolvedValue({ requestId: "r1", status: "new", replayed: false, cancelToken: "tok-1", cancelTokenIssued: true, paymentCollected: false, stockReserved: false, accepted: false, message: "Request sent. The shop has not accepted it yet." });
    render(<DiscoverShopperPage />); await fill();
    fireEvent.click(screen.getByLabelText(/may contact me/));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect((await screen.findByTestId("dp-receipt")).textContent).toMatch(/Nothing was paid\. Nothing is reserved/);
    expect(m.send.mock.calls[0][0]).toMatchObject({ listingId: "l1", quantity: 1, consent: true, buyerName: "Kofi Mensah" });
    expect(JSON.parse(localStorage.getItem("tallybook.discover.requests")!)[0]).toMatchObject({ requestId: "r1", cancelToken: "tok-1" });
  });
  it("a failed send keeps the same submission key so the retry cannot create a duplicate", async () => {
    m.send.mockRejectedValueOnce(new Error("Can't reach Tallybook right now.")).mockResolvedValueOnce({ requestId: "r1", status: "new", replayed: true, cancelTokenIssued: false, paymentCollected: false, stockReserved: false, accepted: false });
    render(<DiscoverShopperPage />); await fill();
    fireEvent.click(screen.getByLabelText(/may contact me/));
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(m.send).toHaveBeenCalledTimes(2));
    expect(m.send.mock.calls[0][0].operationKey).toBe(m.send.mock.calls[1][0].operationKey);
  });
  it("saved requests can be checked and cancelled; a server refusal is shown", async () => {
    localStorage.setItem("tallybook.discover.requests", JSON.stringify([{ requestId: "r9", cancelToken: "t9", title: "Rice 5kg" }]));
    m.status.mockResolvedValue({ requestId: "r9", status: "declined", decisionNote: "Sold out" });
    m.cancel.mockRejectedValue(new Error("The shop already answered this request."));
    render(<DiscoverShopperPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Check status" }));
    expect((await screen.findByTestId("dp-status-r9")).textContent).toMatch(/declined — “Sold out”/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already answered/);
  });
  it("survives unavailable or corrupt browser storage", async () => {
    localStorage.setItem("tallybook.discover.requests", "{not json");
    render(<DiscoverShopperPage />);
    expect(await screen.findByTestId("dp-result-l1")).toBeTruthy();
  });
});
