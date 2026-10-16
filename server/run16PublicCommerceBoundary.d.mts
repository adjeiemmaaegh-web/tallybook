export const RUN16_PUBLIC_COMMERCE_ENABLED:false;
export interface Run16SignedCatalogueGrant {
 grant:string;expiresAt:number;offersOnly:true;paymentEnabled:false
}
export interface Run16GrantScope {
 version:1;companyId:string;revision:number;offerDigest:string;issuedAt:number;expiresAt:number
}
export interface Run16PublicLine {productId:string;quantity:number}
export interface Run16PublicDraft {
 requestKey:string;customerName:string;customerContact:string;
 deliveryMethod:"pickup"|"delivery";deliveryNotes:string;items:ReadonlyArray<Run16PublicLine>;
 paymentPerformed:false;stockReserved:false
}
export function createRun16CatalogueSnapshot(config:{
 companyId:string;revision:number;currency:string;publicEnabled:true
},products:unknown[]):Readonly<{
 companyId:string;revision:number;currency:string;publicEnabled:true;offerDigest:string;
 items:ReadonlyArray<Readonly<{id:string;name:string;priceMinor:number;available:number;active:true}>>
}>;
export function signRun16CatalogueGrant(
 snapshot:{companyId:string;revision:number;offerDigest:string},key:string,now?:number
):Readonly<Run16SignedCatalogueGrant>;
export function verifyRun16CatalogueGrant(grant:string,key:string,now?:number):Readonly<Run16GrantScope>;
export function validateRun16PublicRequest(raw:unknown):Readonly<Run16PublicDraft>;
export function stageRun16PublicRequest(
 grant:string,raw:unknown,settings:unknown
):Promise<Readonly<{companyId:string;status:"stored"|"duplicate";stockReserved:false;paymentPerformed:false}>>;
