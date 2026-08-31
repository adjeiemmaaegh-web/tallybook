/** Tallybook Africa Stage 2 regression: Home must take an owner directly to people who owe money without creating another debt total. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/reports/reports", () => ({
  getDashboardSummary: vi.fn().mockResolvedValue({
    generatedAt: "2026-08-26T00:00:00.000Z",
    todaySalesMinor: 4000,
    todayMoneyReceivedMinor: 2000,
    outstandingDebtMinor: 1500,
    todayTransactions: 2,
    lowStockProducts: [],
    recentSales: [],
    bestSeller: { productId: "product-1", productName: "USB-C Cable", quantity: 3, salesMinor: 4000 },
    recentActivity: [{ id: "sale-1", type: "sale", label: "Walk-in sale", amountMinor: 4000, createdAt: "2026-08-26T10:00:00.000Z" }],
    trend: [{ dateKey: "2026-08-26", label: "Tue", salesMinor: 4000, transactions: 2 }],
  }),
}));

import { TodayDashboard } from "@/components/TodayDashboard";

describe("Stage 2 customer-debt discovery", () => {
  it("links the Home debt amount directly to the debtor-only customer view", async () => {
    render(<TodayDashboard currency="GHS" />);

    const debtorLink = await screen.findByRole("link", { name: /Customers owe/i });
    expect(debtorLink).toHaveAttribute("href", "/customers?view=owing");
    expect(screen.getByText("Open customer balances")).toBeInTheDocument();
  });

  it("uses the daily summary language and distinguishes the best seller from saved recent activity", async () => {
    render(<TodayDashboard currency="GHS" />);

    expect(await screen.findByText("How is your business")).toBeInTheDocument();
    expect(screen.getByText("Collected today")).toBeInTheDocument();
    expect(screen.getByText("Sales made")).toBeInTheDocument();
    expect(screen.getByText("USB-C Cable")).toBeInTheDocument();
    expect(screen.getByText("3 items sold")).toBeInTheDocument();
    expect(screen.getByText("Today’s saved activity")).toBeInTheDocument();
    expect(screen.getByText("Walk-in sale")).toBeInTheDocument();
  });
});
