import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "./shopClient";
import type { LocalBooksSnapshot } from "./localBooksExport";

const m = vi.hoisted(() => ({ overview: vi.fn(), importOpening: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: "own" } } } }) } }),
}));
vi.mock("./cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: "owner" }] }));
vi.mock("./shopClient", () => ({ getShopOverview: m.overview, importShopOpening: (_c: string, books: unknown) => m.importOpening(books) }));
vi.mock("./localBooksExport", () => ({ readLocalBooks: m.read }));

import { MoveToSharedShopPanel } from "./MoveToSharedShopPanel";

const overview: ShopOverview = { companyId: "biz", role: "owner", currency: "GHS", members: [], pendingInvites: [], products: [], stock: [],
  stores: [{ id: "st-1", name: "Madina", status: "active" }, { id: "st-2", name: "Osu", status: "active" }] };
const snapshot: LocalBooksSnapshot = { profileId: "main", businessName: "Kwaku (phone)", hasStores: false, skipped: { services: 1, archived: 0 },
  books: { sourceKey: "device:main", currency: "GHS", stores: [], products: [{ localId: "p", name: "Eggs", unitPriceMinor: 4500 }],
    stock: [{ localProductId: "p", quantity: 12 }] } };

beforeEach(() => { m.overview.mockReset(); m.importOpening.mockReset(); m.read.mockReset(); m.read.mockResolvedValue(snapshot); });
const openPanel = () => { render(<MoveToSharedShopPanel database={{} as never} profileId="main" />); fireEvent.click(screen.getByText("Move to the shared shop")); };

describe("move to the shared shop", () => {
  it("sends the phone's books to the store the owner picks and reports what happened", async () => {
    m.overview.mockResolvedValue(overview);
    m.importOpening.mockResolvedValue({ storesCreated: 0, storesReused: 0, productsCreated: 1, productsReused: 0, stockOpened: 1, stockSkipped: 0, unitsOpened: 12 });
    openPanel();
    expect(await screen.findByText(/12 units/)).toBeInTheDocument();
    expect(screen.getByText(/Past sales stay on this phone/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Put the stock in"), { target: { value: "st-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to shared shop" }));
    expect(await screen.findByText(/12 units of stock opened/)).toBeInTheDocument();
    expect(m.importOpening).toHaveBeenCalledWith({ ...snapshot.books, defaultStoreId: "st-2" });
  });

  it("blocks a move between different currencies", async () => {
    m.overview.mockResolvedValue({ ...overview, currency: "NGN" });
    openPanel();
    expect(await screen.findByText(/books are in GHS but/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to shared shop" })).toBeDisabled();
  });

  it("asks the owner to open the shared shop first when it has no currency yet", async () => {
    m.overview.mockResolvedValue({ ...overview, currency: null });
    openPanel();
    await waitFor(() => expect(screen.getByText(/choose its currency first/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Move to shared shop" })).toBeDisabled();
  });
});
