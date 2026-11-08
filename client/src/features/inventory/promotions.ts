import {nanoid} from "nanoid";
import {withCoordinatedRetailWrite} from "@/features/backup/coordinatedRetailWrite";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
import {db,type TallybookDB} from "@/db/TallybookDB";
import {getActiveBusinessProfileId} from "@/features/business/activeCompany";
import {assertCompanyScope} from "@/features/business/companyScope.mjs";
import {requirePermission,currentStaffId} from "@/features/staff/staff";
import {validatePromotionHistory,type ProductPromotionRevision} from "./promotionRules.mjs";
export type {ProductPromotionRevision};
export interface PromotionChange {
 enabled:boolean;discountBps:number;startsAt:string;endsAt:string;reason:string;
}
/** Only an explicitly unlocked company owner can authorize percentage promotions.
 * Every revision is append-only and audited on-device; the existing product
 * pricing and all historical sale lines remain unchanged.
 */
export async function setProductPromotion(productId:string,change:PromotionChange,database:TallybookDB=db){
 const company=getActiveBusinessProfileId();
 if(!productId||!change||typeof change.enabled!=="boolean")throw Error("Select a saved product and explicit promotion state.");
 const reason=change.reason?.trim();
 if(!reason||reason.length<4||reason.length>200)throw Error("Explain the promotion change (4–200 characters).");
 return withCoordinatedRetailWrite(()=>database.transaction("rw",[
  database.appMeta,database.products,database.staffMembers,database.staffAudits
 ],async()=>{
  await assertRun7RetailWriteReady(database.appMeta);
  const owner=await requirePermission("inventory",database,company);
  if(!owner||owner.role!=="owner"||currentStaffId(company)!==owner.id)
    throw Error("Unlock the business owner to change product promotions.");
  const product=await database.products.get(productId);
  if(!product||product.businessProfileId!==company||product.archivedAt)
    throw Error("Product is not active in this business.");
  const original=validatePromotionHistory(product.promotionHistory,productId,company);
  if(original.length>=100)throw Error("Promotion revision history is full; export records and review archival policy.");
  const next:ProductPromotionRevision={version:1,productId,companyId:company,
    revision:original.length+1,ownerStaffId:owner.id,reason,
    enabled:change.enabled,discountBps:change.enabled?change.discountBps:0,
    startsAt:change.startsAt,endsAt:change.endsAt,changedAt:new Date().toISOString()};
  const history=[...original,next];
  validatePromotionHistory(history,productId,company);
  assertCompanyScope(company,getActiveBusinessProfileId());
  await database.products.put({...product,promotionHistory:history,updatedAt:next.changedAt});
  await database.staffAudits.add({id:nanoid(14),businessProfileId:company,staffId:owner.id,
    action:"product.promotion.changed",createdAt:next.changedAt,
    details:`${productId}:v${next.revision}:${next.enabled?"enabled":"disabled"}:${next.discountBps}bps:${reason}`});
  if(currentStaffId(company)!==owner.id||getActiveBusinessProfileId()!==company)
    throw Error("Owner session changed while saving promotion.");
  return next;
 }));
}
