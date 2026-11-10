import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCatalogEntry, ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), catalog: vi.fn(), failWrites: { on: false } }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "att-1" } } } }),
    getUser: async () => ({ data: { user: { id: "att-1", email: "ama@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: "attendant", owner_id: "own", created_at: "", updated_at: "" }] }));
// Writes can be made to silently do nothing, as a full or blocked device store does.
vi.mock("@/cloud/secureStorage", async (orig) => {
  const real = await orig<typeof import("@/cloud/secureStorage")>();
  return { ...real, writeSealedJson: async (name: string, value: unknown) => { if (!shop.failWrites.on) await real.writeSealedJson(name, value); } };
});
vi.mock("@/cloud/shopClient", async (orig) => ({ ...(await orig<object>()), getShopOverview: shop.overview, getProductCatalog: shop.catalog }));

import SharedShopPage from "./SharedShopPage";
import { removeSealedPrefix } from "@/cloud/secureStorage";
import { PARKED_PREFIX } from "@/cloud/parkedCarts";

const overview: ShopOverview = {
  companyId: "biz", role: "attendant", currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [
    { id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true },
    { id: "milo", name: "Milo", unitPriceMinor: 3000, active: true },
    { id: "cut", name: "Haircut", unitPriceMinor: 5000, active: true },
  ],
  stock: [{ storeId: "st-a", productId: "eggs", quantity: 10 }, { storeId: "st-a", productId: "milo", quantity: 10 }],
  members: [], pendingInvites: [],
};
const catalog: ProductCatalogEntry[] = [
  { productId: "cut", name: "Haircut", unitPriceMinor: 5000, active: true, barcode: null, category: null, kind: "service", trackStock: false, lowStockThreshold: null }];

beforeEach(async () => {
  localStorage.clear();
  await removeSealedPrefix(PARKED_PREFIX);
  shop.failWrites.on = false;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.overview.mockReset().mockResolvedValue(overview);
  shop.catalog.mockReset().mockResolvedValue(catalog);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

async function till() { const view = render(<SharedShopPage />); await screen.findByText("Haircut"); return view; }
const add = (name: string, times = 1) => { for (let i = 0; i < times; i++) fireEvent.click(screen.getByRole("button", { name: `Add one ${name}` })); };
const inCart = (name: string) => screen.getByLabelText(`${name} in cart`).textContent;
const park = () => fireEvent.click(screen.getByRole("button", { name: "Set this cart aside" }));
const parkedGroup = () => screen.findByRole("group", { name: "Parked carts" });

describe("parking a cart at the shared till", () => {
  it("sets the cart aside, clears the screen and lists it with its count and total", async () => {
    await till();
    expect(screen.getByRole("button", { name: "Set this cart aside" })).toBeDisabled();   // nothing to park yet
    add("Eggs", 2); add("Haircut");
    park();
    const group = await parkedGroup();
    expect(group).toHaveTextContent("3 items · GHS 140.00");
    expect(inCart("Eggs")).toBe("0");
    expect(inCart("Haircut")).toBe("0");
    expect(screen.getByText(/Cart set aside/)).toBeInTheDocument();
  });

  it("resumes the cart exactly as it was and removes it from the parked list", async () => {
    await till();
    add("Eggs", 2); add("Milo");
    park();
    fireEvent.click(await within(await parkedGroup()).findByRole("button", { name: "Resume" }));
    await waitFor(() => expect(inCart("Eggs")).toBe("2"));
    expect(inCart("Milo")).toBe("1");
    expect(screen.queryByRole("group", { name: "Parked carts" })).toBeNull();
    expect(screen.getByText("Cart resumed.")).toBeInTheDocument();
  });

  it("asks before replacing a cart that is already on the screen, and keeps both if declined", async () => {
    await till();
    add("Eggs");
    park();
    await parkedGroup();
    add("Milo", 2);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(within(await parkedGroup()).getByRole("button", { name: "Resume" }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(inCart("Milo")).toBe("2");
    expect(inCart("Eggs")).toBe("0");
    expect(screen.getByRole("group", { name: "Parked carts" })).toBeInTheDocument();
  });

  it("discards only after confirmation", async () => {
    await till();
    add("Eggs"); park();
    const group = await parkedGroup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(within(group).getByRole("button", { name: "Discard" }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(screen.getByRole("group", { name: "Parked carts" })).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(screen.getByRole("group", { name: "Parked carts" })).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Parked carts" })).toBeNull());
  });

  it("is still there after the page is reloaded", async () => {
    const first = await till();
    add("Eggs", 3); park();
    await parkedGroup();
    first.unmount();
    await till();
    expect(await parkedGroup()).toHaveTextContent("3 items · GHS 135.00");
  });

  it("stops at five parked carts and says why", async () => {
    await till();
    for (let i = 0; i < 5; i++) { add("Milo"); park(); await waitFor(() => expect(inCart("Milo")).toBe("0")); }
    expect(await parkedGroup()).toHaveTextContent("Parked carts (5)");
    add("Milo"); park();
    expect(await screen.findByText(/already have 5 parked carts/)).toBeInTheDocument();
    expect(inCart("Milo")).toBe("1");          // not cleared when it could not be parked
  });

  it("keeps the cart on the screen, and says so, when the device cannot store it", async () => {
    await till();
    add("Eggs", 2);
    shop.failWrites.on = true;
    park();
    expect(await screen.findByText(/could not keep the cart/)).toBeInTheDocument();
    expect(inCart("Eggs")).toBe("2");
    expect(screen.queryByRole("group", { name: "Parked carts" })).toBeNull();
  });
});
