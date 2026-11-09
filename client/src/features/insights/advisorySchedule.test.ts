import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, unlockStaff, lockStaff } from "@/features/staff/staff";
import { createProduct } from "@/features/inventory/inventory";
import {
  createBackup,
  parseBackup,
  restoreBackup,
} from "@/features/backup/backup";
import {
  configureAdvisorySchedule,
  readAdvisorySchedule,
  runDueAdvisorySchedule,
} from "./advisorySchedule";
const databases: TallybookDB[] = [];
async function fixture() {
  setActiveBusinessProfileId("primary");
  const d = new TallybookDB(`schedule-${crypto.randomUUID()}`);
  databases.push(d);
  await initializeDatabase(d);
  await saveBusinessProfile(
    {
      name: "Scheduled shop",
      country: "Ghana",
      currency: "GHS",
      businessType: "Retail",
    },
    d
  );
  const owner = await createStaff("Owner", "owner", "123456", d);
  await unlockStaff(owner.id, "123456", d);
  await createProduct(
    {
      name: "Rice",
      categoryId: "uncategorized",
      sellingPrice: "10",
      costPrice: "1",
      initialStock: "0",
      lowStockThreshold: "1",
    },
    "GHS",
    d
  );
  return { d, owner, now: new Date() };
}
afterEach(async () => {
  vi.restoreAllMocks();
  lockStaff("primary");
  setActiveBusinessProfileId("primary");
  for (const d of databases.splice(0)) {
    d.close();
    await new Dexie(d.name).delete();
  }
});
const input = {
  state: "active" as const,
  intervalHours: 24 as const,
  kinds: ["stock", "expiry"] as ("stock" | "expiry")[],
};
it("persists opt-in, runs once across competing tabs, and never posts business transactions", async () => {
  const { d, now } = await fixture();
  expect(await readAdvisorySchedule(d)).toBeUndefined();
  expect(await runDueAdvisorySchedule(d, now)).toBeNull();
  await configureAdvisorySchedule(input, d, now);
  const results = await Promise.all([
    runDueAdvisorySchedule(d, now),
    runDueAdvisorySchedule(d, now),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(results.find(Boolean)?.findings[0].kind).toBe("stock");
  expect(
    await d.staffAudits
      .filter(r => r.action === "insights.schedule.reviewed")
      .count()
  ).toBe(1);
  expect(await d.sales.count()).toBe(0);
  expect(await d.inventoryMovements.count()).toBe(1);
  d.close();
  await d.open();
  expect((await readAdvisorySchedule(d))?.lastRun?.id).toBe(
    results.find(Boolean)?.id
  );
});
it("missed days yield one catch-up; pause and cancellation stop subsequent work", async () => {
  const { d, now } = await fixture();
  await configureAdvisorySchedule(input, d, now);
  const later = new Date(now.getTime() + 30 * 86400000);
  await runDueAdvisorySchedule(d, later);
  expect(Date.parse((await readAdvisorySchedule(d))!.nextDueAt)).toBe(
    later.getTime() + 86400000
  );
  await configureAdvisorySchedule({ ...input, state: "paused" }, d, later);
  expect(
    await runDueAdvisorySchedule(d, new Date(later.getTime() + 86400000))
  ).toBeNull();
  await configureAdvisorySchedule({ ...input, state: "cancelled" }, d, later);
  expect(
    await runDueAdvisorySchedule(d, new Date(later.getTime() + 86400000))
  ).toBeNull();
  expect(
    await d.staffAudits
      .filter(r => r.action === "insights.schedule.reviewed")
      .count()
  ).toBe(1);
});
it("locked and cashier sessions cannot configure or execute an owner schedule", async () => {
  const { d, now } = await fixture();
  await configureAdvisorySchedule(input, d, now);
  const cashier = await createStaff("Cashier", "cashier", "654321", d);
  lockStaff("primary");
  await expect(runDueAdvisorySchedule(d, now)).rejects.toThrow();
  await unlockStaff(cashier.id, "654321", d);
  await expect(configureAdvisorySchedule(input, d, now)).rejects.toThrow();
  await expect(runDueAdvisorySchedule(d, now)).rejects.toThrow();
  expect(
    (await d.businessProfiles.get("primary"))?.advisorySchedule?.lastRun
  ).toBeUndefined();
});
it("audit write failure rolls back the result and keeps the due slot retryable", async () => {
  const { d, now } = await fixture();
  await configureAdvisorySchedule(input, d, now);
  const spy = vi
    .spyOn(d.staffAudits, "add")
    .mockRejectedValueOnce(new Error("quota failure"));
  await expect(runDueAdvisorySchedule(d, now)).rejects.toThrow(/quota/);
  spy.mockRestore();
  expect((await readAdvisorySchedule(d))?.lastRun).toBeUndefined();
  expect(await runDueAdvisorySchedule(d, now)).not.toBeNull();
});
it("company edits preserve the schedule and a portable restore pauses execution", async () => {
  const { d, now } = await fixture();
  await configureAdvisorySchedule(input, d, now);
  await runDueAdvisorySchedule(d, now);
  await saveBusinessProfile(
    {
      name: "Renamed shop",
      country: "Ghana",
      currency: "GHS",
      businessType: "Retail",
    },
    d
  );
  expect((await readAdvisorySchedule(d))?.state).toBe("active");
  const archive = await createBackup(d);
  const parsed = parseBackup(JSON.stringify(archive));
  expect(
    parsed.records.businessProfiles[0].advisorySchedule?.lastRun?.findings
  ).toHaveLength(1);
  await restoreBackup(parsed, d);
  expect(
    (await d.businessProfiles.get("primary"))?.advisorySchedule?.state
  ).toBe("paused");
  const corrupt = structuredClone(archive);
  corrupt.records.businessProfiles[0].advisorySchedule!.companyId =
    "another-company";
  expect(() => parseBackup(JSON.stringify(corrupt))).toThrow(/advisory/);
});
it("rejects unapproved actions, invalid intervals and foreign persisted ownership", async () => {
  const { d, now } = await fixture();
  await expect(
    configureAdvisorySchedule(
      { ...input, kinds: ["send-payment" as never] },
      d,
      now
    )
  ).rejects.toThrow(/schedule/);
  await expect(
    configureAdvisorySchedule({ ...input, intervalHours: 0 as never }, d, now)
  ).rejects.toThrow(/schedule/);
  expect(
    (await d.businessProfiles.get("primary"))?.advisorySchedule
  ).toBeUndefined();
});
