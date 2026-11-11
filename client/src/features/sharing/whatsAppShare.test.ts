import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWhatsAppUrl, normalizeWhatsAppNumber, openWhatsAppShare } from "./businessSharing";

afterEach(() => vi.restoreAllMocks());

describe("normalizeWhatsAppNumber", () => {
  it("adds the country code to a local number and drops the leading zero", () => {
    expect(normalizeWhatsAppNumber("024 412 3456", "Ghana")).toBe("233244123456");
    expect(normalizeWhatsAppNumber("0803-123-4567", "Nigeria")).toBe("2348031234567");
    expect(normalizeWhatsAppNumber("0712 345 678", "Kenya")).toBe("254712345678");
  });

  it("keeps numbers that already carry a country code", () => {
    expect(normalizeWhatsAppNumber("+233 24 412 3456", "Kenya")).toBe("233244123456");
    expect(normalizeWhatsAppNumber("00233244123456", "Ghana")).toBe("233244123456");
  });

  it("refuses to guess when it cannot be sure which number is meant", () => {
    expect(normalizeWhatsAppNumber("0244123456", "Other")).toBeNull();
    expect(normalizeWhatsAppNumber("0244123456", undefined)).toBeNull();
    expect(normalizeWhatsAppNumber("244123456", "Ghana")).toBeNull(); // no leading 0 and no +
    expect(normalizeWhatsAppNumber("", "Ghana")).toBeNull();
    expect(normalizeWhatsAppNumber(null, "Ghana")).toBeNull();
    expect(normalizeWhatsAppNumber("call Kofi 0244123456", "Ghana")).toBeNull();
    expect(normalizeWhatsAppNumber("+12", "Ghana")).toBeNull(); // too short
    expect(normalizeWhatsAppNumber("+" + "9".repeat(20), "Ghana")).toBeNull(); // too long
  });
});

describe("buildWhatsAppUrl / openWhatsAppShare", () => {
  it("encodes the message and targets the customer when the number is usable", () => {
    expect(buildWhatsAppUrl("Hello & thanks\nBye", "0244123456", "Ghana"))
      .toBe("https://wa.me/233244123456?text=Hello%20%26%20thanks%0ABye");
  });

  it("opens WhatsApp without a recipient when the number is unusable", () => {
    expect(buildWhatsAppUrl("Hi", "n/a", "Ghana")).toBe("https://wa.me/?text=Hi");
  });

  it("opens in a new window without leaking the opener, and reports a blocked popup", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    expect(openWhatsAppShare("Hi", "0244123456", "Ghana")).toBe(true);
    expect(open).toHaveBeenCalledWith("https://wa.me/233244123456?text=Hi", "_blank", "noopener,noreferrer");
    open.mockReturnValue(null);
    expect(openWhatsAppShare("Hi")).toBe(false);
  });
});
