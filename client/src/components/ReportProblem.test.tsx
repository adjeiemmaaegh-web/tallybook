import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportProblem } from "@/components/ReportProblem";
import { reportError, resetErrorReportingForTests } from "@/lib/errorReporting";

beforeEach(() => { resetErrorReportingForTests(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); Reflect.deleteProperty(navigator, "share"); });

const openDialog = () => { render(<ReportProblem />); fireEvent.click(screen.getByRole("button", { name: "Report a problem" })); };
const shown = () => (screen.getByLabelText("Report to send") as HTMLTextAreaElement).value;

describe("Report a problem", () => {
  it("shows exactly what would be sent, including recent errors and the person's note", () => {
    reportError(new Error("Till froze"), "window");
    openDialog();
    expect(screen.getByText(/does not include sales, customers, prices or stock/)).toBeInTheDocument();
    expect(shown()).toContain("[window] Till froze");
    fireEvent.change(screen.getByLabelText(/What were you doing/), { target: { value: "Pressed Pay" } });
    expect(shown()).toContain("Pressed Pay");
  });

  it("opens WhatsApp at the configured support number", () => {
    vi.stubEnv("VITE_TALLYBOOK_SUPPORT_WHATSAPP", "+233 24 000 0000");
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    expect(String(open.mock.calls[0][0]).startsWith("https://wa.me/233240000000?text=")).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("WhatsApp opened");
  });

  it("lets the person choose the contact when no support number is set", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    expect(String(open.mock.calls[0][0]).startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("says so when WhatsApp cannot open, and copies instead", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send on WhatsApp" }));
    expect(screen.getByRole("status")).toHaveTextContent("could not open");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Report copied/)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Tallybook problem report"));
  });

  it("uses the share sheet when the browser has one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText(/Opened in your share options/)).toBeInTheDocument();
    expect(share.mock.calls[0][0].text).toContain("Tallybook problem report");
  });
});
