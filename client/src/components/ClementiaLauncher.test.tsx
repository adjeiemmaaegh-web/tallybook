import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/pages/AssistantPage", () => ({ default: () => <textarea aria-label="Assistant draft" /> }));

import { ClementiaLauncher } from "./ClementiaLauncher";

describe("Clementia window controls", () => {
  it("loads the assistant on demand, then preserves an unsent draft across size changes", async () => {
    render(<ClementiaLauncher hidden={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Let Clementia assist you" }));
    const draft = await screen.findByRole("textbox", { name: "Assistant draft" });
    fireEvent.change(draft, { target: { value: "Unsaved shop question" } });

    fireEvent.click(screen.getByRole("button", { name: "Maximize Clementia" }));
    expect(screen.getByRole("dialog", { name: "Clementia assistant" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("textbox", { name: "Assistant draft" })).toBe(draft);
    expect(draft).toHaveValue("Unsaved shop question");

    fireEvent.click(screen.getByRole("button", { name: "Minimize Clementia" }));
    expect(screen.getByRole("dialog", { name: "Clementia assistant" })).toHaveAttribute("aria-modal", "false");
    expect(draft).toHaveValue("Unsaved shop question");
  });
});
