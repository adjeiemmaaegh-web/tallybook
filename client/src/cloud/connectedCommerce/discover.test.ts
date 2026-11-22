import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ callShop: vi.fn() }));
vi.mock("../shopClient", () => ({
  callShop: m.callShop,
  ShopRejectedError: class ShopRejectedError extends Error {},
  ShopUnreachableError: class ShopUnreachableError extends Error {},
}));
import { ShopRejectedError, ShopUnreachableError } from "../shopClient";
import {
  DiscoverError, availabilityText, cancelDiscoverRequest, confirmDiscoverAvailability, decideDiscoverRequest, discoverRequestStatus, formatDiscoverPrice, getDiscoverListing,
  getDiscoverProfile, listDiscoverListings, listDiscoverRequests, parseDiscoverError, publishDiscoverProfile, saveDiscoverListing, saveDiscoverProfile, searchDiscover,
  sendDiscoverRequest, setDiscoverListingStatus, validateRequestDraft, type RequestDraft,
} from "./discover";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
beforeEach(() => m.callShop.mockReset());
const draft = (over: Partial<RequestDraft> = {}): RequestDraft => ({ listingId: crypto.randomUUID(), quantity: 2, buyerName: "Kofi Mensah", buyerContact: "+233 24 111 2222", note: "", consent: true, operationKey: crypto.randomUUID(), ...over });

describe("Discover client contract", () => {
  it("owner calls target the owner-only RPC and generate fresh operation keys; shopper calls target the public RPC", async () => {
    m.callShop.mockResolvedValue({ listings: [], requests: [] });
    await getDiscoverProfile("c1"); await saveDiscoverProfile("c1", { displayName: "Ama", category: "groceries", areaLabel: "Madina" });
    await publishDiscoverProfile("c1", true); await publishDiscoverProfile("c1", false); await listDiscoverListings("c1");
    await saveDiscoverListing("c1", { title: "Rice", description: "", kind: "good", priceMinor: 100, currency: "GHS", availability: "in_stock" });
    await confirmDiscoverAvailability("c1", "l1", "limited"); await setDiscoverListingStatus("c1", "l1", "removed");
    await listDiscoverRequests("c1"); await decideDiscoverRequest("c1", "r1", "accept", " ok ");
    const owner = m.callShop.mock.calls.splice(0);
    for (const c of owner) expect(c[2]).toBe("tallybook_cc_discover");
    expect(owner.map(c => c[0])).toEqual(["getProfile", "saveProfile", "publishProfile", "unpublishProfile", "listListings", "saveListing", "confirmAvailability", "setListingStatus", "listRequests", "decideRequest"]);
    expect(owner[2][1].operationKey).toMatch(UUID); expect(owner[2][1].operationKey).not.toBe(owner[3][1].operationKey);
    expect(owner[9][1]).toMatchObject({ decision: "accept", note: "ok" });
    m.callShop.mockResolvedValue({ results: [] });
    await searchDiscover({ q: "rice" }); await getDiscoverListing("l1"); await sendDiscoverRequest(draft()); await discoverRequestStatus("r1", "tok"); await cancelDiscoverRequest("r1", "tok");
    for (const c of m.callShop.mock.calls) expect(c[2]).toBe("tallybook_cc_discover_public");
  });
  it("a caller-supplied operation key is preserved so a retry replays instead of duplicating", async () => {
    m.callShop.mockResolvedValue({}); const k = crypto.randomUUID(); const d = draft({ operationKey: k });
    await sendDiscoverRequest(d); await sendDiscoverRequest(d);
    expect(m.callShop.mock.calls.map(c => c[1].operationKey)).toEqual([k, k]);
  });
  it("server errors map to friendly, whitelisted copy; unknown server text is never echoed; network errors keep their retry meaning", async () => {
    for (const [raw, code] of [["CC:REQUIRES_CONFIRMATION Turn on", "REQUIRES_CONFIRMATION"], ["CC:RATE_LIMITED Too many", "RATE_LIMITED"], ["CC:NOT_FOUND Listing not found", "NOT_FOUND"], ["CC:CONFLICT x", "CONFLICT"], ["CC:STALE_VERSION x", "STALE_VERSION"]] as const) {
      m.callShop.mockRejectedValueOnce(new ShopRejectedError(raw));
      await expect(sendDiscoverRequest(draft())).rejects.toMatchObject({ code });
    }
    m.callShop.mockRejectedValueOnce(new ShopRejectedError("relation \"cc_discover_requests\" does not exist"));
    const e = await sendDiscoverRequest(draft()).catch(x => x as DiscoverError);
    expect(e.code).toBe("UNKNOWN"); expect(e.message).not.toMatch(/relation|cc_discover/);
    expect(parseDiscoverError(new ShopRejectedError("Invalid areaLabel (use a town or neighbourhood, not coordinates)")).message).toMatch(/town or neighbourhood/);
    m.callShop.mockRejectedValueOnce(new ShopUnreachableError("offline"));
    await expect(sendDiscoverRequest(draft())).rejects.toBeInstanceOf(ShopUnreachableError);
  });
});

describe("request validation mirrors the server limits (the server still decides)", () => {
  it("accepts a good draft and refuses missing consent, bad quantity, name, phone and note", () => {
    expect(validateRequestDraft(draft())).toBeNull();
    expect(validateRequestDraft(draft({ consent: false }))).toMatch(/agree/);
    for (const q of [0, 21, 1.5, NaN]) expect(validateRequestDraft(draft({ quantity: q }))).toMatch(/1 to 20/);
    expect(validateRequestDraft(draft({ buyerName: "K" }))).toMatch(/name/);
    expect(validateRequestDraft(draft({ buyerName: "Bad\u0007Name" }))).toMatch(/name/);
    expect(validateRequestDraft(draft({ buyerContact: "call me" }))).toMatch(/phone/);
    expect(validateRequestDraft(draft({ note: "x".repeat(201) }))).toMatch(/note/);
  });
  it("trims what it sends", async () => {
    m.callShop.mockResolvedValue({});
    await sendDiscoverRequest(draft({ buyerName: "  Kofi  ", buyerContact: " +233 24 111 2222 ", note: "  hi " }));
    expect(m.callShop.mock.calls[0][1]).toMatchObject({ buyerName: "Kofi", buyerContact: "+233 24 111 2222", note: "hi" });
  });
});

describe("display helpers are honest", () => {
  it("formats minor units and never invents a price", () => {
    expect(formatDiscoverPrice(null, "GHS")).toBe("Ask the shop");
    expect(formatDiscoverPrice("not a number", "GHS")).toBe("Ask the shop");
    expect(formatDiscoverPrice("12000", "GHS")).toMatch(/120/);
    expect(formatDiscoverPrice("12000", "???")).toMatch(/minor units/);
  });
  it("states WHEN the shop confirmed availability, and never a stock count", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");
    expect(availabilityText("in_stock", "2026-11-22T08:00:00Z", now)).toBe("In stock (shop confirmed today)");
    expect(availabilityText("limited", "2026-11-21T08:00:00Z", now)).toBe("Limited (shop confirmed yesterday)");
    expect(availabilityText("out_of_stock", "2026-11-10T08:00:00Z", now)).toBe("Out of stock (shop confirmed 12 days ago)");
    expect(availabilityText("unknown", "garbage", now)).toBe("Ask the shop");
    expect(availabilityText("in_stock", "2026-11-22T08:00:00Z", now)).not.toMatch(/\d+ (units|left|in stock)/i);
  });
});
