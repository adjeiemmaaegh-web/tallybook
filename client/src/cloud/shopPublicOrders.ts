/** Guest order requests never process payment, reserve stock or record a sale.
 * All product prices and owner permissions are checked by PostgreSQL RPCs.
 */
import {callShop} from "./shopClient";

export interface PublicCatalogProduct {
 productId:string;name:string;unitPriceMinor:number;category:string|null;kind:"good"|"service";
}
export interface GuestCatalog {
 businessName:string;storeName:string;currency:string;products:PublicCatalogProduct[];
 catalogLimited:boolean;paymentCollected:false;stockReserved:false;
}
export interface GuestLine {productId:string;quantity:number}
export interface GuestOrderInput {
 shareToken:string;submissionKey:string;customerName:string;contactPhone:string;
 customerNote:string;consent:true;lines:GuestLine[];
}
export interface GuestReceipt {
 requestId:string;status:"new"|"converted"|"declined";
 quotedTotalMinor:string;replayed:boolean;paymentCollected:false;accepted:false;
}
export interface PublicOrderShare {
 shareId:string;storeId:string;createdAt:string;revoked:boolean;
}
export interface PublicOrderRequest {
 requestId:string;storeId:string;customerName:string;contactPhone:string;
 customerNote:string;lines:GuestLine[];quotedTotalMinor:string;
 status:"new"|"converted"|"declined";convertedOrderId:string|null;createdAt:string;
}
export interface OwnerGuestOrders {shares:PublicOrderShare[];requests:PublicOrderRequest[]}
export interface CreatedPublicShare {shareId:string;shareToken:string;storeId:string}
export interface GuestOrderAdminReceipt {requestId:string;status:string;orderId?:string;replayed:boolean}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const MONEY=/^(0|[1-9][0-9]{0,14})$/;
export const isPublicUuid=(v:unknown):v is string=>typeof v==="string"&&UUID.test(v);
const textOk=(s:unknown,max:number,min=0):s is string=>
 typeof s==="string"&&s.trim().length>=min&&s.trim().length<=max&&!/[\x00-\x1f\x7f]/.test(s);

