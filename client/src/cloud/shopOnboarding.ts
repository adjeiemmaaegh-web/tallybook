/**
 * Owner first-run checklist for the shared shop (PRD UX2/UX3).
 *
 * Pure and dependency-free so it can be tested without a browser. It only
 * reports what the server-provided overview proves: a step is done when the
 * data exists, never because a button was pressed. `hasSale` is `null` while
 * unknown (offline, or the sales list has not loaded), and the shop is never
 * called "ready to sell" on an unknown.
 */
export interface OnboardingOverview {
  stores: Array<{ id: string; status: string }>;
  products: Array<{ id: string; active: boolean }>;
  stock: Array<{ storeId: string; productId: string; quantity: number }>;
}

export type StepId = "store" | "product" | "stock" | "sale";
export interface ChecklistStep { id: StepId; title: string; hint: string; done: boolean; unknown: boolean; goTo: "team" | "stock" | "sell" }
export interface Checklist {
  steps: ChecklistStep[];
  /** First step that is not done, or null when everything is done. */
  next: ChecklistStep | null;
  /** Minimum prerequisites to sell: an active store, an active product and stock of it. */
  readyToSell: boolean;
  /** Every step is done and the first sale is confirmed. */
  complete: boolean;
  doneCount: number;
}

export function buildChecklist(overview: OnboardingOverview, hasSale: boolean | null): Checklist {
  const activeStores = overview.stores.filter(s => s.status === "active");
  const activeProducts = overview.products.filter(p => p.active);
  const storeIds = new Set(activeStores.map(s => s.id));
  const productIds = new Set(activeProducts.map(p => p.id));
  const stocked = overview.stock.some(s => storeIds.has(s.storeId) && productIds.has(s.productId) && s.quantity > 0);
  const steps: ChecklistStep[] = [
    { id: "store", title: "Add your store", hint: "Name the place you sell from.", done: activeStores.length > 0, unknown: false, goTo: "team" },
    { id: "product", title: "Add a product", hint: "A name and a price is enough to start.", done: activeProducts.length > 0, unknown: false, goTo: "stock" },
    { id: "stock", title: "Add opening stock", hint: "Count what is on the shelf now.", done: stocked, unknown: false, goTo: "stock" },
    { id: "sale", title: "Record your first sale", hint: "This is a real sale. You can refund it afterwards if it was a test.", done: hasSale === true, unknown: hasSale === null, goTo: "sell" },
  ];
  const next = steps.find(s => !s.done) ?? null;
  const readyToSell = steps[0]!.done && steps[1]!.done && steps[2]!.done;
  return { steps, next, readyToSell, complete: steps.every(s => s.done), doneCount: steps.filter(s => s.done).length };
}
