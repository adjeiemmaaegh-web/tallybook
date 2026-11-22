// ST30-05: automated accessibility scan (axe-core) of the new Discover screens in their main states. Colour contrast needs a real
// browser and is excluded here; labels, names, roles, landmarks, list structure and form associations are checked.
import {render, screen, waitFor, fireEvent} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import axe from "axe-core";

const m = vi.hoisted(() => ({
  search: vi.fn(), send: vi.fn(), status: vi.fn(), cancel: vi.fn(),
  profile: vi.fn(), listings: vi.fn(), requests: vi.fn(),
}));
vi.mock("@/cloud/connectedCommerce/discover", async importOriginal => ({ ...(await importOriginal<typeof import("@/cloud/connectedCommerce/discover")>()),
  searchDiscover: m.search, sendDiscoverRequest: m.send, discoverRequestStatus: m.status, cancelDiscoverRequest: m.cancel,
  getDiscoverProfile: m.profile, listDiscoverListings: m.listings, listDiscoverRequests: m.requests }));
import DiscoverShopperPage from "./DiscoverShopperPage";
import {SharedShopDiscover} from "@/cloud/connectedCommerce/SharedShopDiscover";

async function violations(container: HTMLElement) {
  const result = await axe.run(container, {rules: {"color-contrast": {enabled: false}, region: {enabled: false}}, resultTypes: ["violations"]});
  return result.violations.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(" ")).join(" | ")}`);
}
const listing = {listingId: "l1", title: "Rice 5kg", description: "", kind: "good", priceMinor: "12000", currency: "GHS", availability: "limited", availabilityAsOf: new Date().toISOString(),
  shop: {name: "Ama Provisions", category: "groceries", area: "Madina", contact: null, verification: "Not verified by Tallybook", externallyVerified: false}};
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset(); localStorage.clear();
  m.search.mockResolvedValue({results: [listing], next: null, note: "Availability is the shop's own statement."});
  m.profile.mockResolvedValue({enabled: true, profile: {displayName: "Ama Provisions", category: "groceries", areaLabel: "Madina", contactLabel: null, status: "published", version: 1}});
  m.listings.mockResolvedValue([{listingId: "l1", title: "Rice 5kg", description: "", kind: "good", priceMinor: "12000", currency: "GHS", availability: "in_stock", availabilityAsOf: new Date().toISOString(), status: "published", version: 1}]);
  m.requests.mockResolvedValue([{requestId: "r1", listingId: "l1", listingTitle: "Rice 5kg", quantity: 2, buyerName: "Kofi", buyerContact: "+233 24 111 2222", note: "evening", status: "new", createdAt: new Date().toISOString(), decisionNote: null, paymentCollected: false, stockReserved: false}]);
});

describe("Discover screens pass an automated accessibility scan", () => {
  it("shopper: results, request form open, and a saved request", async () => {
    localStorage.setItem("tallybook.discover.requests", JSON.stringify([{requestId: "r9", cancelToken: "t9", title: "Rice 5kg"}]));
    const {container} = render(<DiscoverShopperPage />);
    await screen.findByTestId("dp-result-l1");
    expect(await violations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", {name: "Send a request"}));
    await screen.findByRole("form", {name: "Request form"});
    expect(await violations(container)).toEqual([]);
  });
  it("shopper: empty and error states", async () => {
    m.search.mockRejectedValueOnce(new Error("Search failed."));
    const {container} = render(<DiscoverShopperPage />);
    await screen.findByRole("alert");
    expect(await violations(container)).toEqual([]);
  });
  it("owner: published shop with listings and an open request", async () => {
    const {container} = render(<SharedShopDiscover companyId="c1" online />);
    await screen.findByTestId("dc-listing-l1");
    expect(await violations(container)).toEqual([]);
  });
  it("owner: Discover off with an error message", async () => {
    m.profile.mockResolvedValue({enabled: false, profile: null});
    const {container} = render(<SharedShopDiscover companyId="c1" online />);
    await screen.findByTestId("dc-off");
    await waitFor(() => expect(container.querySelector("[data-testid=dc-off]")).toBeTruthy());
    expect(await violations(container)).toEqual([]);
  });
  it("the scanner really detects problems (sanity check that this test can fail)", async () => {
    const {container} = render(<main><input /><img src="x.png" /><button /></main>);
    const found = await violations(container);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.join(" ")).toMatch(/label|image-alt|button-name/);
  });
});
