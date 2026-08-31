/** Stage 8 repair: only an actual offline-to-online transition may notify; there is no sync action. */
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionRestoredNotifier } from "@/components/ConnectionRestoredNotifier";

const { success } = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success } }));

afterEach(() => { success.mockReset(); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });

describe("ConnectionRestoredNotifier", () => {
  it("does not notify on an initial online load but confirms that nothing uploaded after reconnection", () => {
    render(<ConnectionRestoredNotifier />);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(success).not.toHaveBeenCalled();

    act(() => { window.dispatchEvent(new Event("offline")); window.dispatchEvent(new Event("online")); });
    expect(success).toHaveBeenCalledWith("Connection restored", expect.objectContaining({ description: "Your records remain saved on this device. Nothing was uploaded.", duration: 3000, id: "connection-restored" }));
  });
});
