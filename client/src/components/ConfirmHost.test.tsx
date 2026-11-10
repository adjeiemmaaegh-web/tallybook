import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmHost } from "@/components/ConfirmHost";
import { confirmAction } from "@/lib/confirmAction";

afterEach(() => vi.restoreAllMocks());

describe("confirmAction", () => {
  it("falls back to window.confirm when no dialog host is mounted", async () => {
    const native = vi.spyOn(window, "confirm").mockReturnValue(true);
    await expect(confirmAction("Go ahead?")).resolves.toBe(true);
    native.mockReturnValue(false);
    await expect(confirmAction("Go ahead?")).resolves.toBe(false);
    expect(native).toHaveBeenCalledTimes(2);
  });

  it("resolves true only when the person presses the confirm button", async () => {
    const native = vi.spyOn(window, "confirm");
    render(<ConfirmHost />);
    let answer!: Promise<boolean>;
    act(() => { answer = confirmAction("Refund GHS 20.00?", { confirmLabel: "Refund", danger: true }); });
    expect(await screen.findByText("Refund GHS 20.00?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    await expect(answer).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByText("Refund GHS 20.00?")).toBeNull());
    expect(native).not.toHaveBeenCalled();
  });

  it("resolves false on Cancel and on Escape", async () => {
    render(<ConfirmHost />);
    let answer!: Promise<boolean>;
    act(() => { answer = confirmAction("Remove this attendant?"); });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await expect(answer).resolves.toBe(false);

    act(() => { answer = confirmAction("Close this order?"); });
    await screen.findByText("Close this order?");
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    await expect(answer).resolves.toBe(false);
  });

  it("shows queued prompts one at a time and settles each exactly once", async () => {
    render(<ConfirmHost />);
    let first!: Promise<boolean>, second!: Promise<boolean>;
    act(() => { first = confirmAction("First?"); second = confirmAction("Second?"); });
    expect(await screen.findByText("First?")).toBeInTheDocument();
    expect(screen.queryByText("Second?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await expect(first).resolves.toBe(true);
    expect(await screen.findByText("Second?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await expect(second).resolves.toBe(false);
  });
});
