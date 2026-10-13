/** Read-only, company-scoped onboarding indicators. Counts do not mutate business records. */
export interface SetupCounts { products: number; customers: number; sales: number }
export interface SetupStep { id: "products" | "customers" | "sales" | "backup"; title: string; href: string; done: boolean; optional?: boolean }
export function buildSetupSteps(counts: SetupCounts): SetupStep[] {
  for (const value of Object.values(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid onboarding count.");
  }
  return [
    { id: "products", title: "Add your first product", href: "/inventory", done: counts.products > 0 },
    { id: "customers", title: "Add a customer (optional)", href: "/customers", done: counts.customers > 0, optional: true },
    { id: "sales", title: "Record your first sale", href: "/sales", done: counts.sales > 0 },
    { id: "backup", title: "Create a backup after your first sale", href: "/backup", done: false, optional: true },
  ];
}
