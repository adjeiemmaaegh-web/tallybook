import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { TallybookDB } from "@/db/TallybookDB";
import { lockWorkspace, verifyOnlineWorkspace } from "./workspaceBoundary";
import { requirePermission } from "@/features/staff/staff";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: () => ({ auth }),
}));
const databases: TallybookDB[] = [];
const fresh = () => {
  const db = new TallybookDB(`workspace-boundary-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
};
afterEach(async () => {
  lockWorkspace();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) {
    db.close();
    await new Dexie(db.name).delete();
  }
});
it("rejects direct IndexedDB service reads and writes without mounting React", async () => {
  const db = fresh();
  for (const read of [
    () => db.sales.toArray(),
    () => db.products.count(),
    () => db.businessProfiles.get("primary"),
  ])
    await expect(read()).rejects.toThrow(/authorized/);
  await expect(
    db.appMeta.put({
      key: "schemaVersion",
      value: "39",
      updatedAt: new Date().toISOString(),
    })
  ).rejects.toThrow(/authorized/);
  await expect(requirePermission("sell", db, "primary")).rejects.toThrow(
    /authorized/
  );
  await expect(requirePermission("reports", db, "primary")).rejects.toThrow(
    /authorized/
  );
});
it("retains legacy records when unauthenticated application access is refused", async () => {
  const db = fresh();
  const raw = new Dexie(db.name);
  raw.version(1).stores({ appMeta: "key" });
  await raw
    .table("appMeta")
    .put({ key: "legacy-sentinel", value: "preserve-me" });
  raw.close();
  await expect(db.appMeta.toArray()).rejects.toThrow(/authorized/);
  db.close();
  const check = new Dexie(db.name);
  await check.open();
  expect(await check.table("appMeta").get("legacy-sentinel")).toMatchObject({
    value: "preserve-me",
  });
  check.close();
});
it("rejects a SPA response instead of treating it as workspace authorization", async () => {
  const session = {
    user: { id: "user-a" },
    access_token: "test-token-not-a-credential",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
      })
  );
  await expect(verifyOnlineWorkspace()).rejects.toThrow(/no verified/);
  await expect(fresh().sales.toArray()).rejects.toThrow(/authorized/);
});
