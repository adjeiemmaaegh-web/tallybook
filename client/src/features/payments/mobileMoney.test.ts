import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { addMobileMoneyProvider, getMobileMoneyProviders, setMobileMoneyProviderActive } from "@/features/payments/mobileMoney";

const names = new Set<string>();
const opened: Dexie[] = [];
let sequence = 0;

function makeDatabase() { const database = new TallybookDB(`tallybook-mobile-money-test-${Date.now()}-${++sequence}`); names.add(database.name); opened.push(database); return database; }

afterEach(async () => { opened.splice(0).forEach((database) => database.close()); await Promise.all([...names].map((name) => new Dexie(name).delete())); names.clear(); });

describe("local Mobile Money providers", () => {
  it("normalizes duplicate names, lists only active providers for checkout, and keeps disabled providers as historical configuration", async () => {
    const database = makeDatabase(); await initializeDatabase(database);
    await saveBusinessProfile({ name: "Provider Shop", country: "Other", currency: "USD", businessType: "Retail shop", phone: "", email: "", address: "" }, database);

    const first = await addMobileMoneyProvider({ name: "  Airtel   Money " }, database);
    const duplicate = await addMobileMoneyProvider({ name: "airtel money" }, database);
    await setMobileMoneyProviderActive(first.id, false, database);

    expect(duplicate.id).toBe(first.id);
    expect(await getMobileMoneyProviders(database)).toMatchObject([{ name: "Airtel Money", active: false }]);
    expect(await getMobileMoneyProviders(database, false)).toEqual([]);
  });

  it("rejects a provider list if the active company changes while Dexie reads it", async () => {
    const database = makeDatabase(); await initializeDatabase(database);
    await saveBusinessProfile({ name: "Provider Shop", country: "Other", currency: "USD", businessType: "Retail shop", phone: "", email: "", address: "" }, database);
    await addMobileMoneyProvider({ name: "Company A Provider" }, database);
    await database.businessProfiles.put({ id: "company-two", name: "Company B", country: "Other", currency: "GHS", businessType: "Retail shop", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as never);
    setActiveBusinessProfileId("primary");
    const switchDuringRead = (record: unknown) => { setActiveBusinessProfileId("company-two"); return record; };
    database.mobileMoneyProviders.hook("reading").subscribe(switchDuringRead);
    try {
      await expect(getMobileMoneyProviders(database)).rejects.toThrow(/Company changed/i);
    } finally {
      database.mobileMoneyProviders.hook("reading").unsubscribe(switchDuringRead);
      setActiveBusinessProfileId("primary");
    }
  });
});
