import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/BusinessProfileContext", () => ({ useBusinessProfile: () => ({ profile: { id: "primary", name: "Kwaku Provision Store", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" } }) }));
vi.mock("@/features/reports/reports", () => ({ getEndOfDaySummary: vi.fn().mockResolvedValue({ generatedAt: "2026-08-27T20:00:00.000Z", dateLabel: "Thursday, August 27, 2026", salesMinor: 5000, salesCount: 3, receivedMinor: 3500, unpaidFromTodaySalesMinor: 2000, namedCustomersServed: 1, lowStockProducts: [{ productId: "oil", productName: "Cooking Oil", stockQuantity: 1, lowStockThreshold: 1, isLowStock: true, sellingPriceMinor: 1000 }], methods: [{ method: "cash", label: "Cash", salesMinor: 1000, receivedMinor: 1000 }, { method: "mobile", label: "Mobile Money", salesMinor: 2000, receivedMinor: 1000 }, { method: "card", label: "Card", salesMinor: 0, receivedMinor: 0 }, { method: "credit", label: "Credit", salesMinor: 2000, receivedMinor: 0 }] }) }));

import EndOfDayPage from "@/pages/EndOfDayPage";

describe("Stage 6 end-of-day summary", () => {
  it("shows saved daily facts without a close-day control and keeps the existing follow-up routes", async () => {
    render(<EndOfDayPage />);

    expect(await screen.findByText("What happened in your")).toBeInTheDocument();
    expect(screen.getByText("Money actually received today")).toBeInTheDocument();
    expect(screen.getByText("Money received today")).toBeInTheDocument();
    expect(screen.getByText("Still unpaid from today’s sales")).toBeInTheDocument();
    expect(screen.getByText("Named customers served")).toBeInTheDocument();
    expect(screen.getByText("Mobile Money sales")).toBeInTheDocument();
    expect(screen.getByText("Payments actually recorded")).toBeInTheDocument();
    expect(screen.getByText("Cooking Oil")).toBeInTheDocument();
    expect(screen.getByText(/does not close, reset, or lock your day/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close day/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Still unpaid from today’s sales/i })).toHaveAttribute("href", "/customers?view=owing");
    expect(screen.getByRole("link", { name: /Open stock record/i })).toHaveAttribute("href", "/inventory");
  });

  it("uses only the browser print dialog and shows the required printed-summary disclaimer", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<EndOfDayPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Print \/ Save as PDF/i }));

    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByText("End of day summary — not a receipt, invoice, tax document, or accounting statement.")).toBeInTheDocument();
    print.mockRestore();
  });
});
