import {useEffect,useMemo,useRef,useState} from "react";
import { confirmAction } from "@/lib/confirmAction";
import {nanoid} from "nanoid";
import {formatMinorAmount} from "@/features/inventory/inventory";
import {getCashReturnReview} from "@/features/sales/cashReturnReview.ts";
import {quoteReviewedCashReturn,type CashReturnReview} from "@/features/sales/cashReturnReview.mjs";
import {recordConfirmedCashPartialReturn} from "@/features/sales/cashPartialReturnPosting.ts";

/** Stage 7: keep the preview independent of the irreversible, physical cash handover.
 * Only explicitly owner-enabled, eligible cash returns can reach the local
 * append-only posting service. Its transaction revalidates authorization,
 * stored FIFO costs, remaining stock, exact amount and original sale policy.
 * This UI cannot issue a real cash/provider refund by itself.
 */
export function CashReturnReviewDialog({saleId,onClose,onSaved}:{saleId:string|null;onClose:()=>void;onSaved?:()=>void}) {
 const [returnStoreId,setReturnStoreId]=useState("");
 const [review,setReview]=useState<CashReturnReview|null>(null);
 const [problem,setProblem]=useState<string|null>(null);
 const [lineId,setLineId]=useState("");
 const [quantity,setQuantity]=useState("1");
 const [cashConfirmed,setCashConfirmed]=useState(false);
 const [stockConfirmed,setStockConfirmed]=useState(false);
 const [saving,setSaving]=useState(false);
 const [saved,setSaved]=useState(false);
 const submissionKey=useRef<string|null>(null);
 useEffect(()=>{
  let cancelled=false;
  setReview(null);setReturnStoreId("");setProblem(null);setLineId("");setQuantity("1");
  setCashConfirmed(false);setStockConfirmed(false);setSaved(false);submissionKey.current=null;
  if(!saleId)return;
  void getCashReturnReview(saleId).then(data=>{
   if(!cancelled){setReview(data);setReturnStoreId(data.sale.storeId??"");setLineId(data.options.find(row=>row.remainingQuantity>0)?.saleLineId??"");}
  }).catch(error=>{if(!cancelled)setProblem(error instanceof Error?error.message:"Return evidence is unavailable.");});
  return()=>{cancelled=true;};
 },[saleId]);
 const quote=useMemo(()=>{
  if(!review||!lineId)return {result:null,error:null};
  try{
   if(!/^[1-9][0-9]*$/.test(quantity))throw Error("Enter a whole return quantity using digits.");
   return {result:quoteReviewedCashReturn(review,lineId,Number(quantity)),error:null};
  }catch(error){return {result:null,error:error instanceof Error?error.message:"Invalid return quantity."};}
 },[review,lineId,quantity]);
 async function saveReturn(){
  if(!saleId||!review||(review.storeMode&&!returnStoreId)||!quote.result||!cashConfirmed||!stockConfirmed||saving||saved)return;
  if(!(await confirmAction(
    "Confirm cash was ALREADY physically returned and the selected items were inspected and accepted as sellable. "+
    "This will now record a local financial and stock return. Never hand out money twice when retrying."
  )))return;
  submissionKey.current??="cash-return-"+nanoid(16);
  setSaving(true);setProblem(null);
  try{
   await recordConfirmedCashPartialReturn({
    ...(review.storeMode?{returnStoreId}:{}),
    originalSaleId:saleId,submissionKey:submissionKey.current,
    lines:[{saleLineId:lineId,quantity:Number(quantity)}],
    cashWasRefunded:true,confirmedRefundMinor:quote.result.amountMinor,
    disposition:"restockable"
   });
   setSaved(true);setCashConfirmed(false);setStockConfirmed(false);onSaved?.();
  }catch(error){
   setProblem((error instanceof Error?error.message:"The return could not be recorded.")+
    " Do not hand out any more cash. Reopen the original receipt and reconcile saved returns before any retry.");
  }finally{setSaving(false);}
 }
 if(!saleId)return null;
 return <div role="dialog" aria-modal="true" aria-label="Cash return review and confirmation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
  <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-background p-5 shadow-xl space-y-4">
   <div className="flex justify-between items-start gap-3"><div><h2 className="text-xl font-semibold">Cash return review</h2><p className="text-sm text-muted-foreground">Only your company's enabled cash-return policy applies. No card or MoMo money can be refunded here.</p></div><button type="button" onClick={onClose} disabled={saving} className="secondary-action min-h-11">Close</button></div>
   {problem&&<p role="alert" className="text-sm text-destructive">{problem}</p>}
   {saved&&<p role="status">Cash return saved to the original sale history with stock and cost correction. Do not hand out cash again.</p>}
   {!problem&&!review&&!saved&&<p>Checking original receipt, saved cash tender and return policy…</p>}
   {review&&!saved&&<>
    <p className="text-sm"><strong>Original receipt:</strong> {review.receiptNumber} · <strong>Previous recorded returns:</strong> {review.priorReturnCount}</p>
    {review.storeMode&&<label className="block text-sm space-y-1">
      <span>Receiving store</span>
      <select aria-label="Receiving store" className="block w-full rounded border bg-background p-2 min-h-11"
        value={returnStoreId} onChange={event=>{
          setReturnStoreId(event.target.value);setCashConfirmed(false);setStockConfirmed(false);
        }}>
        <option value="">Choose the active store physically receiving the returned goods</option>
        {review.receivingStores?.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
      {!review.receivingStores?.length&&<span role="status">No active store is available. Ask the owner to create one before recording the return.</span>}
      <span className="text-xs text-muted-foreground">The receiving store may differ from the original sale location; original sales history will not be changed.</span>
    </label>}
    <label className="block text-sm space-y-1"><span>Original item</span><select aria-label="Original sale line for return review" className="w-full rounded border bg-background p-2 min-h-11" value={lineId} onChange={event=>{setLineId(event.target.value);setQuantity("1");setCashConfirmed(false);setStockConfirmed(false);}}><option value="">Select an item</option>{review.options.map(row=><option key={row.saleLineId} value={row.saleLineId} disabled={!row.remainingQuantity}>{row.productName} · {row.remainingQuantity} remaining</option>)}</select></label>
    <label className="block text-sm space-y-1"><span>Quantity to return (whole units)</span><input aria-label="Return review quantity" className="w-full rounded border bg-background p-2 min-h-11" inputMode="numeric" value={quantity} onChange={event=>{setQuantity(event.target.value);setCashConfirmed(false);setStockConfirmed(false);}}/></label>
    {quote.error&&<p role="alert" className="text-sm text-destructive">{quote.error}</p>}
    {quote.result&&<div aria-label="Provisional refund breakdown" className="rounded-lg border p-3 space-y-1 text-sm"><p><strong>Exact proposed cash correction:</strong> {formatMinorAmount(quote.result.amountMinor,review.currency)}</p><p>Tax portion: {formatMinorAmount(quote.result.taxMinor,review.currency)}</p><p>Discount portion: {formatMinorAmount(quote.result.discountMinor,review.currency)}</p></div>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={stockConfirmed} onChange={event=>setStockConfirmed(event.target.checked)}/>I physically inspected these items and accepted them as sellable/restockable.</label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={cashConfirmed} onChange={event=>setCashConfirmed(event.target.checked)}/>I confirm that exactly {quote.result?formatMinorAmount(quote.result.amountMinor,review.currency):"the proposed amount"} was already physically returned to the customer as cash.</label>
    <button className="primary-action" type="button" disabled={(review.storeMode&&!returnStoreId)||!quote.result||!cashConfirmed||!stockConfirmed||saving||saved} onClick={()=>void saveReturn()}>{saving?"Recording return…":"Record confirmed cash return"}</button>
    <p className="text-xs text-muted-foreground">This is not a cash payout instruction. The final transaction rechecks the company's current and original policy, staff authority, payment, refund history, FIFO stock, and exact amount. Provider refunds, customer credit and Ghana VAT tax-credit corrections are not supported by this cash-only path.</p>
   </>}
  </section>
 </div>;
}
