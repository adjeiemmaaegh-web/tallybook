import { nanoid } from "nanoid";
import type { TallybookDB } from "@/db/TallybookDB";
import { db } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { assertRun7RetailWriteReady } from "@/features/backup/run7RetailWriteBarrier.mjs";
import { currentStaffId, requirePermission } from "@/features/staff/staff";
import { requireStage9Capability } from "./stage9ReleaseScope";

/** Company-wide stock and cost remain the financial totals. The per-store
 * quantity journal partitions physical units; it never creates inventory
 * value, receives supplier money or communicates between devices. */
export type StoreStockKind = "opening" | "sale" | "purchase" | "refund" | "adjustment" | "transfer-out" | "transfer-in";
export interface StoreStockEntry {
  id: string; businessProfileId: string; storeId: string; productId: string;
  kind: StoreStockKind; quantityDelta: number; sourceId: string; submissionKey: string;
  createdAt: string; sequence: number; transferId?: string;
}
export interface StoreStockMode {
  businessProfileId: string; activatedAt: string; activatedByStaffId: string;
  /** Immutable intent: no automatic retroactive store assignment to historical sales. */
  evidence: "owner-confirmed-opening-allocations";
}
export interface OpeningStoreQuantity {storeId: string; productId: string; quantity: number}
export const MAX_STORE_UNITS = 9_999_999;
const whole = (n:number) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_STORE_UNITS;
const requireCompany = (company:string) => {
  if (company !== getActiveBusinessProfileId()) throw new Error("Company changed during store stock posting.");
};
function add(a:number,b:number) {
  const n=a+b;
  if (!whole(n)) throw new Error("Store quantity exceeds supported limits.");
  return n;
}
export async function readStoreBalances(database:TallybookDB,company:string,productId:string) {
  const rows=await database.storeStockEntries.where("[businessProfileId+productId]").equals([company,productId]).toArray();
  const seenIds=new Set<string>(), seenSubmissions=new Set<string>();
  const balances=new Map<string,number>();
  for (const row of rows.sort((a,b)=>a.sequence-b.sequence)) {
    if (row.businessProfileId!==company || row.productId!==productId || !row.storeId ||
        !Number.isSafeInteger(row.sequence) || row.sequence!==seenIds.size+1 ||
        !Number.isSafeInteger(row.quantityDelta) || !["opening","sale","purchase","refund","adjustment","transfer-out","transfer-in"].includes(row.kind) ||
        seenIds.has(row.id) || seenSubmissions.has(row.submissionKey))
      throw new Error("Corrupt or duplicate store stock entry.");
    seenIds.add(row.id);seenSubmissions.add(row.submissionKey);
    const next=(balances.get(row.storeId)??0)+row.quantityDelta;
    if (!whole(next)) throw new Error("Store stock journal has negative or overflowing quantity.");
    balances.set(row.storeId,next);
  }
  return balances;
}
/** Call only within a Dexie RW transaction that includes policy, entries,
 * locations, products and staff. No awaits to Web Locks here.
 */
export async function postStoreStockDelta(
  database:TallybookDB, company:string, productId:string, storeId:string|undefined,
  quantityDelta:number, sourceId:string, kind:StoreStockKind,
  now:string, companyBefore:number, companyAfter:number,
) {
  requireCompany(company);
  const mode=await database.storeStockModes.get(company);
  if (!mode) {
    if (storeId) throw new Error("Activate and allocate multi-store stock before store-specific posting.");
    return null;
  }
  if (!storeId) throw new Error("Choose a store for this stock operation.");
  if (!Number.isSafeInteger(quantityDelta) || quantityDelta===0 || !whole(companyBefore) || !whole(companyAfter) ||
      companyBefore+quantityDelta!==companyAfter)
    throw new Error("Invalid company/store stock conservation.");
  const store=await database.storeLocations.get(storeId);
  if (!store || store.businessProfileId!==company || store.status!=="active") throw new Error("Store is not active in company.");
  const balances=await readStoreBalances(database,company,productId);
  let total=0;
  for (const n of balances.values()) total=add(total,n);
  if (total!==companyBefore) throw new Error("Store stock allocation needs reconciliation before another posting.");
  const atStore=balances.get(storeId)??0;
  if (!whole(atStore+quantityDelta)) throw new Error("Insufficient stock or store capacity.");
  const sequence=await database.storeStockEntries.where("[businessProfileId+productId]").equals([company,productId]).count()+1;
  const entry:StoreStockEntry={id:nanoid(18),businessProfileId:company,storeId,productId,sequence,
    kind,quantityDelta,sourceId,submissionKey:`store:${kind}:${sourceId}`,createdAt:now};
  const actorId=currentStaffId(company);
  const actor=actorId ? await database.staffMembers.get(actorId) : undefined;
  if (!actor || actor.businessProfileId!==company || actor.disabledAt) throw new Error("Unlock authorized store staff.");
  if (actor.role!=="owner" && !await database.storeAssignments.where("[businessProfileId+staffId+storeId]").equals([company,actorId,storeId]).first())
    throw new Error("Staff is not assigned to this store.");
  await database.storeStockEntries.add(entry);
  requireCompany(company);
  return entry;
}
/** Initialize once, using explicit owner-confirmed opening counts that
 * exhaustively reconcile every existing non-service company product.
 * This must never infer missing stock distribution from observations.
 */
