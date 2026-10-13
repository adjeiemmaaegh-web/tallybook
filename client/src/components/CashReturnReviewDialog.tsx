import { useEffect, useMemo, useState } from 'react';
import { formatMinorAmount } from '@/features/inventory/inventory';
import { getCashReturnReview } from '@/features/sales/cashReturnReview.ts';
import { quoteReviewedCashReturn, type CashReturnReview } from '@/features/sales/cashReturnReview.mjs';

/** Deliberately no posting or physical-money action: preview-only until real client QA. */
export function CashReturnReviewDialog({saleId,onClose}:{saleId:string|null;onClose:()=>void}) {
  const [review,setReview]=useState<CashReturnReview|null>(null);
  const [problem,setProblem]=useState<string|null>(null);
  const [lineId,setLineId]=useState('');
  const [quantity,setQuantity]=useState('1');
  useEffect(()=>{
    let cancelled=false;
    setReview(null);setProblem(null);setLineId('');setQuantity('1');
    if (!saleId) return;
    void getCashReturnReview(saleId).then(data=>{
      if (!cancelled) {setReview(data);setLineId(data.options.find(row=>row.remainingQuantity>0)?.saleLineId??'');}
    }).catch(error=>{if(!cancelled) setProblem(error instanceof Error?error.message:'Return evidence is unavailable.');});
    return ()=>{cancelled=true;};
  },[saleId]);
  const quote=useMemo(()=>{
    if (!review || !lineId) return {result:null,error:null};
    try {
      if (!/^[1-9][0-9]*$/.test(quantity)) throw new Error('Enter a whole return quantity using digits.');
      return {result:quoteReviewedCashReturn(review,lineId,Number(quantity)),error:null};
    }
    catch(error){return {result:null,error:error instanceof Error?error.message:'Invalid return quantity.'};}
  },[review,lineId,quantity]);
  if (!saleId) return null;
  return <div role="dialog" aria-modal="true" aria-label="Read-only cash return review" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-xl space-y-4">
      <div className="flex justify-between items-start gap-3"><div><h2 className="text-xl font-semibold">Cash return review</h2><p className="text-sm text-muted-foreground">Read-only estimate. No refund is approved, paid, or recorded here.</p></div><button type="button" onClick={onClose} className="secondary-action min-h-11">Close</button></div>
      {problem && <p role="alert" className="text-sm text-destructive">Cannot review this sale: {problem}</p>}
      {!problem && !review && <p>Checking the saved receipt and original payment…</p>}
      {review && <>
        <p className="text-sm"><strong>Original receipt:</strong> {review.receiptNumber} · <strong>Previous recorded returns:</strong> {review.priorReturnCount}</p>
        <label className="block text-sm space-y-1"><span>Original item</span><select aria-label="Original sale line for return review" className="w-full rounded border bg-background p-2 min-h-11" value={lineId} onChange={event=>{setLineId(event.target.value);setQuantity('1');}}><option value="">Select an item</option>{review.options.map(row=><option key={row.saleLineId} value={row.saleLineId} disabled={!row.remainingQuantity}>{row.productName} · {row.remainingQuantity} remaining</option>)}</select></label>
        <label className="block text-sm space-y-1"><span>Quantity to review (whole units)</span><input aria-label="Return review quantity" className="w-full rounded border bg-background p-2 min-h-11" inputMode="numeric" value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
        {quote.error && <p role="alert" className="text-sm text-destructive">{quote.error}</p>}
        {quote.result && <div aria-label="Provisional refund breakdown" className="rounded-lg border p-3 space-y-1 text-sm"><p><strong>Provisional total:</strong> {formatMinorAmount(quote.result.amountMinor,review.currency)}</p><p>Tax portion: {formatMinorAmount(quote.result.taxMinor,review.currency)}</p><p>Discount portion: {formatMinorAmount(quote.result.discountMinor,review.currency)}</p></div>}
        <p className="text-xs text-muted-foreground">Not a cash-handout instruction. Saved records may change after this preview; the final restricted posting service must revalidate stock, FIFO, staff approval, cash confirmation, and all ledger evidence in one transaction. Refund posting is not enabled in this screen.</p>
      </>}
    </section>
  </div>;
}
