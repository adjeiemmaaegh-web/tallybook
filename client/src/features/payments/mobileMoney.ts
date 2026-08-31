import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

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
  const providers = await database.mobileMoneyProviders.where("businessProfileId").equals(getActiveBusinessProfileId()).toArray();
  return providers.filter((provider) => includeInactive || provider.active).sort((left, right) => left.name.localeCompare(right.name));
}

export async function addMobileMoneyProvider(input: MobileMoneyProviderInput, database: TallybookDB = db): Promise<MobileMoneyProvider> {
  const values = mobileMoneyProviderSchema.parse(input);
  const name = values.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeProviderName(name);
  const now = new Date().toISOString();

  return database.transaction("rw", database.businessProfiles, database.mobileMoneyProviders, async () => {
    const activeId = getActiveBusinessProfileId();
    const profile = await database.businessProfiles.get(activeId);
    if (!profile) throw new Error("Save your business details before adding a Mobile Money provider.");
    const existing = (await database.mobileMoneyProviders.where("businessProfileId").equals(activeId).toArray()).find((provider) => provider.normalizedName === normalizedName);
    if (existing) return existing;
    const provider: MobileMoneyProvider = { id: nanoid(14), businessProfileId: activeId, name, normalizedName, active: true, createdAt: now, updatedAt: now };
    await database.mobileMoneyProviders.add(provider);
    return provider;
  });
}

export async function setMobileMoneyProviderActive(providerId: string, active: boolean, database: TallybookDB = db): Promise<MobileMoneyProvider> {
  return database.transaction("rw", database.mobileMoneyProviders, async () => {
    const provider = await database.mobileMoneyProviders.get(providerId);
    if (!provider || provider.businessProfileId !== getActiveBusinessProfileId()) throw new Error("This Mobile Money provider is no longer available.");
    const updated = { ...provider, active, updatedAt: new Date().toISOString() };
    await database.mobileMoneyProviders.put(updated);
    return updated;
  });
}
