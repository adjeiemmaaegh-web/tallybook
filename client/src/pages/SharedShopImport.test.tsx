import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCatalogEntry, ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), catalog: vi.fn(), saveFull: vi.fn(), adjust: vi.fn() }));
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
  adjustShopStock: (_c: string, change: unknown) => shop.adjust(change),
  getShopReadiness: async () => ({ companyId: "biz", saleCount: 1 }),
}));

import SharedShopPage from "./SharedShopPage";
import { ShopRejectedError, ShopUnreachableError } from "@/cloud/shopClient";

const overview: ShopOverview = {
  companyId: "biz", role: "owner", currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [{ id: "old", name: "Sugar", unitPriceMinor: 1000, active: true }],
  stock: [], members: [], pendingInvites: [],
};
const catalog: ProductCatalogEntry[] = [
  { productId: "old", name: "Sugar", unitPriceMinor: 1000, active: true, barcode: "777", category: null, kind: "good", trackStock: true, lowStockThreshold: null, costMinor: null }];

const CSV = [
  "name,price,barcode,category,type,quantity,low_stock,cost",
  "Rice 5kg,90.00,6001,Grains,good,20,5,70.00",
  "Haircut,50,,Salon,service,,,",
  "Sugar,12,,,,,,",            // already in the catalogue
  "Bad price,abc,,,,,,",
].join("\n");

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.overview.mockReset().mockResolvedValue(overview);
  shop.catalog.mockReset().mockResolvedValue(catalog);
  shop.saveFull.mockReset().mockResolvedValue({});
  shop.adjust.mockReset().mockResolvedValue({ quantity: 1 });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

/** The summary bolds its numbers, so match the paragraph's whole text rather than one text node. */
const paragraph = (pattern: RegExp) => screen.findByText((_, el) => el?.tagName === "P" && pattern.test(el.textContent ?? ""));
const csvFile = (text: string, name = "products.csv") => {
  const file = new File([text], name, { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => text });
  return file;
};
async function openImport() {
  render(<SharedShopPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Stock" }));
  fireEvent.click(await screen.findByText("Import products from a file"));
  return screen.getByLabelText("Choose a CSV file of products") as HTMLInputElement;
}
const upload = (input: HTMLInputElement, file: File) => fireEvent.change(input, { target: { files: [file] } });

describe("importing products from a CSV file", () => {
  it("previews what will be added and what is skipped, with the reason for each skipped row", async () => {
    const input = await openImport();
    upload(input, csvFile(CSV));
    expect(await screen.findByText(/ready from products\.csv/)).toHaveTextContent("2 products ready from products.csv, 2 skipped");
    const skipped = within(screen.getByLabelText("Skipped rows"));
    expect(skipped.getByText(/Row 4 · Sugar: .*already in your catalogue/)).toBeInTheDocument();
    expect(skipped.getByText(/Row 5 · Bad price: The price "abc" is not a valid amount/)).toBeInTheDocument();
    expect(screen.getByText(/Opening stock will be added to/)).toHaveTextContent("Madina");
    expect(shop.saveFull).not.toHaveBeenCalled();           // previewing never writes
  });

  it("imports each product with its details and sets opening stock only where given", async () => {
    const input = await openImport();
    upload(input, csvFile(CSV));
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 products" }));
    await paragraph(/2 products added, opening stock set for 1/);
    expect(shop.saveFull).toHaveBeenCalledTimes(2);
    expect(shop.saveFull.mock.calls[0][0]).toMatchObject({ name: "Rice 5kg", unitPriceMinor: 9000, barcode: "6001", category: "Grains", kind: "good", trackStock: true, lowStockThreshold: 5, costMinor: 7000 });
    expect(shop.saveFull.mock.calls[1][0]).toMatchObject({ name: "Haircut", kind: "service", trackStock: false });
    expect(shop.adjust).toHaveBeenCalledTimes(1);
    expect(shop.adjust.mock.calls[0][0]).toMatchObject({ storeId: "st-a", delta: 20, note: "Opening stock (import)" });
  });

  it("does nothing if the owner declines the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const input = await openImport();
    upload(input, csvFile(CSV));
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 products" }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(shop.saveFull).not.toHaveBeenCalled();
  });

  it("reports a refused row and carries on", async () => {
    shop.saveFull.mockRejectedValueOnce(new ShopRejectedError("Another product already uses that barcode")).mockResolvedValue({});
    const input = await openImport();
    upload(input, csvFile(CSV));
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 products" }));
    const list = await screen.findByLabelText("Rows with a problem");
    expect(within(list).getByText(/Row 2 · Rice 5kg: Another product already uses that barcode/)).toBeInTheDocument();
    await paragraph(/1 product added.*1 had a problem/);
  });

  it("stops when the connection drops and tells the owner it is safe to run the same file again", async () => {
    shop.saveFull.mockResolvedValueOnce({}).mockRejectedValueOnce(new ShopUnreachableError("Can't reach Tallybook right now."));
    const input = await openImport();
    upload(input, csvFile(CSV));
    fireEvent.click(await screen.findByRole("button", { name: "Import 2 products" }));
    expect(await screen.findByText(/The import stopped before the end/)).toHaveTextContent("products already added are skipped");
    expect(shop.saveFull).toHaveBeenCalledTimes(2);
  });

  it("explains a file that cannot be used at all, and an oversize file", async () => {
    const input = await openImport();
    upload(input, csvFile("name\nRice\n"));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least “name” and “price”");
    const big = csvFile("name,price\nA,1");
    Object.defineProperty(big, "size", { value: 3_000_000 });
    upload(input, big);
    expect(await screen.findByText(/larger than 2 MB/)).toBeInTheDocument();
  });

  it("needs a store when the file has opening stock", async () => {
    shop.overview.mockResolvedValue({ ...overview, stores: [] });
    const input = await openImport();
    upload(input, csvFile("name,price,quantity\nRice,5,3"));
    expect(await screen.findByText(/a store must be selected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 product" })).toBeDisabled();
  });
});
