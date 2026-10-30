import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  listenForWorkspaceRevocation,
  lockWorkspace,
  protectWorkspaceTransaction,
  requireWorkspaceAccess,
  verifyOnlineWorkspace,
  workspaceSnapshot,
} from "./workspaceBoundary";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth }),
}));
// Contract fixtures only: these do not establish real encrypted provisioning.
const databaseName = `tallybook-protected-v1-${"a".repeat(64)}`;
let stop = () => {};
let session: { user: { id: string }; access_token: string; expires_at: number };
function proof() {
  return {
    active: true,
    storageProtection: "encrypted-workspace-v1",
    grant: {
      userId: "owner",
      localCompanyId: "company-a",
      cloudCompanyId: "cloud-a",
      staffId: "staff-a",
      storeIds: ["store-a"],
      permissions: ["sell"],
      databaseName,
      expiresAtEpochMs: Date.now() + 60_000,
    },
  };
}
function respond(value: unknown) {
  return {
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => value,
  };
}
beforeEach(() => {
  lockWorkspace(false);
  vi.useFakeTimers();
  session = {
    user: { id: "owner" },
    access_token: "fixture-only",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => respond(proof()))
  );
});
afterEach(() => {
  stop();
  stop = () => {};
  lockWorkspace(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("scopes a trusted contract grant to one account database and company", async () => {
  await verifyOnlineWorkspace();
  expect(requireWorkspaceAccess(databaseName, "company-a").userId).toBe(
    "owner"
  );
  expect(() => requireWorkspaceAccess(databaseName, "company-b")).toThrow(
    /authorized/
  );
  expect(() => requireWorkspaceAccess("tallybook-db", "company-a")).toThrow(
    /authorized/
  );
  expect(Object.isFrozen(workspaceSnapshot()?.permissions)).toBe(true);
});
it("aborts active transactions and denies further access at expiry", async () => {
  await verifyOnlineWorkspace();
  const abort = vi.fn();
  protectWorkspaceTransaction({ abort });
  vi.advanceTimersByTime(60_001);
  expect(abort).toHaveBeenCalledOnce();
  expect(() => requireWorkspaceAccess()).toThrow(/authorized/);
});
it("locks on another tab signing out and never restores a grant from storage", async () => {
  stop = listenForWorkspaceRevocation();
  await verifyOnlineWorkspace();
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "tallybook.workspace.revocation.v1",
      newValue: "anything",
    })
  );
  expect(workspaceSnapshot()).toBeNull();
});
it("losing the network locks an online workspace", async () => {
  stop = listenForWorkspaceRevocation();
  await verifyOnlineWorkspace();
  window.dispatchEvent(new Event("offline"));
  expect(workspaceSnapshot()).toBeNull();
});
it("cannot resurrect an authorization request that finished after signout", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      lockWorkspace();
      return respond(proof());
    })
  );
  await expect(verifyOnlineWorkspace()).rejects.toThrow(/changed/);
  expect(workspaceSnapshot()).toBeNull();
});
it("aborts a stalled verification request after fifteen seconds", async () => {
  let requestStarted!: () => void;
  const started = new Promise<void>(resolve => {
    requestStarted = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: unknown, options: RequestInit) => {
      requestStarted();
      return new Promise((_resolve, reject) =>
        options.signal!.addEventListener("abort", () =>
          reject(new Error("Aborted verification"))
        )
      );
    })
  );
  const pending = expect(verifyOnlineWorkspace()).rejects.toThrow(/Aborted/);
  await started;
  await vi.advanceTimersByTimeAsync(15_000);
  await pending;
  expect(workspaceSnapshot()).toBeNull();
});
it.each(["identity", "legacy-database", "permission", "expiration"])(
  "rejects malformed %s authority",
  async kind => {
    const value = proof();
    if (kind === "identity") value.grant.userId = "someone-else";
    if (kind === "legacy-database") value.grant.databaseName = "tallybook-db";
    if (kind === "permission") value.grant.permissions = ["superuser"];
    if (kind === "expiration")
      value.grant.expiresAtEpochMs = Date.now() + 16 * 60_000;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(value))
    );
    await expect(verifyOnlineWorkspace()).rejects.toThrow(/invalid/);
    expect(workspaceSnapshot()).toBeNull();
  }
);
