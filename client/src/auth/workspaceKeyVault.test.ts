import Dexie from "dexie";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createWorkspaceKey,
  unlockWorkspaceKey,
  assertWorkspaceKeyUnlocked,
  sealWorkspaceRecord,
  openWorkspaceRecord,
  clearWorkspaceKeys,
} from "./workspaceKeyVault";
import {
  lockWorkspace,
  verifyOnlineWorkspace,
  workspaceSnapshot,
} from "./workspaceBoundary";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth }),
}));
const scope = {
  userId: "owner",
  cloudCompanyId: "cloud-a",
  localCompanyId: "local-a",
  deviceId: "device-a",
  databaseName: `tallybook-protected-v1-${"b".repeat(64)}`,
};
const password = "local vault test phrase only";
const text = new TextEncoder().encode("private customer and sales record");
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  clearWorkspaceKeys();
});
afterEach(async () => {
  lockWorkspace(false);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await new Dexie("tallybook-workspace-key-vault-v1").delete();
});
async function raw() {
  const db = new Dexie("tallybook-workspace-key-vault-v1");
  await db.open();
  return db;
}
it("persists only a wrapped key; creation does not unlock or authorize", async () => {
  await createWorkspaceKey(scope, password);
  expect(() => assertWorkspaceKeyUnlocked(scope)).toThrow(/Unlock/);
  expect(workspaceSnapshot()).toBeNull();
  const db = await raw();
  const rows = await db.table("keys").toArray();
  db.close();
  expect(rows).toHaveLength(1);
  expect(Object.keys(rows[0]).sort()).toEqual([
    "id",
    "iterations",
    "iv",
    "salt",
    "version",
    "wrapped",
  ]);
  expect(rows[0].wrapped.byteLength).toBe(48);
  expect(JSON.stringify(rows)).not.toContain(password);
});
it("rejects wrong credentials and preserves the original wrapped key on duplicate creation", async () => {
  await createWorkspaceKey(scope, password);
  await expect(
    createWorkspaceKey(scope, "another long password")
  ).rejects.toThrow();
  await expect(
    unlockWorkspaceKey(scope, "incorrect long password")
  ).rejects.toThrow();
  expect(() => assertWorkspaceKeyUnlocked(scope)).toThrow();
  await unlockWorkspaceKey(scope, password);
  expect(() => assertWorkspaceKeyUnlocked(scope)).not.toThrow();
});
it("binds authenticated ciphertext to account, device and record identity across a restart", async () => {
  await createWorkspaceKey(scope, password);
  await unlockWorkspaceKey(scope, password);
  const encrypted = await sealWorkspaceRecord(scope, "sales/one", text);
  const another = await sealWorkspaceRecord(scope, "sales/one", text);
  expect(another.iv).not.toEqual(encrypted.iv);
  clearWorkspaceKeys();
  await expect(
    openWorkspaceRecord(scope, "sales/one", encrypted)
  ).rejects.toThrow(/locked/);
  await unlockWorkspaceKey(scope, password);
  expect(
    Array.from(await openWorkspaceRecord(scope, "sales/one", encrypted))
  ).toEqual(Array.from(text));
  await expect(
    openWorkspaceRecord(scope, "sales/two", encrypted)
  ).rejects.toThrow();
  await expect(
    unlockWorkspaceKey({ ...scope, userId: "attendant" }, password)
  ).rejects.toThrow(/missing/);
  await expect(
    unlockWorkspaceKey({ ...scope, deviceId: "device-b" }, password)
  ).rejects.toThrow(/missing/);
  const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0) };
  new Uint8Array(tampered.ciphertext)[0] ^= 1;
  await expect(
    openWorkspaceRecord(scope, "sales/one", tampered)
  ).rejects.toThrow();
  lockWorkspace(false);
  expect(() => assertWorkspaceKeyUnlocked(scope)).toThrow();
});
it("rejects staff PINs and legacy database names before writing", async () => {
  await expect(createWorkspaceKey(scope, "123456")).rejects.toThrow(
    /passphrase/
  );
  await expect(
    createWorkspaceKey({ ...scope, databaseName: "tallybook-db" }, password)
  ).rejects.toThrow(/identity/);
});
it("rejects a wrapped key copied into another identity and unsupported KDF metadata", async () => {
  await createWorkspaceKey(scope, password);
  const db = await raw();
  const original = (await db.table("keys").toArray())[0];
  const changed = JSON.parse(original.id);
  changed[0] = "attendant";
  await db.table("keys").add({ ...original, id: JSON.stringify(changed) });
  await expect(
    unlockWorkspaceKey({ ...scope, userId: "attendant" }, password)
  ).rejects.toThrow();
  await db.table("keys").put({ ...original, iterations: 1 });
  db.close();
  await expect(unlockWorkspaceKey(scope, password)).rejects.toThrow(/invalid/);
});
it("cannot finish unlocking or return decrypted data after signout", async () => {
  await createWorkspaceKey(scope, password);
  const unlocking = unlockWorkspaceKey(scope, password);
  lockWorkspace(false);
  await expect(unlocking).rejects.toThrow(/locked/);
  expect(() => assertWorkspaceKeyUnlocked(scope)).toThrow();
  await unlockWorkspaceKey(scope, password);
  const encrypted = await sealWorkspaceRecord(scope, "race", text);
  const reading = openWorkspaceRecord(scope, "race", encrypted);
  lockWorkspace(false);
  await expect(reading).rejects.toThrow(/locked/);
});
it("does not accept a server protection marker without unlocking a real local key", async () => {
  const session = {
    user: { id: scope.userId },
    access_token: "fixture-only",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        active: true,
        storageProtection: "encrypted-workspace-v1",
        grant: {
          ...scope,
          staffId: "staff-a",
          storeIds: ["store-a"],
          permissions: ["sell"],
          expiresAtEpochMs: Date.now() + 60000,
        },
      }),
    }))
  );
  await expect(verifyOnlineWorkspace()).rejects.toThrow(/Unlock/);
  await createWorkspaceKey(scope, password);
  await expect(
    verifyOnlineWorkspace("incorrect long password")
  ).rejects.toThrow();
  expect(workspaceSnapshot()).toBeNull();
  await verifyOnlineWorkspace(password);
  expect(workspaceSnapshot()?.deviceId).toBe(scope.deviceId);
  auth.getSession
    .mockResolvedValueOnce({ data: { session }, error: null })
    .mockRejectedValueOnce(new Error("Session recheck unavailable"));
  await expect(verifyOnlineWorkspace(password)).rejects.toThrow(
    /recheck unavailable/
  );
  expect(() => assertWorkspaceKeyUnlocked(scope)).toThrow();
  expect(workspaceSnapshot()).toBeNull();
  lockWorkspace(false);
  expect(() => assertWorkspaceKeyUnlocked(scope)).toThrow();
  expect(workspaceSnapshot()).toBeNull();
});
