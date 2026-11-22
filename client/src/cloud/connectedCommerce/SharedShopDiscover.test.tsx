import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerListing, OwnerRequest } from "./discover";

const m = vi.hoisted(() => ({ profile: vi.fn(), save: vi.fn(), publish: vi.fn(), listings: vi.fn(), saveListing: vi.fn(), confirm: vi.fn(), status: vi.fn(), requests: vi.fn(), decide: vi.fn() }));
vi.mock("./discover", async importOriginal => ({ ...(await importOriginal<typeof import("./discover")>()),
  getDiscoverProfile: m.profile, saveDiscoverProfile: m.save, publishDiscoverProfile: m.publish, listDiscoverListings: m.listings, saveDiscoverListing: m.saveListing,
  confirmDiscoverAvailability: m.confirm, setDiscoverListingStatus: m.status, listDiscoverRequests: m.requests, decideDiscoverRequest: m.decide }));
import { SharedShopDiscover } from "./SharedShopDiscover";

const profile = (over = {}) => ({ displayName: "Ama Provisions", category: "groceries", areaLabel: "Madina", contactLabel: null, status: "draft", version: 1, ...over });
const listing = (over: Partial<OwnerListing> = {}): OwnerListing => ({ listingId: "l1", title: "Rice 5kg", description: "", kind: "good", priceMinor: "12000", currency: "GHS", availability: "in_stock", availabilityAsOf: new Date().toISOString(), status: "published", version: 1, ...over });
const request = (over: Partial<OwnerRequest> = {}): OwnerRequest => ({ requestId: "r1", listingId: "l1", listingTitle: "Rice 5kg", quantity: 2, buyerName: "Kofi", buyerContact: "+233 24 111 2222", note: "evening", status: "new", createdAt: new Date().toISOString(), decisionNote: null, paymentCollected: false, stockReserved: false, ...over });
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); m.listings.mockResolvedValue([]); m.requests.mockResolvedValue([]); });

describe("Discover owner screen", () => {
  it("offline: explains it needs a connection and calls nothing", () => {
    render(<SharedShopDiscover companyId="c1" online={false} />);
    expect(screen.getByRole("status").textContent).toMatch(/Connect to the internet/);
    expect(m.profile).not.toHaveBeenCalled();
  });
  it("when Discover is off it says so, and every action that could make anything public is disabled", async () => {
    m.profile.mockResolvedValue({ enabled: false, profile: profile() });
    m.listings.mockResolvedValue([listing({ status: "unpublished" })]);
    render(<SharedShopDiscover companyId="c1" online />);
    expect((await screen.findByTestId("dc-off")).textContent).toMatch(/Discover is off/);
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Save shop details" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "List again" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add item" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("says a request is not a sale and shows availability with the time the owner confirmed it", async () => {
    m.profile.mockResolvedValue({ enabled: true, profile: profile({ status: "published" }) });
    m.listings.mockResolvedValue([listing()]); m.requests.mockResolvedValue([request()]);
    render(<SharedShopDiscover companyId="c1" online />);
    expect((await screen.findByTestId("dc-listing-l1")).textContent).toMatch(/In stock \(shop confirmed today\)/);
    expect(screen.getAllByText(/not a sale|No payment/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("dc-status").textContent).toMatch(/Published/);
    expect(screen.queryByText(/units left|\d+ (units|in stock|left)/i)).toBeNull();
  });
  it("publishes, with the server deciding; a refusal is shown and nothing is claimed as done", async () => {
    m.profile.mockResolvedValue({ enabled: true, profile: profile() });
    m.publish.mockRejectedValueOnce(new Error("Turn on Tallybook Discover first"));
    render(<SharedShopDiscover companyId="c1" online />);
    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Turn on Tallybook Discover first/));
    expect(screen.queryByText(/^Published\.$/)).toBeNull();
    expect(m.publish).toHaveBeenCalledWith("c1", true);
  });
  it("lists an item with an exact minor-unit price and rejects an invalid price before calling the server", async () => {
    m.profile.mockResolvedValue({ enabled: true, profile: profile() }); m.saveListing.mockResolvedValue({ listingId: "l2" });
    render(<SharedShopDiscover companyId="c1" online />);
    await screen.findByText("Your shop on Discover");
    fireEvent.change(screen.getByLabelText("Item title"), { target: { value: "Rice 5kg" } });
    fireEvent.change(screen.getByLabelText("Item price"), { target: { value: "abc" } });
    expect(screen.getByRole("alert").textContent).toMatch(/valid price/);
    expect((screen.getByRole("button", { name: "Add item" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Item price"), { target: { value: "120.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(m.saveListing).toHaveBeenCalled());
    expect(m.saveListing.mock.calls[0][1]).toMatchObject({ title: "Rice 5kg", priceMinor: 12050, availability: "unknown" });
  });
  it("accept/decline pass the note, say nothing was paid or reserved, and only open requests have buttons", async () => {
    m.profile.mockResolvedValue({ enabled: true, profile: profile({ status: "published" }) });
    m.requests.mockResolvedValue([request(), request({ requestId: "r2", status: "accepted" })]);
    m.decide.mockResolvedValue({ status: "accepted" });
    render(<SharedShopDiscover companyId="c1" online />);
    fireEvent.change(await screen.findByLabelText("Note to Kofi"), { target: { value: "Ready at 5pm" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith("c1", "r1", "accept", "Ready at 5pm"));
    expect(await screen.findByText(/No payment was taken and no stock was held/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
  });
});
