import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { requirePermission } from "@/features/staff/staff";

/** Device-local order requests only. Never an accepted sale, payment or stock reservation. */
export interface CommerceOrderLine { productId: string; name: string; quantity: number; unitPriceMinor: number; }
export interface CommerceOrder { id: string; businessProfileId: string; createdAt: string; updatedAt: string; status: "draft" | "prepared" | "ready" | "reserved" | "packed" | "dispatched" | "delivered" | "return-requested" | "cancelled"; customerName: string; lines: CommerceOrderLine[]; totalMinor: number; storeId?:string; saleId?:string; reservationKey?:string; reservationExpiresAt?:string; cancellationKey?:string; dispatchedAt?:string; deliveredAt?:string; deliveryMethod?:"pickup"|"delivery"; customerContact?:string; deliveryInstructions?:string; }
export interface CatalogueItem { id: string; name: string; sku?: string; priceMinor: number; itemKind: "stock" | "service"; }
/** Internal preparation only: these states never imply payment, stock allocation or delivery. */
export function nextPreparationStatus(current: CommerceOrder["status"], action: "prepare" | "ready" | "cancel"): CommerceOrder["status"] {
  const allowed: Record<CommerceOrder["status"], Partial<Record<typeof action, CommerceOrder["status"]>>> = {
    draft: { prepare: "prepared", cancel: "cancelled" },
    prepared: { ready: "ready", cancel: "cancelled" },
    ready: { cancel: "cancelled" }, reserved:{}, packed:{}, dispatched:{}, delivered:{}, "return-requested":{}, cancelled: {},
  };
  const next = allowed[current]?.[action];
  if (!next) throw new Error("Invalid order preparation transition.");
  return next;
}
/** Only owner-controlled, local snapshot data may be displayed; never reveal wholesale cost. */
export function publishableCatalogue(items: CatalogueItem[]): CatalogueItem[] {
  return items.filter(item => typeof item.id === "string" && item.id.length > 0 && typeof item.name === "string" && item.name.trim().length > 0 &&
    Number.isSafeInteger(item.priceMinor) && item.priceMinor >= 0 && item.priceMinor <= 1_000_000_000 &&
    (item.itemKind === "stock" || item.itemKind === "service"));
}
export const COMMERCE_RELEASE_SCOPE = Object.freeze({ catalogue: true, localDraftOrders: true, publicStorefront: false, onlinePayments: false, reserveStock: false, fulfillOrders: false, automaticSync: false, localPublicPreview:true, authorizedPOSLink:true });
export function requireCommerceCapability(name: keyof typeof COMMERCE_RELEASE_SCOPE) { if (!COMMERCE_RELEASE_SCOPE[name]) throw new Error(`Online commerce feature unavailable: ${name}`); }
function companyId() { const id = getActiveBusinessProfileId(); if (!id || typeof id !== "string") throw new Error("Select a company first."); return id; }
export function calculateOrderTotal(lines: CommerceOrderLine[]): number {
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw new Error("Choose 1–100 products.");
  let sum = 0;
  for (const line of lines) {
    if (!line || !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 9999 || !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0 || line.unitPriceMinor > 1_000_000_000) throw new Error("Invalid order line.");
    const amount = line.quantity * line.unitPriceMinor;
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(sum + amount)) throw new Error("Order amount exceeds safe range.");
    sum += amount;
  }
  if (new Set(lines.map(line => line.productId)).size !== lines.length) throw new Error("Duplicate products are not allowed.");
  return sum;
}
export async function listCatalogue(database: TallybookDB = db): Promise<CatalogueItem[]> {
  const id = companyId();
  const products = await database.products.where("businessProfileId").equals(id).toArray();
  if (id !== companyId()) throw new Error("Company changed; reload catalogue.");
  return publishableCatalogue(products.filter(p => !p.archivedAt).map(p => ({ id: p.id, name: p.name, sku: p.sku, priceMinor: p.sellingPriceMinor, itemKind: p.itemKind === "service" ? "service" : "stock" })));
}
export async function createDraftOrder(customerName: string, requested: Array<{productId:string;quantity:number}>, database: TallybookDB = db, options?:{deliveryMethod?:"pickup"|"delivery";customerContact?:string;deliveryInstructions?:string}): Promise<CommerceOrder> {
  requireCommerceCapability("localDraftOrders");
  const company = companyId();
  const name = customerName.trim();
  if (!name || name.length > 120) throw new Error("Enter a customer name (up to 120 characters).");
  if(options&&(options.deliveryMethod!==undefined&&!["pickup","delivery"].includes(options.deliveryMethod)||
    options.customerContact!==undefined&&(typeof options.customerContact!=="string"||options.customerContact.length>100)||
    options.deliveryInstructions!==undefined&&(typeof options.deliveryInstructions!=="string"||options.deliveryInstructions.length>300)))
    throw Error("Invalid customer contact or requested delivery instructions.");
  if (!Array.isArray(requested) || !requested.length || requested.length > 100 || new Set(requested.map(r => r.productId)).size !== requested.length) throw new Error("Select distinct products.");
  return withCoordinatedRetailWrite(() => database.transaction("rw", [database.products, database.commerceOrders, database.staffMembers, database.staffAudits], async () => {
    const actor = await requirePermission("sell", database, company);
    if (company !== companyId()) throw new Error("Company changed; order not saved.");
    const lines: CommerceOrderLine[] = [];
    for (const item of requested) {
      if (!item || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) throw new Error("Invalid quantity.");
      const product = await database.products.get(item.productId);
      if (!product || product.businessProfileId !== company || product.archivedAt) throw new Error("Product unavailable for this company.");
      lines.push({productId: product.id, name: product.name, quantity:item.quantity,unitPriceMinor:product.sellingPriceMinor});
    }
    const totalMinor = calculateOrderTotal(lines);
    const now = new Date().toISOString();
    const order: CommerceOrder = {id:crypto.randomUUID(), businessProfileId:company, status:"draft", createdAt:now, updatedAt:now, customerName:name,
      ...(options?.deliveryMethod?{deliveryMethod:options.deliveryMethod}:{}),
      ...(options?.customerContact?.trim()?{customerContact:options.customerContact.trim()}:{}),
      ...(options?.deliveryInstructions?.trim()?{deliveryInstructions:options.deliveryInstructions.trim()}:{}),
      lines,totalMinor};
    await database.commerceOrders.add(order);
    if (actor) await database.staffAudits.add({ id: crypto.randomUUID(), businessProfileId: company, staffId: actor.id, action: "commerce.draft.created", createdAt: now, details: order.id });
    return order;
  }));
}
export async function listDraftOrders(database:TallybookDB=db): Promise<CommerceOrder[]> {
  const company=companyId();
  const rows=await database.commerceOrders.where("businessProfileId").equals(company).toArray();
  if (company!==companyId()) throw new Error("Company changed; reload orders.");
  return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function cancelDraftOrder(orderId:string,database:TallybookDB=db) {
  const company=companyId();
  return withCoordinatedRetailWrite(() => database.transaction("rw", [database.commerceOrders, database.staffMembers, database.staffAudits], async()=>{
    const actor = await requirePermission("sell", database, company);
    const existing=await database.commerceOrders.get(orderId);
    if (!existing || existing.businessProfileId!==company || existing.status!=="draft" || company!==companyId()) throw new Error("Draft unavailable.");
    await database.commerceOrders.update(orderId,{status:"cancelled",updatedAt:new Date().toISOString()});
    if (actor) await database.staffAudits.add({ id: crypto.randomUUID(), businessProfileId: company, staffId: actor.id, action: "commerce.draft.cancelled", createdAt: new Date().toISOString(), details: orderId });
  }));
}

/** Device-local planning transition; never creates a sale or touches inventory. */
export async function transitionLocalOrder(orderId: string, action: "prepare" | "ready" | "cancel", database: TallybookDB = db): Promise<void> {
  requireCommerceCapability("localDraftOrders");
  const company = companyId();
  await withCoordinatedRetailWrite(() => database.transaction("rw", [database.commerceOrders, database.staffMembers, database.staffAudits], async () => {
    const actor = await requirePermission("sell", database, company);
    if (company !== companyId()) throw new Error("Company changed; order not updated.");
    const order = await database.commerceOrders.get(orderId);
    if (!order || order.businessProfileId !== company) throw new Error("Order not found in this company.");
    const status = nextPreparationStatus(order.status, action);
    await database.commerceOrders.update(orderId, { status, updatedAt: new Date().toISOString() });
    if (actor) await database.staffAudits.add({ id: crypto.randomUUID(), businessProfileId: company, staffId: actor.id, action: `commerce.draft.${status}`, createdAt: new Date().toISOString(), details: orderId });
  }));
}
