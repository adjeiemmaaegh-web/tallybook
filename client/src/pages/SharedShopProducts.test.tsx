import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCatalogEntry, ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), catalog: vi.fn(), saveFull: vi.fn(), saveLegacy: vi.fn(), adjust: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "own-1" } } } }),
    getUser: async () => ({ data: { user: { id: "own-1", email: "owner@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: "owner", owner_id: "own-1", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({
  ...(await orig<object>()),
  getShopOverview: shop.overview,
  getProductCatalog: shop.catalog,
  saveShopProductFull: (_c: string, input: unknown) => shop.saveFull(input),
  saveShopProduct: (_c: string, input: unknown) => shop.saveLegacy(input),
  adjustShopStock: (_c: string, input: unknown) => shop.adjust(input),
  getShopReadiness: async () => ({ companyId: "biz", saleCount: 3 }),
}));

import SharedShopPage from "./SharedShopPage";
import { ShopRejectedError, ShopUnreachableError } from "@/cloud/shopClient";

const overview: ShopOverview = {
  companyId: "biz", role: "owner", currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [
    { id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true },
    { id: "cut", name: "Haircut", unitPriceMinor: 5000, active: true },
    { id: "milk", name: "Milk", unitPriceMinor: 800, active: true },
  ],
  stock: [{ storeId: "st-a", productId: "eggs", quantity: 2 }],
  members: [], pendingInvites: [],
};
const entry = (over: Partial<ProductCatalogEntry> & Pick<ProductCatalogEntry, "productId" | "name" | "unitPriceMinor">): ProductCatalogEntry => ({
  active: true, barcode: null, category: null, kind: "good", trackStock: true, lowStockThreshold: null, costMinor: null, ...over });
const catalog: ProductCatalogEntry[] = [
  entry({ productId: "eggs", name: "Eggs", unitPriceMinor: 4500, barcode: "6001", category: "Dairy", lowStockThreshold: 5, costMinor: 3000 }),
  entry({ productId: "cut", name: "Haircut", unitPriceMinor: 5000, kind: "service", trackStock: false, category: "Salon" }),
  entry({ productId: "milk", name: "Milk", unitPriceMinor: 800 }),
];

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  shop.adjust.mockReset().mockResolvedValue({});
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.overview.mockReset().mockResolvedValue(overview);
  shop.catalog.mockReset().mockResolvedValue(catalog);
  shop.saveFull.mockReset().mockResolvedValue({});
  shop.saveLegacy.mockReset().mockResolvedValue({});
});

async function openTab(name: "Stock" | "Sell") {
  render(<SharedShopPage />);
  fireEvent.click(await screen.findByRole("button", { name }));
}
const row = (name: string) => screen.getByText(name, { selector: "strong" }).closest("li") as HTMLElement;

