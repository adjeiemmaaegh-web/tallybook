/** Tactile Ledger customer reminder: people records stay local, and financial figures are never invented before a real transaction exists. */
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export const CUSTOMER_BUSINESS_ID = "primary" as const;
export const customerStatuses = ["active", "inactive"] as const;
export type CustomerStatus = (typeof customerStatuses)[number];

export interface Customer {
  id: string;
  businessProfileId: string;
  name: string;
  normalizedName: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface CustomerSnapshot {
  customers: Customer[];
  archivedCustomers: Customer[];
}

const optionalText = (maximum: number, label: string) => z.string().trim().max(maximum, `${label} must be ${maximum} characters or fewer.`).optional().or(z.literal(""));

export const customerFormSchema = z.object({
  name: z.string().trim().min(2, "Enter a customer name with at least 2 characters.").max(100, "Customer name must be 100 characters or fewer."),
  phone: z.string().trim().min(7, "Enter a phone number with at least 7 characters.").max(32, "Phone number must be 32 characters or fewer."),
  email: optionalText(120, "Email address").refine((value) => value === "" || value === undefined || z.string().email().safeParse(value).success, "Enter a valid email address."),
  address: optionalText(180, "Address"),
  notes: optionalText(500, "Notes"),
  status: z.enum(customerStatuses),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

function cleanOptional(value: string | undefined) { const trimmed = value?.trim(); return trimmed || undefined; }
export function normalizeCustomerName(value: string) { return value.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }
export function customerFormValues(customer?: Customer | null): CustomerFormValues { return { name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "", address: customer?.address ?? "", notes: customer?.notes ?? "", status: customer?.status ?? "active" }; }

export async function getCustomerSnapshot(database: TallybookDB = db): Promise<CustomerSnapshot> {
  const activeId = getActiveBusinessProfileId();
  const allCustomers = (await database.customers.orderBy("name").toArray()).filter((customer) => customer.businessProfileId === activeId);
  return { customers: allCustomers.filter((customer) => !customer.archivedAt), archivedCustomers: allCustomers.filter((customer) => Boolean(customer.archivedAt)) };
}

export async function createCustomer(values: CustomerFormValues, database: TallybookDB = db) {
  const input = customerFormSchema.parse(values);
  const now = new Date().toISOString();
  const normalizedName = normalizeCustomerName(input.name);
  const activeId = getActiveBusinessProfileId();
  const duplicate = await database.customers.where("normalizedName").equals(normalizedName).and((customer) => customer.businessProfileId === activeId && !customer.archivedAt).first();
  if (duplicate) throw new Error("An active customer with this name already exists.");
  const customer: Customer = { id: nanoid(12), businessProfileId: getActiveBusinessProfileId(), name: input.name.trim(), normalizedName, phone: input.phone.trim(), email: cleanOptional(input.email), address: cleanOptional(input.address), notes: cleanOptional(input.notes), status: input.status, createdAt: now, updatedAt: now };
  await database.customers.add(customer);
  return customer;
}

export async function updateCustomer(customerId: string, values: CustomerFormValues, database: TallybookDB = db) {
  const input = customerFormSchema.parse(values);
  const existing = await database.customers.get(customerId);
  if (!existing || existing.businessProfileId !== getActiveBusinessProfileId() || existing.archivedAt) throw new Error("This customer is no longer active.");
  const normalizedName = normalizeCustomerName(input.name);
  const activeId = getActiveBusinessProfileId();
  const duplicate = await database.customers.where("normalizedName").equals(normalizedName).and((customer) => customer.businessProfileId === activeId && customer.id !== customerId && !customer.archivedAt).first();
  if (duplicate) throw new Error("An active customer with this name already exists.");
  const updated: Customer = { ...existing, name: input.name.trim(), normalizedName, phone: input.phone.trim(), email: cleanOptional(input.email), address: cleanOptional(input.address), notes: cleanOptional(input.notes), status: input.status, updatedAt: new Date().toISOString() };
  await database.customers.put(updated);
  return updated;
}

export async function archiveCustomer(customerId: string, database: TallybookDB = db) {
  const customer = await database.customers.get(customerId);
  if (!customer || customer.businessProfileId !== getActiveBusinessProfileId() || customer.archivedAt) throw new Error("This customer is already archived or unavailable.");
  const archived = { ...customer, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await database.customers.put(archived);
  return archived;
}

export function searchCustomers(customers: Customer[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return customers;
  return customers.filter((customer) => [customer.name, customer.phone, customer.email ?? ""].some((value) => value.toLocaleLowerCase().includes(term)));
}
