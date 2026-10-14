import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CloudBusinessPanel } from "./CloudBusinessPanel";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), lookup: vi.fn(), create: vi.fn(), unsubscribe: vi.fn(), callback: null as null | (() => void) }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, getSupabaseClient: () => ({ auth: { getUser: mock.getUser, onAuthStateChange: (callback: () => void) => { mock.callback = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; } } }) }));
vi.mock("./businessIdentity", () => ({ getCurrentBusiness: mock.lookup, createBusiness: mock.create }));
beforeEach(() => {
  cleanup(); vi.clearAllMocks(); localStorage.clear();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, callback: () => unknown) => callback() } });
  mock.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mock.lookup.mockResolvedValue(null);
});
it("does not contact business tables for a signed-out visitor", async () => {
  mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
  render(<CloudBusinessPanel />);
  expect(await screen.findByText("Sign in to prepare your cloud business")).toBeTruthy();
  expect(mock.lookup).not.toHaveBeenCalled();
});
it("reuses the persisted request ID after a failed creation and remount", async () => {
  mock.create.mockRejectedValueOnce(new Error("Connection lost"));
  const view = render(<CloudBusinessPanel />);
  fireEvent.change(await screen.findByLabelText("Cloud business name"), { target: { value: "Shop" } });
  fireEvent.click(screen.getByText("Create cloud business"));
  await screen.findByText("Connection lost");
  const firstId = mock.create.mock.calls[0][1];
  view.unmount();
  mock.create.mockResolvedValue({ id: "cloud", owner_id: "owner", name: "Shop" });
  render(<CloudBusinessPanel />);
  fireEvent.change(await screen.findByLabelText("Cloud business name"), { target: { value: "Shop" } });
  fireEvent.click(screen.getByText("Create cloud business"));
  await screen.findByText("Shop");
  expect(mock.create).toHaveBeenLastCalledWith("Shop", firstId);
  expect(mock.unsubscribe).toHaveBeenCalled();
});
it("discards a previous account's delayed business lookup after sign-out", async () => {
  let resolve!: (value: unknown) => void;
  mock.lookup.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<CloudBusinessPanel />);
  await waitFor(() => expect(mock.lookup).toHaveBeenCalled());
  mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mock.callback?.();
  await screen.findByText("Sign in to prepare your cloud business");
  resolve({ id: "old", name: "Old private shop", owner_id: "owner" });
  await waitFor(() => expect(screen.queryByText("Old private shop")).toBeNull());
});
