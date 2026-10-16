/** Run 9: inventory value is a stock-at-cost evidence summary, NOT
 * replacement-cost, sales value, a completed statutory valuation or profit.
 * Products with pre-cost-ledger stock remain unverified; never multiply
 * present-day editable product costPriceMinor into old stock.
 */
const deny=()=>{throw Error('Inventory valuation contains unsafe or contradictory cost evidence.');};
const add=(a,b)=>{
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||
    !Number.isSafeInteger(a+b))deny();
 return a+b;
};
const whole=x=>Number.isSafeInteger(x)&&x>=0;
export function summarizeRun9InventoryValuation(products,states){
 if(!Array.isArray(products)||!Array.isArray(states)||
    products.length!==states.length)deny();
 const ids=new Set();
 let knownValueMinor=0,unknownCostUnits=0,unverifiedProducts=0,trackedProducts=0;
 for(let i=0;i<products.length;i++){
  const product=products[i],state=states[i];
  if(typeof product?.id!=='string'||!product.id||ids.has(product.id)||
     !whole(product.stockQuantity))deny();
  ids.add(product.id);
  if(product.itemKind==='service'&&product.stockQuantity!==0)deny();
  if(product.itemKind==='service')continue;
  trackedProducts++;
  if(state===null){
   // No historical receipt evidence; an empty shelf has zero current value,
   // whereas a nonzero historical balance has unverified acquisition cost.
   if(product.stockQuantity>0){
    unknownCostUnits=add(unknownCostUnits,product.stockQuantity);
    unverifiedProducts++;
   }
   continue;
  }
  if(!state||state.historyAvailable!==true||
     !whole(state.quantity)||state.quantity!==product.stockQuantity||
     !whole(state.knownValueMinor)||!whole(state.unknownCostUnits)||
     state.unknownCostUnits>state.quantity)deny();
  knownValueMinor=add(knownValueMinor,state.knownValueMinor);
  unknownCostUnits=add(unknownCostUnits,state.unknownCostUnits);
  if(state.unknownCostUnits>0)unverifiedProducts++;
 }
 const complete=unknownCostUnits===0;
 return Object.freeze({
  knownValueMinor,
  unknownCostUnits,
  unverifiedProducts,
  trackedProducts,
  complete,
  ...(complete?{totalValueMinor:knownValueMinor}:{})
 });
}