describe("shared shop products: owner form", () => {
  it("shows category, barcode, service and low-stock details, and no stock controls for a service", async () => {
    await openTab("Stock");
    await screen.findByText("Eggs");
    expect(row("Eggs")).toHaveTextContent("Dairy · 6001 · 2 in stock · Low stock");
    expect(row("Haircut")).toHaveTextContent("Salon · Service");
    expect(within(row("Haircut")).queryByRole("button", { name: "Add" })).toBeNull();
    expect(within(row("Eggs")).getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("sends every field to the server in one save, with blanks as null", async () => {
    await openTab("Stock");
    fireEvent.click(await screen.findByRole("button", { name: /Add product/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Rice 5kg " } });
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText(/^Barcode/), { target: { value: " 6001234 " } });
    fireEvent.change(screen.getByLabelText(/^Warn me/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/What it costs you/), { target: { value: "70.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(shop.saveFull).toHaveBeenCalledTimes(1));
    expect(shop.saveFull.mock.calls[0][0]).toMatchObject({
      name: "  Rice 5kg ", unitPriceMinor: 9000, active: true, barcode: "6001234", category: null,
      kind: "good", trackStock: true, lowStockThreshold: 4, costMinor: 7050 });
  });

  it("a service never sends stock settings and hides the stock fields", async () => {
    await openTab("Stock");
    fireEvent.click(await screen.findByRole("button", { name: /Add product/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Massage" } });
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "service" } });
    expect(screen.queryByLabelText(/Count stock/)).toBeNull();
    expect(screen.queryByLabelText(/^Warn me/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(shop.saveFull).toHaveBeenCalled());
    expect(shop.saveFull.mock.calls[0][0]).toMatchObject({ kind: "service", trackStock: false, lowStockThreshold: null });
  });

  it("prefills an existing product, including cost, when editing", async () => {
    await openTab("Stock");
    await screen.findByText("Eggs");
    fireEvent.click(within(row("Eggs")).getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText(/^Barcode/) as HTMLInputElement).value).toBe("6001");
    expect((screen.getByLabelText(/^Category/) as HTMLInputElement).value).toBe("Dairy");
    expect((screen.getByLabelText(/What it costs you/) as HTMLInputElement).value).toBe("30.00");
    expect((screen.getByLabelText(/^Warn me/) as HTMLInputElement).value).toBe("5");
  });

  it("rejects a non-numeric low-stock level in plain words and sends nothing", async () => {
    await openTab("Stock");
    fireEvent.click(await screen.findByRole("button", { name: /Add product/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sugar" } });
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/^Warn me/), { target: { value: "lots" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("low-stock level must be a whole number");
    expect(shop.saveFull).not.toHaveBeenCalled();
  });

  it("shows the server's reason when it refuses (for example a duplicate barcode)", async () => {
    shop.saveFull.mockRejectedValue(new ShopRejectedError("Another product already uses that barcode"));
    await openTab("Stock");
    fireEvent.click(await screen.findByRole("button", { name: /Add product/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sugar" } });
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/^Barcode/), { target: { value: "6001" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another product already uses that barcode");
  });

  it("falls back to name, price and availability on a shop that has not been upgraded, and says so", async () => {
    shop.saveFull.mockRejectedValue(new ShopRejectedError("Unknown shop operations action"));
    await openTab("Stock");
    fireEvent.click(await screen.findByRole("button", { name: /Add product/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sugar" } });
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    await waitFor(() => expect(shop.saveLegacy).toHaveBeenCalledWith(expect.objectContaining({ name: "Sugar", unitPriceMinor: 1000, active: true })));
    expect(await screen.findByRole("status")).toHaveTextContent("need the shop to be updated");
  });
});

describe("shared shop products: the till", () => {
  it("sells a service with no stock but still stops tracked goods at zero", async () => {
    await openTab("Sell");
    await screen.findByText("Haircut");
    const addCut = screen.getByRole("button", { name: "Add one Haircut" });
    expect(addCut).toBeEnabled();
    fireEvent.click(addCut); fireEvent.click(addCut); fireEvent.click(addCut);
    expect(screen.getByLabelText("Haircut in cart")).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "Add one Milk" })).toBeDisabled();           // tracked, zero stock
    const eggs = screen.getByRole("button", { name: "Add one Eggs" });
    fireEvent.click(eggs); fireEvent.click(eggs); fireEvent.click(eggs);
    expect(screen.getByLabelText("Eggs in cart")).toHaveTextContent("2");                     // stops at the 2 in stock
  });

  it("works exactly as before when the shop has no catalogue yet (every product counted)", async () => {
    shop.catalog.mockRejectedValue(new ShopUnreachableError("no catalogue"));
    await openTab("Sell");
    await screen.findByText("Haircut");
    expect(screen.getByRole("button", { name: "Add one Haircut" })).toBeDisabled();           // no stock, so blocked as before
    expect(screen.getByRole("button", { name: "Add one Eggs" })).toBeEnabled();
  });

  it("labels a service and shows the category at the till", async () => {
    await openTab("Sell");
    await screen.findByText("Haircut");
    expect(screen.getByText("Haircut", { selector: "strong" }).closest("li")).toHaveTextContent("Salon · Service");
    expect(screen.getByText("Eggs", { selector: "strong" }).closest("li")).toHaveTextContent("Dairy · 2 in stock");
  });
});

describe("shared shop products: stock console", () => {
  const card = (label: string) => screen.getByText(label, { selector: "span" }).closest("div") as HTMLElement;
  const names = () => screen.getAllByRole("listitem").map(li => li.querySelector("strong")?.textContent).filter(Boolean);

  it("summarises value at cost, counts, low and out of stock for the selected store", async () => {
    await openTab("Stock");
    await screen.findByText("Eggs");
    expect(card("Stock value")).toHaveTextContent("GHS 60.00");              // 2 eggs × 30.00; milk has no stock, the haircut is a service
    expect(card("Products")).toHaveTextContent("3");
    expect(card("Products")).toHaveTextContent("2 counted");
    expect(card("Units on hand")).toHaveTextContent("2");
    expect(card("Low stock")).toHaveTextContent("1");                        // eggs: 2 left, level 5
    expect(card("Out of stock")).toHaveTextContent("1");                     // milk
  });

  it("filters the list by status and by text, and offers a way back from an empty result", async () => {
    await openTab("Stock");
    await screen.findByText("Eggs");
    const chip = (name: string) => within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name });
    fireEvent.click(chip("Out of stock"));
    expect(names()).toEqual(["Milk"]);
    fireEvent.click(chip("Low stock"));
    expect(names()).toEqual(["Eggs"]);
    fireEvent.click(chip("Not counted"));
    expect(names()).toEqual(["Haircut"]);
    fireEvent.click(chip("All"));
    fireEvent.change(screen.getByLabelText("Search your products"), { target: { value: "6001" } });   // Eggs' barcode
    expect(names()).toEqual(["Eggs"]);
    fireEvent.change(screen.getByLabelText("Search your products"), { target: { value: "zzz" } });
    expect(screen.getByText(/No products match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all products" }));
    expect(names()).toHaveLength(3);
  });
});

describe("shared shop stock adjustment safety",()=>{
 it("requires confirmation before removing stock",async()=>{
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
  try{
   await openTab("Stock");
   fireEvent.change(screen.getByLabelText("Units of Eggs"),{target:{value:"1"}});
   fireEvent.click(within(row("Eggs")).getByRole("button",{name:"Remove"}));
   await waitFor(()=>expect(confirm).toHaveBeenCalled());
   expect(shop.adjust).not.toHaveBeenCalled();
  }finally{confirm.mockRestore();}
 });
 it("retries a dropped stock response with the same operation ID, never a fresh one",async()=>{
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(true);
  shop.adjust.mockReset().mockRejectedValueOnce(new ShopUnreachableError("Network dropped")).mockResolvedValueOnce({});
  try{
   await openTab("Stock");
   fireEvent.change(screen.getByLabelText("Units of Eggs"),{target:{value:"1"}});
   fireEvent.click(within(row("Eggs")).getByRole("button",{name:"Remove"}));
   await waitFor(()=>expect(shop.adjust).toHaveBeenCalledTimes(1));
   await screen.findByText(/Stock adjustment not confirmed/);
   const first=shop.adjust.mock.calls[0][0] as {operationId:string};
   expect(first.operationId).toMatch(/^[0-9a-f-]{36}$/i);
   fireEvent.click(within(row("Eggs")).getByRole("button",{name:"Remove"}));
   await waitFor(()=>expect(shop.adjust).toHaveBeenCalledTimes(2));
   expect(shop.adjust.mock.calls[1][0]).toMatchObject({operationId:first.operationId,storeId:"st-a",productId:"eggs",delta:-1});
  }finally{confirm.mockRestore();}
 });
});
