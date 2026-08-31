/** Tactile Ledger testing reminder: archived stock must leave the active shelf immediately yet remain discoverable through a deliberate record view. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArchivedProductsPanel } from "@/components/ArchivedProductsPanel";
import type { Product } from "@/features/inventory/inventory";

const archivedProduct: Product = {
  id: "product-1",
  businessProfileId: "primary",
  name: "Laundry soap",
  normalizedName: "laundry soap",
  sellingPriceMinor: 1250,
  stockQuantity: 4,
  lowStockThreshold: 2,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  archivedAt: "2026-08-24T00:00:00.000Z",
};

describe("ArchivedProductsPanel", () => {
  it("keeps a zero-record destination visible so owners know where archived stock will appear", () => {
    render(<ArchivedProductsPanel products={[]} showArchived={false} onToggle={() => {}} />);
    expect(screen.getByRole("heading", { name: "No archived products" })).toBeInTheDocument();
    expect(screen.getByText(/When you archive a product/)).toBeInTheDocument();
  });

  it("shows the archived product only after Show archived and hides it again after Hide archived", () => {
    let shown = false;
    const rerenderPanel = () => render(<ArchivedProductsPanel products={[archivedProduct]} showArchived={shown} onToggle={() => { shown = !shown; }} />);
    const view = rerenderPanel();

    expect(screen.getByRole("button", { name: "Show archived products (1)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Laundry soap")).not.toBeInTheDocument();
    expect(screen.getByText(/Archived products are hidden from this view/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show archived products (1)" }));
    view.rerender(<ArchivedProductsPanel products={[archivedProduct]} showArchived={shown} onToggle={() => { shown = !shown; }} />);

    expect(screen.getByRole("button", { name: "Hide archived products" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Laundry soap")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide archived products" }));
    view.rerender(<ArchivedProductsPanel products={[archivedProduct]} showArchived={shown} onToggle={() => { shown = !shown; }} />);

    expect(screen.getByRole("button", { name: "Show archived products (1)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Laundry soap")).not.toBeInTheDocument();
  });
});
