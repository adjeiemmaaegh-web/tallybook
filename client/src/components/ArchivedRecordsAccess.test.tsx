/** Tactile Ledger testing reminder: archived records must be reachable from Inventory without relying on page position or a transient toast. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchivedRecordsAccess } from "@/components/ArchivedRecordsAccess";

describe("ArchivedRecordsAccess", () => {
  it("is always visible in Inventory actions when archived records exist and opens the record view", () => {
    const open = vi.fn();
    render(<ArchivedRecordsAccess count={2} onOpen={open} />);

    const control = screen.getByRole("button", { name: "Archived records 2" });
    expect(control).toHaveClass("archive-access-control");
    fireEvent.click(control);
    expect(open).toHaveBeenCalledOnce();
  });

  it("keeps the archive destination visible with a zero count so owners know where archived records will appear", () => {
    const open = vi.fn();
    render(<ArchivedRecordsAccess count={0} onOpen={open} />);
    const control = screen.getByRole("button", { name: "Archived records 0" });
    expect(control).toHaveClass("archive-access-control-empty");
    fireEvent.click(control);
    expect(open).toHaveBeenCalledOnce();
  });
});
