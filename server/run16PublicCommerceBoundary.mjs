/** Run 16 — unmounted, deny-by-default customer storefront boundary.
 * Trusted server directory owns tenants, offers, availability and fulfillment.
 * Customer JSON NEVER authorizes inventory, settlement or private record reads.
 * No public route is registered and no public API keys exist in this run.
 */
import {createHmac,createHash,timingSafeEqual} from "node:crypto";
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const SHA=/^[a-f0-9]{64}$/;
const deny=()=>{throw Error("Public commerce request unavailable or invalid.");};
export const RUN16_PUBLIC_COMMERCE_ENABLED=false;
const safeText=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.length<=max&&
  !/[\u0000-\u001f<>]/.test(v);
function configKey(key){
 if(typeof key!=="string"||Buffer.byteLength(key,"utf8")<32||Buffer.byteLength(key,"utf8")>4096)deny();
 return key;
}
function payloadValid(value){
 if(!value||typeof value!=="object"||Array.isArray(value)||
   Object.keys(value).sort().join(",")!=="companyId,expiresAt,issuedAt,offerDigest,revision,version"||
   value.version!==1||!ID.test(value.companyId??"")||
   !Number.isSafeInteger(value.revision)||value.revision<1||
   !SHA.test(value.offerDigest??"")||
   !Number.isSafeInteger(value.issuedAt)||!Number.isSafeInteger(value.expiresAt)||
   value.expiresAt<=value.issuedAt||value.expiresAt-value.issuedAt>10*60*1000)
  deny();
 return value;
}
const digest=(key,value)=>createHmac("sha256",configKey(key)).update(value).digest("hex");
/** A trusted server-only source may project opt-in public offerings. Every
 * default is private. Never exposes costs, staff, supplier, credit or tax data.
 */
export function createRun16CatalogueSnapshot(config,rawProducts) {
 if(!config||config.publicEnabled!==true||!ID.test(config.companyId??"")||
   !Number.isSafeInteger(config.revision)||config.revision<1||
   typeof config.currency!=="string"||!/^[A-Z]{3}$/.test(config.currency)||
   !Array.isArray(rawProducts)||rawProducts.length>10000)deny();
 const items=[],seen=new Set();
 for(const p of rawProducts){
   if(!p||p.businessProfileId!==config.companyId||p.publicListed!==true||
      p.archivedAt||!ID.test(p.id??"")||!safeText(p.name,120)||
      !Number.isSafeInteger(p.sellingPriceMinor)||p.sellingPriceMinor<0||
      p.sellingPriceMinor>1_000_000_000||
      !Number.isSafeInteger(p.stockQuantity)||p.stockQuantity<0||
      p.stockQuantity>9999999||seen.has(p.id)) {
     if(p?.publicListed===true)deny();
     continue;
   }
   seen.add(p.id);
   items.push(Object.freeze({id:p.id,name:p.name,priceMinor:p.sellingPriceMinor,
     available:p.itemKind==="service"?9999:Math.min(p.stockQuantity,9999),
     active:true}));
 }
 if(items.length>1000)deny();
 items.sort((x,y)=>x.id.localeCompare(y.id));
 const offerDigest=createHash("sha256").update(JSON.stringify({
   companyId:config.companyId,revision:config.revision,currency:config.currency,items
 })).digest("hex");
 return Object.freeze({companyId:config.companyId,revision:config.revision,
   currency:config.currency,publicEnabled:true,offerDigest,items:Object.freeze(items)});
}
export function signRun16CatalogueGrant(snapshot,key,now=Date.now()){
 if(!Number.isSafeInteger(now)||!snapshot||!ID.test(snapshot.companyId??"")||
   !Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||
   !SHA.test(snapshot.offerDigest??""))deny();
 const scope={version:1,companyId:snapshot.companyId,revision:snapshot.revision,
   offerDigest:snapshot.offerDigest,issuedAt:now,expiresAt:now+10*60_000};
 const body=Buffer.from(JSON.stringify(scope),"utf8").toString("base64url");
 return Object.freeze({grant:body+"."+digest(key,body),expiresAt:scope.expiresAt,
   offersOnly:true,paymentEnabled:false});
}
export function verifyRun16CatalogueGrant(grant,key,now=Date.now()){
 if(typeof grant!=="string"||grant.length>8192||!Number.isSafeInteger(now))deny();
 const fields=grant.split(".");
 if(fields.length!==2||!/^[A-Za-z0-9_-]+$/.test(fields[0])||!SHA.test(fields[1]))deny();
 const expected=Buffer.from(digest(key,fields[0]),"hex"),signature=Buffer.from(fields[1],"hex");
 if(expected.length!==signature.length||!timingSafeEqual(expected,signature))deny();
 let payload;try{payload=JSON.parse(Buffer.from(fields[0],"base64url").toString("utf8"));}catch{deny();}
 payloadValid(payload);
 if(now<payload.issuedAt||now>=payload.expiresAt)deny();
 if(Buffer.from(JSON.stringify(payload)).toString("base64url")!==fields[0])deny();
 return Object.freeze(payload);
}
export function validateRun16PublicRequest(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||
   Object.keys(raw).sort().join(",")!=="customerContact,customerName,deliveryMethod,deliveryNotes,items,requestKey"||
   !ID.test(raw.requestKey??"")||!safeText(raw.customerName,120)||
   !safeText(raw.customerContact,100)||
   !["pickup","delivery"].includes(raw.deliveryMethod)||
   typeof raw.deliveryNotes!=="string"||raw.deliveryNotes.length>300||
   /[\u0000-\u001f<>]/.test(raw.deliveryNotes)||
   !Array.isArray(raw.items)||raw.items.length<1||raw.items.length>100)
   deny();
 const seen=new Set();
 for(const item of raw.items){
   if(!item||typeof item!=="object"||Array.isArray(item)||
     Object.keys(item).sort().join(",")!=="productId,quantity"||
     !ID.test(item.productId??"")||!Number.isSafeInteger(item.quantity)||
     item.quantity<1||item.quantity>9999||seen.has(item.productId))deny();
   seen.add(item.productId);
 }
 return Object.freeze({requestKey:raw.requestKey,customerName:raw.customerName.trim(),
   customerContact:raw.customerContact.trim(),deliveryMethod:raw.deliveryMethod,
   deliveryNotes:raw.deliveryNotes.trim(),items:raw.items.map(x=>Object.freeze({...x})),
   paymentPerformed:false,stockReserved:false});
}
/** Server-only request staging adapter. Must never trust browser-provided
 * price/tenant/status. Caller must provide an independently trusted snapshot
 * and durable request sink; release flag stays OFF in current source.
 */
