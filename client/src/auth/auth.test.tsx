import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AuthGate } from "./AuthGate";

const mock = vi.hoisted(() => ({ getSession: vi.fn(), unsubscribe: vi.fn(), listener: null as null | ((event: string, session: unknown) => void) }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, getSupabaseClient: () => ({ auth: {
  getSession: mock.getSession,
  onAuthStateChange: (listener: typeof mock.listener) => { mock.listener = listener; return { data: { subscription: { unsubscribe: mock.unsubscribe } } }; },
} }) }));
const session = { user: { id: "owner-id" } };
function mount(path = "/sales") {
  const location = memoryLocation({ path });
  const view = render(<Router hook={location.hook}><AuthGate enabled signIn={<p>Sign in here</p>}><p>Private ledger</p></AuthGate></Router>);
  return { ...view, location };
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true); mock.getSession.mockResolvedValue({ data: { session: null }, error: null }); });
afterEach(() => vi.restoreAllMocks());
describe("authentication gate", () => {
  it("redirects a signed-out deep link and never mounts the ledger", async () => { mount(); expect(screen.queryByText("Private ledger")).not.toBeInTheDocument(); expect(await screen.findByText("Sign in here")).toBeInTheDocument(); });
  it("opens a signed-in session and redirects away from sign-in", async () => { mock.getSession.mockResolvedValue({data:{session},error:null}); mount("/signin"); expect(await screen.findByText("Private ledger")).toBeInTheDocument(); expect(screen.queryByText("Sign in here")).not.toBeInTheDocument(); });
  it("reacts to sign-out without exposing the previous page", async () => { mock.getSession.mockResolvedValue({data:{session},error:null}); mount(); await screen.findByText("Private ledger"); act(()=>mock.listener!("SIGNED_OUT",null)); await screen.findByText("Sign in here"); expect(localStorage.getItem("tallybook.auth.offline-user.v1")).toBeNull(); });
  it("cleans up its listener", async () => { const view=mount(); await screen.findByText("Sign in here"); view.unmount(); expect(mock.unsubscribe).toHaveBeenCalledOnce(); });
  it("does not let a stale session lookup override a newer sign-out", async () => { let resolve!: (value: unknown)=>void; mock.getSession.mockReturnValue(new Promise(r=>resolve=r)); mount(); act(()=>mock.listener!("SIGNED_OUT",null)); await act(async()=>resolve({data:{session},error:null})); expect(await screen.findByText("Sign in here")).toBeInTheDocument(); });
  it("keeps a previously signed-in device available offline without granting a cloud session", async () => { vi.spyOn(navigator,"onLine","get").mockReturnValue(false); localStorage.setItem("tallybook.auth.offline-user.v1","owner-id"); mock.getSession.mockRejectedValue(new Error("offline")); mount(); expect(await screen.findByText("Private ledger")).toBeInTheDocument(); });
  it("clears offline access after an online session is absent", async () => { localStorage.setItem("tallybook.auth.offline-user.v1","owner-id"); mount(); await screen.findByText("Sign in here"); expect(localStorage.getItem("tallybook.auth.offline-user.v1")).toBeNull(); });
  it("does not allow a new offline visitor into the ledger", async () => { vi.spyOn(navigator,"onLine","get").mockReturnValue(false); mount(); expect(await screen.findByText("Sign in here")).toBeInTheDocument(); });
  it("fails closed on a session error while retaining local records", async () => { localStorage.setItem("records-marker","retained"); mock.getSession.mockRejectedValue(new Error("unavailable")); mount(); expect(await screen.findByRole("alert")).toHaveTextContent("could not check"); expect(localStorage.getItem("records-marker")).toBe("retained"); });
  it("honors cross-tab sign-out even when offline", async () => { vi.spyOn(navigator,"onLine","get").mockReturnValue(false); localStorage.setItem("tallybook.auth.offline-user.v1","owner-id"); mount(); await screen.findByText("Private ledger"); act(()=>window.dispatchEvent(new StorageEvent("storage",{key:"tallybook.auth.offline-user.v1",newValue:null}))); await waitFor(()=>expect(screen.queryByText("Private ledger")).not.toBeInTheDocument()); });
});
