import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductCatalogEntry, ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), catalog: vi.fn(), scanned: { value: "0012345678905" } }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "att-1" } } } }),
    getUser: async () => ({ data: { user: { id: "att-1", email: "ama@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: "attendant", owner_id: "own", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({ ...(await orig<object>()), getShopOverview: shop.overview, getProductCatalog: shop.catalog }));
// The real component needs a camera; this stand-in "scans" a fixed code when pressed.
vi.mock("@/components/CameraBarcodeScanner", () => ({
  CameraBarcodeScanner: ({ onScan }: { onScan: (code: string) => void }) =>
    <div role="region" aria-label="Camera barcode scanner"><button type="button" onClick={() => onScan(shop.scanned.value)}>Pretend to scan</button></div>,
}));

import SharedShopPage from "./SharedShopPage";

const overview: ShopOverview = {
  companyId: "biz", role: "attendant", currency: "GHS",
  stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [
    { id: "eggs", name: "Eggs", unitPriceMinor: 4500, active: true },
    { id: "milo", name: "Milo", unitPriceMinor: 3000, active: true },
    { id: "milk", name: "Milk", unitPriceMinor: 800, active: true },
    { id: "cut", name: "Haircut", unitPriceMinor: 5000, active: true },
  ],
  stock: [{ storeId: "st-a", productId: "eggs", quantity: 2 }, { storeId: "st-a", productId: "milo", quantity: 5 }],
  members: [], pendingInvites: [],
};
const entry = (over: Partial<ProductCatalogEntry> & Pick<ProductCatalogEntry, "productId" | "name" | "unitPriceMinor">): ProductCatalogEntry => ({
  active: true, barcode: null, category: null, kind: "good", trackStock: true, lowStockThreshold: null, ...over });
const catalog: ProductCatalogEntry[] = [
  entry({ productId: "eggs", name: "Eggs", unitPriceMinor: 4500, barcode: "6001234567890", category: "Dairy" }),
  entry({ productId: "milo", name: "Milo", unitPriceMinor: 3000, barcode: "012345678905", category: "Drinks" }),
  entry({ productId: "milk", name: "Milk", unitPriceMinor: 800, barcode: "6009999999999", category: "Dairy" }),
  entry({ productId: "cut", name: "Haircut", unitPriceMinor: 5000, kind: "service", trackStock: false, barcode: "SVC-001", category: "Salon" }),
];

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.overview.mockReset().mockResolvedValue(overview);
  shop.catalog.mockReset().mockResolvedValue(catalog);
  shop.scanned.value = "0012345678905";
});

async function till() {
  render(<SharedShopPage />);
  const box = await screen.findByLabelText("Search products or scan a barcode");
  await screen.findByText("Haircut");
  return box as HTMLInputElement;
}
const type = (box: HTMLElement, text: string) => { fireEvent.change(box, { target: { value: text } }); fireEvent.keyDown(box, { key: "Enter" }); };
const inCart = (name: string) => screen.getByLabelText(`${name} in cart`).textContent;

describe("barcode scanning at the shared till", () => {
  it("adds one of the matching product when a barcode is typed or scanned with Enter, and clears the box", async () => {
    const box = await till();
    type(box, "6001234567890\r");
    expect(inCart("Eggs")).toBe("1");
    expect(await screen.findByText("Added Eggs · 1 in the cart")).toBeInTheDocument();
    expect(box.value).toBe("");
    type(box, "6001234567890");
    expect(inCart("Eggs")).toBe("2");
  });

  it("matches the 12-digit UPC and 13-digit EAN forms of the same code", async () => {
    const box = await till();
    type(box, "0012345678905"); // the shelf says 012345678905
    expect(inCart("Milo")).toBe("1");
  });

  it("says when no product has the code, and adds nothing", async () => {
    const box = await till();
    type(box, "9990000000000");
    expect(await screen.findByText(/No product has the barcode 9990000000000\. Ask the owner to add it\./)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "" } });   // the typed code stays in the box, which filters the list
    expect(inCart("Eggs")).toBe("0");
    expect(inCart("Milo")).toBe("0");
  });

  it("refuses an out-of-stock product but sells a service with no stock", async () => {
    const box = await till();
    type(box, "6009999999999"); // Milk: counted, zero stock
    expect(await screen.findByText("Milk is out of stock in this store.")).toBeInTheDocument();
    expect(inCart("Milk")).toBe("0");
    type(box, "SVC-001"); type(box, "SVC-001");
    expect(inCart("Haircut")).toBe("2");
  });

  it("stops at the stock on hand and says how many are already in the cart", async () => {
    const box = await till();
    for (let i = 0; i < 3; i++) type(box, "6001234567890");
    expect(inCart("Eggs")).toBe("2");
    expect(await screen.findByText("No more Eggs available. 2 already in the cart.")).toBeInTheDocument();
  });

  it("opens the camera, adds the scanned product and closes the camera", async () => {
    await till();
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(screen.getByRole("region", { name: "Camera barcode scanner" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pretend to scan" }));   // 0012345678905 = Milo's 12-digit UPC with a leading zero
    expect(inCart("Milo")).toBe("1");
    expect(screen.queryByRole("region", { name: "Camera barcode scanner" })).toBeNull();
  });

  it("never fuzzy-matches a camera scan by name", async () => {
    // A camera value is only ever a barcode: a scan that happens to read "Eggs" must not add the Eggs product.
    shop.scanned.value = "Eggs";
    await till();
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    fireEvent.click(screen.getByRole("button", { name: "Pretend to scan" }));
    expect(await screen.findByText(/No product has the barcode Eggs/)).toBeInTheDocument();
    expect(inCart("Eggs")).toBe("0");
  });

  it("never adds a product from part of a long numeric code", async () => {
    const box = await till();
    type(box, "600123");   // the first digits of Eggs' barcode, but not the whole code
    expect(await screen.findByText(/No product has the barcode 600123/)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: "" } });
    expect(inCart("Eggs")).toBe("0");
  });
});

describe("searching products at the till", () => {
  it("filters by name, category or barcode and explains an empty result", async () => {
    const box = await till();
    fireEvent.change(box, { target: { value: "dairy" } });
    expect(screen.getByText("Eggs", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Milk", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByText("Milo", { selector: "strong" })).toBeNull();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(await screen.findByText(/No products match “zzz”/)).toBeInTheDocument();
  });

  it("Enter on text that matches one product adds it; on several, asks the person to choose", async () => {
    const box = await till();
    type(box, "haircut");
    expect(inCart("Haircut")).toBe("1");
    type(box, "mil");   // Milo and Milk
    expect(await screen.findByText("Several products match. Tap the one you want.")).toBeInTheDocument();
    expect(inCart("Milo")).toBe("0");
    expect(inCart("Milk")).toBe("0");
  });

  it("adding by search never bypasses the stock limit", async () => {
    const box = await till();
    type(box, "milk");
    expect(await screen.findByText("Milk is out of stock in this store.")).toBeInTheDocument();
    expect(inCart("Milk")).toBe("0");
  });
});

