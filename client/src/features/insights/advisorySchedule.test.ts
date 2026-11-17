import {createCustomer} from "@/features/customers/customers";
import {recordWalletTransfer} from "@/features/customers/walletTransfers";
import {createSupplier,completePurchase} from "@/features/purchases/purchases";
import {recognizeUnpaidPurchase} from "@/features/purchases/supplierPayables.ts";
import {completeSale} from "@/features/sales/sales";
import {RESTORE_JOURNAL_KEY} from "@/features/backup/restoreJournal.mjs";
import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, unlockStaff, lockStaff, openShift } from "@/features/staff/staff";
import { createProduct, adjustStock } from "@/features/inventory/inventory";
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
  const product=await createProduct(
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
  return { d, owner,product, now: new Date() };
}
afterEach(async () => {
  vi.restoreAllMocks();
  lockStaff("primary");
  setActiveBusinessProfileId("primary");
  const opened=databases.splice(0),names=new Set(opened.map(d=>d.name));
  for(const d of opened)d.close();
  for(const name of names)await new Dexie(name).delete();
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
  const peer=new TallybookDB(d.name);databases.push(peer);await peer.open();
  const results = await Promise.all([
    runDueAdvisorySchedule(d, now),
    runDueAdvisorySchedule(peer, now),
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

it('interrupted recovery blocks schedule approval and due-result writes without consuming a slot',async()=>{
 const {d,now}=await fixture();await configureAdvisorySchedule(input,d,now);
 const before=await d.businessProfiles.get('primary'),audits=await d.staffAudits.toArray();
 await d.appMeta.put({key:RESTORE_JOURNAL_KEY,value:'interrupted recovery fixture',updatedAt:now.toISOString()});
 await expect(configureAdvisorySchedule({...input,state:'paused'},d,now)).rejects.toThrow(/requires recovery/);
 await expect(runDueAdvisorySchedule(d,now)).rejects.toThrow(/requires recovery/);
 expect(await d.businessProfiles.get('primary')).toEqual(before);expect(await d.staffAudits.toArray()).toEqual(audits);
});
it('a new unlock of the same owner invalidates an in-flight schedule read',async()=>{
 const {d,owner,now}=await fixture();await configureAdvisorySchedule(input,d,now);
 const get=d.businessProfiles.get.bind(d.businessProfiles);
 vi.spyOn(d.businessProfiles,'get').mockImplementationOnce(async key=>{
  const saved=await get(key);lockStaff('primary');await Dexie.waitFor(unlockStaff(owner.id,'123456',d));return saved;
 });
 await expect(readAdvisorySchedule(d)).rejects.toThrow(/owner session changed/);
});
it('approval captures its input and time before asynchronous coordination',async()=>{
 const {d,now}=await fixture(),expected=now.toISOString();const requested={...input,kinds:[...input.kinds]};
 const task=configureAdvisorySchedule(requested,d,now);requested.kinds.splice(0,2,'debt' as never);now.setFullYear(2040);
 const saved=await task;expect(saved.kinds).toEqual(['stock','expiry']);expect(saved.updatedAt).toBe(expected);
});
it('scheduled business evidence leaves every financial, inventory, customer and supplier record unchanged',async()=>{
 const {d,product}=await fixture();await openShift(0,d);
 await adjustStock(product.id,{movementType:'increase',quantity:'5'},d);
 const customer=await createCustomer({name:'Advisory customer',phone:'+233000000001',email:'',address:'',notes:'',status:'active'},d);
 const supplier=await createSupplier({name:'Advisory supplier',phone:'',email:'',address:'',notes:''},d);
 const purchase=await completePurchase({supplierId:supplier.id,purchaseDate:new Date().toISOString().slice(0,10),submissionKey:'schedule-purchase',lines:[{productId:product.id,quantity:'3',unitCost:'1'}]},'GHS',d);
 await recognizeUnpaidPurchase(purchase.id,'schedule-payable',d);
 await recordWalletTransfer({customerId:customer.id,kind:'deposit',amountMinor:2000,method:'cash',reference:'fixture',submissionKey:'schedule-wallet'},d);
 await completeSale({lines:[{productId:product.id,quantity:1}],customerId:customer.id,discount:'0',paymentMethod:'credit',amountPaid:'0',currency:'GHS',submissionKey:'schedule-credit'},d);
 const now=new Date();await configureAdvisorySchedule({...input,kinds:['debt','repayment']},d,now);
 const tables=d.tables.filter(t=>!['businessProfiles','staffAudits'].includes(t.name));
 const snapshot=async()=>Promise.all(tables.map(async table=>({table:table.name,rows:await table.toArray()})));
 const before=await snapshot(),result=await runDueAdvisorySchedule(d,now);
 expect(result?.findings.find(f=>f.kind==='debt')?.evidence).toBe('Current recorded outstanding debt: 1000 minor currency units');
 expect(await snapshot()).toEqual(before);
 expect((await d.businessProfiles.get('primary'))?.advisorySchedule?.lastRun?.id).toBe(result?.id);
});
