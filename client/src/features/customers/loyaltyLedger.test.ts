// S4-04: loyalty points cannot overflow, go negative, be double spent, or leak across companies.
import Dexie from "dexie";
import {webcrypto} from "node:crypto";
import {afterEach, describe, expect, it} from "vitest";
import {TallybookDB, initializeDatabase} from "@/db/TallybookDB";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {createCustomer} from "./customers";
import {recordCustomerBenefit, getCustomerBenefits} from "./customerBenefits";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", {configurable: true, value: webcrypto});
let n = 0;
const dbs: TallybookDB[] = [];
async function setup() {
  setActiveBusinessProfileId("primary");
  const d = new TallybookDB(`loyalty-${Date.now()}-${++n}`);
  dbs.push(d);
  await initializeDatabase(d);
  await saveBusinessProfile({name: "Loyalty Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: ""}, d);
  const customer = await createCustomer({name: "Ama", phone: "+233 20 000 1111", email: "", address: "", notes: "", status: "active"}, d);
  return {d, customer};
}
afterEach(async () => {
  for (const d of dbs.splice(0)) { const name = d.name; d.close(); await new Dexie(name).delete(); }
  setActiveBusinessProfileId("primary");
});
const adj = (customerId: string, delta: number, key: string, reason = "Goodwill") => ({customerId, kind: "points" as const, delta, reason, submissionKey: key});

describe("loyalty points ledger", () => {
  it("earns, redeems and never lets the balance go negative (no double spend)", async () => {
    const {d, customer} = await setup();
    await recordCustomerBenefit(adj(customer.id, 100, "earn-0001"), d);
    await recordCustomerBenefit(adj(customer.id, -60, "spend-001"), d);
    await expect(recordCustomerBenefit(adj(customer.id, -60, "spend-002"), d)).rejects.toThrow(/Insufficient balance/);
    expect((await getCustomerBenefits(customer.id, d)).points).toBe(40);
    await recordCustomerBenefit(adj(customer.id, -40, "spend-003"), d);
    expect((await getCustomerBenefits(customer.id, d)).points).toBe(0);
  });
  it("replaying the same submission is idempotent; reusing a key with different details is refused", async () => {
    const {d, customer} = await setup();
    const first = await recordCustomerBenefit(adj(customer.id, 50, "replay-001"), d);
    const again = await recordCustomerBenefit(adj(customer.id, 50, "replay-001"), d);
    expect(again.id).toBe(first.id);
    expect(await d.customerBenefits.count()).toBe(1);
    await expect(recordCustomerBenefit(adj(customer.id, 51, "replay-001"), d)).rejects.toThrow(/different/i);
  });
  it("rejects zero, fractional, huge and unsafe adjustments and cannot overflow the balance", async () => {
    const {d, customer} = await setup();
    for (const [i, delta] of [0, 1.5, 1_000_000_001, Number.MAX_SAFE_INTEGER, NaN].entries())
      await expect(recordCustomerBenefit(adj(customer.id, delta, `bad-000${i}`), d)).rejects.toThrow(/Invalid benefit adjustment/);
    // Push the stored balance to the safe-integer edge directly, then prove a further credit is refused, not wrapped.
    await d.customerBenefits.add({id: "edge", businessProfileId: "primary", customerId: customer.id, kind: "points", delta: Number.MAX_SAFE_INTEGER - 5, reason: "edge", submissionKey: "edge-0001", createdAt: new Date().toISOString()} as never);
    await expect(recordCustomerBenefit(adj(customer.id, 100, "over-0001"), d)).rejects.toThrow(/Insufficient balance or invalid/);
  });
  it("wallet money cannot be adjusted here; a reason and a valid key are required", async () => {
    const {d, customer} = await setup();
    await expect(recordCustomerBenefit({customerId: customer.id, kind: "wallet", delta: 100, reason: "x", submissionKey: "wallet-001"}, d)).rejects.toThrow(/verified prepaid/);
    await expect(recordCustomerBenefit(adj(customer.id, 5, "reason-01", "  "), d)).rejects.toThrow(/reason/);
    await expect(recordCustomerBenefit(adj(customer.id, 5, "short"), d)).rejects.toThrow(/submission key/);
  });
  it("a corrupted (negative) ledger is reported, not silently clamped; another company's customer is unavailable", async () => {
    const {d, customer} = await setup();
    await d.customerBenefits.add({id: "neg", businessProfileId: "primary", customerId: customer.id, kind: "points", delta: -5, reason: "corrupt", submissionKey: "corrupt-01", createdAt: new Date().toISOString()} as never);
    await expect(getCustomerBenefits(customer.id, d)).rejects.toThrow(/requires reconciliation/);
    setActiveBusinessProfileId("other-company");
    await expect(recordCustomerBenefit(adj(customer.id, 5, "cross-0001"), d)).rejects.toThrow(/unavailable|denied|not/i);
  });
});
