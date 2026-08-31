/** Tactile Ledger testing reminder: a dropdown is a paper record surface, never a transparent overlay that obscures the owner’s work. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} });

describe("shared select menu", () => {
  it("renders dropdown options on an explicit opaque paper surface", async () => {
    render(<Select><SelectTrigger><SelectValue placeholder="Choose a country" /></SelectTrigger><SelectContent><SelectItem value="ghana">Ghana</SelectItem></SelectContent></Select>);

    fireEvent.click(screen.getByRole("combobox"));
    const option = await screen.findByText("Ghana");
    const content = option.closest('[data-slot="select-content"]');

    expect(content).not.toBeNull();
    expect(content!).toHaveClass("bg-[#fffdf8]", "border-[#cfc3b3]");
    expect(content!).not.toHaveClass("bg-transparent");
  });
});
