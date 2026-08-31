/** Stage 8 final connection feedback: the header stays visibly offline until the browser reports connectivity again. */
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseStatus } from "@/components/DatabaseStatus";

const retry = vi.fn();
let databaseState: { status: "checking" | "ready" | "error"; message: string | null } = { status: "ready", message: null };
vi.mock("@/contexts/DatabaseContext", () => ({ useDatabase: () => ({ ...databaseState, readiness: databaseState.status === "ready" ? { databaseName: "test", schemaVersion: 8, initializedAt: "2026-01-01T00:00:00.000Z" } : null, retry }) }));
function setOnline(value: boolean) { Object.defineProperty(navigator, "onLine", { configurable: true, value }); }
afterEach(() => { setOnline(true); databaseState = { status: "ready", message: null }; retry.mockReset(); });

describe("DatabaseStatus", () => {
  it("keeps a visible offline indicator until connectivity returns", () => {
    setOnline(false);
    render(<DatabaseStatus />);
    expect(screen.getByText("Offline — changes saved on this device")).toBeInTheDocument();
    setOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
  });

  it("uses the approved plain-language preparation and recovery states", () => {
    databaseState = { status: "checking", message: null };
    const { rerender } = render(<DatabaseStatus />);
    expect(screen.getByText("Getting your records ready")).toBeInTheDocument();

    databaseState = { status: "error", message: "An internal detail that is available only as button context." };
    rerender(<DatabaseStatus />);
    expect(screen.getByRole("button", { name: "Your saved records need attention. Try again." })).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });
});
