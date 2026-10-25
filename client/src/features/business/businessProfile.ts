import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
/** Tactile Ledger design reminder: a business profile is one clear local record, validated before it becomes part of the owner’s ledger. */
import { taxPolicySchema } from "@/features/sales/tax";
import type {ReturnPolicyRevision} from './returnPolicy.mjs';
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { nanoid } from "nanoid";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission } from "@/features/staff/staff";

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
  taxPolicy: taxPolicySchema.optional(),
  name: z.string().trim().min(2, "Enter a business name with at least 2 characters.").max(80, "Business name must be 80 characters or fewer."),
  country: z.string().min(1, "Choose the country where you operate."),
  currency: z.string().min(1, "Choose the currency you use."),
  businessType: z.string().min(1, "Choose the type of business you run."),
  preferredPaymentMethod: z.enum(["mobile", "cash", "card"]).optional(),
  mobileMoneyProviderName: optionalText(80, "Mobile Money provider"),
  cardProviderName: optionalText(80, "Card provider"),
  phone: optionalText(32, "Phone number"),
  email: optionalText(120, "Email address").refine((value) => value === "" || value === undefined || z.string().email().safeParse(value).success, "Enter a valid email address."),
  address: optionalText(160, "Address"),
});

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

export interface BusinessProfile extends BusinessProfileInput {
  /** Company-owner configured append-only return policy revisions. Legacy omission means disabled. */
  returnPolicyHistory?:ReturnPolicyRevision[];
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
    taxPolicy: profile?.taxPolicy,
    name: profile?.name ?? "",
    country: profile?.country ?? "Ghana",
    currency: profile?.currency ?? "GHS",
    preferredPaymentMethod: profile ? profile.preferredPaymentMethod ?? "cash" : "mobile",
    mobileMoneyProviderName: profile?.mobileMoneyProviderName ?? "",
    cardProviderName: profile?.cardProviderName ?? "",
    businessType: profile?.businessType ?? "",
    phone: profile?.phone ?? "",
    email: profile?.email ?? "",
    address: profile?.address ?? "",
  };
}

export async function getBusinessProfile(database: TallybookDB = db) {
  const company = getActiveBusinessProfileId();
  const profile = await database.businessProfiles.get(company);
  if (company !== getActiveBusinessProfileId()) throw new Error("Company changed; reload the business profile.");
  return profile;
}

export async function saveBusinessProfile(input: BusinessProfileInput, database: TallybookDB = db, expectedCompanyId?: string): Promise<BusinessProfile> {
  const activeId = getActiveBusinessProfileId();
  const expectedId = expectedCompanyId ?? activeId;
  if (expectedId !== activeId) throw new Error("Company changed; reload the business profile before saving.");
  const values = businessProfileSchema.parse(input);
  const now = new Date().toISOString();

  return withCoordinatedRetailWrite(() => database.transaction("rw", [database.businessProfiles, database.mobileMoneyProviders, database.staffMembers, database.staffAudits], async () => {
    const actor = await requirePermission("staff", database, activeId);
    if (expectedId !== activeId || activeId !== getActiveBusinessProfileId()) throw new Error("Company changed; business profile not saved.");
    const existing = await database.businessProfiles.get(activeId);
    const profile: BusinessProfile = {
      id: activeId,
      taxPolicy: values.taxPolicy ?? existing?.taxPolicy,
      // General company-details forms cannot rewrite or erase refund governance.
      returnPolicyHistory:existing?.returnPolicyHistory,
      name: values.name.trim(),
      country: values.country,
      currency: values.currency,
      businessType: values.businessType,
      preferredPaymentMethod: values.preferredPaymentMethod ?? existing?.preferredPaymentMethod ?? "mobile",
      mobileMoneyProviderName: cleanOptional(values.mobileMoneyProviderName),
      cardProviderName: cleanOptional(values.cardProviderName),
      phone: cleanOptional(values.phone),
      email: cleanOptional(values.email),
      address: cleanOptional(values.address),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (expectedId !== activeId || activeId !== getActiveBusinessProfileId()) throw new Error("Company changed; business profile not saved.");
    await database.businessProfiles.put(profile);
    await saveInitialProvider(profile, database);
    if (actor) await database.staffAudits.add({ id: nanoid(14), businessProfileId: activeId, staffId: actor.id, action: "business.updated", details: profile.id, createdAt: now });
    if (expectedId !== activeId || activeId !== getActiveBusinessProfileId()) throw new Error("Company changed; business profile not saved.");
    return profile;
  }));
}

export async function createBusinessProfile(input: BusinessProfileInput, database: TallybookDB = db): Promise<BusinessProfile> {
  const activeId = getActiveBusinessProfileId();
  const values = businessProfileSchema.parse(input);
  const now = new Date().toISOString();
  const id = `company-${nanoid(12)}`;
  const profile: BusinessProfile = { id, taxPolicy: values.taxPolicy, name: values.name.trim(), country: values.country, currency: values.currency, businessType: values.businessType, preferredPaymentMethod: values.preferredPaymentMethod ?? "mobile", mobileMoneyProviderName: cleanOptional(values.mobileMoneyProviderName), cardProviderName: cleanOptional(values.cardProviderName), phone: cleanOptional(values.phone), email: cleanOptional(values.email), address: cleanOptional(values.address), createdAt: now, updatedAt: now };
  await withCoordinatedRetailWrite(() => database.transaction("rw", [database.businessProfiles, database.appMeta, database.mobileMoneyProviders, database.staffMembers], async () => {
    await requirePermission("staff", database, activeId);
    const duplicate = await database.businessProfiles.where("name").equals(profile.name).first();
    if (duplicate) throw new Error("A company with this name is already on this device. Choose a different name.");
    await database.businessProfiles.add(profile);
    await saveInitialProvider(profile, database);
    if (activeId !== getActiveBusinessProfileId()) throw new Error("Company changed; new business not saved.");
    await database.appMeta.put({ key: "activeBusinessProfileId", value: id, updatedAt: now });
  }));
  return profile;
}

async function saveInitialProvider(profile: BusinessProfile, database: TallybookDB) {
  const name = profile.mobileMoneyProviderName?.trim().replace(/\s+/g, " ");
  if (!name) return;
  if (name.length < 2) throw new Error("Enter a provider name with at least 2 characters.");
  const normalizedName = name.toLocaleLowerCase();
  const existing = await database.mobileMoneyProviders.where("businessProfileId").equals(profile.id).and(provider => provider.normalizedName === normalizedName).first();
  if (!existing) await database.mobileMoneyProviders.add({ id: nanoid(14), businessProfileId: profile.id, name, normalizedName, active: true, createdAt: profile.updatedAt, updatedAt: profile.updatedAt });
}