export function normalizeGuestLines(lines:readonly GuestLine[]):GuestLine[]{
 if(!Array.isArray(lines)||lines.length<1||lines.length>30)throw Error("Select 1 to 30 products.");
 const unique=new Set<string>();
 return lines.map(l=>{
  if(!l||!isPublicUuid(l.productId)||!Number.isSafeInteger(l.quantity)||
      l.quantity<1||l.quantity>100)throw Error("Enter 1 to 100 units for each product.");
  const productId=l.productId.toLowerCase();
  if(unique.has(productId))throw Error("The same product was selected twice.");
  unique.add(productId);
  return {productId,quantity:l.quantity};
 });
}
export function normalizeGuestInput(draft:GuestOrderInput):GuestOrderInput {
 if(draft.consent!==true)throw Error("Confirm contact-sharing consent before submitting.");
 if(!isPublicUuid(draft.shareToken)||!isPublicUuid(draft.submissionKey))
   throw Error("The order link or submission ID is invalid.");
 const customerName=draft.customerName.trim();
 const contactPhone=draft.contactPhone.trim();
 const customerNote=draft.customerNote.trim();
 if(!textOk(customerName,80,2)||
    !/^[+0-9][0-9 ()+-]{5,59}$/.test(contactPhone)||
    !textOk(customerNote,240))
  throw Error("Enter a name and valid contact phone; avoid special control characters.");
 return {...draft,shareToken:draft.shareToken.toLowerCase(),
   submissionKey:draft.submissionKey.toLowerCase(),customerName,contactPhone,
   customerNote,lines:normalizeGuestLines(draft.lines)};
}
export function verifyGuestCatalog(data:unknown):GuestCatalog {
 const x=data as GuestCatalog;
 if(!x||!textOk(x.businessName,120,1)||!textOk(x.storeName,120,1)||
   typeof x.currency!=="string"||!/^[A-Z]{3}$/.test(x.currency)||
   !Array.isArray(x.products)||x.products.length>200||
   typeof x.catalogLimited!=="boolean"||x.paymentCollected!==false||
   x.stockReserved!==false)throw Error("Unverified public catalogue. Do not submit an order.");
 const seen=new Set<string>();
 for(const p of x.products){
  if(!p||!isPublicUuid(p.productId)||!textOk(p.name,120,1)||
    !Number.isSafeInteger(p.unitPriceMinor)||p.unitPriceMinor<0||
    p.unitPriceMinor>100000000000||
    (p.category!==null&&!textOk(p.category,60))||
    !["good","service"].includes(p.kind)||seen.has(p.productId.toLowerCase()))
   throw Error("Unverified public catalogue. Do not submit an order.");
  seen.add(p.productId.toLowerCase());
 }
 return x;
}
export async function getGuestCatalog(shareToken:string):Promise<GuestCatalog> {
 if(!isPublicUuid(shareToken))throw Error("Invalid public order link.");
 const response=await callShop<unknown>("catalog",{shareToken:shareToken.toLowerCase()},"tallybook_guest_order");
 return verifyGuestCatalog(response);
}
export async function submitGuestOrder(draft:GuestOrderInput):Promise<GuestReceipt>{
 const input=normalizeGuestInput(draft);
 const r=await callShop<GuestReceipt>("submit",input,"tallybook_guest_order");
 if(!r||!isPublicUuid(r.requestId)||!MONEY.test(r.quotedTotalMinor)||
    !["new","converted","declined"].includes(r.status)||
    typeof r.replayed!=="boolean"||r.accepted!==false||
    r.paymentCollected!==false)
   throw Error("Order request response is not verified. Keep the original submission ID.");
 return r;
}
export function validateOwnerGuestOrders(data:unknown):OwnerGuestOrders{
 const d=data as OwnerGuestOrders;
 if(!d||!Array.isArray(d.shares)||d.shares.length>50||
    !Array.isArray(d.requests)||d.requests.length>100)
  throw Error("Guest order history cannot be verified.");
 const shareIds=new Set<string>(),requestIds=new Set<string>();
 for(const s of d.shares){
  if(!s||!isPublicUuid(s.shareId)||!isPublicUuid(s.storeId)||
     typeof s.createdAt!=="string"||typeof s.revoked!=="boolean"||
     shareIds.has(s.shareId))throw Error("Guest order history cannot be verified.");
  shareIds.add(s.shareId);
 }
 for(const r of d.requests){
  if(!r||!isPublicUuid(r.requestId)||!isPublicUuid(r.storeId)||
     !textOk(r.customerName,80,2)||!textOk(r.contactPhone,60,6)||
     !textOk(r.customerNote,240)||!MONEY.test(r.quotedTotalMinor)||
     !["new","converted","declined"].includes(r.status)||
     (r.convertedOrderId!==null&&!isPublicUuid(r.convertedOrderId))||
     (r.status==="converted")!==(r.convertedOrderId!==null)||
     typeof r.createdAt!=="string"||requestIds.has(r.requestId))
    throw Error("Guest order history cannot be verified.");
  normalizeGuestLines(r.lines);
  requestIds.add(r.requestId);
 }
 return d;
}
export async function listOwnerGuestOrders(companyId:string):Promise<OwnerGuestOrders>{
 const r=await callShop<unknown>("list",{companyId},"tallybook_public_order_admin");
 return validateOwnerGuestOrders(r);
}
export async function createPublicOrderShare(companyId:string,storeId:string):Promise<CreatedPublicShare>{
 if(!isPublicUuid(storeId))throw Error("Choose a valid store.");
 const r=await callShop<CreatedPublicShare>("createShare",{companyId,storeId},"tallybook_public_order_admin");
 if(!r||!isPublicUuid(r.shareId)||!isPublicUuid(r.shareToken)||r.storeId!==storeId)
   throw Error("Share link was not verified. Refresh before creating another.");
 return r;
}
export async function revokePublicOrderShare(companyId:string,shareId:string):Promise<void>{
 if(!isPublicUuid(shareId))throw Error("Invalid link.");
 const r=await callShop<{shareId:string;revoked:boolean}>("revokeShare",{companyId,shareId},"tallybook_public_order_admin");
 if(r.shareId!==shareId||r.revoked!==true)throw Error("The link revocation was not confirmed.");
}
export async function resolveOwnerGuestRequest(
 companyId:string,requestId:string,action:"convert"|"decline"):Promise<GuestOrderAdminReceipt>{
 if(!isPublicUuid(requestId))throw Error("Invalid guest order.");
 const r=await callShop<GuestOrderAdminReceipt>(action,{companyId,requestId},"tallybook_public_order_admin");
 if(r.requestId!==requestId||r.status!==(action==="convert"?"converted":"declined")||
    typeof r.replayed!=="boolean"||
    (action==="convert"&&!isPublicUuid(r.orderId)))
  throw Error("The operation was not confirmed. Refresh before retrying.");
 return r;
}
