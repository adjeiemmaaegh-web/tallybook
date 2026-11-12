import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShopOverview } from "@/cloud/shopClient";
import type { TelegramStatus } from "@/cloud/telegramClient";

const tg = vi.hoisted(() => ({
  status: vi.fn(),
  create: vi.fn(),
  setCap: vi.fn(),
  unlink: vi.fn(),
  businesses: vi.fn(),
  overview: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
      getUser: async () => ({
        data: { user: { id: "u1", email: "kwaku@demo.test" } },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  }),
}));
vi.mock("@/lib/confirmAction", () => ({ confirmAction: async () => true }));
vi.mock("@/cloud/cloudMembership", () => ({
  listVerifiedCloudBusinesses: tg.businesses,
}));
vi.mock("@/cloud/shopClient", async orig => ({
  ...(await orig<object>()),
  getShopOverview: tg.overview,
  getProductCatalog: async () => [],
  getShopReadiness: async () => ({ companyId: "biz", saleCount: 0 }),
  // Keep the other Team cards quiet so only the Telegram card's alert shows.
  listJoinCodes: async () => ({ codes: [] }),
  getShopRefundPolicy: async () => ({
    companyId: "biz",
    revision: 0,
    refundsEnabled: false,
    allowVoid: true,
    allowPartial: true,
    maxAgeDays: 30,
    effectiveAt: null,
    history: [],
  }),
}));
vi.mock("@/cloud/shopPurchasing", async orig => ({
  ...(await orig<object>()),
  getShopStockAccess: async () => ({ canManageStock: true, members: [] }),
}));
vi.mock("@/cloud/telegramClient", async orig => ({
  ...(await orig<object>()),
  getTelegramStatus: tg.status,
  createTelegramLinkCode: tg.create,
  setTelegramCapability: tg.setCap,
  unlinkTelegramChat: tg.unlink,
}));

import SharedShopPage from "./SharedShopPage";

const overview = (): ShopOverview => ({
  companyId: "biz",
  role: "owner",
  currency: "GHS",
  stores: [],
  products: [],
  stock: [],
  members: [
    { userId: "u1", role: "owner", email: "kwaku@demo.test", storeIds: [] },
  ],
  pendingInvites: [],
});
const status = (over: Partial<TelegramStatus> = {}): TelegramStatus => ({
  companyId: "biz",
  capabilities: {
    dailySummary: true,
    realtimeAlerts: true,
    onDemandQueries: true,
    canRecord: false,
  },
  links: [],
  openCodes: 0,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  tg.businesses
    .mockReset()
    .mockResolvedValue([
      {
        id: "biz",
        name: "Kwaku Provisions",
        role: "owner",
        owner_id: "u1",
        created_at: "",
        updated_at: "",
      },
    ]);
  tg.overview.mockReset().mockImplementation(async () => overview());
  tg.status.mockReset().mockResolvedValue(status());
  tg.create
    .mockReset()
    .mockResolvedValue({
      codeId: "c1",
      code: "AbC123_-xyz",
      expiresAt: "2026-11-12T10:15:00Z",
    });
  tg.setCap
    .mockReset()
    .mockResolvedValue({
      companyId: "biz",
      capabilities: status().capabilities,
    });
  tg.unlink
    .mockReset()
    .mockResolvedValue({ companyId: "biz", chatId: "123", unlinked: true });
});

const openTeam = async () => {
  render(<SharedShopPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Team" }));
};

describe("Telegram settings panel (owner)", () => {
  it("mints a link code and shows the /start instructions when no bot username is configured", async () => {
    await openTeam();
    fireEvent.click(
      await screen.findByRole("button", { name: "Make a link code" })
    );
    expect(
      await screen.findByLabelText("Telegram link code")
    ).toHaveTextContent("AbC123_-xyz");
    expect(screen.getByText(/\/start AbC123_-xyz/)).toBeInTheDocument();
  });

  it("toggles the off-by-default recording capability through the server", async () => {
    await openTeam();
    const record = await screen.findByRole("checkbox", {
      name: /Record sales from Telegram/,
    });
    expect(record).not.toBeChecked();
    fireEvent.click(record);
    await waitFor(() =>
      expect(tg.setCap).toHaveBeenCalledWith("biz", "can_record", true)
    );
  });

  it("lists a linked chat and can unlink it", async () => {
    tg.status.mockResolvedValue(
      status({
        links: [
          {
            chatId: "123",
            role: "owner",
            status: "active",
            tgUsername: "kwaku",
            linkedAt: "2026-11-12T09:00:00Z",
          },
        ],
      })
    );
    await openTeam();
    expect(await screen.findByText("@kwaku")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(tg.unlink).toHaveBeenCalledWith("biz", "123"));
  });

  it("surfaces the server's reason when a code cannot be made", async () => {
    tg.create.mockRejectedValue(
      new Error("There are already 5 open link codes. Use or cancel one first.")
    );
    await openTeam();
    fireEvent.click(
      await screen.findByRole("button", { name: "Make a link code" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already 5 open link codes"
    );
  });
});
