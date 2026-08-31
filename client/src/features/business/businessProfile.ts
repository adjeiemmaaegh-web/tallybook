/** Tactile Ledger design reminder: a business profile is one clear local record, validated before it becomes part of the owner’s ledger. */
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { nanoid } from "nanoid";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export const BUSINESS_PROFILE_ID = "primary" as const;
export const BUSINESS_PROFILE_ID_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;

export const countries = [
  { value: "Ghana", currency: "GHS" },
  { value: "Kenya", currency: "KES" },
  { value: "Nigeria", currency: "NGN" },
  { value: "Rwanda", currency: "RWF" },
  { value: "South Africa", currency: "ZAR" },
  { value: "Tanzania", currency: "TZS" },
  { value: "Uganda", currency: "UGX" },
  { value: "Zambia", currency: "ZMW" },
  { value: "Zimbabwe", currency: "USD" },
  { value: "Other", currency: "USD" },
] as const;

export const currencies = ["GHS", "KES", "NGN", "RWF", "TZS", "UGX", "USD", "ZAR", "ZMW"] as const;

export const businessTypes = [
  "Retail shop",
  "Clothing or fashion",
  "Salon or barber",
  "Food or restaurant",
  "Mechanic or repair",
  "Professional service",
  "Market trader",
  "Wholesale",
  "Home-based business",
  "Other",
] as const;

const optionalText = (maximum: number, label: string) =>
  z.string().trim().max(maximum, `${label} must be ${maximum} characters or fewer.`).optional().or(z.literal(""));

export const businessProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter a business name with at least 2 characters.").max(80, "Business name must be 80 characters or fewer."),
  country: z.string().min(1, "Choose the country where you operate."),
  currency: z.string().min(1, "Choose the currency you use."),
  businessType: z.string().min(1, "Choose the type of business you run."),
  phone: optionalText(32, "Phone number"),
  email: optionalText(120, "Email address").refine((value) => value === "" || value === undefined || z.string().email().safeParse(value).success, "Enter a valid email address."),
  address: optionalText(160, "Address"),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

export interface BusinessProfile extends BusinessProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function toBusinessProfileFormValues(profile?: BusinessProfile | null): BusinessProfileInput {
  return {
    name: profile?.name ?? "",
    country: profile?.country ?? "",
    currency: profile?.currency ?? "",
    businessType: profile?.businessType ?? "",
    phone: profile?.phone ?? "",
    email: profile?.email ?? "",
    address: profile?.address ?? "",
  };
}

export async function getBusinessProfile(database: TallybookDB = db) {
  return database.businessProfiles.get(getActiveBusinessProfileId());
}

export async function saveBusinessProfile(input: BusinessProfileInput, database: TallybookDB = db): Promise<BusinessProfile> {
  const values = businessProfileSchema.parse(input);
  const now = new Date().toISOString();

  return database.transaction("rw", database.businessProfiles, async () => {
    const activeId = getActiveBusinessProfileId();
    const existing = await database.businessProfiles.get(activeId);
    const profile: BusinessProfile = {
      id: activeId,
      name: values.name.trim(),
      country: values.country,
      currency: values.currency,
      businessType: values.businessType,
      phone: cleanOptional(values.phone),
      email: cleanOptional(values.email),
      address: cleanOptional(values.address),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await database.businessProfiles.put(profile);
    return profile;
  });
}

export async function createBusinessProfile(input: BusinessProfileInput, database: TallybookDB = db): Promise<BusinessProfile> {
  const values = businessProfileSchema.parse(input);
  const now = new Date().toISOString();
  const id = `company-${nanoid(12)}`;
  const profile: BusinessProfile = { id, name: values.name.trim(), country: values.country, currency: values.currency, businessType: values.businessType, phone: cleanOptional(values.phone), email: cleanOptional(values.email), address: cleanOptional(values.address), createdAt: now, updatedAt: now };
  await database.transaction("rw", [database.businessProfiles, database.appMeta], async () => {
    const duplicate = await database.businessProfiles.where("name").equals(profile.name).first();
    if (duplicate) throw new Error("A company with this name is already on this device. Choose a different name.");
    await database.businessProfiles.add(profile);
    await database.appMeta.put({ key: "activeBusinessProfileId", value: id, updatedAt: now });
  });
  return profile;
}
