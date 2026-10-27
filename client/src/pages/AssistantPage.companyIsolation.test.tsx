/**
 * Deferred regression coverage for company-switch isolation in Clementia.
 * These tests are committed for the owner's Windows run; they have NOT run in CI.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantReply } from "@/features/assistant";

const mock = vi.hoisted(() => ({
  companyId: "alpha",
  currency: "GHS",
  pendingAlphaReply: null as null | ((reply: AssistantReply) => void),
  pendingAlphaWorkflows: null as null | ((rows: Array<{ id: string; name: string; description: string }>) => void),
}));

vi.mock("@/contexts/BusinessProfileContext", () => ({
  useBusinessProfile: () => ({
    activeCompanyId: mock.companyId,
    profile: { id: mock.companyId, name: mock.companyId, currency: mock.currency, country: "Ghana" },
  }),
}));
vi.mock("@/contexts/DatabaseContext", () => ({ useDatabase: () => ({ status: "ready" }) }));
vi.mock("@/features/assistant", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createAssistant: () => ({
    send: (text: string): Promise<AssistantReply> =>
      mock.companyId === "alpha"
        ? new Promise((resolve) => { mock.pendingAlphaReply = resolve; })
        : Promise.resolve({ kind: "answer", text: `Beta-only reply to: ${text}` }),
    act: async (): Promise<AssistantReply> => ({ kind: "answer", text: "Action complete." }),
    clearContext: () => {},
    pendingToken: () => null,
  }),
  listPersistentWorkflows: (id: string) =>
    id === "alpha"
      ? new Promise((resolve) => { mock.pendingAlphaWorkflows = resolve; })
      : Promise.resolve([{ id: "beta-only", name: "Beta stock check", description: "Beta workspace" }]),
  listStoredAliases: async () => [],
  listAssistantHistory: async () => [],
}));

import AssistantPage from "@/pages/AssistantPage";

beforeEach(() => {
  mock.companyId = "alpha";
  mock.currency = "GHS";
  mock.pendingAlphaReply = null;
  mock.pendingAlphaWorkflows = null;
});

describe("Clementia company-switch UI isolation", () => {
  it("drops an unsent confidential draft as soon as the active company changes", () => {
    const view = render(<AssistantPage />);
    const input = screen.getByRole("textbox", { name: "Message TallyBook's assistant" });
    fireEvent.change(input, { target: { value: "Alpha unsent private notes" } });
    expect(input).toHaveValue("Alpha unsent private notes");

    mock.companyId = "beta";
    view.rerender(<AssistantPage />);
    expect(screen.getByRole("textbox", { name: "Message TallyBook's assistant" })).toHaveValue("");
    expect(screen.queryByText("Alpha unsent private notes")).not.toBeInTheDocument();
  });

  it("invalidates unsent drafts if a company's currency changes", () => {
    const view = render(<AssistantPage />);
    const composer = screen.getByRole("textbox", { name: "Message TallyBook's assistant" });
    fireEvent.change(composer, { target: { value: "GHS amount from an old preview" } });
    expect(composer).toHaveValue("GHS amount from an old preview");

    mock.currency = "USD";
    view.rerender(<AssistantPage />);
    expect(screen.getByRole("textbox", { name: "Message TallyBook's assistant" })).toHaveValue("");
    expect(screen.queryByText("GHS amount from an old preview")).not.toBeInTheDocument();
  });

  it("discards pending questions and ignores a prior company's late reply", async () => {
    const view = render(<AssistantPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Message TallyBook's assistant" }), {
      target: { value: "Alpha private customer balance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("Alpha private customer balance")).toBeInTheDocument();
    expect(mock.pendingAlphaReply).not.toBeNull();

    mock.companyId = "beta";
    view.rerender(<AssistantPage />);
    expect(screen.queryByText("Alpha private customer balance")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message TallyBook's assistant" })).toHaveValue("");

    await act(async () => {
      mock.pendingAlphaReply?.({ kind: "answer", text: "Alpha-only confidential reply" });
    });
    expect(screen.queryByText("Alpha-only confidential reply")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Message TallyBook's assistant" }), {
      target: { value: "Beta inventory" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Beta-only reply to: Beta inventory")).toBeInTheDocument();
    expect(screen.queryByText("Alpha-only confidential reply")).not.toBeInTheDocument();
  });

  it("does not replace new-company shortcuts when old-company IndexedDB reads finish last", async () => {
    const view = render(<AssistantPage />);
    await waitFor(() => expect(mock.pendingAlphaWorkflows).not.toBeNull());

    mock.companyId = "beta";
    view.rerender(<AssistantPage />);
    fireEvent.click(screen.getByText("On-device workflows and memory"));
    expect(await screen.findByText("Beta stock check")).toBeInTheDocument();

    await act(async () => {
      mock.pendingAlphaWorkflows?.([
        { id: "alpha-secret", name: "Alpha confidential workflow", description: "Alpha workspace" },
      ]);
    });
    expect(screen.getByText("Beta stock check")).toBeInTheDocument();
    expect(screen.queryByText("Alpha confidential workflow")).not.toBeInTheDocument();
  });
});