export async function stageRun16PublicRequest(grant,raw,settings){
 if(!RUN16_PUBLIC_COMMERCE_ENABLED)deny();
 if(!settings?.catalogue||!settings?.journal||!settings?.secret||!settings?.rateLimit)deny();
 const token=verifyRun16CatalogueGrant(grant,settings.secret);
 const requested=validateRun16PublicRequest(raw);
 const allowed=await settings.rateLimit.allow(token.companyId,requested.requestKey);
 if(allowed!==true)deny();
 const trusted=await settings.catalogue.read(token.companyId);
 if(!trusted||trusted.companyId!==token.companyId||trusted.revision!==token.revision||
   trusted.offerDigest!==token.offerDigest||trusted.publicEnabled!==true||
   !Array.isArray(trusted.items))deny();
 const offerMap=new Map(trusted.items.map(x=>[x.id,x]));
 let total=0;
 const lines=requested.items.map(item=>{
   const offered=offerMap.get(item.productId);
   if(!offered||offered.active!==true||
      !Number.isSafeInteger(offered.priceMinor)||offered.priceMinor<0||
      !Number.isSafeInteger(offered.available)||item.quantity>offered.available)deny();
   const lineTotal=item.quantity*offered.priceMinor;
   if(!Number.isSafeInteger(lineTotal)||!Number.isSafeInteger(total+lineTotal))deny();
   total+=lineTotal;
   return {productId:offered.id,name:offered.name,quantity:item.quantity,
     unitPriceMinor:offered.priceMinor};
 });
 // Journal must itself enforce unique [company,requestKey], quote revision,
 // server-derived totals and pending-review status in one durable transaction.
 const result=await settings.journal.stage({
   companyId:token.companyId,requestKey:requested.requestKey,customerName:requested.customerName,
   customerContact:requested.customerContact,deliveryMethod:requested.deliveryMethod,
   deliveryNotes:requested.deliveryNotes,lines,totalMinor:total,
   status:"pending-merchant-review",stockReserved:false,paymentPerformed:false,
   requestSource:"public-untrusted-customer",catalogueRevision:token.revision,
 });
 if(!result||result.companyId!==token.companyId||
    !["stored","duplicate"].includes(result.status)||result.paymentPerformed!==false||
    result.stockReserved!==false)deny();
 return Object.freeze(result);
}
