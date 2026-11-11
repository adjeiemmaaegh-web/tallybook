import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";

const shop = vi.hoisted(() => ({ overview: vi.fn(), archivedIds: vi.fn(), setArchived: vi.fn(), save: vi.fn(), statement: vi.fn(), role: { value: "owner" as "owner" | "attendant" } }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
    getUser: async () => ({ data: { user: { id: "u1", email: "kwaku@demo.test" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  } }),
}));
vi.mock("@/cloud/cloudMembership", () => ({ listVerifiedCloudBusinesses: async () => [{ id: "biz", name: "Kwaku Provisions", role: shop.role.value, owner_id: "u1", created_at: "", updated_at: "" }] }));
vi.mock("@/cloud/shopClient", async (orig) => ({
  ...(await orig<object>()),
  getShopOverview: shop.overview,
  getProductCatalog: async () => [],
  getShopReadiness: async () => ({ companyId: "biz", saleCount: 3 }),
  getArchivedCustomerIds: shop.archivedIds,
  setShopCustomerArchived: shop.setArchived,
  saveShopCustomer: shop.save,
  getCustomerStatement: shop.statement,
}));
vi.mock("@/cloud/shopPurchasing", async (orig) => ({ ...(await orig<object>()), getShopStockAccess: async () => ({ canManageStock: true, members: [] }) }));

import SharedShopPage from "./SharedShopPage";

const customers = [
  { id: "c1", name: "Ama", phone: "0240000001", creditLimitMinor: 100000, balanceMinor: 3000 },
  { id: "c2", name: "Kofi", phone: "0240000002", creditLimitMinor: 50000, balanceMinor: 0 },
  { id: "c3", name: "Esi", phone: null, creditLimitMinor: 0, balanceMinor: 0 },
];
const overview = (role: "owner" | "attendant"): ShopOverview => ({
  companyId: "biz", role, currency: "GHS", stores: [{ id: "st-a", name: "Madina", status: "active" }],
  products: [], stock: [], members: [{ userId: "u1", role: "owner", email: "kwaku@demo.test", storeIds: [] }], pendingInvites: [], customers,
  myPermissions: { canDiscount: false, maxDiscountBps: 0, canCredit: true }, memberPermissions: {},
});
const statementOf = (c: typeof customers[number]) => ({ ...c, entries: [
  { kind: "credit_sale", amountMinor: 3000, balanceAfterMinor: 3000, receiptNumber: 7, method: null, reference: null, recordedAt: "2026-11-02T10:00:00Z" }] });

let archived: string[] = [];
beforeEach(() => {
  localStorage.clear(); archived = [];
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  shop.role.value = "owner";
  shop.overview.mockReset().mockImplementation(async () => overview(shop.role.value));
  shop.archivedIds.mockReset().mockImplementation(async () => ({ customerIds: archived }));
  shop.setArchived.mockReset().mockImplementation(async (_c: string, id: string, a: boolean) => { archived = a ? [...archived, id] : archived.filter(x => x !== id); return { customerId: id, archived: a }; });
  shop.save.mockReset().mockResolvedValue({});
  shop.statement.mockReset().mockImplementation(async (_c: string, id: string) => statementOf(customers.find(c => c.id === id)!));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

async function openCustomers() {
  render(<SharedShopPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Customers" }));
}
const row = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("customers: edit, archive, statement", () => {
  it("the owner edits a customer's name and phone", async () => {
    await openCustomers();
    fireEvent.click(await screen.findByRole("button", { name: /^Ama/ }));
    const name = await screen.findByDisplayValue("Ama");
    fireEvent.change(name, { target: { value: "Ama Boateng" } });
    fireEvent.change(screen.getByDisplayValue("0240000001"), { target: { value: "0240000099" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(shop.save).toHaveBeenCalledWith("biz", { customerId: "c1", name: "Ama Boateng", phone: "0240000099" }));
    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
  });

  it("only a customer who owes nothing can be archived; archiving hides them and Restore brings them back", async () => {
    await openCustomers();
    fireEvent.click(await screen.findByRole("button", { name: /^Ama/ }));
    expect(await screen.findByRole("button", { name: "Archive customer" })).toBeDisabled();
    expect(screen.getByText("Can be archived once they owe nothing.")).toBeInTheDocument();
    fireEvent.click(row("Ama"));
    fireEvent.click(row("Kofi"));
    fireEvent.click(await screen.findByRole("button", { name: "Archive customer" }));
    await waitFor(() => expect(shop.setArchived).toHaveBeenCalledWith("biz", "c2", true));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Kofi/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^Ama/ })).toBeInTheDocument();
    const section = screen.getByText("Archived (1)").closest("details") as HTMLElement;
    fireEvent.click(within(section).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(shop.setArchived).toHaveBeenCalledWith("biz", "c2", false));
    expect(await screen.findByRole("button", { name: /^Kofi/ })).toBeInTheDocument();
  });

  it("an older server without the archive shows every customer", async () => {
    shop.archivedIds.mockRejectedValue(new Error("Unknown shop operations action"));
    await openCustomers();
    for (const n of ["Ama", "Kofi", "Esi"]) expect(await screen.findByRole("button", { name: new RegExp(`^${n}`) })).toBeInTheDocument();
    expect(screen.queryByText(/Archived \(/)).toBeNull();
  });

  it("an attendant never sees the archive controls or archived customers", async () => {
    shop.role.value = "attendant"; archived = ["c2"];
    await openCustomers();
    fireEvent.click(await screen.findByRole("button", { name: /^Ama/ }));
    await screen.findByText("History");
    expect(screen.queryByRole("button", { name: "Archive customer" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Kofi/ })).toBeNull();
    expect(screen.queryByText(/Archived \(/)).toBeNull();
  });

  it("a statement can be shared on WhatsApp to the customer's number, and printed", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await openCustomers();
    fireEvent.click(await screen.findByRole("button", { name: /^Ama/ }));
    await screen.findByText("History");
    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    const url = String(open.mock.calls[0][0]);
    expect(url).toContain("wa.me/233240000001");
    expect(decodeURIComponent(url)).toContain("Statement for Ama");
    expect(decodeURIComponent(url)).toContain("Balance owed");
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
    expect(screen.getByLabelText("Statement for Ama")).toHaveAttribute("data-printing", "true");
  });
});