export async function activateStoreInventory(
  allocations:OpeningStoreQuantity[], database:TallybookDB=db
) {
  requireStage9Capability("authoritativeStoreStock");
  return withCoordinatedRetailWrite(async()=>{
    const company=getActiveBusinessProfileId();
    if (!Array.isArray(allocations) || allocations.length>100000)
      throw new Error("Invalid opening store allocation list.");
    return database.transaction("rw",[
      database.appMeta,database.businessProfiles,database.products,database.inventoryBatches,
      database.storeLocations,database.storeStockEntries,database.storeStockModes,
      database.staffMembers,database.staffAudits
    ],async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      const staff=await requirePermission("staff",database,company);
      if (!staff || staff.role!=="owner" || currentStaffId(company)!==staff.id)
        throw new Error("Unlock company owner to activate store stock.");
      if (!(await database.businessProfiles.get(company))) throw new Error("Active company missing.");
      if (await database.storeStockModes.get(company)) throw new Error("Store stock already activated.");
      const products=await database.products.where("businessProfileId").equals(company).toArray();
      const stock=products.filter(p=>!p.archivedAt && p.itemKind!=="service");
      if (products.some(p=>p.itemKind!=="service" && p.archivedAt && p.stockQuantity!==0))
        throw new Error("Archived stock must be reconciled before store activation.");
      const expected=new Map(stock.map(p=>[p.id,p.stockQuantity]));
      if (stock.some(p=>!whole(p.stockQuantity))) throw new Error("Company stock requires reconciliation.");
      const seen=new Set<string>(),totals=new Map<string,number>();
      const checked:OpeningStoreQuantity[]=[];
      for(const a of allocations) {
        if (!a || !whole(a.quantity) || a.quantity===0 || !expected.has(a.productId)) throw new Error("Invalid opening stock allocation.");
        const k=JSON.stringify([a.storeId,a.productId]);
        if(seen.has(k)) throw new Error("Duplicate store opening allocation.");
        seen.add(k);
        const store=await database.storeLocations.get(a.storeId);
        if(!store || store.businessProfileId!==company || store.status!=="active")
          throw new Error("Opening allocation references inactive or foreign store.");
        totals.set(a.productId,add(totals.get(a.productId)??0,a.quantity));
        checked.push(a);
      }
      for(const [productId,quantity] of expected) {
        if((totals.get(productId)??0)!==quantity)
          throw new Error("Opening store quantities must exactly equal each company product stock balance.");
      }
      // Batch FIFO / expiry is company-global. Store FIFO provenance cannot
      // be invented: reject ambiguous tracked batches at activation.
      for(const p of stock) {
        if(await database.inventoryBatches.where("productId").equals(p.id)
            .and(x=>x.businessProfileId===company).count())
          throw new Error("Tracked batches require store-specific provenance before activation.");
      }
      const now=new Date().toISOString();
      const openingSequences=new Map<string,number>();
      for(const a of checked) await database.storeStockEntries.add({
        id:nanoid(18),businessProfileId:company,storeId:a.storeId,productId:a.productId,
        kind:"opening",quantityDelta:a.quantity,
        sequence:(openingSequences.set(a.productId,(openingSequences.get(a.productId)??0)+1),openingSequences.get(a.productId)!),
        sourceId:`opening:${company}:${a.storeId}:${a.productId}`,
        submissionKey:`opening:${a.storeId}:${a.productId}`,createdAt:now
      });
      const mode:StoreStockMode={businessProfileId:company,activatedAt:now,activatedByStaffId:staff.id,
        evidence:"owner-confirmed-opening-allocations"};
      requireCompany(company);
      await database.storeStockModes.add(mode);
      await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:staff.id,
        action:"store.inventory.activated",details:`Opened ${checked.length} store-product allocations`,createdAt:now});
      return mode;
    });
  });
}
export async function getCompanyStoreInventory(database:TallybookDB=db) {
  const company=getActiveBusinessProfileId();
  return database.transaction("r",[
    database.storeStockModes,database.storeStockEntries,database.products,database.storeLocations,database.staffMembers
  ],async()=>{
    await requirePermission("inventory",database,company);
    const mode=await database.storeStockModes.get(company);
    if (!mode) return {active:false as const,balances:[],stores:[]};
    const [products,stores]=await Promise.all([
      database.products.where("businessProfileId").equals(company).toArray(),
      database.storeLocations.where("businessProfileId").equals(company).toArray()
    ]);
    const balances=[];
    for(const product of products.filter(p=>p.itemKind!=="service")) {
      const map=await readStoreBalances(database,company,product.id);
      let total=0;
      for(const [storeId,quantity] of map) {total=add(total,quantity);balances.push({storeId,productId:product.id,quantity});}
      if(total!==product.stockQuantity) throw new Error("Store and company stock are not reconciled.");
    }
    requireCompany(company);
    return {active:true as const,balances,stores};
  });
}
/** Paired transfer legs: the company total and financial FIFO costs stay
 * unchanged. Callers hold the origin lock and transaction; no external payment.
 */
