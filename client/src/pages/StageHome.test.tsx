/** Tactile Ledger regression: the owner's saved business identity must be visible on Today, not only buried in desktop navigation. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/BusinessProfileContext", () => ({ useBusinessProfile: () => ({ profile: { id: "primary", name: "Kwaku Provision Store", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" } }) }));
vi.mock("@/contexts/DatabaseContext", () => ({ useDatabase: () => ({ status: "ready", readiness: { databaseName: "tallybook-db", schemaVersion: 7, initializedAt: "2026-08-25T00:00:00.000Z" }, retry: vi.fn() }) }));

import StageHome from "@/pages/StageHome";

describe("Today business identity", () => {
  it("shows the saved business name and its local country/currency record", () => {
    render(<StageHome />);

    expect(screen.getByText("Kwaku Provision Store", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Ghana · GHS")).toBeInTheDocument();
  });
});
