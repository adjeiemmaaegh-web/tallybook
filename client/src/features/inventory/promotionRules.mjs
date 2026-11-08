/** Opt-in product-level percent promotion, bound to the original sale price.
 * Calculated BEFORE invoice-wide discounts/tax, preventing exemption/tax-category
 * leakage from a single unallocated cart-wide promotion. No auto-stacking.
 */
const validMinor=n=>Number.isSafeInteger(n)&&n>=0;
const date=s=>typeof s==="string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&
 Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
export function validatePromotionHistory(history,productId,companyId){
 if(history===undefined)return [];
 if(!Array.isArray(history)||history.length>100)throw Error("Invalid or oversized product promotion history.");
 let previousTime="",revision=0;
 for(const row of history){
  if(!row||row.version!==1||row.productId!==productId||row.companyId!==companyId ||
    row.revision!==++revision||typeof row.ownerStaffId!=="string"||!row.ownerStaffId ||
    typeof row.reason!=="string"||row.reason.trim().length<4||row.reason.length>200 ||
    typeof row.enabled!=="boolean" ||!Number.isSafeInteger(row.discountBps)||
    row.discountBps<0||row.discountBps>9000 ||(row.enabled&&row.discountBps<1) ||
    !date(row.changedAt)||!date(row.startsAt)||!date(row.endsAt) ||
    row.endsAt<row.startsAt||row.changedAt<previousTime)
    throw Error("Saved product promotion revision contains invalid ownership, pricing or time evidence.");
  previousTime=row.changedAt;
 }
 return history;
}
export function effectivePromotionPrice(product,regularUnitMinor,nowISO){
 if(!product||!validMinor(regularUnitMinor)||!date(nowISO))throw Error("Promotion pricing inputs are not validated.");
 const history=validatePromotionHistory(product.promotionHistory,product.id,product.businessProfileId);
 const last=history.at(-1);
 if(!last||!last.enabled||nowISO<last.startsAt||nowISO>last.endsAt)
   return {unitPriceMinor:regularUnitMinor,originalUnitPriceMinor:regularUnitMinor,
    savingsMinor:0,revision:last?.revision??0};
 const discount=(BigInt(regularUnitMinor)*BigInt(last.discountBps)+5000n)/10000n;
 const price=BigInt(regularUnitMinor)-discount;
 if(price<0n||price>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Promotion price exceeds monetary precision.");
 return {unitPriceMinor:Number(price),originalUnitPriceMinor:regularUnitMinor,
  savingsMinor:Number(discount),revision:last.revision};
}
export function promotionPriceReviewKey(lines) {
 if(!Array.isArray(lines)||lines.some(l=>typeof l.productId!=="string"||!l.productId||
  !Number.isSafeInteger(l.quantity)||l.quantity<=0||!validMinor(l.unitPriceMinor)||
  !Number.isSafeInteger(l.revision)||l.revision<0))
   throw Error("Promotion price preview is incomplete.");
 const ids=new Set(lines.map(l=>l.productId));if(ids.size!==lines.length)throw Error("Duplicate product in price preview.");
 return JSON.stringify([...lines].sort((a,b)=>a.productId.localeCompare(b.productId))
  .map(l=>[l.productId,l.quantity,l.unitPriceMinor,l.revision]));
}

/** Independently compare original sale-line promo evidence with the saved
 * preview; later product changes must not rewrite this original unit price. */
export function validateSavedPromotionPricing(sale,lines){
 if(!sale||!Array.isArray(lines))throw Error("Sale promotion evidence is unavailable.");
 for(const line of lines){
  const fields=[line.regularUnitPriceMinorAtSale,line.promotionSavingsPerUnitMinor,line.promotionRevisionAtSale];
  const discounted=fields[0]!==undefined||fields[1]!==undefined;
  if(discounted&&(fields[0]===undefined||fields[1]===undefined||fields[2]===undefined))
    throw Error("Sale promotion unit-price provenance is incomplete.");
  if(fields[2]!==undefined&&(!Number.isSafeInteger(fields[2])||fields[2]<1))
    throw Error("Sale promotion revision is invalid.");
  if(discounted&&(!validMinor(fields[0])||!validMinor(fields[1])||
      fields[1]<=0||fields[0]-fields[1]!==line.unitPriceMinor))
    throw Error("Saved promotion savings no longer match the original receipt.");
 }
 if(sale.priceReviewKeyAtSale!==undefined){
  const key=promotionPriceReviewKey(lines.map(line=>({
    productId:line.productId,quantity:line.quantity,
    unitPriceMinor:line.unitPriceMinor,revision:line.promotionRevisionAtSale??0
  })));
  if(key!==sale.priceReviewKeyAtSale)
    throw Error("Original sale pricing preview was altered after checkout.");
 }
 return true;
}
