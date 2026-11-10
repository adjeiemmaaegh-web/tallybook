import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Receipt } from "@/pages/SharedShopPage";
import { sampleReceipt } from "@/cloud/testReceipt";

afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(navigator, "share"); });

describe("shared shop receipt actions", () => {
  it("shares the receipt text through the device share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<Receipt receipt={sampleReceipt()} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0][0].text).toContain("Receipt #42");
    expect(await screen.findByRole("status")).toHaveTextContent("opened in your share options");
  });

  it("falls back to showing copyable text when nothing else works", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<Receipt receipt={sampleReceipt()} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const box = await screen.findByLabelText("Receipt text to copy");
    expect((box as HTMLTextAreaElement).value).toContain("Total:");
  });

  it("opens WhatsApp at the customer's normalised number", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(<Receipt receipt={sampleReceipt()} />);
    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith("https://wa.me/233244123456?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("Receipt #42");
  });

  it("opens WhatsApp without a recipient when the sale has no customer", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(<Receipt receipt={sampleReceipt({ customer: null })} />);
    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    expect(String(open.mock.calls[0][0]).startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("marks only this receipt for printing, then clears the mark after printing", () => {
    const print = vi.fn();
    Object.defineProperty(window, "print", { value: print, configurable: true });
    const { container } = render(<Receipt receipt={sampleReceipt()} />);
    const node = container.querySelector(".shop-receipt")!;
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(node.getAttribute("data-printing")).toBe("true");
    window.dispatchEvent(new Event("afterprint"));
    expect(node.hasAttribute("data-printing")).toBe(false);
  });
});
