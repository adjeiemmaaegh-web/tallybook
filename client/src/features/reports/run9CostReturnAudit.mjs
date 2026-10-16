/** Run 9: independently prove BOTH sides of sale inventory cost restorations.
 * Existing reconstruction ensures FIFO math; this checker requires complete,
 * unique linkage to financial full/partial return evidence. No DB writes.
 */
const fail=(detail)=>{throw Error('Inventory return cost evidence does not reconcile: '+detail);};
const id=x=>typeof x==='string'&&x.trim()&&x.trim()===x;
export function assertRun9ReturnCostCompleteness({
  events,lines,reversals,cashReturns=[]
}={}){
  if(![events,lines,reversals,cashReturns].every(Array.isArray))
    fail('missing saved journal arrays');
  const byEvent=new Map(),saleLines=new Map(),reversalEvents=new Map();
  for(const event of events){
    if(!id(event?.id)||byEvent.has(event.id))fail('duplicate or invalid cost event');
    byEvent.set(event.id,event);
    if(event.kind==='reversal'){
      if(!id(event.reversesEventId))fail('restoration missing original issue');
      const list=reversalEvents.get(event.reversesEventId)??[];
      list.push(event);reversalEvents.set(event.reversesEventId,list);
    }
  }
  const lineIds=new Set();
  for(const line of lines){
    if(!id(line?.id)||lineIds.has(line.id)||!id(line.saleId))
      fail('invalid or duplicate sale line');
    lineIds.add(line.id);
    const list=saleLines.get(line.saleId)??[];
    list.push(line);saleLines.set(line.saleId,list);
  }
  const claimed=new Set(),fullSales=new Set(),returnLineKeys=new Set();
  for(const reversal of reversals){
    if(!id(reversal?.originalSaleId)||!id(reversal.createdAt)||
       fullSales.has(reversal.originalSaleId))
      fail('duplicate or invalid full-sale reversal');
    fullSales.add(reversal.originalSaleId);
    for(const line of saleLines.get(reversal.originalSaleId)??[]){
      // Legacy uncosted sale lines cannot become verified just because a
      // reversal exists. Their cost remains unavailable in financial reports.
      if(!line.costEventId)continue;
      const issue=byEvent.get(line.costEventId);
      if(!issue||issue.kind!=='issue'||issue.saleId!==line.saleId||
         issue.saleLineId!==line.id||issue.productId!==line.productId||
         !Number.isSafeInteger(line.quantity)||line.quantity<=0||
         issue.quantityDelta!==-line.quantity)
        fail('full-sale original FIFO issue is missing or mismatched');
      const restores=reversalEvents.get(issue.id)??[];
      const matching=restores.filter(event=>
        event.saleId===reversal.originalSaleId&&
        event.productId===line.productId&&
        event.createdAt===reversal.createdAt&&
        event.quantityDelta===line.quantity&&
        (!event.saleLineId||event.saleLineId===line.id));
      if(matching.length!==1||restores.length!==1)
        fail('full-sale reversal has missing, partial or duplicate FIFO restoration');
      if(claimed.has(matching[0].id))fail('cost restoration claimed by multiple returns');
      claimed.add(matching[0].id);
    }
  }
  for(const ret of cashReturns){
    if(!id(ret?.id)||!id(ret.originalSaleId)||!id(ret.createdAt)||
       !Array.isArray(ret.lines)||fullSales.has(ret.originalSaleId))
      fail('invalid or conflicting partial return journal');
    for(const line of ret.lines){
      if(!id(line?.saleLineId)||!id(line.costEventId)||!id(line.movementId)||
         !id(line.productId)||!Number.isSafeInteger(line.quantity)||line.quantity<=0)
        fail('invalid partial-return line');
      const key=ret.id+':'+line.saleLineId;
      if(returnLineKeys.has(key))fail('duplicate line in partial return');
      returnLineKeys.add(key);
      const original=(saleLines.get(ret.originalSaleId)??[]).find(x=>x.id===line.saleLineId);
      const issue=original?.costEventId?byEvent.get(original.costEventId):undefined;
      const restored=byEvent.get(line.costEventId);
      if(!original||!issue||issue.kind!=='issue'||
         issue.saleId!==ret.originalSaleId||issue.saleLineId!==original.id||
         !restored||restored.kind!=='reversal'||
         restored.reversesEventId!==issue.id||
         restored.saleId!==ret.originalSaleId||
         restored.saleLineId!==line.saleLineId||
         restored.productId!==line.productId||
         restored.sourceId!==line.movementId||
         restored.quantityDelta!==line.quantity||
         restored.createdAt!==ret.createdAt)
        fail('partial-return FIFO restoration has missing or mismatched money and stock links');
      if(claimed.has(restored.id))fail('cost restoration claimed by multiple returns');
      claimed.add(restored.id);
    }
  }
  for(const event of events){
    if(event.kind==='reversal'&&!claimed.has(event.id))
      fail('orphaned FIFO restoration without a matching financial return');
  }
  return Object.freeze({restorationsVerified:claimed.size});
}