export async function postPairedStoreTransfer(
  database:TallybookDB,company:string,request:{
    id:string;sourceStoreId:string;destinationStoreId:string;productId:string;quantity:number
  }, staffId:string, submissionKey:string, now:string
) {
  requireStage9Capability("executeStoreTransfer");
  requireCompany(company);
  if (!await database.storeStockModes.get(company)) throw new Error("Activate company store stock before transferring.");
  if (!whole(request.quantity) || request.quantity<1 || !submissionKey.trim()) throw new Error("Invalid transfer.");
  const [source,destination,product]=await Promise.all([
    database.storeLocations.get(request.sourceStoreId),
    database.storeLocations.get(request.destinationStoreId),database.products.get(request.productId)
  ]);
  if(!source||!destination||source.id===destination.id ||
    source.businessProfileId!==company||destination.businessProfileId!==company ||
    source.status!=="active"||destination.status!=="active"||
    !product||product.businessProfileId!==company||product.archivedAt||product.itemKind==="service")
    throw new Error("Invalid transfer ownership or store/product status.");
  const balances=await readStoreBalances(database,company,product.id);
  let total=0;for(const n of balances.values()) total=add(total,n);
  if(total!==product.stockQuantity) throw new Error("Company/store stock does not reconcile.");
  if((balances.get(source.id)??0)<request.quantity ||
    !whole((balances.get(destination.id)??0)+request.quantity))
    throw new Error("Store transfer stock insufficient or destination overflow.");
  const transferId=nanoid(18);
  const sequence=await database.storeStockEntries.where("[businessProfileId+productId]").equals([company,product.id]).count();
  const legs:StoreStockEntry[]=[
    {id:nanoid(18),businessProfileId:company,storeId:source.id,productId:product.id,
      kind:"transfer-out",quantityDelta:-request.quantity,sequence:sequence+1,sourceId:request.id,
      submissionKey:`transfer-out:${submissionKey}`,createdAt:now,transferId},
    {id:nanoid(18),businessProfileId:company,storeId:destination.id,productId:product.id,
      kind:"transfer-in",quantityDelta:request.quantity,sequence:sequence+2,sourceId:request.id,
      submissionKey:`transfer-in:${submissionKey}`,createdAt:now,transferId},
  ];
  const actor=staffId ? await database.staffMembers.get(staffId) : undefined;
  if(!actor || actor.businessProfileId!==company || actor.disabledAt || actor.role==="cashier" || currentStaffId(company)!==staffId) throw new Error("Verified inventory-authorized transfer actor required.");
  if(actor.role!=="owner")for(const storeId of [source.id,destination.id]){
    if(!await database.storeAssignments.where("[businessProfileId+staffId+storeId]").equals([company,staffId,storeId]).first())
      throw new Error("Transfer actor is not assigned to both stores.");
  }
  requireCompany(company);
  await database.storeStockEntries.bulkAdd(legs);
  return transferId;
}
