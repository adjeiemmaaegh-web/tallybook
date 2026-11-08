/** Reconciliation-bound management P&L for ONE saved company/currency/period.
 * This is NOT a full income statement or statutory tax calculation.
 * Supplier invoice settlement is excluded: purchases capitalize into FIFO
 * inventory cost until sold, and supplier cash payouts may duplicate expenses.
 */
export function managementProfitFromRecordedFigures({revenueExTaxMinor,cogsMinor,expensesMinor,costsUnavailable,taxUnknownSales}) {
 const checked=n=>Number.isSafeInteger(n);
 if(!checked(revenueExTaxMinor)||!checked(expensesMinor)||expensesMinor<0||
    (cogsMinor!==undefined&&!checked(cogsMinor))||
    !Number.isSafeInteger(costsUnavailable)||costsUnavailable<0||
    !Number.isSafeInteger(taxUnknownSales)||taxUnknownSales<0)
   throw Error("Management profit inputs contain invalid or overflowing ledger amounts.");
 if(cogsMinor===undefined||costsUnavailable>0)
   return {status:"unavailable",grossProfitMinor:null,operatingResultMinor:null,
    reason:"Original FIFO cost evidence is unavailable for one or more sale or return postings.",
    taxUnknownSales};
 const gross=BigInt(revenueExTaxMinor)-BigInt(cogsMinor);
 const operating=gross-BigInt(expensesMinor);
 if([gross,operating].some(n=>n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER)))
   throw Error("Management profit computation exceeds safe monetary precision.");
 return {status:"available",grossProfitMinor:Number(gross),operatingResultMinor:Number(operating),
  reason:taxUnknownSales
   ?"Historical sale tax configuration is incomplete; result excludes only tax actually recorded."
   :"Derived only from recorded tax, inventory FIFO cost and operating expenses. Unrecorded charges are not included.",
  taxUnknownSales};
}
