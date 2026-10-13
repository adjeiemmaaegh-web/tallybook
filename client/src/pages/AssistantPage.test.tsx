/** Tallybook Africa design reminder: the assistant page is a thin shortcut UI — this test doubles the assistant itself (already covered by assistant.test.ts) and checks only that the page wires input, starters, and preview actions correctly. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AssistantReply } from "@/features/assistant";

const send = vi.fn<(text: string) => Promise<AssistantReply>>();
const act = vi.fn<(action: unknown) => Promise<AssistantReply>>();

vi.mock("@/contexts/BusinessProfileContext", () => ({
  useBusinessProfile: () => ({ profile: { id: "primary", name: "Kwaku Provision Store", country: "Ghana", currency: "GHS" }, activeCompanyId: "primary" }),
}));
vi.mock("@/contexts/DatabaseContext", () => ({ useDatabase: () => ({ status: "ready" }) }));
vi.mock("@/features/assistant", async (importOriginal) => ({ ...(await importOriginal<object>()), createAssistant: () => ({ send, act, pendingToken: () => null }) }));

import AssistantPage from "@/pages/AssistantPage";

describe("AssistantPage", () => {
  it("sends a starter suggestion and renders the reply", async () => {
    send.mockResolvedValueOnce({ kind: "answer", text: "Adwoa Mensah currently owes GHS 450.00." });
    render(<AssistantPage />);

    fireEvent.click(screen.getByRole("button", { name: "How much does Adwoa owe?" }));
    expect(send).toHaveBeenCalledWith("How much does Adwoa owe?");
    expect(await screen.findByText("Adwoa Mensah currently owes GHS 450.00.")).toBeInTheDocument();
    expect(screen.getByText("How much does Adwoa owe?", { selector: ".assistant-msg-user p" })).toBeInTheDocument();
  });

  it("sends typed text and clears the input", async () => {
    send.mockResolvedValueOnce({ kind: "answer", text: "Eggs: 37 in stock." });
    render(<AssistantPage />);

    const input = screen.getByLabelText("Message TallyBook's assistant") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "How many eggs are left?" } });
    fireEvent.submit(input.closest("form")!);

    expect(send).toHaveBeenCalledWith("How many eggs are left?");
    expect(await screen.findByText("Eggs: 37 in stock.")).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("renders a transaction preview with working confirm and cancel buttons", async () => {
    send.mockResolvedValueOnce({
      kind: "preview",
      text: "Please check this. Nothing is saved until you confirm.",
      preview: { token: "tok-1", kind: "sale", title: "Sale preview — not saved yet", rows: [{ label: "Product", value: "Eggs" }], notes: [], confirmLabel: "Confirm sale" },
      actions: [{ type: "confirm", label: "Confirm sale", token: "tok-1" }, { type: "cancel", label: "Cancel" }],
    });
    act.mockResolvedValueOnce({ kind: "success", text: "Sale recorded: 2 × Eggs for GHS 120.00." });
    render(<AssistantPage />);

    fireEvent.click(screen.getByRole("button", { name: "Record 2 crates of eggs sold to walk-in customer, paid cash" }));
    expect(await screen.findByText("Sale preview — not saved yet")).toBeInTheDocument();
    expect(screen.getByText("Eggs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm sale" }));
    expect(act).toHaveBeenCalledWith({ type: "confirm", label: "Confirm sale", token: "tok-1" });
    expect(await screen.findByText("Sale recorded: 2 × Eggs for GHS 120.00.")).toBeInTheDocument();
  });

  it("shows a business setup gate instead of the chat when no business profile exists", async () => {
    vi.resetModules();
    vi.doMock("@/contexts/BusinessProfileContext", () => ({ useBusinessProfile: () => ({ profile: null, activeCompanyId: "primary" }) }));
    vi.doMock("@/contexts/DatabaseContext", () => ({ useDatabase: () => ({ status: "ready" }) }));
    const { default: GatedAssistantPage } = await import("@/pages/AssistantPage");
    render(<GatedAssistantPage />);
    expect(screen.getByRole("link", { name: "Set up business" })).toHaveAttribute("href", "/business");
    expect(screen.queryByLabelText("Message TallyBook's assistant")).not.toBeInTheDocument();
  });
});
