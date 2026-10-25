import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assertCompanyScope } from "@/features/business/companyScope.mjs";
import { requirePermission } from "@/features/staff/staff";

export interface MobileMoneyProvider {
  id: string;
  businessProfileId: string;
  name: string;
  normalizedName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const mobileMoneyProviderSchema = z.object({
  name: z.string().trim().min(2, "Enter a provider name with at least 2 characters.").max(80, "Provider name must be 80 characters or fewer."),
});

export type MobileMoneyProviderInput = z.infer<typeof mobileMoneyProviderSchema>;

function normalizeProviderName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export async function getMobileMoneyProviders(database: TallybookDB = db, includeInactive = true): Promise<MobileMoneyProvider[]> {
  const company = getActiveBusinessProfileId();
  const providers = await database.mobileMoneyProviders.where("businessProfileId").equals(company).toArray();
  assertCompanyScope(company, getActiveBusinessProfileId());
  const result = providers.filter((provider) => includeInactive || provider.active).sort((left, right) => left.name.localeCompare(right.name));
  assertCompanyScope(company, getActiveBusinessProfileId());
  return result;
}

export async function addMobileMoneyProvider(input: MobileMoneyProviderInput, database: TallybookDB = db): Promise<MobileMoneyProvider> {
  const activeId = getActiveBusinessProfileId();
  const values = mobileMoneyProviderSchema.parse(input);
  const name = values.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeProviderName(name);
  const now = new Date().toISOString();

  return database.transaction("rw", [database.businessProfiles, database.mobileMoneyProviders, database.staffMembers, database.staffAudits], async () => {
    assertCompanyScope(activeId, getActiveBusinessProfileId());
    const actor = await requirePermission("staff", database, activeId);
    const profile = await database.businessProfiles.get(activeId);
    if (!profile) throw new Error("Save your business details before adding a Mobile Money provider.");
    const existing = (await database.mobileMoneyProviders.where("businessProfileId").equals(activeId).toArray()).find((provider) => provider.normalizedName === normalizedName);
    if (existing) { assertCompanyScope(activeId, getActiveBusinessProfileId()); return existing; }
    const provider: MobileMoneyProvider = { id: nanoid(14), businessProfileId: activeId, name, normalizedName, active: true, createdAt: now, updatedAt: now };
    assertCompanyScope(activeId, getActiveBusinessProfileId());
    await database.mobileMoneyProviders.add(provider);
    if (actor) await database.staffAudits.add({ id: nanoid(14), businessProfileId: activeId, staffId: actor.id, action: "payments.provider.added", createdAt: now, details: provider.id });
    assertCompanyScope(activeId, getActiveBusinessProfileId());
    return provider;
  });
}

export async function setMobileMoneyProviderActive(providerId: string, active: boolean, database: TallybookDB = db): Promise<MobileMoneyProvider> {
  const company = getActiveBusinessProfileId();
  if (typeof active !== "boolean") throw new Error("Invalid provider status.");
  return database.transaction("rw", [database.mobileMoneyProviders, database.staffMembers, database.staffAudits], async () => {
    assertCompanyScope(company, getActiveBusinessProfileId());
    const actor = await requirePermission("staff", database, company);
    const provider = await database.mobileMoneyProviders.get(providerId);
    if (!provider || provider.businessProfileId !== company) throw new Error("This Mobile Money provider is no longer available.");
    const updated = { ...provider, active, updatedAt: new Date().toISOString() };
    assertCompanyScope(company, getActiveBusinessProfileId());
    await database.mobileMoneyProviders.put(updated);
    if (actor) await database.staffAudits.add({ id: nanoid(14), businessProfileId: company, staffId: actor.id, action: "payments.provider.status", createdAt: updated.updatedAt, details: `${providerId}:${active}` });
    assertCompanyScope(company, getActiveBusinessProfileId());
    return updated;
  });
}
